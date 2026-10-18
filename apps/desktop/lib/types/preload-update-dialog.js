/** Isolated response-only bridge for shell-owned update dialogs. */
import { contextBridge, ipcRenderer } from 'electron';
import { UPDATE_DIALOG_IPC } from "./update-dialog.js";
const api = {
    status: () => ipcRenderer.invoke(UPDATE_DIALOG_IPC.status),
    respond: (revision, index) => ipcRenderer.invoke(UPDATE_DIALOG_IPC.respond, revision, index),
    subscribe: (listener) => {
        const receive = (_event, view) => { listener(view); };
        ipcRenderer.on(UPDATE_DIALOG_IPC.changed, receive);
        return () => { ipcRenderer.removeListener(UPDATE_DIALOG_IPC.changed, receive); };
    },
};
if (location.href === 'dsh-app://shell/update-dialog.html')
    contextBridge.exposeInMainWorld('dshUpdateDialog', api);
//# sourceMappingURL=preload-update-dialog.js.map