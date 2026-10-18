let electron = require("electron");
//#region lib/types/studybuddy/types.js
/** Private product channels; no renderer-supplied URL or token is accepted. */
const STUDYBUDDY_IPC = {
	status: "studybuddy:auth-status",
	start: "studybuddy:auth-start",
	cancel: "studybuddy:auth-cancel",
	logout: "studybuddy:auth-logout",
	state: "studybuddy:auth-state",
	updates: "studybuddy:updates-check",
	business: "studybuddy:business-invoke",
	embeddedAcquire: "studybuddy:embedded-acquire",
	embeddedRelease: "studybuddy:embedded-release",
	embeddedTheme: "studybuddy:embedded-theme",
	embeddedInvalid: "studybuddy:embedded-invalid",
	toolsAcquire: "studybuddy:tools-acquire",
	toolsResize: "studybuddy:tools-resize",
	toolsVisible: "studybuddy:tools-visible",
	toolsTheme: "studybuddy:tools-theme",
	toolsRelease: "studybuddy:tools-release",
	toolsInvalid: "studybuddy:tools-invalid",
	toolPageState: "studybuddy:tool-page-state",
	toolOperation: "studybuddy:tool-operation",
	toolNavigate: "studybuddy:tool-navigate",
	toolInstallSubscribe: "studybuddy:tool-install-subscribe",
	toolInstallUnsubscribe: "studybuddy:tool-install-unsubscribe",
	toolInstallEvent: "studybuddy:tool-install-event",
	toolNavigation: "studybuddy:tool-navigation"
};
//#endregion
//#region lib/types/studybuddy/tool-center-preload.js
/** The tool page receives only fixed named operations, never generic IPC or Electron. */
/** @param transport Private preload transport. @returns Fixed methods and UI-safe state; the lease stays inside this closure. */
function createToolPageApi(transport) {
	const unwrap = async (promise) => {
		const reply = await promise;
		if (!reply.ok) throw {
			...reply.error,
			code: reply.error?.code ?? "TOOL_OPERATION_FAILED",
			message: reply.error?.message ?? reply.error?.code ?? "TOOL_OPERATION_FAILED"
		};
		return reply.data;
	};
	let boot;
	const owner = () => boot ??= unwrap(transport.invoke(STUDYBUDDY_IPC.toolPageState));
	const call = async (method, args) => {
		const { owner: lease } = await owner();
		return unwrap(transport.invoke(STUDYBUDDY_IPC.toolOperation, lease.lease, method, args));
	};
	const labsCall = async (method, args) => {
		const { owner: lease } = await owner();
		return unwrap(transport.invoke(STUDYBUDDY_IPC.toolOperation, lease.lease, method, args));
	};
	const api = {
		startSkillSafetyAssistant: (input) => labsCall("startSkillSafetyAssistant", [input]),
		getSkillSafetyScannerStatus: () => labsCall("getSkillSafetyScannerStatus", []),
		prepareSkillSafetyScanner: (input) => labsCall("prepareSkillSafetyScanner", [input]),
		cancelSkillSafetyScannerPreparation: (input) => labsCall("cancelSkillSafetyScannerPreparation", [input]),
		getCodexChineseStatus: () => call("getCodexChineseStatus", []),
		applyCodexChinese: () => call("applyCodexChinese", []),
		restoreCodexChinese: () => call("restoreCodexChinese", []),
		addNativeUserModel: (...args) => call("addNativeUserModel", args),
		checkNativeUserSource: (...args) => call("checkNativeUserSource", args),
		configureSource: (...args) => call("configureSource", args),
		connectNativeTool: (...args) => call("connectNativeTool", args),
		connectNativeUserSource: (...args) => call("connectNativeUserSource", args),
		deleteNativeUserModel: (...args) => call("deleteNativeUserModel", args),
		getConfigurationViews: (toolId) => call("getConfigurationViews", toolId === void 0 ? [] : [toolId]),
		getDirectoryStates: (toolId) => call("getDirectoryStates", toolId === void 0 ? [] : [toolId]),
		getNativeRememberedChoices: (...args) => call("getNativeRememberedChoices", args),
		getNativeSourceCandidates: (...args) => call("getNativeSourceCandidates", args),
		getNativeToolCatalog: (...args) => call("getNativeToolCatalog", args),
		getNativeToolUserApiUsage: (...args) => call("getNativeToolUserApiUsage", args),
		getNativeUserModels: (...args) => call("getNativeUserModels", args),
		getSourceConfigurationContext: (...args) => call("getSourceConfigurationContext", args),
		launchNativeTool: (...args) => call("launchNativeTool", args),
		listNativeConnectionUi: (...args) => call("listNativeConnectionUi", args),
		listNativeUserModelRegistrations: (...args) => call("listNativeUserModelRegistrations", args),
		listNativeUserSources: (...args) => call("listNativeUserSources", args),
		openNativeToolInstall: (...args) => call("openNativeToolInstall", args),
		pickNativeWorkingDirectory: (...args) => call("pickNativeWorkingDirectory", args),
		pingNativeUserModel: (...args) => call("pingNativeUserModel", args),
		rememberNativeModelChoice: (...args) => call("rememberNativeModelChoice", args),
		reorderNativeUserModels: (...args) => call("reorderNativeUserModels", args),
		restoreNativeConnectionUi: (...args) => call("restoreNativeConnectionUi", args),
		resumeNativeUserModelSave: (...args) => call("resumeNativeUserModelSave", args),
		resumeNativeUserSourceSave: (...args) => call("resumeNativeUserSourceSave", args),
		retryNativeConnectionUi: (...args) => call("retryNativeConnectionUi", args),
		saveNativeUserModel: (...args) => call("saveNativeUserModel", args),
		saveNativeUserSource: (...args) => call("saveNativeUserSource", args),
		scanNativeTools: (...args) => call("scanNativeTools", args),
		testNativeUserModel: (...args) => call("testNativeUserModel", args),
		updateNativeUserModel: (...args) => call("updateNativeUserModel", args),
		getManagedInstallRoot: (...args) => call("getManagedInstallRoot", args),
		listInstallDrives: (...args) => call("listInstallDrives", args),
		setManagedInstallRoot: (...args) => call("setManagedInstallRoot", args),
		recoverManagedInstallRoot: (...args) => call("recoverManagedInstallRoot", args),
		prepareToolInstallation: (...args) => call("prepareToolInstallation", args),
		startInstall: (...args) => call("startInstall", args),
		getActiveInstall: (...args) => call("getActiveInstall", args),
		getInstallRun: (...args) => call("getInstallRun", args),
		retryInstallComponent: (...args) => call("retryInstallComponent", args),
		repairInstallComponent: (...args) => call("repairInstallComponent", args),
		cancelInstall: (...args) => call("cancelInstall", args),
		resumeInstall: (...args) => call("resumeInstall", args),
		listManagedComponents: (...args) => call("listManagedComponents", args),
		uninstallManagedComponent: (...args) => call("uninstallManagedComponent", args),
		exportInstallDiagnostics: (...args) => call("exportInstallDiagnostics", args),
		uploadDetectionFailureLogs: (...args) => call("uploadDetectionFailureLogs", args),
		uploadInstallFailureLogs: (...args) => call("uploadInstallFailureLogs", args),
		listPersistentTools: (...args) => call("listPersistentTools", args),
		restoreOfficialLogin: (...args) => call("restoreOfficialLogin", args),
		restoreToolOfficialLogin: (...args) => call("restoreToolOfficialLogin", args),
		resumeNativeToolRuntime: (...args) => call("resumeNativeToolRuntime", args),
		getNativeToolUserKeys: (...args) => call("getNativeToolUserKeys", args),
		listenInstallEvents: (listener) => listen(listener)
	};
	const listeners = /* @__PURE__ */ new Set();
	let offEvents, subscribing;
	const listen = async (listener) => {
		listeners.add(listener);
		offEvents ??= transport.on(STUDYBUDDY_IPC.toolInstallEvent, (payload) => {
			for (const current of [...listeners]) try {
				current(payload);
			} catch (error) {
				console.error("Tool install listener failed", error);
			}
		});
		try {
			await (subscribing ??= owner().then(({ owner: lease }) => unwrap(transport.invoke(STUDYBUDDY_IPC.toolInstallSubscribe, lease.lease))));
		} catch (error) {
			listeners.delete(listener);
			if (!listeners.size) {
				offEvents();
				offEvents = void 0;
				subscribing = void 0;
			}
			throw error;
		}
		return () => {
			listeners.delete(listener);
			if (!listeners.size) {
				offEvents?.();
				offEvents = void 0;
				subscribing = void 0;
				owner().then(({ owner: lease }) => unwrap(transport.invoke(STUDYBUDDY_IPC.toolInstallUnsubscribe, lease.lease))).catch((error) => console.error("Tool install unsubscription failed", error));
			}
		};
	};
	return {
		api,
		state: () => unwrap(transport.invoke(STUDYBUDDY_IPC.toolPageState)).then((value) => value.state),
		subscribeState: (listener) => transport.on(STUDYBUDDY_IPC.toolPageState, (value) => listener(value)),
		navigate: async (target) => {
			const { owner: lease } = await owner();
			await unwrap(transport.invoke(STUDYBUDDY_IPC.toolNavigate, lease.lease, target));
		}
	};
}
/** Install only on the exact registered document's main frame. */
function exposeToolCenter() {
	if (!process.isMainFrame || !["dsh-tools://tool-center/index.html", "dsh-tools://tool-center/labs.html"].includes(location.href)) return;
	electron.contextBridge.exposeInMainWorld("studybuddyTools", createToolPageApi({
		invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args),
		on: (channel, listener) => {
			const callback = (_event, value) => listener(value);
			electron.ipcRenderer.on(channel, callback);
			return () => {
				electron.ipcRenderer.off(channel, callback);
			};
		}
	}));
}
//#endregion
//#region lib/types/preload-studybuddy-tools.js
/** Fixed sandboxed preload for the packaged StudyBuddy tool module. */
exposeToolCenter();
//#endregion
