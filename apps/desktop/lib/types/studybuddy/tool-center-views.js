/** Own isolated local tool views by account generation and exact document instance. */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { validateEmbeddedTheme } from "./embedded-guests.js";
import { BusinessFailure } from "./business-api.js";
import { resolveToolResource, TOOL_CSP, TOOL_PAGE_URL, LAB_PAGE_URL } from "./tool-center-resources.js";
import { STUDYBUDDY_IPC } from "./types.js";
const same = (a, b) => a?.accountId === b.accountId && a.generation === b.generation;
/**
 * @param value Viewport CSS rectangle.
 * @param zoom Parent renderer zoom.
 * @param content Electron content DIP limits.
 * @returns Clamped DIP bounds without another DPR multiplication.
 */
export function toolSurfaceBounds(value, zoom, content) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isFinite(zoom) || zoom <= 0 || zoom > 5)
        throw new BusinessFailure('TOOL_BOUNDS_INVALID');
    const row = value, result = { x: 0, y: 0, width: 0, height: 0 };
    if (Object.keys(row).sort().join(',') !== 'height,width,x,y')
        throw new BusinessFailure('TOOL_BOUNDS_INVALID');
    for (const key of ['x', 'y', 'width', 'height']) {
        const n = row[key];
        if (typeof n !== 'number' ||
            !Number.isFinite(n) ||
            Math.abs(n) > 100_000 ||
            ((key === 'width' || key === 'height') && n < 0))
            throw new BusinessFailure('TOOL_BOUNDS_INVALID');
        result[key] = Math.round(n * zoom);
    }
    const right = Math.min(content.width, result.x + result.width), bottom = Math.min(content.height, result.y + result.height);
    result.x = Math.max(0, Math.min(content.width, result.x));
    result.y = Math.max(0, Math.min(content.height, result.y));
    result.width = Math.max(0, right - result.x);
    result.height = Math.max(0, bottom - result.y);
    return result;
}
export class ToolCenterViews {
    dependencies;
    rows = new Map();
    pending = new Map();
    epoch = 0;
    disposed = false;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    acquire(scope, target = 'tools') {
        if (target !== 'tools' && target !== 'labs')
            return Promise.reject(new BusinessFailure('TOOL_VIEW_DENIED'));
        const existing = this.pending.get(target);
        if (existing)
            return existing.then((lease) => {
                if (!same(lease.scope, scope))
                    throw new BusinessFailure('TOOL_VIEW_DENIED');
                return lease;
            });
        const pending = this.create(scope, target).finally(() => {
            if (this.pending.get(target) === pending)
                this.pending.delete(target);
        });
        this.pending.set(target, pending);
        return pending;
    }
    async create(scope, target) {
        const d = this.dependencies, window = d.owner(), epoch = this.epoch;
        if (this.disposed || !window || window.isDestroyed() || !same(d.scope() ?? undefined, scope))
            throw new BusinessFailure('TOOL_VIEW_DENIED');
        for (const row of this.rows.values())
            if (row.target === target && row.window === window && same(row.lease.scope, scope))
                return row.lease;
        const pageUrl = target === 'labs' ? LAB_PAGE_URL : TOOL_PAGE_URL;
        const [runtime, accountSummary] = await Promise.all([
            d.runtime(),
            target === 'labs' ? null : d.summary?.(scope).catch((error) => {
                console.error('StudyBuddy tool summary unavailable', error instanceof BusinessFailure ? error.code : 'ACCOUNT_SUMMARY_UNCONFIRMED');
                return null;
            }) ?? null,
        ]);
        if (this.disposed ||
            epoch !== this.epoch ||
            window.isDestroyed() ||
            d.owner() !== window ||
            !same(d.scope() ?? undefined, scope))
            throw new BusinessFailure('TOOL_VIEW_DENIED');
        const lease = { lease: randomUUID(), scope: { ...scope }, moduleId: runtime.module.moduleId }, browserSession = d.session('studybuddy-tools-' + randomUUID());
        browserSession.protocol.handle('dsh-tools', async (request) => {
            try {
                const resource = await resolveToolResource(request.url, join(runtime.directory, 'module'), runtime.module);
                return new Response(new Uint8Array(resource.bytes), {
                    headers: {
                        'Content-Type': resource.mime,
                        'Content-Security-Policy': TOOL_CSP,
                        'X-Content-Type-Options': 'nosniff',
                        'Cache-Control': 'no-store',
                    },
                });
            }
            catch (error) {
                return new Response(error instanceof BusinessFailure ? error.code : 'TOOL_RESOURCE_DENIED', { status: 403 });
            }
        });
        browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        browserSession.setPermissionCheckHandler(() => false);
        browserSession.setDevicePermissionHandler(() => false);
        browserSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
        browserSession.on('will-download', event => event.preventDefault());
        browserSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('dsh-tools://tool-center/') && !details.url.startsWith('data:') }));
        const view = d.create({
            webPreferences: {
                session: browserSession,
                preload: d.preload,
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                nodeIntegrationInWorker: false,
                nodeIntegrationInSubFrames: false,
                webSecurity: true,
                webviewTag: false,
                navigateOnDragDrop: false,
                disableDialogs: true,
            },
        });
        const row = {
            target,
            lease,
            window,
            view,
            browserSession,
            attached: false,
            visible: false,
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            summaryRevision: 0,
            state: {
                scope: lease.scope,
                enabled: false,
                refreshRevision: 0,
                returnRevision: 0,
                theme: { mode: 'light', variables: {} },
                accountSummary,
            },
            off: () => { },
        };
        this.rows.set(lease.lease, row);
        view.setVisible(false);
        const invalidate = () => {
            if (this.rows.has(lease.lease)) {
                void this.release(lease.lease).catch(error => console.error('StudyBuddy tool view cleanup failed', error instanceof BusinessFailure ? error.code : 'TOOL_VIEW_FAILED'));
                d.invalidated?.(lease);
            }
        };
        const deny = (event, url) => {
            if (url !== pageUrl) {
                event.preventDefault();
                invalidate();
            }
        };
        view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        view.webContents.on('will-navigate', deny);
        view.webContents.on('will-redirect', deny);
        view.webContents.on('will-frame-navigate', (event) => {
            if (!event.isMainFrame || event.url !== pageUrl) {
                event.preventDefault();
                invalidate();
            }
        });
        view.webContents.on('will-attach-webview', event => event.preventDefault());
        view.webContents.once('destroyed', invalidate);
        view.webContents.on('render-process-gone', invalidate);
        const navigate = (_event, _url, inPlace, mainFrame) => {
            if (mainFrame && !inPlace)
                invalidate();
        };
        window.webContents.on('did-start-navigation', navigate);
        window.webContents.on('render-process-gone', invalidate);
        window.once('closed', invalidate);
        row.off = () => {
            window.webContents.removeListener('did-start-navigation', navigate);
            window.webContents.removeListener('render-process-gone', invalidate);
            window.removeListener('closed', invalidate);
        };
        try {
            await view.webContents.loadURL(pageUrl);
            this.get(lease.lease);
            return lease;
        }
        catch (error) {
            await this.release(lease.lease);
            throw error;
        }
    }
    get(id) {
        const row = typeof id === 'string' ? this.rows.get(id) : undefined;
        if (this.disposed ||
            !row ||
            row.window.isDestroyed() ||
            row.view.webContents.isDestroyed() ||
            this.dependencies.owner() !== row.window ||
            !same(this.dependencies.scope() ?? undefined, row.lease.scope))
            throw new BusinessFailure('TOOL_VIEW_DENIED');
        return row;
    }
    checked(event, id) {
        const row = id === undefined ? [...this.rows.values()].find(item => item.view.webContents === event.sender) : this.get(id);
        if (!row ||
            event.sender !== row.view.webContents ||
            event.senderFrame !== row.view.webContents.mainFrame ||
            event.senderFrame.url !== (row.target === 'labs' ? LAB_PAGE_URL : TOOL_PAGE_URL) ||
            event.sender.getURL() !== (row.target === 'labs' ? LAB_PAGE_URL : TOOL_PAGE_URL))
            throw new BusinessFailure('TOOL_VIEW_DENIED');
        return this.get(row.lease.lease);
    }
    publish(row) {
        row.view.webContents.send(STUDYBUDDY_IPC.toolPageState, row.state);
    }
    async resize(id, value) {
        const row = this.get(id);
        row.bounds = toolSurfaceBounds(value, row.window.webContents.getZoomFactor(), row.window.getContentBounds());
        row.view.setBounds(row.bounds);
        await this.setVisible(id, row.visible);
    }
    async setVisible(id, visible) {
        if (typeof visible !== 'boolean')
            throw new BusinessFailure('TOOL_BOUNDS_INVALID');
        const row = this.get(id);
        row.visible = visible;
        const show = visible && row.bounds.width > 0 && row.bounds.height > 0;
        const returning = show && !row.attached;
        if (show && !row.attached) {
            row.window.contentView.addChildView(row.view);
            row.attached = true;
            // Visibility restores the retained page. Its scan lifetime belongs to
            // startup, explicit refresh and installation mutations, not navigation.
        }
        if (!show && row.attached) {
            row.window.contentView.removeChildView(row.view);
            row.attached = false;
        }
        row.view.setVisible(show);
        row.state = { ...row.state, enabled: show };
        this.publish(row);
        if (returning)
            void this.readSummary(row);
    }
    async setTheme(id, value) {
        const row = this.get(id);
        row.state = { ...row.state, theme: validateEmbeddedTheme(value) };
        this.publish(row);
    }
    async readSummary(row) {
        if (row.target === 'labs')
            return;
        const summary = this.dependencies.summary;
        if (!summary)
            return;
        const revision = ++row.summaryRevision;
        let accountSummary;
        try {
            accountSummary = await summary(row.lease.scope);
        }
        catch (error) {
            console.error('StudyBuddy tool summary unavailable', error instanceof BusinessFailure ? error.code : 'ACCOUNT_SUMMARY_UNCONFIRMED');
            accountSummary = null;
        }
        if (this.disposed ||
            this.rows.get(row.lease.lease) !== row ||
            revision !== row.summaryRevision ||
            !same(this.dependencies.scope() ?? undefined, row.lease.scope) ||
            this.dependencies.owner() !== row.window ||
            row.window.isDestroyed() ||
            row.view.webContents.isDestroyed())
            return;
        row.state = { ...row.state, accountSummary };
        this.publish(row);
    }
    /** Summary readback does not invalidate tool inventories. Omitted summaries signal a configuration change. */
    refresh(scope, accountSummary) {
        if (this.disposed || !same(this.dependencies.scope() ?? undefined, scope))
            return;
        for (const row of this.rows.values())
            if (same(scope, row.lease.scope)) {
                if (accountSummary !== undefined) {
                    ++row.summaryRevision;
                    row.state = { ...row.state, accountSummary };
                    this.publish(row);
                    continue;
                }
                row.state = { ...row.state, refreshRevision: row.state.refreshRevision + 1 };
                this.publish(row);
                if (accountSummary === undefined)
                    void this.readSummary(row);
            }
    }
    async release(id) {
        const row = this.rows.get(id);
        if (!row)
            return;
        this.rows.delete(id);
        row.off();
        this.dependencies.released?.(row.lease);
        if (row.attached && !row.window.isDestroyed())
            row.window.contentView.removeChildView(row.view);
        row.view.setVisible(false);
        if (!row.view.webContents.isDestroyed()) {
            const ended = new Promise(resolve => row.view.webContents.once('destroyed', () => resolve()));
            row.view.webContents.close({ waitForBeforeUnload: false });
            await ended;
        }
        row.browserSession.protocol.unhandle?.('dsh-tools');
        await Promise.all([row.browserSession.clearStorageData(), row.browserSession.clearCache()]);
    }
    async revoke() {
        ++this.epoch;
        await Promise.all([...this.rows.keys()].map(id => this.release(id)));
        await Promise.all([...this.pending.values()].map(pending => pending.catch((error) => {
            if (!(error instanceof BusinessFailure))
                throw error;
        })));
    }
    async dispose() {
        this.disposed = true;
        await this.revoke();
    }
}
//# sourceMappingURL=tool-center-views.js.map