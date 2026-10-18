/** The local guest receives closed page actions; official-site actions open the system browser via Main. */
import { contextBridge, ipcRenderer } from 'electron';
const channel = 'studybuddy:research-guest-action';
if (process.isMainFrame && location.protocol === 'http:' && location.hostname === '127.0.0.1') {
    contextBridge.exposeInMainWorld('researchHost', { request: async (action) => {
            const result = await ipcRenderer.invoke(channel, action);
            if (!result.ok)
                throw Error(result.error?.code ?? 'RESEARCH_ACTION_FAILED');
            return result.data;
        } });
}
//# sourceMappingURL=research-guest-preload.js.map