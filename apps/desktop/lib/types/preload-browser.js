/** Lease-scoped browser operations and one main-process event subscription per window. */
import { ipcRenderer } from 'electron';
import { DESKTOP_IPC } from "./ipc.js";
/** @returns browser operations that expose neither IPC nor Electron objects. */
export function createDesktopBrowserBridge() {
    const listeners = new Map();
    ipcRenderer.on(DESKTOP_IPC.browserOpenRequested, (_event, request) => {
        if (typeof request !== 'object' || request === null || !('lease' in request) || !('url' in request)
            || typeof request.lease !== 'string' || typeof request.url !== 'string')
            return;
        const callbacks = listeners.get(request.lease);
        if (callbacks === undefined)
            return;
        for (const callback of [...callbacks]) {
            try {
                callback(request.url);
            }
            catch (error) {
                console.error('Desktop browser link handler failed', error);
            }
        }
    });
    return {
        acquire: workspace => ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace),
        release: lease => ipcRenderer.invoke(DESKTOP_IPC.browserRelease, lease),
        onOpenRequested(lease, listener) {
            let callbacks = listeners.get(lease);
            if (callbacks === undefined) {
                callbacks = new Set();
                listeners.set(lease, callbacks);
            }
            callbacks.add(listener);
            return () => {
                callbacks.delete(listener);
                if (callbacks.size === 0 && listeners.get(lease) === callbacks)
                    listeners.delete(lease);
            };
        },
    };
}
//# sourceMappingURL=preload-browser.js.map