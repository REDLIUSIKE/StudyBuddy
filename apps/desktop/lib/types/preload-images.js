/** Image-only DOM capture and a disposable notice bridge for the application top frame. */
import { ipcRenderer } from 'electron';
import { DESKTOP_IPC } from "./ipc.js";
import { imageContextTarget } from "./image-context-target.js";
export function createDesktopImageBridge() {
    return { subscribe(listener) {
            const handle = (_event, action) => { listener(action); };
            ipcRenderer.on(DESKTOP_IPC.imageAction, handle);
            return () => { ipcRenderer.off(DESKTOP_IPC.imageAction, handle); };
        } };
}
export function installImageContextMenu() {
    window.addEventListener('contextmenu', event => {
        const target = imageContextTarget(event.target, document);
        if (target === undefined)
            return;
        event.preventDefault();
        event.stopPropagation();
        void ipcRenderer.invoke(DESKTOP_IPC.imageContext, { ...target, x: event.clientX, y: event.clientY }).catch(() => { });
    }, true);
}
//# sourceMappingURL=preload-images.js.map