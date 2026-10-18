import { join } from 'node:path';
import { DESKTOP_IPC } from "./ipc.js";
import { validImageSource } from "./image-context-target.js";
/** Bounded, process-local knowledge of explicitly downloaded images. */
export class DesktopImageActions {
    host;
    disposed = false;
    exports = new Map();
    pending = new Map();
    sessions = new Set();
    constructor(host) {
        this.host = host;
    }
    /** Open exactly five actions for a currently decoded image in the owned main document. */
    async open(value) {
        if (!this.isTarget(value) || this.disposed)
            return;
        const target = value;
        const owner = this.host.window();
        if (owner === undefined || owner.isDestroyed() || owner.webContents.isDestroyed())
            return;
        const scope = this.host.scope();
        const live = () => !this.disposed && this.host.window() === owner && !owner.isDestroyed()
            && !owner.webContents.isDestroyed() && this.host.scope() === scope;
        if (!await this.host.verify(owner, target) || !live())
            return;
        const guarded = (action) => async () => {
            if (live() && await this.host.verify(owner, target) && live())
                action();
        };
        const key = this.key(scope, target.src);
        const path = this.exports.get(key);
        const messages = this.host.messages();
        this.host.popup(owner, [
            { label: messages.imageOpenTab, click: guarded(() => owner.webContents.send(DESKTOP_IPC.imageAction, { action: 'open', target })) },
            { label: messages.imageAttach, click: guarded(() => owner.webContents.send(DESKTOP_IPC.imageAction, { action: 'attach', target })) },
            { label: messages.imageCopy, click: guarded(() => owner.webContents.copyImageAt(Math.floor(target.x), Math.floor(target.y))) },
            { label: messages.imageReveal, enabled: path !== undefined && this.host.fileExists(path), click: guarded(() => {
                    if (path !== undefined && this.host.fileExists(path))
                        this.host.reveal(path);
                }) },
            { label: messages.imageDownload, click: guarded(() => {
                    this.observeDownloads(owner.webContents.session);
                    this.pending.set(target.src, { owner, scope, target });
                    if (this.pending.size > 64)
                        this.pending.delete(this.pending.keys().next().value);
                    try {
                        owner.webContents.downloadURL(target.src);
                    }
                    catch {
                        this.pending.delete(target.src);
                    }
                }) },
        ]);
    }
    download = (_event, item, contents) => {
        const request = item.getURLChain().map(url => this.pending.get(url)).find(value => value !== undefined)
            ?? this.pending.get(item.getURL());
        if (request === undefined || contents !== request.owner.webContents)
            return;
        this.pending.delete(request.target.src);
        const mime = item.getMimeType().split(';')[0];
        const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
        const extension = extensions[mime ?? ''];
        if (extension === undefined) {
            item.cancel();
            return;
        }
        const name = request.target.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 96) || 'image';
        item.setSaveDialogOptions({ defaultPath: join(this.host.downloadsDirectory(), `${name}.${extension}`) });
        item.once('done', (_event, state) => {
            if (state !== 'completed' || this.disposed || this.host.scope() !== request.scope
                || this.host.window() !== request.owner || request.owner.isDestroyed())
                return;
            const path = item.getSavePath();
            if (!this.host.fileExists(path))
                return;
            this.exports.set(this.key(request.scope, request.target.src), path);
            if (this.exports.size > 128)
                this.exports.delete(this.exports.keys().next().value);
        });
    };
    observeDownloads(session) {
        if (this.sessions.has(session))
            return;
        this.sessions.add(session);
        session.on('will-download', this.download);
    }
    key(scope, src) { return `${scope}\n${src}`; }
    isTarget(value) {
        if (typeof value !== 'object' || value === null)
            return false;
        const target = value;
        return validImageSource(target.src) && typeof target.sessionId === 'string' && target.sessionId.length > 0 && target.sessionId.length <= 200
            && typeof target.name === 'string' && target.name.length <= 160
            && typeof target.x === 'number' && Number.isFinite(target.x) && target.x >= 0 && target.x < 100000
            && typeof target.y === 'number' && Number.isFinite(target.y) && target.y >= 0 && target.y < 100000;
    }
    dispose() {
        this.disposed = true;
        for (const session of this.sessions)
            session.off('will-download', this.download);
        this.sessions.clear();
        this.pending.clear();
        this.exports.clear();
    }
}
/** Recheck the actual pointer target before showing a menu and before native actions. */
export async function verifyImageTarget(owner, target) {
    const request = JSON.stringify(target);
    return owner.webContents.executeJavaScript(`(() => {
    const target = ${request}; const image = document.elementFromPoint(target.x, target.y);
    if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0
      || (image.currentSrc || image.src) !== target.src) return false;
    const owner = image.closest('[data-chat-session]');
    if (owner) return owner.getAttribute('data-chat-session') === target.sessionId;
    return image.closest('[data-image-lightbox]') !== null && Array.from(document.querySelectorAll('[data-chat-session] img'))
      .some(original => (original.currentSrc || original.src) === target.src && original.closest('[data-chat-session]').getAttribute('data-chat-session') === target.sessionId);
  })()`).then(value => value === true, () => false);
}
//# sourceMappingURL=image-actions.js.map