/** AIGC's isolated guest receives only the closed, Main-validated page action capability. */
import { contextBridge, ipcRenderer } from 'electron';
if (process.isMainFrame && location.protocol === 'http:' && location.hostname === '127.0.0.1') {
    contextBridge.exposeInMainWorld('aigcHost', { request: async (action) => {
            const result = await ipcRenderer.invoke('studybuddy:aigc-guest-action', action);
            if (!result.ok)
                throw Error(result.error?.code ?? 'AIGC_ACTION_FAILED');
            return result.data;
        } });
}
//# sourceMappingURL=preload-studybuddy-aigc.js.map