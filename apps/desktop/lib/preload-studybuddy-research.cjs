let electron = require("electron");
//#region lib/types/studybuddy/research-guest-preload.js
/** The local guest receives closed page actions; official-site actions open the system browser via Main. */
const channel = "studybuddy:research-guest-action";
if (process.isMainFrame && location.protocol === "http:" && location.hostname === "127.0.0.1") electron.contextBridge.exposeInMainWorld("researchHost", { request: async (action) => {
	const result = await electron.ipcRenderer.invoke(channel, action);
	if (!result.ok) throw Error(result.error?.code ?? "RESEARCH_ACTION_FAILED");
	return result.data;
} });
//#endregion
