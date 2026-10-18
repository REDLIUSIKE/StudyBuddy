/** Isolated bridge for the shell-owned mandatory-update modal only. */
import { contextBridge, ipcRenderer } from 'electron';
import { MANDATORY_IPC } from "./mandatory-update-ipc.js";
const api = {
    status: () => ipcRenderer.invoke(MANDATORY_IPC.status),
    action: (action, version, confirmationRevision) => ipcRenderer.invoke(MANDATORY_IPC.action, action, version, confirmationRevision),
    subscribe(listener) {
        const handle = (_event, state) => { listener(state); };
        ipcRenderer.on(MANDATORY_IPC.state, handle);
        return () => { ipcRenderer.off(MANDATORY_IPC.state, handle); };
    },
};
if (location.href === 'dsh-app://shell/mandatory-update.html')
    contextBridge.exposeInMainWorld('dshMandatoryUpdate', api);
//# sourceMappingURL=preload-mandatory.js.map