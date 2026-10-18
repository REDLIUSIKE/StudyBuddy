/** Shell-owned modal policy UI; only explicit actions authorize downloads or browser navigation. */
import { app, clipboard, ipcMain, shell } from 'electron';
import { assertDesktopSender } from "./ipc.js";
import { desktopPolicyPage } from "./mandatory-update-policy.js";
import { MANDATORY_IPC } from "./mandatory-update-ipc.js";
import { DesktopUpdateAttention } from "./update-attention.js";
// main.ts's protocol.handle shell route serves this document and its renderer assets; the modal requires that route.
const page = 'dsh-app://shell/mandatory-update.html';
/** Shell-owned update presentation; Windows embeds it in the main document without a child window. */
export class DesktopMandatoryUpdateWindow {
    options;
    embedded = process.platform === 'win32';
    embeddedParent;
    embeddedBlocking = false;
    publishEmbedded = () => { this.embeddedBlocking = false; this.sync(); };
    window;
    closing;
    disposed = false;
    error;
    action;
    confirmation;
    confirmationRevision = 0;
    deferred = false;
    restart;
    navigation;
    navigationUrl;
    navigationEpoch = 0;
    attention;
    /** @param options - Main-process actions and immutable deployment/navigation settings. */
    constructor(options) {
        this.options = options;
        this.attention = new DesktopUpdateAttention(options.locale);
        this.embeddedParent = this.embedded ? options.parent() : undefined;
        this.embeddedParent?.webContents.on('did-finish-load', this.publishEmbedded);
        ipcMain.handle(MANDATORY_IPC.status, (event) => { this.assertSender(event); return this.view(); });
        ipcMain.handle(MANDATORY_IPC.action, (event, action, version, confirmationRevision) => {
            this.assertSender(event);
            if (!this.options.policy().blocking)
                throw new Error('desktop policy: no mandatory decision is active');
            if (typeof action !== 'string' || !['refresh', 'download', 'install', 'later', 'page', 'copy'].includes(action))
                throw new Error('desktop policy: invalid action');
            if (['download', 'install', 'later'].includes(action) && typeof version !== 'string')
                throw new Error('desktop policy: missing confirmed version');
            if (action === 'page' || action === 'copy')
                return this.navigate(action);
            if (this.confirmation !== undefined && (action === 'install' || action === 'later')) {
                if (version !== this.confirmation.version || confirmationRevision !== this.confirmation.revision) {
                    throw new Error('desktop policy: stale installation confirmation');
                }
                if (action === 'later' && !this.confirmation.active)
                    throw new Error('desktop policy: no task deferral is offered');
                this.deferred = action === 'later';
                this.finishConfirmation(action === 'install');
                this.sync();
                return Promise.resolve();
            }
            if (action === 'later')
                throw new Error('desktop policy: no installation confirmation');
            this.action ??= Promise.resolve().then(async () => {
                this.error = undefined;
                this.restart = undefined;
                this.deferred = false;
                this.clearNavigation();
                if (action === 'download')
                    this.attention.reset();
                this.sync();
                switch (action) {
                    case 'refresh':
                        await this.options.refresh();
                        break;
                    case 'download':
                        await this.options.download(version);
                        break;
                    case 'install':
                        await this.options.install(version);
                        break;
                }
            }).catch(() => {
                this.error = this.options.locale.messages.mandatoryActionFailed;
            }).finally(() => { this.action = undefined; this.sync(); });
            return this.action;
        });
    }
    /** Active modal used as the owner of shell installation-confirmation dialogs. */
    get confirmationWindow() { return this.embedded ? this.options.parent() : this.window; }
    /**
     * @param version - Updater-owned target, already downloaded and verified.
     * @param active - Fresh Host task inspection; unknown state must fail before calling.
     * @returns Explicit approval from this same modal, or false on deferral, policy clearance, or disposal.
     */
    confirm(version, active) {
        if (this.disposed || !this.options.policy().blocking)
            return Promise.resolve(false);
        this.finishConfirmation(false);
        this.deferred = false;
        this.restart = undefined;
        return new Promise((resolve) => {
            this.confirmation = { version, active, revision: ++this.confirmationRevision, resolve };
            this.sync();
            const parent = this.options.parent();
            const owner = this.confirmationWindow;
            if (parent !== undefined && owner !== undefined) {
                this.attention.ready(version, parent, owner, () => {
                    if (!this.disposed && this.options.policy().blocking && this.confirmation !== undefined)
                        this.focus();
                });
            }
            else
                this.finishConfirmation(false);
        });
    }
    /** @param active - Whether admitted tasks are actually being stopped after installation approval. */
    preparingRestart(active) {
        this.restart = active ? 'stopping-tasks' : 'preparing';
        this.attention.clear();
        this.sync();
    }
    /** Publish current status, create the block immediately, or close it only after policy clearance. */
    sync() {
        if (this.disposed)
            return;
        if (this.embedded) {
            const parent = this.options.parent();
            if (parent !== this.embeddedParent) {
                if (this.embeddedParent !== undefined && !this.embeddedParent.isDestroyed()) {
                    this.embeddedParent.webContents.off('did-finish-load', this.publishEmbedded);
                }
                this.embeddedBlocking = false;
                this.embeddedParent = parent;
                if (parent !== undefined && !parent.isDestroyed())
                    parent.webContents.on('did-finish-load', this.publishEmbedded);
            }
            if (parent === undefined || parent.isDestroyed())
                return;
        }
        if (!this.options.policy().blocking) {
            this.finishConfirmation(false);
            this.attention.reset();
            this.clearNavigation();
            this.restart = undefined;
            this.deferred = false;
            if (this.window !== undefined && this.closing === undefined) {
                const window = this.window;
                window.webContents.send(MANDATORY_IPC.state, this.view());
                this.closing = setTimeout(() => {
                    this.closing = undefined;
                    if (this.window === window)
                        this.window = undefined;
                    window.destroy();
                }, 150);
            }
            this.error = undefined;
            if (this.embedded && this.embeddedBlocking) {
                this.embeddedBlocking = false;
                this.embeddedParent?.webContents.send(MANDATORY_IPC.state, this.view());
            }
            return;
        }
        clearTimeout(this.closing);
        this.closing = undefined;
        if (this.navigationUrl !== this.options.policy().page)
            this.clearNavigation();
        if (this.options.update().phase === 'error')
            this.restart = undefined;
        if (this.embedded) {
            this.embeddedBlocking = true;
            this.embeddedParent?.webContents.send(MANDATORY_IPC.state, this.view());
            return;
        }
        if (this.window === undefined) {
            const parent = this.options.parent();
            if (parent === undefined)
                return;
            const window = this.options.overlays.create(parent, this.options.preload, this.options.locale.messages.mandatoryTitle, false);
            this.window = window;
            window.setMenu(null);
            window.on('close', (event) => { if (!this.disposed && this.options.policy().blocking) {
                event.preventDefault();
                app.quit();
            } });
            window.on('closed', () => { if (this.window === window)
                this.window = undefined; });
            window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
            window.webContents.on('will-navigate', (event, url) => { if (url !== page)
                event.preventDefault(); });
            window.webContents.on('render-process-gone', () => {
                if (!this.disposed)
                    void window.loadURL(page).catch(() => {
                        // A failed recovery keeps the parent blocked and leaves application exit available.
                        if (!window.isDestroyed())
                            window.setTitle(this.options.locale.messages.mandatoryActionFailed);
                    });
            });
            void window.loadURL(page).catch(() => {
                // The parent stays modal-blocked if its dedicated recovery document cannot load.
                if (!window.isDestroyed())
                    window.setTitle(this.options.locale.messages.mandatoryActionFailed);
            });
        }
        this.window.webContents.send(MANDATORY_IPC.state, this.view());
    }
    /** Focus the block instead of opening ordinary product or plugin interactions. */
    focus() {
        this.sync();
        const parent = this.options.parent();
        if (parent?.isDestroyed())
            return;
        if (parent?.isMinimized())
            parent.restore();
        parent?.show();
        if (this.embedded)
            parent?.focus();
        this.window?.show();
        this.window?.focus();
    }
    /** Detach IPC and release the modal during shutdown, including after the main window closes. */
    dispose() {
        this.disposed = true;
        clearTimeout(this.closing);
        this.closing = undefined;
        this.finishConfirmation(false);
        this.attention.reset();
        this.clearNavigation();
        ipcMain.removeHandler(MANDATORY_IPC.status);
        ipcMain.removeHandler(MANDATORY_IPC.action);
        if (this.embeddedParent !== undefined && !this.embeddedParent.isDestroyed()) {
            this.embeddedParent.webContents.off('did-finish-load', this.publishEmbedded);
            this.embeddedParent.webContents.send(MANDATORY_IPC.state, { ...this.view(), policy: { blocking: false, checking: false } });
        }
        this.window?.destroy();
        this.window = undefined;
    }
    view() {
        const locale = process.platform === 'win32'
            ? { ...this.options.locale, messages: { ...this.options.locale.messages,
                    mandatoryReadyDetail: this.options.locale.messages.updateDownloadedDetailWindows } }
            : this.options.locale;
        return { locale, policy: this.options.policy(), update: this.options.update(),
            deferred: this.deferred,
            ...(this.confirmation === undefined ? {}
                : { confirmation: { version: this.confirmation.version, active: this.confirmation.active, revision: this.confirmation.revision } }),
            ...(this.restart === undefined ? {} : { restart: this.restart }),
            ...(this.navigation === undefined ? {} : { navigation: this.navigation }),
            ...(this.error === undefined ? {} : { error: this.error }) };
    }
    finishConfirmation(approved) {
        const confirmation = this.confirmation;
        this.confirmation = undefined;
        this.attention.clear();
        confirmation?.resolve(approved);
    }
    clearNavigation() {
        this.navigation = undefined;
        this.navigationUrl = undefined;
        this.navigationEpoch++;
    }
    async navigate(action) {
        const url = desktopPolicyPage(this.options.policy().page, this.options.allowedPageOrigins);
        if (url === undefined)
            throw new Error('desktop policy: no allowed download page');
        if (this.navigationUrl !== url)
            this.clearNavigation();
        this.navigationUrl = url;
        if (action === 'page') {
            this.navigation = { page: 'requested' };
            this.navigationEpoch++;
        }
        const epoch = this.navigationEpoch;
        this.sync();
        try {
            if (action === 'copy') {
                await clipboard.writeText(url);
                if (await clipboard.readText() !== url)
                    throw new Error('desktop policy: clipboard did not retain download address');
            }
            else
                await shell.openExternal(url);
            if (epoch !== this.navigationEpoch || this.disposed)
                return;
            if (action === 'copy')
                this.navigation = { page: this.navigation?.page ?? 'requested', copy: 'copied' };
        }
        catch {
            if (epoch !== this.navigationEpoch || this.disposed)
                return;
            this.navigation = action === 'page' ? { ...this.navigation, page: 'failed' }
                : { page: this.navigation?.page ?? 'requested', copy: 'failed' };
        }
        this.sync();
    }
    assertSender(event) {
        if (this.embedded) {
            const parent = this.options.parent();
            if (parent === undefined || parent.isDestroyed() || event.sender !== parent.webContents
                || event.senderFrame !== parent.webContents.mainFrame) {
                throw new Error('desktop policy: rejected unowned renderer');
            }
            assertDesktopSender(event, ['app']);
            return;
        }
        if (event.sender !== this.window?.webContents || event.senderFrame !== this.window.webContents.mainFrame
            || event.senderFrame.url !== page)
            throw new Error('desktop policy: rejected unowned renderer');
    }
}
//# sourceMappingURL=mandatory-update-window.js.map