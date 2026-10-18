/** Main-owned, ephemeral profile guests over the existing one-time embedded-session exchange. */
import { randomUUID } from 'node:crypto';
import { parseGrowthSaveUrl } from "./growth-image.js";
import { settleCleanup } from "../settle-cleanup.js";
const origin = 'https://guijitongzhuo.com';
const prefix = 'about:blank#studybuddy-profile-';
const routes = ['/my-ai/profile', '/leaderboards', '/campus-knowledge'];
/** A ticket issuer may return only the existing authenticated profile entry. */
export function validateProfileEntry(value) {
    if (typeof value !== 'string' || !URL.canParse(value))
        throw new Error('PROFILE_ENTRY_INVALID');
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.pathname !== '/my-ai/profile' || url.searchParams.get('embed') !== 'desktop' || !/^#ticket=[A-Za-z0-9_-]{43}$/.test(url.hash) || [...url.searchParams.keys()].some(key => key !== 'embed'))
        throw new Error('PROFILE_ENTRY_INVALID');
    url.searchParams.set('host_ui', 'harness');
    return url.href;
}
/** Profile and existing campus flows remain inside their own web origin. */
export function profileNavigationAllowed(value) {
    if (!URL.canParse(value))
        return false;
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password && routes.some(route => url.pathname === route || url.pathname.startsWith(route + '/'));
}
/** Theme transfer accepts only resolved stylesheet tokens, never arbitrary guest scripts. */
export function validateEmbeddedTheme(value) {
    if (!value || typeof value !== 'object')
        throw new Error('PROFILE_THEME_INVALID');
    const row = value;
    if (row.mode !== 'light' && row.mode !== 'dark' || !row.variables || typeof row.variables !== 'object' || Array.isArray(row.variables))
        throw new Error('PROFILE_THEME_INVALID');
    const entries = Object.entries(row.variables);
    if (entries.length > 1200)
        throw new Error('PROFILE_THEME_INVALID');
    const variables = {};
    for (const [name, item] of entries) {
        if (!/^--(?:dsw-[a-z0-9-]+|dsh-(?:content-font-size(?:-secondary)?|terminal-font-size|font-family-[a-z0-9-]+))$/.test(name) || typeof item !== 'string' || !item.length || item.length > 256 || /[;{}<>]|url\s*\(|@/i.test(item))
            throw new Error('PROFILE_THEME_INVALID');
        variables[name] = item;
    }
    return { mode: row.mode, variables };
}
/** Account lifetime owns the partition; release waits for destruction and wipes its browser storage. */
export class StudyBuddyEmbeddedGuests {
    auth;
    fetcher;
    fromPartition;
    saveGrowth;
    invalidated;
    options;
    #leases = new Map();
    #pending = new Map();
    #cleanup = Promise.resolve();
    constructor(auth, fetcher, fromPartition, saveGrowth, invalidated, options) {
        this.auth = auth;
        this.fetcher = fetcher;
        this.fromPartition = fromPartition;
        this.saveGrowth = saveGrowth;
        this.invalidated = invalidated;
        this.options = options;
    }
    get prefix() { return this.options ? 'about:blank#studybuddy-' + this.options.target + '-' : prefix; }
    allowed(value) { return this.options ? this.options.navigationAllowed(value) : profileNavigationAllowed(value); }
    owns(owner, id) { return this.#leases.get(id)?.owner === owner; }
    checkedGuest(event) {
        const row = [...this.#leases.values()].find(row => row.guest === event.sender);
        if (!row || !row.issued || !this.sameScope(row.lease.scope) || event.senderFrame !== event.sender.mainFrame || !this.allowed(event.sender.getURL()) || !this.allowed(event.senderFrame.url))
            throw new Error('COMMUNITY_GUEST_DENIED');
        return { lease: row.lease, issued: row.issued, guest: event.sender };
    }
    async setVisible(owner, id, visible) {
        const row = this.#leases.get(id);
        if (!row || row.owner !== owner || !this.sameScope(row.lease.scope) || typeof visible !== 'boolean')
            throw new Error('PROFILE_OWNER_MISMATCH');
        row.visible = visible;
        await this.applyVisibility(row);
    }
    /** Theme and geometry updates do not start another page-resume transaction. */
    async applyVisibility(row) {
        const guest = row.guest, visible = row.visible === true;
        if (!guest || guest.isDestroyed() || !this.allowed(guest.getURL()) || this.#leases.get(row.lease.lease) !== row || row.announcedVisible === visible)
            return;
        row.announcedVisible = visible;
        try {
            await guest.executeJavaScript('window.dispatchEvent(new Event(' + JSON.stringify(visible ? 'studybuddy:embedded-resume' : 'studybuddy:embedded-suspend') + '))', false);
        }
        catch (error) {
            if (row.announcedVisible === visible)
                delete row.announcedVisible;
            throw error;
        }
    }
    recognizes(owner, src, partition) {
        if (!src.startsWith(this.prefix))
            return false;
        const row = this.#leases.get(src.slice(this.prefix.length));
        return !!row && row.owner === owner && (partition === undefined || row.lease.partition === partition) && this.sameScope(row.lease.scope);
    }
    sameScope(scope) {
        const current = this.auth.scope();
        return !!current && current.accountId === scope.accountId && current.generation === scope.generation;
    }
    acquire(owner, view = 'profile') {
        if (!['profile', 'models'].includes(view) || this.options && view !== 'profile')
            return Promise.reject(new Error('PROFILE_TARGET_DENIED'));
        const key = `${owner.id}:${view}`, pending = this.#pending.get(key);
        if (pending)
            return pending;
        const result = this.create(owner, view).finally(() => { if (this.#pending.get(key) === result)
            this.#pending.delete(key); });
        this.#pending.set(key, result);
        return result;
    }
    async create(owner, view) {
        await this.#cleanup;
        let created, issued;
        try {
            return await this.auth.withSession(async (privateSession) => {
                for (const row of this.#leases.values())
                    if (row.owner === owner && row.view === view && this.sameScope(row.lease.scope))
                        return row.lease;
                if (this.options?.issue)
                    issued = await this.options.issue(privateSession, owner);
                else {
                    const response = await this.fetcher(origin + '/api/v1/auth/embedded-session', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + privateSession.accessToken }, body: JSON.stringify({ target: this.options?.target ?? 'personal_profile' }) });
                    if (!response.ok)
                        throw new Error(response.status === 401 ? 'AUTH_REQUIRED' : 'PROFILE_TICKET_FAILED');
                    const data = await response.json();
                    if (!data || typeof data !== 'object' || !('entryUrl' in data) || typeof data.entryUrl !== 'string')
                        throw new Error('PROFILE_ENTRY_INVALID');
                    issued = { entryUrl: data.entryUrl };
                }
                let entryUrl = this.options ? this.options.validateEntry(issued.entryUrl) : validateProfileEntry(issued.entryUrl);
                if (view === 'models') {
                    const url = new URL(entryUrl);
                    url.searchParams.set('view', 'models');
                    entryUrl = url.href;
                }
                if (owner.isDestroyed() || !this.sameScope(privateSession.scope))
                    throw new Error('ACCOUNT_SCOPE_CHANGED');
                const lease = randomUUID(), partition = 'studybuddy-' + (this.options?.target ?? 'profile') + '-' + randomUUID(), browserSession = this.fromPartition(partition);
                this.configureSession(browserSession, issued);
                created = { lease, partition, entryUrl, scope: privateSession.scope };
                this.#leases.set(lease, { lease: created, view, owner, session: browserSession, attached: false, issued });
                return created;
            });
        }
        catch (error) {
            if (created)
                await this.release(owner, created.lease);
            else
                await issued?.dispose?.();
            throw error;
        }
    }
    async release(owner, id) {
        if (typeof id !== 'string')
            throw new Error('PROFILE_LEASE_INVALID');
        const row = this.#leases.get(id);
        if (!row)
            return;
        if (row.owner !== owner)
            throw new Error('PROFILE_OWNER_MISMATCH');
        this.#leases.delete(id);
        row.releaseInput?.();
        const guest = row.guest;
        if (guest && !guest.isDestroyed()) {
            const stopped = new Promise(resolve => guest.once('destroyed', resolve));
            guest.close({ waitForBeforeUnload: false });
            await stopped;
        }
        await settleCleanup([row.session.clearStorageData(), row.session.clearCache(), row.issued?.dispose?.()]);
    }
    revoke(notify = false) {
        if (notify)
            for (const row of this.#leases.values()) {
                try {
                    this.invalidated?.(row.owner, row.lease.lease);
                }
                catch {
                    console.error('StudyBuddy guest invalidation notification failed');
                }
            }
        const operations = [...this.#leases.values()].map(row => this.release(row.owner, row.lease.lease));
        this.#cleanup = settleCleanup([this.#cleanup, ...operations]);
        return this.#cleanup;
    }
    async setTheme(owner, id, value) {
        const theme = validateEmbeddedTheme(value);
        const row = typeof id === 'string' ? this.#leases.get(id) : undefined;
        if (!row || row.owner !== owner || !this.sameScope(row.lease.scope))
            throw new Error('PROFILE_OWNER_MISMATCH');
        row.theme = theme;
        if (row.guest && !row.guest.isDestroyed() && this.allowed(row.guest.getURL()))
            await this.applyTheme(row);
    }
    async applyTheme(row) {
        if (!row.guest || !row.theme)
            return;
        // Fixed, main-owned setter. Its only inputs were validated tokens and palette mode.
        await row.guest.executeJavaScript('(()=>{const theme=' + JSON.stringify(row.theme) + ';document.documentElement.style.colorScheme=theme.mode;document.body.toggleAttribute("data-ds-dark-theme",theme.mode==="dark");for(const [name,value]of Object.entries(theme.variables))document.body.style.setProperty(name,value);if(!window.__studybuddyInvalidListener){window.__studybuddyInvalidListener=true;window.addEventListener("studybuddy:embedded-invalid",()=>{location.assign("studybuddy://embedded-page/invalid")})}window.dispatchEvent(new Event("studybuddy-theme-change"));' + (this.options ? '' : 'window.dispatchEvent(new Event("studybuddy:embedded-resume"));') + '})()', false);
        if (this.options)
            await this.applyVisibility(row);
    }
    bind(window, attachInput, browserReservation) {
        const owner = window.webContents;
        owner.on('will-attach-webview', (event, preferences, params) => {
            const src = params.src ?? '';
            if (browserReservation(src, params.partition))
                return;
            const row = src.startsWith(this.prefix) ? this.#leases.get(src.slice(this.prefix.length)) : undefined;
            if (!row || row.owner !== owner || row.attached || params.partition !== row.lease.partition || !this.sameScope(row.lease.scope)) {
                event.preventDefault();
                return;
            }
            row.attached = true;
            for (const key of Object.keys(preferences))
                Reflect.deleteProperty(preferences, key);
            Object.assign(preferences, {
                partition: row.lease.partition, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
                contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
                webviewTag: false, plugins: false, navigateOnDragDrop: false, disableDialogs: true, devTools: false,
            });
            if (this.options?.preload)
                preferences.preload = this.options.preload;
            params.httpreferrer = '';
        });
        owner.on('did-attach-webview', (_event, guest) => {
            guest.once('dom-ready', () => {
                const initial = guest.getURL();
                if (browserReservation(initial))
                    return;
                const row = initial.startsWith(this.prefix) ? this.#leases.get(initial.slice(this.prefix.length)) : undefined;
                if (!row || row.owner !== owner || row.guest || !this.sameScope(row.lease.scope)) {
                    guest.close({ waitForBeforeUnload: false });
                    return;
                }
                row.guest = guest;
                row.releaseInput = attachInput(guest, row.lease.lease);
                guest.setWindowOpenHandler(({ url }) => {
                    if (this.options?.openExternal && this.sameScope(row.lease.scope) && this.allowed(guest.getURL()))
                        void this.options.openExternal(url).catch(() => { console.error('StudyBuddy external link was not opened'); });
                    return { action: 'deny' };
                });
                guest.on('will-frame-navigate', (event) => {
                    if (event.isMainFrame && !this.allowed(event.url)) {
                        event.preventDefault();
                        if (!this.allowed(guest.getURL()) || !this.sameScope(row.lease.scope))
                            return;
                        const version = parseGrowthSaveUrl(event.url);
                        if (version)
                            void this.exportGrowth(row, version);
                        else if (event.url === 'studybuddy://embedded-page/invalid')
                            void this.release(owner, row.lease.lease).then(() => this.invalidated?.(owner, row.lease.lease)).catch(() => { this.invalidated?.(owner, row.lease.lease); console.error('StudyBuddy profile invalidation cleanup failed'); });
                        else if (this.options?.navigate && !row.navigationPending) {
                            row.navigationPending = true;
                            void this.options.navigate(owner, guest, row.lease, event.url).catch(async () => { await this.release(owner, row.lease.lease); this.invalidated?.(owner, row.lease.lease); }).catch(() => { this.invalidated?.(owner, row.lease.lease); console.error('StudyBuddy community cleanup failed'); }).finally(() => { row.navigationPending = false; });
                        }
                    }
                });
                guest.on('will-redirect', (event, url, _inPlace, mainFrame) => { if (mainFrame && !this.allowed(url))
                    event.preventDefault(); });
                guest.on('will-attach-webview', (event) => { event.preventDefault(); });
                guest.on('login', (event, _details, _auth, callback) => { event.preventDefault(); callback(); });
                guest.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace)
                    delete row.announcedVisible; });
                guest.on('did-finish-load', () => { if (row.theme || this.options)
                    void (row.theme ? this.applyTheme(row) : this.applyVisibility(row)).catch(() => { void this.release(owner, row.lease.lease).catch(() => { }); }); });
                guest.once('destroyed', () => { if (this.#leases.has(row.lease.lease))
                    void this.release(owner, row.lease.lease).catch(() => { }); });
            });
        });
        const releaseOwner = () => {
            for (const row of [...this.#leases.values()])
                if (row.owner === owner)
                    void this.release(owner, row.lease.lease).catch(() => { });
        };
        owner.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace)
            releaseOwner(); });
        owner.on('render-process-gone', releaseOwner);
        owner.once('destroyed', releaseOwner);
    }
    async exportGrowth(row, version) {
        if (row.saving || !this.saveGrowth)
            return;
        row.saving = true;
        try {
            let status;
            try {
                status = await this.saveGrowth(row.owner, version);
            }
            catch {
                status = 'failed';
            }
            if (this.#leases.get(row.lease.lease) === row && this.sameScope(row.lease.scope) && row.guest && !row.guest.isDestroyed())
                await row.guest.executeJavaScript('window.dispatchEvent(new CustomEvent("studybuddy:growth-save-result",{detail:' + JSON.stringify({ status }) + '}))', false);
        }
        catch {
            console.error('StudyBuddy profile export result could not be delivered');
        }
        finally {
            row.saving = false;
        }
    }
    configureSession(browserSession, issued) {
        browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
            const audioOnly = permission === 'media' && 'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio';
            callback(audioOnly && this.researchMicrophoneAllowed(browserSession, contents, details.requestingUrl, details.isMainFrame, undefined, 'securityOrigin' in details ? details.securityOrigin : undefined)
                || this.clipboardWriteAllowed(browserSession, contents, permission, details.requestingUrl, details.isMainFrame)
                || this.videoFullscreenAllowed(browserSession, contents, permission, details.requestingUrl, details.isMainFrame));
        });
        browserSession.setPermissionCheckHandler((contents, permission, origin, details) => permission === 'media' && details.mediaType === 'audio' && this.researchMicrophoneAllowed(browserSession, contents, details.requestingUrl, details.isMainFrame, origin, details.securityOrigin)
            || this.clipboardWriteAllowed(browserSession, contents, permission, details.requestingUrl, details.isMainFrame, origin)
            || this.videoFullscreenAllowed(browserSession, contents, permission, details.requestingUrl, details.isMainFrame, origin));
        browserSession.setDevicePermissionHandler(() => false);
        browserSession.setDisplayMediaRequestHandler((_request, callback) => { callback({}); });
        browserSession.on('will-download', (event) => { event.preventDefault(); });
        browserSession.webRequest.onBeforeRequest((details, callback) => {
            if (!URL.canParse(details.url)) {
                callback({ cancel: true });
                return;
            }
            const url = new URL(details.url);
            if (issued.requestAllowed) {
                callback({ cancel: url.username !== '' || url.password !== '' || !issued.requestAllowed(details.url) });
                return;
            }
            callback({ cancel: url.username !== '' || url.password !== '' || (!['about:', 'data:', 'blob:'].includes(url.protocol) && (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')) });
        });
        const requestHeaders = issued.requestHeaders?.bind(issued);
        if (requestHeaders)
            browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
                callback({ requestHeaders: { ...details.requestHeaders, ...requestHeaders(details.url) } });
            });
    }
    /** Only a live focused Research root document can request its microphone; every other capture remains denied. */
    researchMicrophoneAllowed(browserSession, contents, requestingUrl, isMainFrame, requestOrigin, securityOrigin) {
        if (this.options?.target !== 'research' || !contents || contents.isDestroyed() || !contents.isFocused() || !isMainFrame || !requestingUrl)
            return false;
        const row = [...this.#leases.values()].find(row => row.guest === contents), page = contents.getURL();
        if (!row || !row.attached || row.session !== browserSession || row.visible !== true || row.owner.isDestroyed() || !this.sameScope(row.lease.scope)
            || !URL.canParse(row.lease.entryUrl) || !URL.canParse(page) || !URL.canParse(requestingUrl) || !this.allowed(page) || !this.allowed(requestingUrl))
            return false;
        const entry = new URL(row.lease.entryUrl);
        if (entry.protocol !== 'http:' || entry.hostname !== '127.0.0.1' || !entry.port || Number(entry.port) > 65535 || entry.username || entry.password || entry.search || entry.hash)
            return false;
        return (requestOrigin === undefined || requestOrigin === entry.origin) && (securityOrigin === undefined || securityOrigin === entry.origin)
            && [new URL(page), new URL(requestingUrl)].every(url => url.href === entry.href);
    }
    /** Only the live foreground editor main frame may request video fullscreen; generated film frames stay excluded. */
    videoFullscreenAllowed(browserSession, contents, permission, requestingUrl, isMainFrame, requestOrigin) {
        if (this.options?.target !== 'video' || permission !== 'fullscreen' || !contents || contents.isDestroyed() || !isMainFrame || !requestingUrl)
            return false;
        const row = [...this.#leases.values()].find(row => row.guest === contents), page = contents.getURL();
        if (!row || row.session !== browserSession || row.visible !== true || row.owner.isDestroyed() || !this.sameScope(row.lease.scope)
            || !URL.canParse(page) || !URL.canParse(requestingUrl) || !this.allowed(page) || !this.allowed(requestingUrl))
            return false;
        const entry = new URL(row.lease.entryUrl);
        return entry.protocol === 'http:' && entry.hostname === '127.0.0.1'
            && (requestOrigin === undefined || requestOrigin === entry.origin)
            && [new URL(page), new URL(requestingUrl)].every(url => url.origin === entry.origin);
    }
    /** Only the live foreground AIGC or Skill main frame may write sanitized clipboard content. */
    clipboardWriteAllowed(browserSession, contents, permission, requestingUrl, isMainFrame, requestOrigin) {
        if (!['aigc', 'skills'].includes(this.options?.target ?? '') || permission !== 'clipboard-sanitized-write' || !contents || contents.isDestroyed() || !isMainFrame || !requestingUrl)
            return false;
        const row = [...this.#leases.values()].find(row => row.guest === contents), page = contents.getURL();
        if (!row || row.session !== browserSession || row.visible !== true || row.owner.isDestroyed() || !this.sameScope(row.lease.scope)
            || !URL.canParse(page) || !URL.canParse(requestingUrl) || !this.allowed(page) || !this.allowed(requestingUrl))
            return false;
        const entry = new URL(row.lease.entryUrl);
        return (requestOrigin === undefined || requestOrigin === entry.origin)
            && [new URL(page), new URL(requestingUrl)].every(url => url.origin === entry.origin && url.protocol === entry.protocol);
    }
}
//# sourceMappingURL=embedded-guests.js.map