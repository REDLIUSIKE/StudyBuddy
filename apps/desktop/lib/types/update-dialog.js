/** Main-owned update confirmations; closing or replacing a dialog never grants installation permission. */
import { ipcMain } from 'electron';
/** Channels available only to the isolated update-dialog document. */
export const UPDATE_DIALOG_IPC = { status: 'dsh-update-dialog:status', changed: 'dsh-update-dialog:changed', respond: 'dsh-update-dialog:respond' };
// main.ts's protocol.handle shell route serves this document and its renderer assets; the modal requires that route.
const page = 'dsh-app://shell/update-dialog.html';
/** One fading backdrop with replaceable confirmation content; aborted checks and mandatory policy cancel ordinary prompts. */
export class DesktopUpdateDialog {
    preload;
    locale;
    overlays;
    disposed = false;
    revision = 0;
    window;
    parent;
    closing;
    active;
    /** Focus the current explanation or confirmation without replacing it or granting permission. */
    focus() { this.active?.window.focus(); }
    /** Whether a shell prompt is awaiting a response. */
    get isOpen() { return this.active !== undefined; }
    /**
     * @param preload - Bundled isolated preload.
     * @param locale - Shell-owned copy or a reader of the current UI language.
     * @param overlays - Application-owned overlay creation and input tracking.
     */
    constructor(preload, locale, overlays) {
        this.preload = preload;
        this.locale = locale;
        this.overlays = overlays;
        ipcMain.handle(UPDATE_DIALOG_IPC.status, (event) => { this.owned(event); return this.active?.view ?? null; });
        ipcMain.handle(UPDATE_DIALOG_IPC.respond, (event, revision, index) => {
            this.owned(event);
            const active = this.active;
            if (active === undefined || revision !== active.view.revision)
                throw new Error('desktop update: stale dialog response');
            if (typeof index !== 'number' || !Number.isInteger(index)
                || (index !== active.view.cancelId && (index < 0 || index >= active.view.buttons.length))) {
                throw new Error('desktop update: invalid dialog response');
            }
            active.finish(index);
        });
    }
    /**
     * @param parent - Window blocked by this confirmation.
     * @param options - Main-owned localized content, response choices, and optional cancellation signal.
     * @returns A displayed response, or cancellation on replacement, abort, close, or load failure; backdrop dismissal fades independently.
     */
    show(parent, options) {
        const locale = typeof this.locale === 'function' ? this.locale() : this.locale;
        const buttons = options.buttons ?? [locale.messages.updateAcknowledge];
        const cancelId = options.cancelId ?? buttons.length - 1;
        if (this.disposed || options.signal?.aborted === true || parent.isDestroyed()) {
            return Promise.resolve({ response: cancelId, checkboxChecked: false });
        }
        if (this.parent !== parent) {
            this.cancel();
            this.close();
        }
        this.active?.finish(this.active.view.cancelId, true);
        clearTimeout(this.closing);
        this.closing = undefined;
        const existing = this.window;
        const window = existing ?? this.overlays.create(parent, this.preload, options.title ?? locale.messages.updateTitle, false);
        this.window = window;
        this.parent = parent;
        const view = { revision: ++this.revision, locale: locale.id, title: options.title ?? '', message: options.message,
            detail: options.detail ?? '', buttons, cancelId, closeLabel: locale.messages.updateClose,
            technicalDetails: options.technicalDetails ?? '', technicalDetailsLabel: locale.messages.updateTechnicalDetails };
        return new Promise((resolve) => {
            const abort = () => { finish(cancelId); };
            const finish = (response, retain = false) => {
                if (this.active?.view !== view)
                    return;
                this.active = undefined;
                options.signal?.removeEventListener('abort', abort);
                if (!retain && !window.isDestroyed()) {
                    window.webContents.send(UPDATE_DIALOG_IPC.changed, null);
                    this.closing = setTimeout(() => { this.close(); }, 150);
                }
                resolve({ response, checkboxChecked: false });
            };
            this.active = { window, view, finish };
            options.signal?.addEventListener('abort', abort, { once: true });
            if (existing !== undefined) {
                window.webContents.send(UPDATE_DIALOG_IPC.changed, view);
                return;
            }
            const failed = () => { if (this.window === window) {
                this.cancel();
                this.close();
            } };
            window.once('closed', failed);
            window.webContents.on('will-navigate', (event, url) => { if (url !== page)
                event.preventDefault(); });
            window.webContents.once('render-process-gone', failed);
            void window.loadURL(page).catch(failed);
        });
    }
    /** Cancel the displayed prompt without authorizing any operation. */
    cancel() { this.active?.finish(this.active.view.cancelId); }
    /** Close the document and detach its private IPC handlers. */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.cancel();
        this.close();
        ipcMain.removeHandler(UPDATE_DIALOG_IPC.status);
        ipcMain.removeHandler(UPDATE_DIALOG_IPC.respond);
    }
    close() {
        clearTimeout(this.closing);
        this.closing = undefined;
        const window = this.window;
        this.window = undefined;
        this.parent = undefined;
        if (window !== undefined && !window.isDestroyed())
            window.destroy();
    }
    owned(event) {
        const window = this.window;
        if (window === undefined || event.sender !== window.webContents
            || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page) {
            throw new Error('desktop update: rejected unowned dialog renderer');
        }
    }
}
//# sourceMappingURL=update-dialog.js.map