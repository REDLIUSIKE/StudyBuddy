let electron = require("electron");
//#region ../../packages/util/crypto/lib/index.js
/**
* Random v4 UUID, minted from `crypto.getRandomValues`.
* @returns the UUID string.
*/
function randomUUID() {
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	const hex = Array.from(bytes, (byte, index) => {
		return (index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte).toString(16).padStart(2, "0");
	}).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
//#endregion
//#region lib/types/studybuddy/community-types.js
/** Dedicated channels keep remote Skill operations outside the model and tool-center bridge. */
const COMMUNITY_IPC = {
	acquire: "studybuddy:community-acquire",
	release: "studybuddy:community-release",
	theme: "studybuddy:community-theme",
	visible: "studybuddy:community-visible",
	invalid: "studybuddy:community-invalid",
	navigation: "studybuddy:community-navigation",
	startup: "studybuddy:skill-startup",
	invoke: "studybuddy:skill-invoke",
	event: "studybuddy:skill-event"
};
//#endregion
//#region lib/types/preload-studybuddy-skills.js
/** The remote Skill page receives only its original command transport and opaque event channels. */
if (process.isMainFrame && location.origin === "https://guijitongzhuo.com" && location.pathname === "/skills" && new URLSearchParams(location.search).get("host_ui") === "harness") {
	const startup = electron.ipcRenderer.sendSync(COMMUNITY_IPC.startup);
	if (startup && typeof startup === "object" && "bindingId" in startup && typeof startup.bindingId === "string" && /^[a-f0-9]{64}$/.test(startup.bindingId) && "operationId" in startup && typeof startup.operationId === "string") {
		const channels = /* @__PURE__ */ new Map(), watches = /* @__PURE__ */ new Map();
		electron.ipcRenderer.on(COMMUNITY_IPC.event, (_event, notice) => {
			if (!notice || typeof notice !== "object" || !("channelId" in notice) || typeof notice.channelId !== "string" || !("payload" in notice)) return;
			const callback = channels.get(notice.channelId);
			try {
				callback?.(notice.payload);
			} catch {}
		});
		const transport = {
			channel(callback) {
				if (typeof callback !== "function" || channels.size >= 1024) throw Error("SKILL_CHANNEL_UNAVAILABLE");
				const id = randomUUID();
				channels.set(id, callback);
				return id;
			},
			async invoke(command, input) {
				try {
					const response = await electron.ipcRenderer.invoke(COMMUNITY_IPC.invoke, command, input);
					if (!response || typeof response !== "object" || !("ok" in response) || typeof response.ok !== "boolean") throw Error("SKILL_NATIVE_RESPONSE_INVALID");
					if (!response.ok) {
						if (typeof input.onChange === "string") channels.delete(input.onChange);
						return response;
					}
					const data = "data" in response ? response.data : null;
					if (command === "skill_center_watch_start" && typeof input.onChange === "string" && data && typeof data === "object" && "watchId" in data && typeof data.watchId === "string") watches.set(data.watchId, input.onChange);
					if (command === "skill_center_watch_stop" && typeof input.watchId === "string") {
						const channel = watches.get(input.watchId);
						if (channel) channels.delete(channel);
						watches.delete(input.watchId);
					}
					return response;
				} catch (error) {
					if (typeof input.onChange === "string") channels.delete(input.onChange);
					throw error;
				} finally {
					if (typeof input.onProgress === "string") channels.delete(input.onProgress);
				}
			}
		};
		electron.contextBridge.exposeInMainWorld("__STUDYBUDDY_SKILL_STARTUP__", startup);
		electron.contextBridge.exposeInMainWorld("__STUDYBUDDY_SKILL_NATIVE__", transport);
		window.addEventListener("pagehide", () => {
			channels.clear();
			watches.clear();
		}, { once: true });
	}
}
//#endregion
