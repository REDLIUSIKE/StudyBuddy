let electron = require("electron");
//#region lib/types/preload-studybuddy-aigc.js
/** AIGC's isolated guest receives only the closed, Main-validated page action capability. */
if (process.isMainFrame && location.protocol === "http:" && location.hostname === "127.0.0.1") electron.contextBridge.exposeInMainWorld("aigcHost", { request: async (action) => {
	const result = await electron.ipcRenderer.invoke("studybuddy:aigc-guest-action", action);
	if (!result.ok) throw Error(result.error?.code ?? "AIGC_ACTION_FAILED");
	return result.data;
} });
//#endregion
