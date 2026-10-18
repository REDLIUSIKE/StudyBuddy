/** Marks the document root with the host platform so shared Web UI CSS can scope desktop-only rules. */
import { ipcRenderer } from 'electron';
import { DESKTOP_IPC } from "./ipc.js";
/**
 * Sets `data-platform` (e.g. `darwin`) on `<html>`, deferring to DOMContentLoaded
 * when the preload runs before the document root exists.
 */
export function markDocumentPlatform() {
    const mark = () => { document.documentElement.dataset.platform = process.platform; };
    // lib.dom types documentElement non-null, but a preload runs before the
    // document root exists.
    const root = document.documentElement;
    if (root === null)
        window.addEventListener('DOMContentLoaded', mark);
    else
        mark();
}
/**
 * Mirrors the window's macOS and Windows fullscreen state onto `<html data-fullscreen>` so
 * CSS drops the clearance for hidden native window controls. The main
 * process sends the state on every transition and after each load.
 */
export function syncWindowFullscreen() {
    // The main process sends this IPC only on macOS and Windows; other platforms need no listener.
    if (process.platform !== 'darwin' && process.platform !== 'win32')
        return;
    ipcRenderer.on(DESKTOP_IPC.windowFullscreen, (_event, fullscreen) => {
        const root = document.documentElement;
        if (root === null)
            return;
        if (fullscreen)
            root.dataset.fullscreen = 'true';
        else
            delete root.dataset.fullscreen;
    });
}
//# sourceMappingURL=preload-platform.js.map