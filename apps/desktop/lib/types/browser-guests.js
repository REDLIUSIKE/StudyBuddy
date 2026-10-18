/** Main-process ownership and fixed isolation policy for Sidebar webview guests. */
import { randomUUID } from 'node:crypto';
import { app, session } from 'electron';
import { DESKTOP_IPC } from "./ipc.js";
/** Owns workspace storage partitions independently from individual tab guests. */
export class DesktopBrowserGuests {
    hostUrl;
    partitions = new Map();
    leases = new Map();
    /** @param hostUrl - current authenticated DSH Host, which guests cannot request. */
    constructor(hostUrl) {
        this.hostUrl = hostUrl;
    }
    /**
     * Reserve one guest in a workspace's process-lifetime partition.
     * @param owner - authenticated primary application WebContents.
     * @param workspace - workspace identity received over IPC.
     * @returns opaque lease and the partition approved for it.
     */
    acquire(owner, workspace) {
        if (typeof workspace !== 'string' || workspace.length === 0 || workspace.length > 4096) {
            throw new Error('desktop browser: a workspace storage identity is required');
        }
        let partition = this.partitions.get(workspace);
        if (partition === undefined) {
            partition = `dsh-sidebar-browser-${randomUUID()}`;
            this.configureSession(session.fromPartition(partition));
            this.partitions.set(workspace, partition);
        }
        const lease = randomUUID();
        this.leases.set(lease, { owner, partition, attached: false });
        return { lease, partition };
    }
    /**
     * Release only a lease issued to this application window; workspace storage survives.
     * @param owner - authenticated IPC sender.
     * @param id - lease received over IPC.
     */
    async release(owner, id) {
        if (typeof id !== 'string')
            throw new Error('desktop browser: invalid guest lease');
        const key = id;
        const lease = this.leases.get(key);
        if (lease === undefined)
            return;
        if (lease.owner !== owner)
            throw new Error('desktop browser: guest belongs to another window');
        lease.releaseInput?.();
        this.leases.delete(key);
        const guest = lease.guest;
        if (guest !== undefined && !guest.isDestroyed()) {
            const destroyed = new Promise((resolve) => { guest.once('destroyed', resolve); });
            guest.close({ waitForBeforeUnload: false });
            await destroyed;
        }
    }
    /**
     * Install attachment checks before the application document can create a webview.
     * @param window - primary application window.
     * @param attachInput - attaches native input after guest ownership is verified and returns its disposer.
     */
    bind(window, attachInput, otherReservation) {
        const owner = window.webContents;
        owner.on('will-attach-webview', (event, preferences, params) => {
            if (otherReservation?.(params.src ?? '', params.partition))
                return;
            const id = typeof params.src === 'string' && params.src.startsWith('about:blank#')
                ? params.src.slice('about:blank#'.length) : '';
            const lease = this.leases.get(id);
            if (lease === undefined || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
                event.preventDefault();
                return;
            }
            lease.attached = true;
            // Keep Electron's allowpopups dispatch flag; the guest handler still denies native windows.
            for (const key of Object.keys(preferences)) {
                if (key !== 'disablePopups')
                    Reflect.deleteProperty(preferences, key);
            }
            Object.assign(preferences, {
                partition: lease.partition,
                nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
                contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
                webviewTag: false, plugins: false, navigateOnDragDrop: false, disableDialogs: true,
                devTools: !app.isPackaged,
            });
            params.httpreferrer = '';
        });
        owner.on('did-attach-webview', (_event, guest) => {
            let attachedLease;
            // The first document is an inert about:blank carrying the approved lease.
            // Bind on the main-process event before the renderer can navigate the ready guest.
            guest.once('dom-ready', () => {
                const url = guest.getURL();
                if (otherReservation?.(url))
                    return;
                const id = (url.startsWith('about:blank#') ? url.slice('about:blank#'.length) : '');
                const lease = this.leases.get(id);
                if (lease === undefined || lease.owner !== owner || lease.guest !== undefined) {
                    guest.close({ waitForBeforeUnload: false });
                    return;
                }
                lease.guest = guest;
                attachedLease = id;
                lease.releaseInput = attachInput(guest, id);
                guest.once('destroyed', () => { lease.releaseInput?.(); this.leases.delete(id); });
            });
            guest.setWindowOpenHandler(({ url, postBody }) => {
                const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease);
                if (attachedLease !== undefined && lease?.guest === guest && lease.owner === owner && !owner.isDestroyed()
                    && postBody === undefined && this.allowedNavigation(url)) {
                    const request = { lease: attachedLease, url: new URL(url).href };
                    owner.send(DESKTOP_IPC.browserOpenRequested, request);
                }
                return { action: 'deny' };
            });
            guest.on('will-frame-navigate', (event) => {
                if (event.isMainFrame && !this.allowedNavigation(event.url))
                    event.preventDefault();
            });
            guest.on('will-redirect', (event, url, _inPlace, mainFrame) => {
                if (mainFrame && !this.allowedNavigation(url))
                    event.preventDefault();
            });
            guest.on('will-attach-webview', (event) => { event.preventDefault(); });
            guest.on('login', (event, _details, _authInfo, callback) => { event.preventDefault(); callback(); });
        });
        const releaseAll = () => {
            for (const [id, lease] of this.leases) {
                if (lease.owner === owner)
                    void this.release(owner, id).catch((error) => { console.error(error); });
            }
        };
        owner.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
            if (mainFrame && !inPlace)
                releaseAll();
        });
        owner.on('render-process-gone', releaseAll);
        owner.once('destroyed', releaseAll);
    }
    /** Admit another attachment owner only after checking this manager's exact lease. */
    recognizes(owner, src, partition) {
        const row = src.startsWith('about:blank#') ? this.leases.get(src.slice('about:blank#'.length)) : undefined;
        return row !== undefined && row.owner === owner && (partition === undefined || row.partition === partition);
    }
    configureSession(browserSession) {
        browserSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false); });
        browserSession.setPermissionCheckHandler(() => false);
        browserSession.setDevicePermissionHandler(() => false);
        browserSession.setDisplayMediaRequestHandler((_request, callback) => { callback({}); });
        browserSession.on('will-download', (event) => { event.preventDefault(); });
        browserSession.webRequest.onBeforeRequest((details, callback) => {
            const url = new URL(details.url);
            const network = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol);
            callback({ cancel: network
                    ? url.username !== '' || url.password !== '' || this.isApplicationHost(url)
                    : !['about:', 'data:', 'blob:'].includes(url.protocol) });
        });
    }
    allowedNavigation(value) {
        if (!URL.canParse(value))
            return false;
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === ''
            && !this.isApplicationHost(url);
    }
    isApplicationHost(url) {
        const value = this.hostUrl();
        if (value === undefined)
            return false;
        const host = new URL(value);
        return url.port === host.port
            && (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    }
}
//# sourceMappingURL=browser-guests.js.map