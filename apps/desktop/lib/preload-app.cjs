var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
//#endregion
let electron = require("electron");
//#region lib/types/ipc.js
/** Typed preload operations exposed only by the Electron shell. */
/** IPC channel names kept private to the desktop application bundle. */
const DESKTOP_IPC = {
	imageContext: "dsh-desktop:image-context",
	imageAction: "dsh-desktop:image-action",
	shortcutsInput: "dsh-desktop:shortcuts-input",
	shortcutsCloseWindow: "dsh-desktop:shortcuts-close-window",
	shortcutsGet: "dsh-desktop:shortcuts-get",
	shortcutsEdit: "dsh-desktop:shortcuts-edit",
	shortcutsChanged: "dsh-desktop:shortcuts-changed",
	shortcutsRecording: "dsh-desktop:shortcuts-recording",
	boot: "dsh-desktop:boot",
	enterWorkspace: "dsh-desktop:enter-workspace",
	onboardingActive: "dsh-desktop:onboarding-active",
	onboardingApiKey: "dsh-desktop:onboarding-api-key",
	bootFailed: "dsh-desktop:boot-failed",
	browserAcquire: "dsh-desktop:browser-acquire",
	browserRelease: "dsh-desktop:browser-release",
	browserOpenRequested: "dsh-desktop:browser-open-requested",
	directoryPick: "dsh-desktop:directory-pick",
	deviceInfo: "dsh-desktop:device-info",
	localeBootstrap: "dsh-desktop:locale-bootstrap",
	localeChanged: "dsh-desktop:locale-changed",
	updatesStatus: "dsh-desktop:updates-status",
	updatesOpen: "dsh-desktop:updates-open",
	updatesPresentation: "dsh-desktop:updates-presentation",
	nativeThemeSet: "dsh-desktop:native-theme-set",
	windowFullscreen: "dsh-desktop:window-fullscreen",
	windowsAppearance: "dsh-desktop:windows-appearance",
	windowsMenu: "dsh-desktop:windows-menu"
};
//#endregion
//#region lib/types/platform-ipc.js
/** Shared names for the desktop Platform bridge. */
/** Private desktop channels; the Platform renderer receives bootstrap and locale updates. */
const PLATFORM_IPC = {
	bootstrap: "dsh-platform:bootstrap",
	localeChanged: "dsh-platform:locale-changed",
	open: "dsh-platform:open",
	bounds: "dsh-platform:bounds",
	close: "dsh-platform:close"
};
//#endregion
//#region lib/types/preload-platform.js
/** Marks the document root with the host platform so shared Web UI CSS can scope desktop-only rules. */
/**
* Sets `data-platform` (e.g. `darwin`) on `<html>`, deferring to DOMContentLoaded
* when the preload runs before the document root exists.
*/
function markDocumentPlatform() {
	const mark = () => {
		document.documentElement.dataset.platform = process.platform;
	};
	if (document.documentElement === null) window.addEventListener("DOMContentLoaded", mark);
	else mark();
}
/**
* Mirrors the window's macOS and Windows fullscreen state onto `<html data-fullscreen>` so
* CSS drops the clearance for hidden native window controls. The main
* process sends the state on every transition and after each load.
*/
function syncWindowFullscreen() {
	if (process.platform !== "darwin" && process.platform !== "win32") return;
	electron.ipcRenderer.on(DESKTOP_IPC.windowFullscreen, (_event, fullscreen) => {
		const root = document.documentElement;
		if (root === null) return;
		if (fullscreen) root.dataset.fullscreen = "true";
		else delete root.dataset.fullscreen;
	});
}
//#endregion
//#region lib/types/preload-theme.js
/** Mirrors the Web UI's theme source into Electron's native theme so native chrome and Platform login pages follow the app palette. */
/** Root attribute written by the Web UI's theme bootstrap and presenter (ui-theme / ui-layout). */
const THEME_SOURCE_ATTRIBUTE = "data-ds-theme-source";
/**
* Watches `html[data-ds-theme-source]` and forwards each value to the main
* process, which sets `nativeTheme.themeSource`. Native chrome and renderer
* `prefers-color-scheme` queries on every platform then follow the app's
* theme preference instead of the OS appearance while `system` keeps
* following the OS; the macOS sidebar vibrancy material is one such consumer.
* The main process reads the same value back as `shouldUseDarkColors` when a
* Platform login link needs the resolved palette.
*/
function syncNativeTheme() {
	let sent;
	const send = () => {
		const value = document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE);
		if (value === null || value === sent) return;
		sent = value;
		electron.ipcRenderer.send(DESKTOP_IPC.nativeThemeSet, value);
	};
	const observe = () => {
		new MutationObserver(send).observe(document.documentElement, { attributeFilter: [THEME_SOURCE_ATTRIBUTE] });
		send();
	};
	if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", observe, { once: true });
	else observe();
}
//#endregion
//#region lib/types/locale.js
/** Typed English and Chinese copy owned by the Electron shell. */
const en = {
	imageOpenTab: "Open image in new tab",
	imageAttach: "Add to chat",
	imageCopy: "Copy image",
	imageReveal: "Show in file manager",
	imageDownload: "Download copy",
	growthSaveTitle: "Save token growth image",
	growthSaveFilename: "StudyBuddy-Token-Growth.png",
	growthSaveFilter: "PNG image",
	cliCommandMenu: "Manage dsh Command…",
	cliCommandTitle: "Manage dsh Command",
	cliCommandLocation: "Desktop command: {path}",
	cliCommandSelected: "Current dsh command: {path}",
	cliCommandTarget: "Current launcher target: {path}",
	cliCommandShadowed: "Another dsh takes precedence. Remove or reorder that installation to use the Desktop command by default. You can also run the Desktop command by its full path.",
	cliCommandSelectionUnknown: "Your shell command could not be verified. An alias or another dsh installation may take precedence.",
	cliCommandInstalled: "The Desktop command is installed.",
	cliCommandNotInstalled: "Add the Desktop command to your terminal.",
	cliCommandBroken: "The Desktop command needs repair.",
	cliCommandInstall: "Install",
	cliCommandRepair: "Repair",
	cliCommandRemove: "Remove",
	cliCommandClose: "Close",
	cliCommandSwitch: "Continue with the Desktop command?",
	cliCommandPreserve: "An existing command will be preserved. Other installations and shell startup files will not be changed.",
	cliCommandContinue: "Continue",
	cliCommandInstallApp: "Install Desktop in your Applications folder before managing the dsh command.",
	cliCommandUpdating: "An update is being installed. Manage the command after installation finishes.",
	cliCommandNewTerminal: "Open a new terminal and run dsh --version.",
	cliCommandRemoved: "Desktop command registration removed.",
	cliCommandPreviousRestored: "The previous launcher has been restored.",
	cliCommandOtherKept: "Other command installations have been left in place.",
	cliCommandBackupKept: "A previous launcher is preserved at: {path}",
	cliCommandChanged: "The command or PATH changed while this dialog was open. Open Manage dsh Command again to review the current state.",
	cliCommandOwnershipError: "The command registration or backup changed. No unrelated command was removed.",
	cliCommandFailed: "The command could not be updated. Check that the application is installed and the destination is writable, then retry.",
	application: "Application",
	fileMenu: "File",
	closePage: "Close Page or Window",
	aboutMenu: "About StudyBuddy",
	aboutProduct: "StudyBuddy",
	aboutVersion: "Version V{version}",
	hideApplication: "Hide StudyBuddy",
	hideOtherApplications: "Hide Others",
	showAllApplications: "Show All",
	quitApplication: "Quit StudyBuddy",
	openApplication: "Open StudyBuddy",
	quit: "Quit",
	cancel: "Cancel",
	quitTitle: "Quit StudyBuddy?",
	quitActiveTasks: "Running tasks will be interrupted.",
	quitScheduledTasks: "Scheduled tasks will not run while the app is closed.",
	quitActiveAndScheduledTasks: "Running tasks will be interrupted, and scheduled tasks will not run while the app is closed.",
	backgroundNoticeBody: "Running tasks will continue. You can reopen the window from the system tray.",
	backgroundNoticeConfirm: "Confirm",
	edit: "Edit",
	menuBar: "Application menu",
	delete: "Delete",
	undo: "Undo",
	redo: "Redo",
	cut: "Cut",
	copy: "Copy",
	paste: "Paste",
	selectAll: "Select All",
	startupFailed: "StudyBuddy is unavailable",
	fatalSummary: "The application could not start or stopped unexpectedly.",
	startupAddressInUse: "Another DSH instance (such as dsh web or the desktop app) is running. They cannot start at the same time. Quit the other running DSH instance, then restart.",
	diagnosticTruncated: "… Error details shortened.",
	reportWrittenTo: "Diagnostic report: {path}",
	startupReinstallAdvice: "If application files are missing or damaged, close the application and reinstall it. Your tasks are stored separately.",
	exitApplication: "Exit",
	restartApplication: "Restart",
	recoveryOperationFailed: "The recovery operation failed",
	disableThirdPartyPlugins: "Disable third-party plugins, back up profile patch, and restart",
	welcomeTitle: "StudyBuddy",
	welcomeBrand: "StudyBuddy",
	welcomeTaglineBefore: "Welcome to ",
	welcomeTaglineBrand: "StudyBuddy",
	welcomeTaglineAfter: "",
	welcomeDescription: "Build potential. Explore intelligence.",
	welcomeAuthStarting: "Opening sign in…",
	welcomeAuthWaiting: "Browser didn’t open automatically?",
	welcomeAuthWaitingDescription: "Copy the sign-in link and open it in your browser to sign in.",
	welcomeAuthExchanging: "Completing sign in…",
	welcomeAuthExpired: "Sign in timed out",
	welcomeAuthExpiredDescription: "Sign in again to continue",
	welcomeAuthFailed: "Could not complete sign in. Please try again.",
	welcomeAuthCopyLink: "Copy sign-in link",
	welcomeAuthCopied: "Copied",
	welcomeAuthCopyFailed: "Could not copy. Try again.",
	welcomeAuthCancel: "Cancel",
	welcomeAuthRetry: "Sign in again",
	welcomeSignIn: "Sign in",
	welcomeApiKey: "Add API Key",
	welcomeKeyTitle: "Add an API key to get started",
	welcomeKeyDescription: "Configure official DeepSeek models to start using Harness",
	welcomeKeyPlaceholder: "Enter API key",
	welcomeKeySave: "Save and continue",
	welcomeKeyLater: "Set up later",
	welcomeKeyBack: "Back to sign in",
	welcomeSessionExpired: "You have signed out of your account, please log in again.",
	welcomeKeyBlank: "Enter an API key.",
	welcomeKeyInvalid: "Enter the API key itself, without quotes, spaces, or an environment-variable assignment.",
	welcomeKeyFailed: "Could not save the API key. Please try again.",
	welcomeContinueFailed: "Could not open the workspace. Please try again.",
	checkUpdatesMenu: "Check for Updates…",
	reloadPageMenu: "Reload Page",
	restartAppHostMenu: "Restart App and Host",
	updateCheckFailedTitle: "Update Check Failed",
	updateCheckFailed: "Could not check for updates. Please try again later.",
	updateDownloadFailed: "Could not download the update. Please try again.",
	updateInstallFailed: "Could not install the update. Please try again later.",
	updateCheckNetworkFailed: "Could not check for updates. Check your connection and try again.",
	updateDownloadNetworkFailed: "Could not download the update. Check your connection and try again.",
	updateInstallNetworkFailed: "Could not install the update. Check your connection and try again.",
	unknownError: "Unknown error",
	updateCheckTitle: "Check for Updates",
	updateCurrentDetail: "Current version: {version}",
	updateCurrent: "You’re up to date!",
	updateChecking: "Checking for updates…",
	updateDownload: "Download update",
	updateDownloadedTitle: "Version {version} is ready to install",
	updateDownloadedDetail: "The app will close during the update and reopen automatically when it is complete.",
	updateDownloadedDetailWindows: "The app will close temporarily during the update and reopen automatically when it is complete.\n\nThe update may take some time. Please wait and do not launch the app again during installation.",
	updateClose: "Close",
	updateAcknowledge: "OK",
	updateLater: "Update later",
	updateDownloading: "Downloading {percent}%…",
	updateVerifying: "Verifying update files…",
	updateInstalling: "Preparing to restart…",
	updateRetry: "Retry update",
	updateActiveTasks: "Tasks are still in progress",
	updateActiveTasksDetail: "Updating will stop the tasks in progress and restart the app. Continue?",
	updateStopTasks: "Stop tasks and update",
	updateTasksChanged: "New tasks have started. Confirm again to stop the tasks and update.",
	updateTasksUnavailable: "Task status is unavailable. Try updating again when the workspace is ready.",
	updateStopFailed: "Could not safely stop the tasks. The update has not been installed. Please try again later.",
	updateTechnicalDetails: "View technical details",
	updateTitle: "StudyBuddy Update",
	updateAvailable: "New version available: {version}",
	updateDetail: "Once the download is complete, you can install the update and restart the app.",
	installAndRestart: "Install and Restart",
	later: "Later",
	updateFailedTitle: "Update Failed",
	mandatoryTitle: "Update to continue",
	mandatoryDetail: "This version is no longer supported. Update to continue. Tasks in progress will keep running until you confirm installation and restart.",
	mandatoryUnavailable: "Could not check update requirements. Please try again later.",
	policyLoginTitle: "Sign in to the test environment",
	policyLoginRequired: "Sign in with Feishu to check update requirements for this test build. Signing in will not download or install an update.",
	policyLogin: "Sign in with Feishu",
	policyLoginFailed: "Feishu sign-in did not complete. Please try again.",
	policyLoginLoading: "Loading sign-in page…",
	mandatoryNoRelease: "No compatible update was found. Check again or contact support.",
	mandatoryRefresh: "Check again",
	mandatoryPage: "Download from the official website",
	mandatoryCopy: "Copy download link",
	mandatoryPageFailed: "Could not open the official download page. Copy the link and open it in your browser.",
	mandatoryActionFailed: "The action failed. Please try again. You can use the app again after the update is complete.",
	mandatoryReady: "Update ready",
	mandatoryVersion: "New version: {version}",
	mandatoryReadyDetail: "The app will close during the update and reopen automatically when it is complete.",
	mandatoryDeferred: "Tasks in progress will keep running. Complete the update before using the app again.",
	mandatoryContinue: "Continue update",
	mandatoryInspecting: "Checking tasks…",
	mandatoryStopping: "Stopping tasks…",
	mandatoryRestarting: "The app will restart shortly. Please wait.",
	mandatoryDownloadFailed: "The update files could not be downloaded or prepared. Please retry.",
	mandatoryInstallFailed: "The update has not been installed. Check the tasks again and retry.",
	mandatoryOpenHelp: "Page didn’t open?",
	mandatoryReopen: "Open the official download page again",
	mandatoryCopied: "Link copied",
	mandatoryCopyFailed: "Could not copy the link. Select and copy it below.",
	mandatoryAddress: "Download link",
	mandatoryNotification: "Return to the application to confirm installation and restart."
};
const zh = {
	imageOpenTab: "在新标签页中打开图像",
	imageAttach: "添加到聊天",
	imageCopy: "复制图像",
	imageReveal: "在文件管理器中打开",
	imageDownload: "下载副本",
	growthSaveTitle: "保存 Token 成长图",
	growthSaveFilename: "StudyBuddy-Token-成长图.png",
	growthSaveFilter: "PNG 图片",
	cliCommandMenu: "管理 dsh 命令…",
	cliCommandTitle: "管理 dsh 命令",
	cliCommandLocation: "Desktop 命令：{path}",
	cliCommandSelected: "当前 dsh 命令：{path}",
	cliCommandTarget: "当前启动器目标：{path}",
	cliCommandShadowed: "另一个 dsh 的优先级更高。请移除或调整该安装的顺序，以默认使用 Desktop 命令；也可以通过完整路径运行 Desktop 命令。",
	cliCommandSelectionUnknown: "无法确认 shell 中的命令。别名或另一个 dsh 安装可能具有更高优先级。",
	cliCommandInstalled: "Desktop 命令已安装。",
	cliCommandNotInstalled: "将 Desktop 命令添加到终端。",
	cliCommandBroken: "Desktop 命令需要修复。",
	cliCommandInstall: "安装",
	cliCommandRepair: "修复",
	cliCommandRemove: "移除",
	cliCommandClose: "关闭",
	cliCommandSwitch: "继续使用 Desktop 命令？",
	cliCommandPreserve: "现有命令会被保留，不会修改其他安装或 shell 启动文件。",
	cliCommandContinue: "继续",
	cliCommandInstallApp: "请先将 Desktop 安装到“应用程序”文件夹，再管理 dsh 命令。",
	cliCommandUpdating: "正在安装更新。请在安装完成后管理命令。",
	cliCommandNewTerminal: "打开新终端并运行 dsh --version。",
	cliCommandRemoved: "已移除 Desktop 命令注册。",
	cliCommandPreviousRestored: "已恢复之前的启动器。",
	cliCommandOtherKept: "其他命令安装保持不变。",
	cliCommandBackupKept: "之前的启动器保留在：{path}",
	cliCommandChanged: "对话框打开期间命令或 PATH 已改变。请重新打开“管理 dsh 命令”检查当前状态。",
	cliCommandOwnershipError: "命令注册或备份已改变，未移除无关命令。",
	cliCommandFailed: "无法更新命令。请检查应用是否已安装、目标位置是否可写，然后重试。",
	application: "应用",
	fileMenu: "文件",
	closePage: "关闭页面或窗口",
	aboutMenu: "关于 StudyBuddy",
	aboutProduct: "StudyBuddy",
	aboutVersion: "版本 V{version}",
	hideApplication: "隐藏 StudyBuddy",
	hideOtherApplications: "隐藏其他",
	showAllApplications: "显示全部",
	quitApplication: "退出 StudyBuddy",
	openApplication: "打开 StudyBuddy",
	quit: "退出",
	cancel: "取消",
	quitTitle: "退出 StudyBuddy？",
	quitActiveTasks: "当前正在运行的任务将会中断",
	quitScheduledTasks: "应用关闭期间，定时任务不会运行",
	quitActiveAndScheduledTasks: "当前正在运行的任务将会中断，且应用关闭期间，定时任务不会运行",
	backgroundNoticeBody: "正在运行的任务不会中断，可在系统托盘中重新打开窗口",
	backgroundNoticeConfirm: "确认",
	edit: "编辑",
	menuBar: "应用菜单",
	delete: "删除",
	undo: "撤销",
	redo: "重做",
	cut: "剪切",
	copy: "复制",
	paste: "粘贴",
	selectAll: "全选",
	startupFailed: "StudyBuddy 无法使用",
	fatalSummary: "应用无法启动或已意外停止。",
	startupAddressInUse: "有其他正在运行的 DSH（如其他 dsh web、桌面端），无法同时启动，请退出其他正在运行的 DSH 后重启。",
	diagnosticTruncated: "… 错误详情已截短。",
	reportWrittenTo: "诊断报告：{path}",
	startupReinstallAdvice: "如果应用文件缺失或损坏，请关闭应用并重新安装。任务数据存储在独立位置。",
	exitApplication: "退出",
	restartApplication: "重启",
	recoveryOperationFailed: "恢复操作失败",
	disableThirdPartyPlugins: "禁用第三方插件、备份 profile patch 并重启",
	welcomeTitle: "StudyBuddy",
	welcomeBrand: "StudyBuddy",
	welcomeTaglineBefore: "欢迎使用 ",
	welcomeTaglineBrand: "StudyBuddy",
	welcomeTaglineAfter: "",
	welcomeDescription: "组装无限可能，共探智能上限",
	welcomeAuthStarting: "正在打开登录…",
	welcomeAuthWaiting: "没有自动打开浏览器？",
	welcomeAuthWaitingDescription: "复制登录链接，用浏览器手动打开完成登录",
	welcomeAuthExchanging: "正在完成登录…",
	welcomeAuthExpired: "登录已超时",
	welcomeAuthExpiredDescription: "请重新登录后继续操作",
	welcomeAuthFailed: "登录未完成，请重试。",
	welcomeAuthCopyLink: "复制登录链接",
	welcomeAuthCopied: "已复制",
	welcomeAuthCopyFailed: "复制失败，请重试",
	welcomeAuthCancel: "取消",
	welcomeAuthRetry: "重新登录",
	welcomeSignIn: "登录",
	welcomeApiKey: "添加 API Key",
	welcomeKeyTitle: "添加一个 API Key 开始使用",
	welcomeKeyDescription: "配置 DeepSeek 官方模型，即可开始使用",
	welcomeKeyPlaceholder: "输入 API 密钥",
	welcomeKeySave: "保存并继续",
	welcomeKeyLater: "稍后配置",
	welcomeKeyBack: "返回登录",
	welcomeSessionExpired: "登录信息已失效，请重新登录",
	welcomeKeyBlank: "请输入 API 密钥。",
	welcomeKeyInvalid: "请仅输入 API 密钥，不要包含引号、空格或环境变量赋值。",
	welcomeKeyFailed: "无法保存 API 密钥，请重试。",
	welcomeContinueFailed: "无法打开工作区，请重试。",
	checkUpdatesMenu: "检查更新…",
	reloadPageMenu: "刷新页面",
	restartAppHostMenu: "重启应用与 Host",
	updateCheckFailedTitle: "更新检查失败",
	updateCheckFailed: "检查更新失败，请稍后重试。",
	updateDownloadFailed: "下载更新失败，请重试。",
	updateInstallFailed: "安装更新失败，请稍后重试。",
	updateCheckNetworkFailed: "检查更新失败，请检查网络连接后重试。",
	updateDownloadNetworkFailed: "下载更新失败，请检查网络连接后重试。",
	updateInstallNetworkFailed: "安装更新失败，请检查网络连接后重试。",
	unknownError: "未知错误",
	updateCheckTitle: "检查更新",
	updateCurrentDetail: "当前版本：{version}",
	updateCurrent: "已是最新版本",
	updateChecking: "正在检查更新…",
	updateDownload: "下载更新",
	updateDownloadedTitle: "新版本 {version} 已准备就绪",
	updateDownloadedDetail: "更新期间应用将暂时关闭，完成后会自动打开。",
	updateDownloadedDetailWindows: "更新期间应用将暂时关闭，完成后会自动打开。\n\n更新可能需要一些时间，请耐心等待，期间请勿重复启动应用。",
	updateClose: "关闭",
	updateAcknowledge: "确定",
	updateLater: "稍后更新",
	updateDownloading: "正在下载 {percent}%…",
	updateVerifying: "正在校验更新文件…",
	updateInstalling: "正在准备重启…",
	updateRetry: "重试更新",
	updateActiveTasks: "仍有进行中的任务",
	updateActiveTasksDetail: "更新将停止进行中的任务并重启应用，是否继续？",
	updateStopTasks: "停止任务并更新",
	updateTasksChanged: "有新任务开始运行，请重新确认是否停止任务并更新。",
	updateTasksUnavailable: "无法确认任务状态，请在工作区就绪后重试更新。",
	updateStopFailed: "未能安全停止任务，更新尚未安装，请稍后重试。",
	updateTechnicalDetails: "查看技术详情",
	updateTitle: "StudyBuddy 更新",
	updateAvailable: "发现新版本 {version}",
	updateDetail: "下载完成后，可安装并重启应用。",
	installAndRestart: "安装并重启",
	later: "稍后",
	updateFailedTitle: "更新失败",
	mandatoryTitle: "请更新后继续使用",
	mandatoryDetail: "当前版本已停止支持，请更新后继续使用。确认安装并重启前，进行中的任务会继续运行。",
	mandatoryUnavailable: "暂时无法检查更新要求，请稍后重试。",
	policyLoginTitle: "登录测试环境",
	policyLoginRequired: "此测试版需要先通过飞书登录，才能检查更新要求。登录不会下载或安装更新。",
	policyLogin: "通过飞书登录",
	policyLoginFailed: "飞书登录未完成，请重试。",
	policyLoginLoading: "正在加载登录页面…",
	mandatoryNoRelease: "暂未找到适用的更新，请重新检查或联系支持人员。",
	mandatoryRefresh: "重新检查",
	mandatoryPage: "前往官网下载",
	mandatoryCopy: "复制下载链接",
	mandatoryPageFailed: "无法打开官网下载页面，请复制链接后在浏览器中打开。",
	mandatoryActionFailed: "操作失败，请重试。完成更新后才能继续使用应用。",
	mandatoryReady: "更新已准备就绪",
	mandatoryVersion: "新版本：{version}",
	mandatoryReadyDetail: "更新期间应用将暂时关闭，完成后会自动打开。",
	mandatoryDeferred: "进行中的任务会继续运行。请完成更新后再操作应用。",
	mandatoryContinue: "继续更新",
	mandatoryInspecting: "正在检查任务状态…",
	mandatoryStopping: "正在停止任务…",
	mandatoryRestarting: "应用即将重启，请稍候。",
	mandatoryDownloadFailed: "更新文件下载或准备失败，请重试。",
	mandatoryInstallFailed: "更新尚未安装，请重新检查任务后重试。",
	mandatoryOpenHelp: "页面未打开？",
	mandatoryReopen: "重新前往官网下载",
	mandatoryCopied: "链接已复制",
	mandatoryCopyFailed: "复制失败，请手动选择并复制下方链接。",
	mandatoryAddress: "下载链接",
	mandatoryNotification: "返回应用确认安装并重启。"
};
/** Resolve Electron's locale to one shipped Desktop dictionary. */
function resolveDesktopLocale(locale) {
	return locale.toLowerCase().startsWith("zh") ? {
		id: "zh-CN",
		messages: zh
	} : {
		id: "en",
		messages: en
	};
}
//#endregion
//#region lib/types/preload-menu.js
/** Windows caption menu labels and native popup anchors, isolated from the Web client. */
/**
* Mount the Windows caption menubar without moving focus out of the active editor.
* @returns Language refresh and document teardown operations.
*/
function installWindowsMenu() {
	const host = document.createElement("div");
	host.dataset.windowsMenu = "";
	const shadow = host.attachShadow({ mode: "open" });
	const style = document.createElement("style");
	style.textContent = `
    :host { position: fixed; top: 0; left: var(--dsh-windows-menu-start, 48px); z-index: 1100;
      height: var(--dsh-windows-titlebar-height); display: flex; align-items: center;
      font-family: var(--dsw-font-family); -webkit-app-region: no-drag; }
    [role=menubar] { display: flex; gap: 2px; }
    button { height: 28px; padding: 0 10px; border: 0; border-radius: 6px;
      background: transparent; color: var(--dsw-alias-label-secondary);
      font: inherit; font-size: 14px; cursor: default; }
    button:hover, button[aria-expanded=true] { background: var(--dsw-alias-interactive-bg-hover);
      color: var(--dsw-alias-label-primary); }
    button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
    :host-context(html[data-input-modality='pointer']) button:focus-visible { outline-color: transparent; }
  `;
	const bar = document.createElement("div");
	bar.setAttribute("role", "menubar");
	let restoreEditor = () => {};
	const rememberEditor = (event) => {
		const target = event.composedPath()[0];
		if (!(target instanceof HTMLElement) || target === host || shadow.contains(target)) return;
		if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !target.matches("[contenteditable=\"true\"]")) return;
		const selection = document.getSelection();
		const ranges = selection === null ? [] : Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange());
		const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : void 0;
		const start = input?.selectionStart;
		const end = input?.selectionEnd;
		const direction = input?.selectionDirection;
		restoreEditor = () => {
			if (!target.isConnected) return;
			target.focus({ preventScroll: true });
			if (input !== void 0 && start != null && end != null) input.setSelectionRange(start, end, direction ?? void 0);
			else if (selection !== null && ranges.length > 0) {
				selection.removeAllRanges();
				for (const range of ranges) selection.addRange(range);
			}
		};
	};
	document.addEventListener("focusout", rememberEditor, true);
	const createButton = (name, index) => {
		const button = document.createElement("button");
		button.type = "button";
		button.setAttribute("role", "menuitem");
		button.setAttribute("aria-haspopup", "menu");
		button.setAttribute("aria-expanded", "false");
		button.tabIndex = index === 0 ? 0 : -1;
		button.addEventListener("pointerdown", (event) => {
			event.preventDefault();
		});
		button.addEventListener("mousedown", (event) => {
			event.preventDefault();
		});
		const open = async () => {
			if (button.getAttribute("aria-expanded") === "true") return;
			const rect = button.getBoundingClientRect();
			button.setAttribute("aria-expanded", "true");
			if (document.activeElement === host) restoreEditor();
			try {
				await electron.ipcRenderer.invoke(DESKTOP_IPC.windowsMenu, name, rect.left, rect.bottom);
			} catch (error) {
				console.error("Desktop caption menu failed", error);
			} finally {
				button.setAttribute("aria-expanded", "false");
			}
		};
		button.addEventListener("click", () => {
			open();
		});
		button.addEventListener("keydown", (event) => {
			if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
				event.preventDefault();
				const next = buttons[index === 0 ? 1 : 0];
				button.tabIndex = -1;
				next.tabIndex = 0;
				next.focus();
			} else if (event.key === "ArrowDown") {
				event.preventDefault();
				open();
			}
		});
		bar.append(button);
		return button;
	};
	const buttons = [createButton("application", 0), createButton("edit", 1)];
	shadow.append(style, bar);
	const measure = () => {
		if (!host.isConnected) return;
		document.documentElement.style.setProperty("--dsh-windows-menu-width", `${host.getBoundingClientRect().width}px`);
	};
	const resizeObserver = new ResizeObserver(measure);
	const mount = () => {
		if (document.querySelector("[data-shell-overlay]") === null) return;
		document.body.append(host);
		observer.disconnect();
		resizeObserver.observe(host);
		measure();
	};
	const observer = new MutationObserver(mount);
	observer.observe(document.body, {
		childList: true,
		subtree: true
	});
	mount();
	const update = () => {
		const { messages } = resolveDesktopLocale(document.documentElement.lang);
		bar.setAttribute("aria-label", messages.menuBar);
		buttons[0].textContent = messages.application;
		buttons[1].textContent = messages.edit;
		measure();
	};
	update();
	return {
		update,
		dispose: () => {
			observer.disconnect();
			resizeObserver.disconnect();
			document.removeEventListener("focusout", rememberEditor, true);
			host.remove();
			document.documentElement.style.removeProperty("--dsh-windows-menu-width");
		}
	};
}
//#endregion
//#region lib/types/preload-windows.js
/** Synchronizes Windows context menus and caption colors with the application document. */
/** Install the Windows-only titlebar marker and observe application language and palette changes. */
function syncWindowsAppearance() {
	if (process.platform !== "win32") return;
	const mark = () => {
		const root = document.documentElement;
		root.dataset.windowsTitlebar = "";
		root.style.setProperty("--dsh-windows-titlebar-height", `40px`);
	};
	if (document.documentElement !== null) mark();
	const install = () => {
		mark();
		const root = document.documentElement;
		const menu = installWindowsMenu();
		const probe = document.createElement("span");
		probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)";
		document.body.append(probe);
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 1;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (context === null) throw new Error("Desktop caption requires a 2D canvas context");
		const nativeColor = (color) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = color;
			context.fillRect(0, 0, 1, 1);
			const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
			return `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 255})`;
		};
		let previous = "";
		const send = () => {
			const style = getComputedStyle(probe);
			const color = nativeColor(style.backgroundColor);
			const symbolColor = nativeColor(style.color);
			const values = [
				root.lang,
				color,
				symbolColor
			];
			const current = JSON.stringify(values);
			if (current === previous) return;
			previous = current;
			menu.update();
			electron.ipcRenderer.send(DESKTOP_IPC.windowsAppearance, ...values);
		};
		const observer = new MutationObserver(send);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["lang"]
		});
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["data-ds-dark-theme", "style"]
		});
		observer.observe(document.head, {
			childList: true,
			subtree: true,
			characterData: true
		});
		document.head.addEventListener("load", send, true);
		window.addEventListener("pagehide", () => {
			observer.disconnect();
			menu.dispose();
			probe.remove();
			document.head.removeEventListener("load", send, true);
		}, { once: true });
		send();
	};
	if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install, { once: true });
	else install();
}
//#endregion
//#region lib/types/mandatory-update-ipc.js
/** Dependency-free IPC names shared with the sandboxed mandatory-update preload. */
const MANDATORY_IPC = {
	status: "dsh-desktop:mandatory-status",
	state: "dsh-desktop:mandatory-state",
	action: "dsh-desktop:mandatory-action"
};
//#endregion
//#region lib/types/preload-mandatory-overlay.js
/** Mounts the shell-owned Windows update document inside the main window's content area. */
/** Keep update actions on a private channel to the shell frame; the shared product DOM is not a tamper-proof display. */
function installMandatoryUpdateOverlay() {
	let disposed = false;
	let state;
	let host;
	let frame;
	let port;
	let closing;
	const publish = () => {
		port?.postMessage({
			type: "dsh-mandatory-state",
			state
		});
	};
	const remove = () => {
		port?.close();
		port = void 0;
		host?.remove();
		host = void 0;
		frame = void 0;
	};
	const render = () => {
		if (state === void 0 || document.readyState === "loading") return;
		if (!state.policy.blocking) {
			if (frame === void 0 || closing !== void 0) return;
			publish();
			closing = setTimeout(remove, 150);
			return;
		}
		clearTimeout(closing);
		closing = void 0;
		if (frame === void 0) {
			host = document.createElement("div");
			host.style.cssText = `position:fixed;top:40px;left:0;right:0;bottom:0;z-index:2147483647`;
			const shadow = host.attachShadow({ mode: "closed" });
			frame = document.createElement("iframe");
			frame.title = state.locale.messages.mandatoryTitle;
			frame.style.cssText = "display:block;width:100%;height:100%;border:0;background:transparent";
			frame.src = "dsh-app://shell/mandatory-update.html";
			shadow.append(frame);
			document.documentElement.append(host);
			frame.addEventListener("load", () => {
				port?.close();
				const channel = new MessageChannel();
				port = channel.port1;
				port.onmessage = message;
				frame?.contentWindow?.postMessage({ type: "dsh-mandatory-connect" }, "dsh-app://shell", [channel.port2]);
				publish();
				frame?.focus();
			});
		}
		publish();
	};
	const receive = (_event, next) => {
		state = next;
		render();
	};
	const message = (event) => {
		const value = event.data;
		if (typeof value !== "object" || value === null || !("type" in value)) return;
		if (value.type !== "dsh-mandatory-action" || !("id" in value) || !Number.isSafeInteger(value.id) || !("action" in value) || !("version" in value) || !("revision" in value)) return;
		const target = port;
		if (target === void 0) return;
		electron.ipcRenderer.invoke(MANDATORY_IPC.action, value.action, value.version, value.revision).then(() => {
			target.postMessage({
				type: "dsh-mandatory-result",
				id: value.id,
				ok: true
			});
		}, () => {
			target.postMessage({
				type: "dsh-mandatory-result",
				id: value.id,
				ok: false
			});
		});
	};
	const blockBackgroundKey = (event) => {
		if (frame === void 0 || state?.policy.blocking !== true || event.composedPath().some((target) => target instanceof HTMLElement && target.hasAttribute("data-windows-menu"))) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		frame.focus();
	};
	electron.ipcRenderer.on(MANDATORY_IPC.state, receive);
	electron.ipcRenderer.invoke(MANDATORY_IPC.status).then((initial) => {
		if (!disposed && state === void 0) {
			state = initial;
			render();
		}
	}, () => {});
	window.addEventListener("keydown", blockBackgroundKey, true);
	window.addEventListener("DOMContentLoaded", render, { once: true });
	window.addEventListener("pagehide", () => {
		disposed = true;
		clearTimeout(closing);
		remove();
		electron.ipcRenderer.off(MANDATORY_IPC.state, receive);
		window.removeEventListener("keydown", blockBackgroundKey, true);
		window.removeEventListener("DOMContentLoaded", render);
	}, { once: true });
}
//#endregion
//#region lib/types/preload-browser.js
/** Lease-scoped browser operations and one main-process event subscription per window. */
/** @returns browser operations that expose neither IPC nor Electron objects. */
function createDesktopBrowserBridge() {
	const listeners = /* @__PURE__ */ new Map();
	electron.ipcRenderer.on(DESKTOP_IPC.browserOpenRequested, (_event, request) => {
		if (typeof request !== "object" || request === null || !("lease" in request) || !("url" in request) || typeof request.lease !== "string" || typeof request.url !== "string") return;
		const callbacks = listeners.get(request.lease);
		if (callbacks === void 0) return;
		for (const callback of [...callbacks]) try {
			callback(request.url);
		} catch (error) {
			console.error("Desktop browser link handler failed", error);
		}
	});
	return {
		acquire: (workspace) => electron.ipcRenderer.invoke(DESKTOP_IPC.browserAcquire, workspace),
		release: (lease) => electron.ipcRenderer.invoke(DESKTOP_IPC.browserRelease, lease),
		onOpenRequested(lease, listener) {
			let callbacks = listeners.get(lease);
			if (callbacks === void 0) {
				callbacks = /* @__PURE__ */ new Set();
				listeners.set(lease, callbacks);
			}
			callbacks.add(listener);
			return () => {
				callbacks.delete(listener);
				if (callbacks.size === 0 && listeners.get(lease) === callbacks) listeners.delete(lease);
			};
		}
	};
}
//#endregion
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
//#region lib/types/studybuddy/aigc-types.js
/** Dedicated Main/preload channels for the local creation page. */
const AIGC_IPC = {
	acquire: "studybuddy:aigc-acquire",
	release: "studybuddy:aigc-release",
	theme: "studybuddy:aigc-theme",
	visible: "studybuddy:aigc-visible",
	invalid: "studybuddy:aigc-invalid",
	guestAction: "studybuddy:aigc-guest-action",
	action: "studybuddy:aigc-action",
	interactionReady: "studybuddy:aigc-interaction-ready"
};
//#endregion
//#region lib/types/studybuddy/research-types.js
const RESEARCH_IPC = {
	acquire: "studybuddy:research-acquire",
	release: "studybuddy:research-release",
	theme: "studybuddy:research-theme",
	visible: "studybuddy:research-visible",
	invalid: "studybuddy:research-invalid",
	project: "studybuddy:research-project",
	guestAction: "studybuddy:research-guest-action",
	action: "studybuddy:research-action",
	acknowledgeIntent: "studybuddy:research-intent-ack"
};
//#endregion
//#region lib/types/studybuddy/video-types.js
const VIDEO_IPC = {
	available: "studybuddy:video-available",
	acquire: "studybuddy:video-acquire",
	release: "studybuddy:video-release",
	theme: "studybuddy:video-theme",
	visible: "studybuddy:video-visible",
	invalid: "studybuddy:video-invalid",
	guestAction: "studybuddy:video-guest-action",
	action: "studybuddy:video-action",
	acknowledgeReference: "studybuddy:video-reference-ack"
};
//#endregion
//#region ../../vendor/studybuddy-contracts/dist/ai-account.js
const PLATFORM_AI_USAGE_IDENTITIES = [
	{
		combinationId: "codex.deepseek.deepseek-flash",
		tool: "codex",
		model: "deepseek-flash"
	},
	{
		combinationId: "claude_code.deepseek.deepseek-flash",
		tool: "claude_code",
		model: "deepseek-flash"
	},
	{
		combinationId: "codex.kimi.kimi-k3",
		tool: "codex",
		model: "kimi-k3"
	},
	{
		combinationId: "claude_code.kimi.kimi-k3",
		tool: "claude_code",
		model: "kimi-k3"
	},
	{
		combinationId: "codex.deepseek.deepseek-v4-flash",
		tool: "codex",
		model: "deepseek-v4-flash"
	},
	{
		combinationId: "claude_code.deepseek.deepseek-v4-flash",
		tool: "claude_code",
		model: "deepseek-v4-flash"
	},
	{
		combinationId: "codex.deepseek.deepseek-v4-flash-vision-exp",
		tool: "codex",
		model: "deepseek-v4-flash-vision-exp"
	},
	{
		combinationId: "claude_code.deepseek.deepseek-v4-flash-vision-exp",
		tool: "claude_code",
		model: "deepseek-v4-flash-vision-exp"
	},
	{
		combinationId: "codex.kimi.kimi-k2.6",
		tool: "codex",
		model: "kimi-k2.6"
	},
	{
		combinationId: "claude_code.kimi.kimi-k2.6",
		tool: "claude_code",
		model: "kimi-k2.6"
	},
	{
		combinationId: "codex.kimi.kimi-k2.7-code",
		tool: "codex",
		model: "kimi-k2.7-code"
	},
	{
		combinationId: "claude_code.kimi.kimi-k2.7-code",
		tool: "claude_code",
		model: "kimi-k2.7-code"
	},
	{
		combinationId: "codex.kimi.kimi-k2.7-code-highspeed",
		tool: "codex",
		model: "kimi-k2.7-code-highspeed"
	},
	{
		combinationId: "claude_code.kimi.kimi-k2.7-code-highspeed",
		tool: "claude_code",
		model: "kimi-k2.7-code-highspeed"
	}
];
PLATFORM_AI_USAGE_IDENTITIES.map((identity) => identity.combinationId);
[...new Set(PLATFORM_AI_USAGE_IDENTITIES.map((identity) => identity.model))];
new Set([
	"PENDING",
	"PAID",
	"COMPLETED",
	"FAILED",
	"EXPIRED",
	"CANCELLED",
	"REFUNDED",
	"RECONCILIATION_REQUIRED"
]);
//#endregion
//#region ../../vendor/studybuddy-contracts/dist/native-tools.js
const NATIVE_TOOLS = Object.freeze([
	{
		"id": "aider",
		"upstreamId": "aider",
		"displayName": "Aider",
		"noModelConfig": false,
		"nativeConfigScope": "aider-home",
		"protocols": ["openai_chat_completions"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "1e1409d8620b815ce3911a3af05e962d0fe3dc28247df7423dfeba579d514628",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "antigravity",
		"upstreamId": "antigravity",
		"displayName": "Antigravity CLI",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "bf1c15e8780866ccba87cf194f08397bca55124e774e6fd607e2096293a5817c",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "antigravitydesktop",
		"upstreamId": "antigravitydesktop",
		"displayName": "Antigravity",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "51981227e3fef793621668c1895852ebda2b69c25093b5c9f67d899806e37974",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "chatgptdesktop",
		"upstreamId": "chatgptdesktop",
		"displayName": "ChatGPT",
		"noModelConfig": false,
		"nativeConfigScope": "codex-home",
		"protocols": ["openai_responses"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "5556425773b1b76ead20245c85ad907cbe65951bee32cf15ac470f3b5feb8807",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "claude_code",
		"upstreamId": "claudecode",
		"displayName": "Claude Code",
		"noModelConfig": false,
		"nativeConfigScope": "claude-home",
		"protocols": ["anthropic_messages"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "7bbfe4634cd700472925a13901fd8726140075cef5e3bc0ad35b2e5bb3f116a5",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "claudedesktop",
		"upstreamId": "claudedesktop",
		"displayName": "Claude Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "claude-desktop-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "15d81b7b53258d46202f9f0bb1dc38f66bf7dbdf040fabd9f9e2f27c27c0c8f5",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "claudescience",
		"upstreamId": "claudescience",
		"displayName": "Claude Science",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "7ab31cfe5ada516fc54a933dc1504a6dcca50fea87b89da7b8ca236fd4b9580b",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "cline",
		"upstreamId": "cline",
		"displayName": "Cline CLI",
		"noModelConfig": false,
		"nativeConfigScope": "cline-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "976bd18837dfbf56de06a844c2ae1f00c554ce3a5b70fb497631d9125899a9f9",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "clinedesktop",
		"upstreamId": "clinedesktop",
		"displayName": "Cline Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "cline-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "7aa2c585e6104a5eb64acdc8537ed4f8d92a445cb933d5e7e719fbd553f7bcd2",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "codex",
		"upstreamId": "codex",
		"displayName": "Codex CLI",
		"noModelConfig": false,
		"nativeConfigScope": "codex-home",
		"protocols": ["openai_responses"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "98535c47040fd935843d2ab5594bb0764baf67ba557011687d1eb69dbe0039a0",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "coffeecli",
		"upstreamId": "coffeecli",
		"displayName": "Coffee CLI",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "447aad8f861c7a4a1fb1387e4d5b0189cb98f03d7935a3d823afb0bfb6a63e6f",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "cursor",
		"upstreamId": "cursor",
		"displayName": "Cursor",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "b061ed03a02d3f64228994f709d08279efc9a2adc670f11a8db8250d7dedfb11",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "dsh",
		"upstreamId": "dsh",
		"displayName": "DeepSeek Harness",
		"noModelConfig": false,
		"nativeConfigScope": "dsh-home",
		"protocols": ["openai_chat_completions", "anthropic_messages"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "a0aecec51d788d5d4410a306b5740226be6b591221d3db23a525ecac7b94f781",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "geminidesktop",
		"upstreamId": "geminidesktop",
		"displayName": "Gemini Desktop",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "unsupported",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "8ac3c74cd08578df34d84a4bd82591ae72aecad64ee40b93e48da89c87cad61b",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "grok",
		"upstreamId": "grok",
		"displayName": "Grok Build",
		"noModelConfig": false,
		"nativeConfigScope": "grok-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "a0df83da6c96c3a96d96bbcd7a333cdc62489b57cc3a63dcc6f064b0dcb1994f",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "grokbot",
		"upstreamId": "grokbot",
		"displayName": "Grok Bot",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "a23d17a89766f344947c527315a47d24032d4345ff9e58f70ac1a0ce74a938f8",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "hermes",
		"upstreamId": "hermes",
		"displayName": "Hermes Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "hermes-home",
		"protocols": ["openai_chat_completions"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "6dc755b4a2a02e1297e0916331eb9aa8a4726d73a21126176d1303b7b1c5ae84",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "kilo",
		"upstreamId": "kilo",
		"displayName": "Kilo Code",
		"noModelConfig": false,
		"nativeConfigScope": "kilo-home",
		"protocols": [
			"openai_chat_completions",
			"openai_responses",
			"anthropic_messages"
		],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "0288e4d396ba8fbfd098eb19182af398cb88bd39820ed3fe4304bee067d0f309",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "kimicode",
		"upstreamId": "kimicode",
		"displayName": "Kimi CLI",
		"noModelConfig": false,
		"nativeConfigScope": "kimi-home",
		"protocols": [
			"openai_chat_completions",
			"openai_responses",
			"anthropic_messages"
		],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "7dc4113da76410aa04a76a3f0a6222b54d5bb5cd47b81799812895d1a2aaa4cc",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "kimidesktop",
		"upstreamId": "kimidesktop",
		"displayName": "Kimi Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "kimi-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "c717d8e7163a3a546fc24a60a2a5ed8cc446bd08207171aa1322d3785bc90fed",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "manus",
		"upstreamId": "manus",
		"displayName": "Manus",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "962b0ecdcd8ccf9f611bf2395226109fecf69cceba7fee5c0ac3e7b1a66a884c",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "mimocode",
		"upstreamId": "mimocode",
		"displayName": "MiMo CLI",
		"noModelConfig": false,
		"nativeConfigScope": "mimo-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "deeebb1114f01233e46fd47ce11240778be7d3ed57d72bbafd8a513c3e643d23",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "mimodesktop",
		"upstreamId": "mimodesktop",
		"displayName": "MiMo Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "mimo-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "9f33083ea1bd1c06ca8203f438038f525211daee8ef92c5b2dcaf20231b087f9",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "minimaxcode",
		"upstreamId": "minimaxcode",
		"displayName": "MiniMax CLI",
		"noModelConfig": false,
		"nativeConfigScope": "minimax-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "b9f69258ce0d3b1f1bb04c838f2bae1eb0a1b01b3b93f7b7052deae2eae22b20",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "minimaxdesktop",
		"upstreamId": "minimaxdesktop",
		"displayName": "MiniMax Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "minimax-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "e2d50eb0f7faf1b9bf56cc8b4a648dc381290ae154feca1a454cf05843c24108",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "omp",
		"upstreamId": "omp",
		"displayName": "Oh My Pi",
		"noModelConfig": false,
		"nativeConfigScope": "omp-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "c8afd9e8d4c8f148cf3e674f112fcbf7bbb2568753dc0594b27100a9563b27d2",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "openclaw",
		"upstreamId": "openclaw",
		"displayName": "OpenClaw",
		"noModelConfig": false,
		"nativeConfigScope": "openclaw-home",
		"protocols": ["openai_chat_completions", "anthropic_messages"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "1b1faebdbbd95f35e82e4aafab9e9c59e1b3a1f4c8b5332cd73b87f9b651d3f9",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "opencode",
		"upstreamId": "opencode",
		"displayName": "OpenCode",
		"noModelConfig": false,
		"nativeConfigScope": "opencode-home",
		"protocols": ["openai_chat_completions", "openai_responses"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "f83bbd109b71c85e82782b3d1b483b5aeca8518d3a8e59aed1675cf4d9112a32",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "opencodedesktop",
		"upstreamId": "opencodedesktop",
		"displayName": "OpenCode Desktop",
		"noModelConfig": false,
		"nativeConfigScope": "opencode-home",
		"protocols": ["openai_chat_completions", "openai_responses"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "5055bc0e80729cbc6077b4ba58fb2bb632888eba6d4d76ffa4198d8e41a37814",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "openscience",
		"upstreamId": "openscience",
		"displayName": "OpenScience",
		"noModelConfig": false,
		"nativeConfigScope": "openscience-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "081e539480cea18a40075200d85393180915a065525b5e36105efacfa5aafc34",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "pi",
		"upstreamId": "pi",
		"displayName": "Pi",
		"noModelConfig": false,
		"nativeConfigScope": "pi-home",
		"protocols": ["openai_chat_completions", "openai_responses"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "5226539cf0958a885755df0c756c101ccd4d6e6870c65e3e60f9e7f39bafc019",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "qwencode",
		"upstreamId": "qwencode",
		"displayName": "QwenCode",
		"noModelConfig": false,
		"nativeConfigScope": "qwencode-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "7f782197d01212a825c2525d030b223bfed46aa442b047f38f3c6c4eb7607d04",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "translator",
		"upstreamId": "translator",
		"displayName": "AI Translate",
		"noModelConfig": false,
		"nativeConfigScope": "translator-home",
		"protocols": [],
		"platformSupport": {
			"windows": "embedded",
			"macos": "embedded",
			"linux": "embedded"
		},
		"sourceSha256": "dcc4ee045fdddff1d614acc79d73ebaa572d2b5bf29ccfa654f0e05e0d3158f5",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "vibe-trading",
		"upstreamId": "vibe-trading",
		"displayName": "Vibe-Trading",
		"noModelConfig": false,
		"nativeConfigScope": "vibe-trading-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "41650824abf0058d22988d9410e01b03a897f6108f3975b055abd302e5e1cccd",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "vscode",
		"upstreamId": "vscode",
		"displayName": "Visual Studio Code",
		"noModelConfig": true,
		"nativeConfigScope": "",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "e141ea0634d0535f05a38c1b801266e69035f96f01e263bf933bfeddb1acc451",
		"configurationEvidence": "not_applicable",
		"configurationRestriction": null
	},
	{
		"id": "workbuddy",
		"upstreamId": "workbuddy",
		"displayName": "WorkBuddy",
		"noModelConfig": false,
		"nativeConfigScope": "workbuddy-home",
		"protocols": ["openai_chat_completions"],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "15c75d2f2704fa1676caab4570b253b923a84a0c845ec9a0e2dd71c732913632",
		"configurationEvidence": "verified",
		"configurationRestriction": null
	},
	{
		"id": "workbuddyai",
		"upstreamId": "workbuddyai",
		"displayName": "WorkBuddy AI",
		"noModelConfig": false,
		"nativeConfigScope": "workbuddyai-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "unsupported"
		},
		"sourceSha256": "440df4702efa231789bfe27f1e4cdcc679dc5b3f582c568b37a1d4cfb87522a7",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	},
	{
		"id": "zcode",
		"upstreamId": "zcode",
		"displayName": "ZCode",
		"noModelConfig": false,
		"nativeConfigScope": "zcode-home",
		"protocols": [],
		"platformSupport": {
			"windows": "native",
			"macos": "native",
			"linux": "native"
		},
		"sourceSha256": "8c5175958b54ca6baac839dbffb6808ba251cc83c653b8abf3ce47e24e05a166",
		"configurationEvidence": "pending",
		"configurationRestriction": null
	}
].map((definition) => Object.freeze({
	...definition,
	protocols: Object.freeze([...definition.protocols]),
	platformSupport: Object.freeze({ ...definition.platformSupport })
})));
new Map(NATIVE_TOOLS.map((definition) => [definition.id, definition]));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/constants.js
var require_constants = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SEMVER_SPEC_VERSION = "2.0.0";
	const MAX_LENGTH = 256;
	const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;
	module.exports = {
		MAX_LENGTH,
		MAX_SAFE_COMPONENT_LENGTH: 16,
		MAX_SAFE_BUILD_LENGTH: MAX_LENGTH - 6,
		MAX_SAFE_INTEGER,
		RELEASE_TYPES: [
			"major",
			"premajor",
			"minor",
			"preminor",
			"patch",
			"prepatch",
			"prerelease"
		],
		SEMVER_SPEC_VERSION,
		FLAG_INCLUDE_PRERELEASE: 1,
		FLAG_LOOSE: 2
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/debug.js
var require_debug = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {};
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/re.js
var require_re = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { MAX_SAFE_COMPONENT_LENGTH, MAX_SAFE_BUILD_LENGTH, MAX_LENGTH } = require_constants();
	const debug = require_debug();
	exports = module.exports = {};
	const re = exports.re = [];
	const safeRe = exports.safeRe = [];
	const src = exports.src = [];
	const safeSrc = exports.safeSrc = [];
	const t = exports.t = {};
	let R = 0;
	const LETTERDASHNUMBER = "[a-zA-Z0-9-]";
	const safeRegexReplacements = [
		["\\s", 1],
		["\\d", MAX_LENGTH],
		[LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
	];
	const makeSafeRegex = (value) => {
		for (const [token, max] of safeRegexReplacements) value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
		return value;
	};
	const createToken = (name, value, isGlobal) => {
		const safe = makeSafeRegex(value);
		const index = R++;
		debug(name, index, value);
		t[name] = index;
		src[index] = value;
		safeSrc[index] = safe;
		re[index] = new RegExp(value, isGlobal ? "g" : void 0);
		safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
	};
	createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
	createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
	createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
	createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
	createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
	createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
	createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
	createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
	createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
	createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
	createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
	createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
	createToken("FULL", `^${src[t.FULLPLAIN]}$`);
	createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
	createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
	createToken("GTLT", "((?:<|>)?=?)");
	createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
	createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
	createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
	createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
	createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
	createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
	createToken("COERCEPLAIN", `(^|[^\\d])(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
	createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
	createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
	createToken("COERCERTL", src[t.COERCE], true);
	createToken("COERCERTLFULL", src[t.COERCEFULL], true);
	createToken("LONETILDE", "(?:~>?)");
	createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
	exports.tildeTrimReplace = "$1~";
	createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
	createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
	createToken("LONECARET", "(?:\\^)");
	createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
	exports.caretTrimReplace = "$1^";
	createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
	createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
	createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
	createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
	createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
	exports.comparatorTrimReplace = "$1$2$3";
	createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
	createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
	createToken("STAR", "(<|>)?=?\\s*\\*");
	createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
	createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/parse-options.js
var require_parse_options = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const looseOption = Object.freeze({ loose: true });
	const emptyOpts = Object.freeze({});
	const parseOptions = (options) => {
		if (!options) return emptyOpts;
		if (typeof options !== "object") return looseOption;
		return options;
	};
	module.exports = parseOptions;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/identifiers.js
var require_identifiers = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const numeric = /^[0-9]+$/;
	const compareIdentifiers = (a, b) => {
		if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
		const anum = numeric.test(a);
		const bnum = numeric.test(b);
		if (anum && bnum) {
			a = +a;
			b = +b;
		}
		return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
	};
	const rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
	module.exports = {
		compareIdentifiers,
		rcompareIdentifiers
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/semver.js
var require_semver$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const debug = require_debug();
	const { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
	const { safeRe: re, t } = require_re();
	const parseOptions = require_parse_options();
	const { compareIdentifiers } = require_identifiers();
	const isPrereleaseIdentifier = (prerelease, identifier) => {
		const identifiers = identifier.split(".");
		if (identifiers.length > prerelease.length) return false;
		for (let i = 0; i < identifiers.length; i++) if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) return false;
		return true;
	};
	module.exports = class SemVer {
		constructor(version, options) {
			options = parseOptions(options);
			if (version instanceof SemVer) if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) return version;
			else version = version.version;
			else if (typeof version !== "string") throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
			if (version.length > MAX_LENGTH) throw new TypeError(`version is longer than ${MAX_LENGTH} characters`);
			debug("SemVer", version, options);
			this.options = options;
			this.loose = !!options.loose;
			this.includePrerelease = !!options.includePrerelease;
			const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
			if (!m) throw new TypeError(`Invalid Version: ${version}`);
			this.raw = version;
			this.major = +m[1];
			this.minor = +m[2];
			this.patch = +m[3];
			if (this.major > MAX_SAFE_INTEGER || this.major < 0) throw new TypeError("Invalid major version");
			if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) throw new TypeError("Invalid minor version");
			if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) throw new TypeError("Invalid patch version");
			if (!m[4]) this.prerelease = [];
			else this.prerelease = m[4].split(".").map((id) => {
				if (/^[0-9]+$/.test(id)) {
					const num = +id;
					if (num >= 0 && num < MAX_SAFE_INTEGER) return num;
				}
				return id;
			});
			this.build = m[5] ? m[5].split(".") : [];
			this.format();
		}
		format() {
			this.version = `${this.major}.${this.minor}.${this.patch}`;
			if (this.prerelease.length) this.version += `-${this.prerelease.join(".")}`;
			return this.version;
		}
		toString() {
			return this.version;
		}
		compare(other) {
			debug("SemVer.compare", this.version, this.options, other);
			if (!(other instanceof SemVer)) {
				if (typeof other === "string" && other === this.version) return 0;
				other = new SemVer(other, this.options);
			}
			if (other.version === this.version) return 0;
			return this.compareMain(other) || this.comparePre(other);
		}
		compareMain(other) {
			if (!(other instanceof SemVer)) other = new SemVer(other, this.options);
			if (this.major < other.major) return -1;
			if (this.major > other.major) return 1;
			if (this.minor < other.minor) return -1;
			if (this.minor > other.minor) return 1;
			if (this.patch < other.patch) return -1;
			if (this.patch > other.patch) return 1;
			return 0;
		}
		comparePre(other) {
			if (!(other instanceof SemVer)) other = new SemVer(other, this.options);
			if (this.prerelease.length && !other.prerelease.length) return -1;
			else if (!this.prerelease.length && other.prerelease.length) return 1;
			else if (!this.prerelease.length && !other.prerelease.length) return 0;
			let i = 0;
			do {
				const a = this.prerelease[i];
				const b = other.prerelease[i];
				debug("prerelease compare", i, a, b);
				if (a === void 0 && b === void 0) return 0;
				else if (b === void 0) return 1;
				else if (a === void 0) return -1;
				else if (a === b) continue;
				else return compareIdentifiers(a, b);
			} while (++i);
		}
		compareBuild(other) {
			if (!(other instanceof SemVer)) other = new SemVer(other, this.options);
			let i = 0;
			do {
				const a = this.build[i];
				const b = other.build[i];
				debug("build compare", i, a, b);
				if (a === void 0 && b === void 0) return 0;
				else if (b === void 0) return 1;
				else if (a === void 0) return -1;
				else if (a === b) continue;
				else return compareIdentifiers(a, b);
			} while (++i);
		}
		inc(release, identifier, identifierBase) {
			if (release.startsWith("pre")) {
				if (!identifier && identifierBase === false) throw new Error("invalid increment argument: identifier is empty");
				if (identifier) {
					const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
					if (!match || match[1] !== identifier) throw new Error(`invalid identifier: ${identifier}`);
				}
			}
			switch (release) {
				case "premajor":
					this.prerelease.length = 0;
					this.patch = 0;
					this.minor = 0;
					this.major++;
					this.inc("pre", identifier, identifierBase);
					break;
				case "preminor":
					this.prerelease.length = 0;
					this.patch = 0;
					this.minor++;
					this.inc("pre", identifier, identifierBase);
					break;
				case "prepatch":
					this.prerelease.length = 0;
					this.inc("patch", identifier, identifierBase);
					this.inc("pre", identifier, identifierBase);
					break;
				case "prerelease":
					if (this.prerelease.length === 0) this.inc("patch", identifier, identifierBase);
					this.inc("pre", identifier, identifierBase);
					break;
				case "release":
					if (this.prerelease.length === 0) throw new Error(`version ${this.raw} is not a prerelease`);
					this.prerelease.length = 0;
					break;
				case "major":
					if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) this.major++;
					this.minor = 0;
					this.patch = 0;
					this.prerelease = [];
					break;
				case "minor":
					if (this.patch !== 0 || this.prerelease.length === 0) this.minor++;
					this.patch = 0;
					this.prerelease = [];
					break;
				case "patch":
					if (this.prerelease.length === 0) this.patch++;
					this.prerelease = [];
					break;
				case "pre": {
					const base = Number(identifierBase) ? 1 : 0;
					if (this.prerelease.length === 0) this.prerelease = [base];
					else {
						let i = this.prerelease.length;
						while (--i >= 0) if (typeof this.prerelease[i] === "number") {
							this.prerelease[i]++;
							i = -2;
						}
						if (i === -1) {
							if (identifier === this.prerelease.join(".") && identifierBase === false) throw new Error("invalid increment argument: identifier already exists");
							this.prerelease.push(base);
						}
					}
					if (identifier) {
						let prerelease = [identifier, base];
						if (identifierBase === false) prerelease = [identifier];
						if (isPrereleaseIdentifier(this.prerelease, identifier)) {
							const prereleaseBase = this.prerelease[identifier.split(".").length];
							if (isNaN(prereleaseBase)) this.prerelease = prerelease;
						} else this.prerelease = prerelease;
					}
					break;
				}
				default: throw new Error(`invalid increment argument: ${release}`);
			}
			this.raw = this.format();
			if (this.build.length) this.raw += `+${this.build.join(".")}`;
			return this;
		}
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/parse.js
var require_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const parse = (version, options, throwErrors = false) => {
		if (version instanceof SemVer) return version;
		try {
			return new SemVer(version, options);
		} catch (er) {
			if (!throwErrors) return null;
			throw er;
		}
	};
	module.exports = parse;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/valid.js
var require_valid$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const parse = require_parse();
	const valid = (version, options) => {
		const v = parse(version, options);
		return v ? v.version : null;
	};
	module.exports = valid;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/clean.js
var require_clean = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const parse = require_parse();
	const clean = (version, options) => {
		const s = parse(version.trim().replace(/^[=v]+/, ""), options);
		return s ? s.version : null;
	};
	module.exports = clean;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/inc.js
var require_inc = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const inc = (version, release, options, identifier, identifierBase) => {
		if (typeof options === "string") {
			identifierBase = identifier;
			identifier = options;
			options = void 0;
		}
		try {
			return new SemVer(version instanceof SemVer ? version.version : version, options).inc(release, identifier, identifierBase).version;
		} catch (er) {
			return null;
		}
	};
	module.exports = inc;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/diff.js
var require_diff = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const parse = require_parse();
	const diff = (version1, version2) => {
		const v1 = parse(version1, null, true);
		const v2 = parse(version2, null, true);
		const comparison = v1.compare(v2);
		if (comparison === 0) return null;
		const v1Higher = comparison > 0;
		const highVersion = v1Higher ? v1 : v2;
		const lowVersion = v1Higher ? v2 : v1;
		const highHasPre = !!highVersion.prerelease.length;
		if (!!lowVersion.prerelease.length && !highHasPre) {
			if (!lowVersion.patch && !lowVersion.minor) return "major";
			if (lowVersion.compareMain(highVersion) === 0) {
				if (lowVersion.minor && !lowVersion.patch) return "minor";
				return "patch";
			}
		}
		const prefix = highHasPre ? "pre" : "";
		if (v1.major !== v2.major) return prefix + "major";
		if (v1.minor !== v2.minor) return prefix + "minor";
		if (v1.patch !== v2.patch) return prefix + "patch";
		return "prerelease";
	};
	module.exports = diff;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/major.js
var require_major = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const major = (a, loose) => new SemVer(a, loose).major;
	module.exports = major;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/minor.js
var require_minor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const minor = (a, loose) => new SemVer(a, loose).minor;
	module.exports = minor;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/patch.js
var require_patch = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const patch = (a, loose) => new SemVer(a, loose).patch;
	module.exports = patch;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/prerelease.js
var require_prerelease = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const parse = require_parse();
	const prerelease = (version, options) => {
		const parsed = parse(version, options);
		return parsed && parsed.prerelease.length ? parsed.prerelease : null;
	};
	module.exports = prerelease;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare.js
var require_compare = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
	module.exports = compare;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rcompare.js
var require_rcompare = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const rcompare = (a, b, loose) => compare(b, a, loose);
	module.exports = rcompare;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-loose.js
var require_compare_loose = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const compareLoose = (a, b) => compare(a, b, true);
	module.exports = compareLoose;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-build.js
var require_compare_build = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const compareBuild = (a, b, loose) => {
		const versionA = new SemVer(a, loose);
		const versionB = new SemVer(b, loose);
		return versionA.compare(versionB) || versionA.compareBuild(versionB);
	};
	module.exports = compareBuild;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/sort.js
var require_sort = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compareBuild = require_compare_build();
	const sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
	module.exports = sort;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rsort.js
var require_rsort = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compareBuild = require_compare_build();
	const rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
	module.exports = rsort;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gt.js
var require_gt = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const gt = (a, b, loose) => compare(a, b, loose) > 0;
	module.exports = gt;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lt.js
var require_lt = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const lt = (a, b, loose) => compare(a, b, loose) < 0;
	module.exports = lt;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/eq.js
var require_eq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const eq = (a, b, loose) => compare(a, b, loose) === 0;
	module.exports = eq;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/neq.js
var require_neq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const neq = (a, b, loose) => compare(a, b, loose) !== 0;
	module.exports = neq;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gte.js
var require_gte = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const gte = (a, b, loose) => compare(a, b, loose) >= 0;
	module.exports = gte;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lte.js
var require_lte = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const compare = require_compare();
	const lte = (a, b, loose) => compare(a, b, loose) <= 0;
	module.exports = lte;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/cmp.js
var require_cmp = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const eq = require_eq();
	const neq = require_neq();
	const gt = require_gt();
	const gte = require_gte();
	const lt = require_lt();
	const lte = require_lte();
	const cmp = (a, op, b, loose) => {
		switch (op) {
			case "===":
				if (typeof a === "object") a = a.version;
				if (typeof b === "object") b = b.version;
				return a === b;
			case "!==":
				if (typeof a === "object") a = a.version;
				if (typeof b === "object") b = b.version;
				return a !== b;
			case "":
			case "=":
			case "==": return eq(a, b, loose);
			case "!=": return neq(a, b, loose);
			case ">": return gt(a, b, loose);
			case ">=": return gte(a, b, loose);
			case "<": return lt(a, b, loose);
			case "<=": return lte(a, b, loose);
			default: throw new TypeError(`Invalid operator: ${op}`);
		}
	};
	module.exports = cmp;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/coerce.js
var require_coerce = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const parse = require_parse();
	const { safeRe: re, t } = require_re();
	const coerce = (version, options) => {
		if (version instanceof SemVer) return version;
		if (typeof version === "number") version = String(version);
		if (typeof version !== "string") return null;
		options = options || {};
		let match = null;
		if (!options.rtl) match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
		else {
			const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
			let next;
			while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
				if (!match || next.index + next[0].length !== match.index + match[0].length) match = next;
				coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
			}
			coerceRtlRegex.lastIndex = -1;
		}
		if (match === null) return null;
		const major = match[2];
		return parse(`${major}.${match[3] || "0"}.${match[4] || "0"}${options.includePrerelease && match[5] ? `-${match[5]}` : ""}${options.includePrerelease && match[6] ? `+${match[6]}` : ""}`, options);
	};
	module.exports = coerce;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/truncate.js
var require_truncate = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const parse = require_parse();
	const constants = require_constants();
	const SemVer = require_semver$1();
	const truncate = (version, truncation, options) => {
		if (!constants.RELEASE_TYPES.includes(truncation)) return null;
		const clonedVersion = cloneInputVersion(version, options);
		return clonedVersion && doTruncation(clonedVersion, truncation);
	};
	const cloneInputVersion = (version, options) => {
		return parse(version instanceof SemVer ? version.version : version, options);
	};
	const doTruncation = (version, truncation) => {
		if (isPrerelease(truncation)) return version.version;
		version.prerelease = [];
		switch (truncation) {
			case "major":
				version.minor = 0;
				version.patch = 0;
				break;
			case "minor":
				version.patch = 0;
				break;
		}
		return version.format();
	};
	const isPrerelease = (type) => {
		return type.startsWith("pre");
	};
	module.exports = truncate;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/lrucache.js
var require_lrucache = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var LRUCache = class {
		constructor() {
			this.max = 1e3;
			this.map = /* @__PURE__ */ new Map();
		}
		get(key) {
			const value = this.map.get(key);
			if (value === void 0) return;
			else {
				this.map.delete(key);
				this.map.set(key, value);
				return value;
			}
		}
		delete(key) {
			return this.map.delete(key);
		}
		set(key, value) {
			if (!this.delete(key) && value !== void 0) {
				if (this.map.size >= this.max) {
					const firstKey = this.map.keys().next().value;
					this.delete(firstKey);
				}
				this.map.set(key, value);
			}
			return this;
		}
	};
	module.exports = LRUCache;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/range.js
var require_range = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SPACE_CHARACTERS = /\s+/g;
	module.exports = class Range {
		constructor(range, options) {
			options = parseOptions(options);
			if (range instanceof Range) if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) return range;
			else return new Range(range.raw, options);
			if (range instanceof Comparator) {
				this.raw = range.value;
				this.set = [[range]];
				this.formatted = void 0;
				return this;
			}
			this.options = options;
			this.loose = !!options.loose;
			this.includePrerelease = !!options.includePrerelease;
			this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
			this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
			if (!this.set.length) throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
			if (this.set.length > 1) {
				const first = this.set[0];
				this.set = this.set.filter((c) => !isNullSet(c[0]));
				if (this.set.length === 0) this.set = [first];
				else if (this.set.length > 1) {
					for (const c of this.set) if (c.length === 1 && isAny(c[0])) {
						this.set = [c];
						break;
					}
				}
			}
			this.formatted = void 0;
		}
		get range() {
			if (this.formatted === void 0) {
				this.formatted = "";
				for (let i = 0; i < this.set.length; i++) {
					if (i > 0) this.formatted += "||";
					const comps = this.set[i];
					for (let k = 0; k < comps.length; k++) {
						if (k > 0) this.formatted += " ";
						this.formatted += comps[k].toString().trim();
					}
				}
			}
			return this.formatted;
		}
		format() {
			return this.range;
		}
		toString() {
			return this.range;
		}
		parseRange(range) {
			range = range.replace(BUILDSTRIPRE, "");
			const memoKey = ((this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE)) + ":" + range;
			const cached = cache.get(memoKey);
			if (cached) return cached;
			const loose = this.options.loose;
			const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
			range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
			debug("hyphen replace", range);
			range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
			debug("comparator trim", range);
			range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
			debug("tilde trim", range);
			range = range.replace(re[t.CARETTRIM], caretTrimReplace);
			debug("caret trim", range);
			let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
			if (loose) rangeList = rangeList.filter((comp) => {
				debug("loose invalid filter", comp, this.options);
				return !!comp.match(re[t.COMPARATORLOOSE]);
			});
			debug("range list", rangeList);
			const rangeMap = /* @__PURE__ */ new Map();
			const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
			for (const comp of comparators) {
				if (isNullSet(comp)) return [comp];
				rangeMap.set(comp.value, comp);
			}
			if (rangeMap.size > 1 && rangeMap.has("")) rangeMap.delete("");
			const result = [...rangeMap.values()];
			cache.set(memoKey, result);
			return result;
		}
		intersects(range, options) {
			if (!(range instanceof Range)) throw new TypeError("a Range is required");
			return this.set.some((thisComparators) => {
				return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
					return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
						return rangeComparators.every((rangeComparator) => {
							return thisComparator.intersects(rangeComparator, options);
						});
					});
				});
			});
		}
		test(version) {
			if (!version) return false;
			if (typeof version === "string") try {
				version = new SemVer(version, this.options);
			} catch (er) {
				return false;
			}
			for (let i = 0; i < this.set.length; i++) if (testSet(this.set[i], version, this.options)) return true;
			return false;
		}
	};
	const cache = new (require_lrucache())();
	const parseOptions = require_parse_options();
	const Comparator = require_comparator();
	const debug = require_debug();
	const SemVer = require_semver$1();
	const { safeRe: re, src, t, comparatorTrimReplace, tildeTrimReplace, caretTrimReplace } = require_re();
	const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
	const BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
	const isNullSet = (c) => c.value === "<0.0.0-0";
	const isAny = (c) => c.value === "";
	const isSatisfiable = (comparators, options) => {
		let result = true;
		const remainingComparators = comparators.slice();
		let testComparator = remainingComparators.pop();
		while (result && remainingComparators.length) {
			result = remainingComparators.every((otherComparator) => {
				return testComparator.intersects(otherComparator, options);
			});
			testComparator = remainingComparators.pop();
		}
		return result;
	};
	const parseComparator = (comp, options) => {
		comp = comp.replace(re[t.BUILD], "");
		debug("comp", comp, options);
		comp = replaceCarets(comp, options);
		debug("caret", comp);
		comp = replaceTildes(comp, options);
		debug("tildes", comp);
		comp = replaceXRanges(comp, options);
		debug("xrange", comp);
		comp = replaceStars(comp, options);
		debug("stars", comp);
		return comp;
	};
	const isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
	const invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
	const replaceTildes = (comp, options) => {
		return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
	};
	const replaceTilde = (comp, options) => {
		const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
		const z = options.includePrerelease ? "-0" : "";
		return comp.replace(r, (_, M, m, p, pr) => {
			debug("tilde", comp, _, M, m, p, pr);
			let ret;
			if (isX(M)) ret = "";
			else if (isX(m)) ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
			else if (isX(p)) ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
			else if (pr) {
				debug("replaceTilde pr", pr);
				ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
			} else ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
			debug("tilde return", ret);
			return ret;
		});
	};
	const replaceCarets = (comp, options) => {
		return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
	};
	const replaceCaret = (comp, options) => {
		debug("caret", comp, options);
		const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
		const z = options.includePrerelease ? "-0" : "";
		return comp.replace(r, (_, M, m, p, pr) => {
			debug("caret", comp, _, M, m, p, pr);
			let ret;
			if (isX(M)) ret = "";
			else if (isX(m)) ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
			else if (isX(p)) if (M === "0") ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
			else ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
			else if (pr) {
				debug("replaceCaret pr", pr);
				if (M === "0") if (m === "0") ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
				else ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
				else ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
			} else {
				debug("no pr");
				if (M === "0") if (m === "0") ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
				else ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
				else ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
			}
			debug("caret return", ret);
			return ret;
		});
	};
	const replaceXRanges = (comp, options) => {
		debug("replaceXRanges", comp, options);
		return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
	};
	const replaceXRange = (comp, options) => {
		comp = comp.trim();
		const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
		return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
			debug("xRange", comp, ret, gtlt, M, m, p, pr);
			if (invalidXRangeOrder(M, m, p)) return comp;
			const xM = isX(M);
			const xm = xM || isX(m);
			const xp = xm || isX(p);
			const anyX = xp;
			if (gtlt === "=" && anyX) gtlt = "";
			pr = options.includePrerelease ? "-0" : "";
			if (xM) if (gtlt === ">" || gtlt === "<") ret = "<0.0.0-0";
			else ret = "*";
			else if (gtlt && anyX) {
				if (xm) m = 0;
				p = 0;
				if (gtlt === ">") {
					gtlt = ">=";
					if (xm) {
						M = +M + 1;
						m = 0;
						p = 0;
					} else {
						m = +m + 1;
						p = 0;
					}
				} else if (gtlt === "<=") {
					gtlt = "<";
					if (xm) M = +M + 1;
					else m = +m + 1;
				}
				if (gtlt === "<") pr = "-0";
				ret = `${gtlt + M}.${m}.${p}${pr}`;
			} else if (xm) ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
			else if (xp) ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
			debug("xRange return", ret);
			return ret;
		});
	};
	const replaceStars = (comp, options) => {
		debug("replaceStars", comp, options);
		return comp.trim().replace(re[t.STAR], "");
	};
	const replaceGTE0 = (comp, options) => {
		debug("replaceGTE0", comp, options);
		return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
	};
	const hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
		if (isX(fM)) from = "";
		else if (isX(fm)) from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
		else if (isX(fp)) from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
		else if (fpr) from = `>=${from}`;
		else from = `>=${from}${incPr ? "-0" : ""}`;
		if (isX(tM)) to = "";
		else if (isX(tm)) to = `<${+tM + 1}.0.0-0`;
		else if (isX(tp)) to = `<${tM}.${+tm + 1}.0-0`;
		else if (tpr) to = `<=${tM}.${tm}.${tp}-${tpr}`;
		else if (incPr) to = `<${tM}.${tm}.${+tp + 1}-0`;
		else to = `<=${to}`;
		return `${from} ${to}`.trim();
	};
	const testSet = (set, version, options) => {
		for (let i = 0; i < set.length; i++) if (!set[i].test(version)) return false;
		if (version.prerelease.length && !options.includePrerelease) {
			for (let i = 0; i < set.length; i++) {
				debug(set[i].semver);
				if (set[i].semver === Comparator.ANY) continue;
				if (set[i].semver.prerelease.length > 0) {
					const allowed = set[i].semver;
					if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) return true;
				}
			}
			return false;
		}
		return true;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/comparator.js
var require_comparator = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const ANY = Symbol("SemVer ANY");
	module.exports = class Comparator {
		static get ANY() {
			return ANY;
		}
		constructor(comp, options) {
			options = parseOptions(options);
			if (comp instanceof Comparator) if (comp.loose === !!options.loose) return comp;
			else comp = comp.value;
			comp = comp.trim().split(/\s+/).join(" ");
			debug("comparator", comp, options);
			this.options = options;
			this.loose = !!options.loose;
			this.parse(comp);
			if (this.semver === ANY) this.value = "";
			else this.value = this.operator + this.semver.version;
			debug("comp", this);
		}
		parse(comp) {
			const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
			const m = comp.match(r);
			if (!m) throw new TypeError(`Invalid comparator: ${comp}`);
			this.operator = m[1] !== void 0 ? m[1] : "";
			if (this.operator === "=") this.operator = "";
			if (!m[2]) this.semver = ANY;
			else this.semver = new SemVer(m[2], this.options.loose);
		}
		toString() {
			return this.value;
		}
		test(version) {
			debug("Comparator.test", version, this.options.loose);
			if (this.semver === ANY || version === ANY) return true;
			if (typeof version === "string") try {
				version = new SemVer(version, this.options);
			} catch (er) {
				return false;
			}
			return cmp(version, this.operator, this.semver, this.options);
		}
		intersects(comp, options) {
			if (!(comp instanceof Comparator)) throw new TypeError("a Comparator is required");
			if (this.operator === "") {
				if (this.value === "") return true;
				return new Range(comp.value, options).test(this.value);
			} else if (comp.operator === "") {
				if (comp.value === "") return true;
				return new Range(this.value, options).test(comp.semver);
			}
			options = parseOptions(options);
			if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) return false;
			if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) return false;
			if (this.operator.startsWith(">") && comp.operator.startsWith(">")) return true;
			if (this.operator.startsWith("<") && comp.operator.startsWith("<")) return true;
			if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) return true;
			if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) return true;
			if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) return true;
			return false;
		}
	};
	const parseOptions = require_parse_options();
	const { safeRe: re, t } = require_re();
	const cmp = require_cmp();
	const debug = require_debug();
	const SemVer = require_semver$1();
	const Range = require_range();
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/satisfies.js
var require_satisfies = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Range = require_range();
	const satisfies = (version, range, options) => {
		try {
			range = new Range(range, options);
		} catch (er) {
			return false;
		}
		return range.test(version);
	};
	module.exports = satisfies;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/to-comparators.js
var require_to_comparators = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Range = require_range();
	const toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
	module.exports = toComparators;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const Range = require_range();
	const maxSatisfying = (versions, range, options) => {
		let max = null;
		let maxSV = null;
		let rangeObj = null;
		try {
			rangeObj = new Range(range, options);
		} catch (er) {
			return null;
		}
		versions.forEach((v) => {
			if (rangeObj.test(v)) {
				if (!max || maxSV.compare(v) === -1) {
					max = v;
					maxSV = new SemVer(max, options);
				}
			}
		});
		return max;
	};
	module.exports = maxSatisfying;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const Range = require_range();
	const minSatisfying = (versions, range, options) => {
		let min = null;
		let minSV = null;
		let rangeObj = null;
		try {
			rangeObj = new Range(range, options);
		} catch (er) {
			return null;
		}
		versions.forEach((v) => {
			if (rangeObj.test(v)) {
				if (!min || minSV.compare(v) === 1) {
					min = v;
					minSV = new SemVer(min, options);
				}
			}
		});
		return min;
	};
	module.exports = minSatisfying;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-version.js
var require_min_version = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const Range = require_range();
	const gt = require_gt();
	const minVersion = (range, loose) => {
		range = new Range(range, loose);
		let minver = new SemVer("0.0.0");
		if (range.test(minver)) return minver;
		minver = new SemVer("0.0.0-0");
		if (range.test(minver)) return minver;
		minver = null;
		for (let i = 0; i < range.set.length; ++i) {
			const comparators = range.set[i];
			let setMin = null;
			comparators.forEach((comparator) => {
				const compver = new SemVer(comparator.semver.version);
				switch (comparator.operator) {
					case ">":
						if (compver.prerelease.length === 0) compver.patch++;
						else compver.prerelease.push(0);
						compver.raw = compver.format();
					case "":
					case ">=":
						if (!setMin || gt(compver, setMin)) setMin = compver;
						break;
					case "<":
					case "<=": break;
					/* istanbul ignore next */
					default: throw new Error(`Unexpected operation: ${comparator.operator}`);
				}
			});
			if (setMin && (!minver || gt(minver, setMin))) minver = setMin;
		}
		if (minver && range.test(minver)) return minver;
		return null;
	};
	module.exports = minVersion;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/valid.js
var require_valid = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Range = require_range();
	const validRange = (range, options) => {
		try {
			return new Range(range, options).range || "*";
		} catch (er) {
			return null;
		}
	};
	module.exports = validRange;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/outside.js
var require_outside = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const SemVer = require_semver$1();
	const Comparator = require_comparator();
	const { ANY } = Comparator;
	const Range = require_range();
	const satisfies = require_satisfies();
	const gt = require_gt();
	const lt = require_lt();
	const lte = require_lte();
	const gte = require_gte();
	const outside = (version, range, hilo, options) => {
		version = new SemVer(version, options);
		range = new Range(range, options);
		let gtfn, ltefn, ltfn, comp, ecomp;
		switch (hilo) {
			case ">":
				gtfn = gt;
				ltefn = lte;
				ltfn = lt;
				comp = ">";
				ecomp = ">=";
				break;
			case "<":
				gtfn = lt;
				ltefn = gte;
				ltfn = gt;
				comp = "<";
				ecomp = "<=";
				break;
			default: throw new TypeError("Must provide a hilo val of \"<\" or \">\"");
		}
		if (satisfies(version, range, options)) return false;
		for (let i = 0; i < range.set.length; ++i) {
			const comparators = range.set[i];
			let high = null;
			let low = null;
			comparators.forEach((comparator) => {
				if (comparator.semver === ANY) comparator = new Comparator(">=0.0.0");
				high = high || comparator;
				low = low || comparator;
				if (gtfn(comparator.semver, high.semver, options)) high = comparator;
				else if (ltfn(comparator.semver, low.semver, options)) low = comparator;
			});
			if (high.operator === comp || high.operator === ecomp) return false;
			if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) return false;
			else if (low.operator === ecomp && ltfn(version, low.semver)) return false;
		}
		return true;
	};
	module.exports = outside;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/gtr.js
var require_gtr = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const outside = require_outside();
	const gtr = (version, range, options) => outside(version, range, ">", options);
	module.exports = gtr;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/ltr.js
var require_ltr = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const outside = require_outside();
	const ltr = (version, range, options) => outside(version, range, "<", options);
	module.exports = ltr;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/intersects.js
var require_intersects = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Range = require_range();
	const intersects = (r1, r2, options) => {
		r1 = new Range(r1, options);
		r2 = new Range(r2, options);
		return r1.intersects(r2, options);
	};
	module.exports = intersects;
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/simplify.js
var require_simplify = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const satisfies = require_satisfies();
	const compare = require_compare();
	module.exports = (versions, range, options) => {
		const set = [];
		let first = null;
		let prev = null;
		const v = versions.sort((a, b) => compare(a, b, options));
		for (const version of v) if (satisfies(version, range, options)) {
			prev = version;
			if (!first) first = version;
		} else {
			if (prev) set.push([first, prev]);
			prev = null;
			first = null;
		}
		if (first) set.push([first, null]);
		const ranges = [];
		for (const [min, max] of set) if (min === max) ranges.push(min);
		else if (!max && min === v[0]) ranges.push("*");
		else if (!max) ranges.push(`>=${min}`);
		else if (min === v[0]) ranges.push(`<=${max}`);
		else ranges.push(`${min} - ${max}`);
		const simplified = ranges.join(" || ");
		const original = typeof range.raw === "string" ? range.raw : String(range);
		return simplified.length < original.length ? simplified : range;
	};
}));
//#endregion
//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/subset.js
var require_subset = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const Range = require_range();
	const Comparator = require_comparator();
	const { ANY } = Comparator;
	const satisfies = require_satisfies();
	const compare = require_compare();
	const subset = (sub, dom, options = {}) => {
		if (sub === dom) return true;
		sub = new Range(sub, options);
		dom = new Range(dom, options);
		let sawNonNull = false;
		OUTER: for (const simpleSub of sub.set) {
			for (const simpleDom of dom.set) {
				const isSub = simpleSubset(simpleSub, simpleDom, options);
				sawNonNull = sawNonNull || isSub !== null;
				if (isSub) continue OUTER;
			}
			if (sawNonNull) return false;
		}
		return true;
	};
	const minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
	const minimumVersion = [new Comparator(">=0.0.0")];
	const simpleSubset = (sub, dom, options) => {
		if (sub === dom) return true;
		if (sub.length === 1 && sub[0].semver === ANY) if (dom.length === 1 && dom[0].semver === ANY) return true;
		else if (options.includePrerelease) sub = minimumVersionWithPreRelease;
		else sub = minimumVersion;
		if (dom.length === 1 && dom[0].semver === ANY) if (options.includePrerelease) return true;
		else dom = minimumVersion;
		const eqSet = /* @__PURE__ */ new Set();
		let gt, lt;
		for (const c of sub) if (c.operator === ">" || c.operator === ">=") gt = higherGT(gt, c, options);
		else if (c.operator === "<" || c.operator === "<=") lt = lowerLT(lt, c, options);
		else eqSet.add(c.semver);
		if (eqSet.size > 1) return null;
		let gtltComp;
		if (gt && lt) {
			gtltComp = compare(gt.semver, lt.semver, options);
			if (gtltComp > 0) return null;
			else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) return null;
		}
		for (const eq of eqSet) {
			if (gt && !satisfies(eq, String(gt), options)) return null;
			if (lt && !satisfies(eq, String(lt), options)) return null;
			for (const c of dom) if (!satisfies(eq, String(c), options)) return false;
			return true;
		}
		let higher, lower;
		let hasDomLT, hasDomGT;
		let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
		let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
		if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) needDomLTPre = false;
		for (const c of dom) {
			hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
			hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
			if (gt) {
				if (needDomGTPre) {
					if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) needDomGTPre = false;
				}
				if (c.operator === ">" || c.operator === ">=") {
					higher = higherGT(gt, c, options);
					if (higher === c && higher !== gt) return false;
				} else if (gt.operator === ">=" && !c.test(gt.semver)) return false;
			}
			if (lt) {
				if (needDomLTPre) {
					if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) needDomLTPre = false;
				}
				if (c.operator === "<" || c.operator === "<=") {
					lower = lowerLT(lt, c, options);
					if (lower === c && lower !== lt) return false;
				} else if (lt.operator === "<=" && !c.test(lt.semver)) return false;
			}
			if (!c.operator && (lt || gt) && gtltComp !== 0) return false;
		}
		if (gt && hasDomLT && !lt && gtltComp !== 0) return false;
		if (lt && hasDomGT && !gt && gtltComp !== 0) return false;
		if (needDomGTPre || needDomLTPre) return false;
		return true;
	};
	const higherGT = (a, b, options) => {
		if (!a) return b;
		const comp = compare(a.semver, b.semver, options);
		return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
	};
	const lowerLT = (a, b, options) => {
		if (!a) return b;
		const comp = compare(a.semver, b.semver, options);
		return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
	};
	module.exports = subset;
}));
(/* @__PURE__ */ __commonJSMin(((exports, module) => {
	const internalRe = require_re();
	const constants = require_constants();
	const SemVer = require_semver$1();
	const identifiers = require_identifiers();
	module.exports = {
		parse: require_parse(),
		valid: require_valid$1(),
		clean: require_clean(),
		inc: require_inc(),
		diff: require_diff(),
		major: require_major(),
		minor: require_minor(),
		patch: require_patch(),
		prerelease: require_prerelease(),
		compare: require_compare(),
		rcompare: require_rcompare(),
		compareLoose: require_compare_loose(),
		compareBuild: require_compare_build(),
		sort: require_sort(),
		rsort: require_rsort(),
		gt: require_gt(),
		lt: require_lt(),
		eq: require_eq(),
		neq: require_neq(),
		gte: require_gte(),
		lte: require_lte(),
		cmp: require_cmp(),
		coerce: require_coerce(),
		truncate: require_truncate(),
		Comparator: require_comparator(),
		Range: require_range(),
		satisfies: require_satisfies(),
		toComparators: require_to_comparators(),
		maxSatisfying: require_max_satisfying(),
		minSatisfying: require_min_satisfying(),
		minVersion: require_min_version(),
		validRange: require_valid(),
		outside: require_outside(),
		gtr: require_gtr(),
		ltr: require_ltr(),
		intersects: require_intersects(),
		simplifyRange: require_simplify(),
		subset: require_subset(),
		SemVer,
		re: internalRe.re,
		src: internalRe.src,
		tokens: internalRe.t,
		SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
		RELEASE_TYPES: constants.RELEASE_TYPES,
		compareIdentifiers: identifiers.compareIdentifiers,
		rcompareIdentifiers: identifiers.rcompareIdentifiers
	};
})))();
//#endregion
//#region ../../vendor/studybuddy-contracts/dist/skill-diagnostic-codes.js
const SKILL_DIAGNOSTIC_CODES = [
	"AUTH_IDENTITY_CONFLICT",
	"NETWORK_ERROR",
	"SKILL_ADAPTER_UNCONFIRMED",
	"SKILL_ADMIN_IDENTITY_REQUIRED",
	"SKILL_ADMIN_REASON_REQUIRED",
	"SKILL_AI_APPROVAL_REQUIRED",
	"SKILL_AI_EXECUTION_PENDING",
	"SKILL_AI_PLAN_CHANGED",
	"SKILL_AI_PLAN_EXPIRED",
	"SKILL_AI_PLAN_LIMIT",
	"SKILL_AI_PLAN_UNKNOWN",
	"SKILL_AI_PROTOCOL_INVALID",
	"SKILL_AI_SESSION_EXPIRED",
	"SKILL_AI_UNAVAILABLE",
	"SKILL_BRIDGE_EXPIRED",
	"SKILL_CANONICAL_NAME_CHANGED",
	"SKILL_CENTER_INPUT_INVALID",
	"SKILL_CENTER_UPGRADE_REQUIRED",
	"SKILL_CENTER_WEBVIEW_UNAVAILABLE",
	"SKILL_CHATGPT_EXECUTOR_UNCONFIRMED",
	"SKILL_COPY_FAILED",
	"SKILL_COVER_INVALID",
	"SKILL_COVER_UPLOAD_EXPIRED",
	"SKILL_COVER_UPLOAD_INVALID",
	"SKILL_CURATION_INVALID",
	"SKILL_CURRENT_PACKAGE_REQUIRED",
	"SKILL_CURSOR_INVALID",
	"SKILL_CUSTOM_SCOPE_UNCONFIRMED",
	"SKILL_DELIST_INVALID",
	"SKILL_DESTINATION_UNAVAILABLE",
	"SKILL_DETECTION_FAILED",
	"SKILL_DIAGNOSTIC_INVALID",
	"SKILL_DIAGNOSTIC_LIMIT",
	"SKILL_DOWNLOAD_EXPIRY_INVALID",
	"SKILL_DOWNLOAD_FAILED",
	"SKILL_EMBEDDED_SESSION_PUBLIC_BASE_URL_INVALID",
	"SKILL_EMBEDDED_TICKET_COLLISION",
	"SKILL_EMBEDDED_TICKET_INVALID",
	"SKILL_EMBEDDED_TICKET_UNAVAILABLE",
	"SKILL_ENTRY_CHANGED",
	"SKILL_EXECUTABLE_UNCONFIRMED",
	"SKILL_EXECUTOR_INVALID",
	"SKILL_EXPORT_FAILED",
	"SKILL_EXPORT_LIMIT",
	"SKILL_FILE_CHANGED",
	"SKILL_FILE_INVALID",
	"SKILL_FLAT_REMOVE_UNCONFIRMED",
	"SKILL_FORMAT_UNCONFIRMED",
	"SKILL_GITHUB_LOOKUP_FAILED",
	"SKILL_GITHUB_NOT_PUBLIC",
	"SKILL_GITHUB_README_INVALID",
	"SKILL_GITHUB_REFERENCE_INVALID",
	"SKILL_GITHUB_REFERENCE_NOT_FOUND",
	"SKILL_HERMES_DESKTOP_EXECUTOR_UNCONFIRMED",
	"SKILL_HOME_UNAVAILABLE",
	"SKILL_HUB_CONTENT_EXISTS",
	"SKILL_HUB_REFERENCED",
	"SKILL_HUB_REFERENCES_UNCONFIRMED",
	"SKILL_IMPORT_REQUIRED",
	"SKILL_INSTALL_FAILED",
	"SKILL_LEGACY_DIRECTORY",
	"SKILL_LINK_CREATE_FAILED",
	"SKILL_LINK_CYCLE",
	"SKILL_LINK_OUTSIDE_SCOPE",
	"SKILL_LINK_PERMISSION_DENIED",
	"SKILL_LINK_PLATFORM_UNSUPPORTED",
	"SKILL_LINK_SOURCE_UNMANAGED",
	"SKILL_LINK_UNVERIFIED",
	"SKILL_LISTING_NOT_FOUND",
	"SKILL_LOCAL_ARCHIVE_INVALID",
	"SKILL_LOCAL_CONTENT_CONFLICT",
	"SKILL_MANIFEST_INVALID",
	"SKILL_MCP_CONFIG_CONFLICT",
	"SKILL_MCP_CONFIG_INVALID",
	"SKILL_MCP_CONFIG_IO_FAILED",
	"SKILL_MCP_CONFIG_PENDING",
	"SKILL_MCP_CONFIG_REPAIR_REQUIRED",
	"SKILL_MCP_CONFIG_UNSAFE",
	"SKILL_MCP_DEPENDENCY_UNCONFIRMED",
	"SKILL_NAME_CONFLICT",
	"SKILL_NATIVE_RESPONSE_INVALID",
	"SKILL_OBJECT_UPLOAD_FAILED",
	"SKILL_OPEN_FAILED",
	"SKILL_OPERATION_CANCELLED",
	"SKILL_OPERATION_CHANGED",
	"SKILL_OPERATION_INVALID",
	"SKILL_OPERATION_LIMIT",
	"SKILL_OPERATION_NOT_FOUND",
	"SKILL_OPERATION_REUSED",
	"SKILL_PACKAGE_INVALID",
	"SKILL_PATH_INVALID",
	"SKILL_PATH_UNSAFE",
	"SKILL_PROJECT_LIMIT",
	"SKILL_PUBLICATION_CHANGED",
	"SKILL_PUBLISH_INVALID",
	"SKILL_PUBLISHER_INVALID",
	"SKILL_RECOVERY_REQUIRED",
	"SKILL_REQUEST_INVALID",
	"SKILL_RESTORE_INVALID",
	"SKILL_ROOT_INVALID",
	"SKILL_SCAN_DEPTH_LIMIT",
	"SKILL_SCAN_FAILED",
	"SKILL_SCAN_LIMIT",
	"SKILL_SCAN_PERMISSION_DENIED",
	"SKILL_SCOPE_INVALID",
	"SKILL_SCOPE_REVOKED",
	"SKILL_SERVICE_UNAVAILABLE",
	"SKILL_SESSION_INVALID",
	"SKILL_SHARED_CODEX_EXECUTOR",
	"SKILL_SNAPSHOT_STALE",
	"SKILL_SOURCE_CHANGED",
	"SKILL_SOURCE_NOT_GITHUB",
	"SKILL_SOURCE_TARGET_OVERLAP",
	"SKILL_SOURCE_UNSAFE",
	"SKILL_STANDARD_INVALID",
	"SKILL_STORAGE_KEY_INVALID",
	"SKILL_STORAGE_OBJECT_INVALID",
	"SKILL_STORAGE_OBJECT_STREAM_INVALID",
	"SKILL_STORAGE_OBJECT_TOO_LARGE",
	"SKILL_STORE_UNAVAILABLE",
	"SKILL_TARGET_AMBIGUOUS",
	"SKILL_TARGET_BUSY",
	"SKILL_TARGET_CASE_CONFLICT",
	"SKILL_TARGET_CHANGED",
	"SKILL_TARGET_PROTECTED",
	"SKILL_TARGET_UNREADABLE",
	"SKILL_TARGET_UNSAFE",
	"SKILL_TARGETS_INCOMPLETE",
	"SKILL_TICKET_EXPIRED",
	"SKILL_TOOL_NOT_INSTALLED",
	"SKILL_TOOL_VERSION_UNCONFIRMED",
	"SKILL_UNMANAGED_DISABLE",
	"SKILL_UPDATE_IDENTITY_UNKNOWN",
	"SKILL_UPLOAD_ALREADY_USED",
	"SKILL_UPLOAD_ID_INVALID",
	"SKILL_UPLOAD_INCOMPLETE",
	"SKILL_UPLOAD_INVALID",
	"SKILL_UPLOAD_RECORD_INVALID",
	"SKILL_UPLOAD_UNAVAILABLE",
	"SKILL_WATCH_CLOSED",
	"SKILL_WATCH_LIMIT",
	"SKILL_WATCH_PLATFORM_UNSUPPORTED",
	"SKILL_WATCH_SCOPE_REVOKED",
	"SKILL_WATCH_UNAVAILABLE",
	"SKILL_WEB_RUNTIME_FAILED",
	"SKILL_WORKBUDDY_PROJECT_REQUIRED",
	"SKILL_WRITE_FAILED",
	"SKILL_WRITE_PERMISSION_DENIED",
	"UNKNOWN_ERROR",
	"WEB_API_RESPONSE_INVALID"
];
//#endregion
//#region ../../vendor/studybuddy-contracts/dist/skill-diagnostics.js
const SKILL_STARTUP_PHASES = [
	"session_exchange",
	"session_restore",
	"native_client",
	"bridge_connect"
];
[...SKILL_STARTUP_PHASES];
[...SKILL_STARTUP_PHASES];
new Set([
	...SKILL_DIAGNOSTIC_CODES,
	"COMMAND_FAILED",
	"AUTH_REQUIRED",
	"ENTITLEMENT_REQUIRED",
	"CSRF_INVALID",
	"API_INVALID_RESPONSE",
	"WEB_API_RESPONSE_INVALID",
	"WEB_API_NETWORK_ERROR",
	"NETWORK_UNAVAILABLE",
	"UNKNOWN_ERROR"
]);
//#endregion
//#region ../../vendor/studybuddy-contracts/dist/harness-support.js
const HARNESS_DIAGNOSTIC_SOURCES = [
	"desktop_main",
	"host",
	"renderer",
	"tool_center",
	"community",
	"skills",
	"personal_ai",
	"labs",
	"aigc"
];
const ranges = [
	"last_24_hours",
	"last_3_days",
	"all_30_days"
];
const phases = [
	"preparing",
	"uploading",
	"submitting"
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const invalid = () => {
	throw new TypeError("HARNESS_SUPPORT_INVALID");
};
function record(value, required, optional = []) {
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
	const row = value;
	if (required.some((key) => !Object.hasOwn(row, key)) || Object.keys(row).some((key) => !required.includes(key) && !optional.includes(key))) return invalid();
	return row;
}
function text(value, maximum) {
	if (typeof value !== "string" || !value.trim() || value.length > maximum) return invalid();
	return value;
}
function integer(value, maximum, minimum = 0) {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) return invalid();
	return value;
}
function oneOf(value, choices) {
	if (typeof value !== "string" || !choices.includes(value)) return invalid();
	return value;
}
function uuid(value) {
	if (typeof value !== "string" || !uuidPattern.test(value)) return invalid();
	return value;
}
/** Validate an opaque workflow identifier before it enters IPC. */
function parseSupportRequestId(value) {
	return uuid(value);
}
/** Validate main's preview with collection availability; native preview fields remain unchanged. */
function parseHarnessSupportPreviewReceipt(value) {
	const { sources, ...native } = record(value, [
		"range",
		"fileCount",
		"eventCount",
		"compressedBytes",
		"firstOccurredAt",
		"lastOccurredAt",
		"sources"
	]);
	if (!Array.isArray(sources) || sources.length !== HARNESS_DIAGNOSTIC_SOURCES.length) return invalid();
	const parsed = sources.map((value) => {
		const source = record(value, ["source", "state"]);
		return {
			source: oneOf(source.source, HARNESS_DIAGNOSTIC_SOURCES),
			state: oneOf(source.state, [
				"present",
				"unavailable",
				"failed"
			])
		};
	});
	if (new Set(parsed.map((value) => value.source)).size !== HARNESS_DIAGNOSTIC_SOURCES.length) return invalid();
	return {
		...parseHarnessSupportResult("previewSupportLogs", native),
		sources: parsed
	};
}
function selectionId(value) {
	return uuid(value);
}
function bytes(value, maximum, allowZero = false) {
	if (typeof value !== "string" || !(allowZero ? /^(?:0|[1-9]\d*)$/u : /^[1-9]\d*$/u).test(value) || value.length > 16 || BigInt(value) > BigInt(maximum)) return invalid();
	return value;
}
function time(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
	return value;
}
function failure(value) {
	const row = record(value, ["code"], ["operationId"]);
	const code = text(row.code, 128);
	if (!/^[A-Z][A-Z0-9_]*$/u.test(code)) return invalid();
	return Object.hasOwn(row, "operationId") ? {
		code,
		operationId: uuid(row.operationId)
	} : { code };
}
function confirmedLog(value) {
	const row = record(value, [
		"uploadId",
		"publicCode",
		"status"
	]);
	const publicCode = text(row.publicCode, 12);
	if (!/^LOG-[A-Z0-9]{8}$/u.test(publicCode) || row.status !== "AVAILABLE") return invalid();
	return {
		uploadId: uuid(row.uploadId),
		publicCode,
		status: "AVAILABLE"
	};
}
function issue(value, log) {
	const row = record(value, [
		"issueId",
		"publicCode",
		"logUploadId",
		"logPublicCode",
		"status"
	]);
	const publicCode = text(row.publicCode, 14);
	if (!/^ISSUE-[A-Z0-9]{8}$/u.test(publicCode) || row.logUploadId !== log.uploadId || row.logPublicCode !== log.publicCode) return invalid();
	return {
		issueId: uuid(row.issueId),
		publicCode,
		logUploadId: log.uploadId,
		logPublicCode: log.publicCode,
		status: oneOf(row.status, [
			"OPEN",
			"IN_PROGRESS",
			"RESOLVED"
		])
	};
}
function operation(value) {
	const base = record(value, ["state"], [
		"requestId",
		"flow",
		"phase",
		"log",
		"issue",
		"error"
	]);
	if (base.state === "idle") {
		record(value, ["state"]);
		return { state: "idle" };
	}
	const requestId = parseSupportRequestId(base.requestId), flow = oneOf(base.flow, ["logs", "issue"]);
	if (base.state === "running") {
		record(value, [
			"state",
			"requestId",
			"flow",
			"phase"
		], ["log"]);
		const phase = oneOf(base.phase, phases);
		if (flow === "logs" && phase === "submitting") return invalid();
		if (Object.hasOwn(base, "log") && (flow !== "issue" || phase === "preparing")) return invalid();
		return {
			state: "running",
			requestId,
			flow,
			phase,
			...Object.hasOwn(base, "log") ? { log: confirmedLog(base.log) } : {}
		};
	}
	if (base.state === "available") {
		record(value, [
			"state",
			"requestId",
			"flow",
			"log"
		], flow === "issue" ? ["issue"] : []);
		const log = confirmedLog(base.log);
		return flow === "logs" ? {
			state: "available",
			requestId,
			flow,
			log
		} : {
			state: "available",
			requestId,
			flow,
			log,
			issue: issue(base.issue, log)
		};
	}
	if (base.state === "submission_unconfirmed") {
		record(value, [
			"state",
			"requestId",
			"flow",
			"log",
			"error"
		]);
		if (flow !== "issue") return invalid();
		return {
			state: "submission_unconfirmed",
			requestId,
			flow,
			log: confirmedLog(base.log),
			error: failure(base.error)
		};
	}
	if (base.state === "failed") {
		record(value, [
			"state",
			"requestId",
			"flow",
			"phase",
			"error"
		], ["log"]);
		const phase = oneOf(base.phase, phases);
		if (flow === "logs" && phase === "submitting") return invalid();
		return {
			state: "failed",
			requestId,
			flow,
			phase,
			error: failure(base.error),
			...Object.hasOwn(base, "log") ? { log: confirmedLog(base.log) } : {}
		};
	}
	return invalid();
}
function preview(value) {
	const row = record(value, [
		"range",
		"fileCount",
		"eventCount",
		"compressedBytes",
		"firstOccurredAt",
		"lastOccurredAt"
	]);
	const firstOccurredAt = time(row.firstOccurredAt), lastOccurredAt = time(row.lastOccurredAt);
	if (firstOccurredAt > lastOccurredAt) return invalid();
	return {
		range: oneOf(row.range, ranges),
		fileCount: integer(row.fileCount, 64),
		eventCount: integer(row.eventCount, 25e4),
		compressedBytes: bytes(row.compressedBytes, 50 * 1024 * 1024, true),
		firstOccurredAt,
		lastOccurredAt
	};
}
function screenshots(value) {
	if (!Array.isArray(value) || value.length > 3) return invalid();
	return value.map((entry) => {
		const row = record(entry, [
			"selectionId",
			"name",
			"mediaType",
			"bytes"
		]), name = text(row.name, 255);
		if (/[\\/\u0000-\u001f]/u.test(name)) return invalid();
		return {
			selectionId: selectionId(row.selectionId),
			name,
			mediaType: oneOf(row.mediaType, [
				"image/png",
				"image/jpeg",
				"image/webp"
			]),
			bytes: bytes(row.bytes, 5 * 1024 * 1024)
		};
	});
}
/** Validate native support results without exposing archive paths or raw failures. */
function parseHarnessSupportResult(method, value) {
	let parsed;
	switch (method) {
		case "previewSupportLogs":
			parsed = preview(value);
			break;
		case "uploadSupportLogs":
		case "submitSupportIssue":
		case "getSupportOperation":
			parsed = operation(value);
			if (parsed.state === "idle" && method !== "getSupportOperation") return invalid();
			if (parsed.state !== "idle" && (method === "uploadSupportLogs" && parsed.flow !== "logs" || method === "submitSupportIssue" && parsed.flow !== "issue")) return invalid();
			break;
		case "stageSupportScreenshots":
			parsed = screenshots(value);
			break;
		case "readSupportPreviousExit": {
			const row = record(value, ["detected"]);
			if (typeof row.detected !== "boolean") return invalid();
			parsed = { detected: row.detected };
			break;
		}
		case "recordHarnessDiagnostics": {
			const row = record(value, ["recorded", "duplicates"]);
			const recorded = integer(row.recorded, 256), duplicates = integer(row.duplicates, 256);
			if (recorded + duplicates > 256) return invalid();
			parsed = {
				recorded,
				duplicates
			};
			break;
		}
		default: return invalid();
	}
	return parsed;
}
/** Parse request-correlated phase events; native owner/stream fencing is validated by main. */
function parseHarnessSupportEvent(value) {
	const row = record(value, [
		"requestId",
		"sequence",
		"phase",
		"operation"
	]);
	const requestId = parseSupportRequestId(row.requestId), parsed = operation(row.operation);
	const phase = oneOf(row.phase, [
		"preparing",
		"uploading",
		"submitting",
		"completed",
		"failed"
	]);
	if (parsed.state === "idle" || parsed.requestId !== requestId || phase === "completed" && parsed.state !== "available" || phase === "failed" && parsed.state !== "failed" && parsed.state !== "submission_unconfirmed" || phases.includes(phase) && (parsed.state !== "running" || parsed.phase !== phase)) return invalid();
	return {
		requestId,
		sequence: integer(row.sequence, Number.MAX_SAFE_INTEGER, 1),
		phase,
		operation: parsed
	};
}
//#endregion
//#region lib/types/studybuddy/support-ipc.js
/** Shared channel names only; no main-only implementation enters sandboxed preload. */
const SUPPORT_IPC = {
	preview: "studybuddy:support-preview",
	upload: "studybuddy:support-upload",
	screenshots: "studybuddy:support-screenshots",
	report: "studybuddy:support-report",
	operation: "studybuddy:support-operation",
	exit: "studybuddy:support-exit",
	subscribe: "studybuddy:support-subscribe",
	unsubscribe: "studybuddy:support-unsubscribe",
	progress: "studybuddy:support-progress"
};
//#endregion
//#region lib/types/studybuddy/support-preload.js
/** Renderer gets closed actions and validated progress, never private diagnostic or file methods. */
/** Assemble the app-only preload API; the caller enforces origin and main-frame exposure.
* @param transport Electron's restricted IPC carrier.
* @returns Support actions with no owner, token, path or arbitrary operation selector.
*/
function createSupportPreload(transport) {
	const unwrap = async (channel, ...args) => {
		const response = await transport.invoke(channel, ...args);
		if (!response || typeof response !== "object" || !("ok" in response)) throw new Error("HARNESS_SUPPORT_INVALID");
		if (response.ok !== true) {
			const error = "error" in response ? response.error : void 0;
			const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,127}$/u.test(error.code) ? error.code : "HARNESS_SUPPORT_INVALID";
			throw Object.assign(new Error(code), { code });
		}
		if (!("data" in response)) throw new Error("HARNESS_SUPPORT_INVALID");
		return response.data;
	};
	return {
		preview: async (range) => parseHarnessSupportPreviewReceipt(await unwrap(SUPPORT_IPC.preview, range)),
		uploadLogs: async (id, range) => parseHarnessSupportResult("uploadSupportLogs", await unwrap(SUPPORT_IPC.upload, id, range)),
		selectScreenshots: async () => parseHarnessSupportResult("stageSupportScreenshots", await unwrap(SUPPORT_IPC.screenshots)),
		submitIssue: async (id, input) => parseHarnessSupportResult("submitSupportIssue", await unwrap(SUPPORT_IPC.report, id, input)),
		getOperation: async (id) => parseHarnessSupportResult("getSupportOperation", await unwrap(SUPPORT_IPC.operation, id)),
		readPreviousExit: async () => parseHarnessSupportResult("readSupportPreviousExit", await unwrap(SUPPORT_IPC.exit)),
		subscribe(id, listener) {
			parseSupportRequestId(id);
			let active = true;
			const handle = (_event, value) => {
				if (!active) return;
				try {
					const event = parseHarnessSupportEvent(value);
					if (event.requestId === id) listener(event);
				} catch (_error) {}
			};
			transport.on(SUPPORT_IPC.progress, handle);
			unwrap(SUPPORT_IPC.subscribe, id).catch((_error) => {});
			return () => {
				active = false;
				transport.off(SUPPORT_IPC.progress, handle);
				unwrap(SUPPORT_IPC.unsubscribe, id).catch((_error) => {});
			};
		}
	};
}
//#endregion
//#region lib/types/studybuddy/preload.js
/** An origin-scoped product API with summary-only responses. */
function exposeStudyBuddy() {
	if (location.protocol !== "dsh-app:" || !process.isMainFrame || !(location.hostname === "app" || location.hostname === "shell" && location.pathname === "/welcome.html")) return;
	const api = {
		status: () => electron.ipcRenderer.invoke(STUDYBUDDY_IPC.status),
		start: () => electron.ipcRenderer.invoke(STUDYBUDDY_IPC.start),
		cancel: () => electron.ipcRenderer.invoke(STUDYBUDDY_IPC.cancel),
		logout: () => electron.ipcRenderer.invoke(STUDYBUDDY_IPC.logout),
		checkUpdates: () => electron.ipcRenderer.invoke(STUDYBUDDY_IPC.updates),
		subscribe(listener) {
			const handle = (_event, state) => {
				listener(state);
			};
			electron.ipcRenderer.on(STUDYBUDDY_IPC.state, handle);
			return () => {
				electron.ipcRenderer.off(STUDYBUDDY_IPC.state, handle);
			};
		}
	};
	if (location.hostname === "app") {
		const unwrap = async (operation) => {
			const response = await operation;
			if (!response.ok) throw Object.assign(new Error(response.error.code), response.error);
			return response.data;
		};
		Object.assign(api, {
			capabilities: {
				completeOpen: (id) => unwrap(electron.ipcRenderer.invoke("studybuddy:capability-open", id)),
				openProject: (id) => unwrap(electron.ipcRenderer.invoke("studybuddy:capability-project-open", id))
			},
			prompts: { invoke: (method, args) => unwrap(electron.ipcRenderer.invoke("studybuddy:prompts", method, args)) },
			support: createSupportPreload(electron.ipcRenderer),
			video: {
				available: () => unwrap(electron.ipcRenderer.invoke(VIDEO_IPC.available)),
				acquire: () => unwrap(electron.ipcRenderer.invoke(VIDEO_IPC.acquire)),
				release: (lease) => unwrap(electron.ipcRenderer.invoke(VIDEO_IPC.release, lease)),
				setTheme: (lease, theme) => unwrap(electron.ipcRenderer.invoke(VIDEO_IPC.theme, lease, theme)),
				setVisible: (lease, visible) => unwrap(electron.ipcRenderer.invoke(VIDEO_IPC.visible, lease, visible)),
				acknowledgeReference: (id) => unwrap(electron.ipcRenderer.invoke(VIDEO_IPC.acknowledgeReference, id)),
				subscribeInvalid: (listener) => {
					const handle = (_event, lease) => {
						if (typeof lease === "string") listener(lease);
					};
					electron.ipcRenderer.on(VIDEO_IPC.invalid, handle);
					return () => {
						electron.ipcRenderer.off(VIDEO_IPC.invalid, handle);
					};
				},
				subscribeAction: (listener) => {
					const handle = (_event, notice) => listener(notice);
					electron.ipcRenderer.on(VIDEO_IPC.action, handle);
					return () => {
						electron.ipcRenderer.off(VIDEO_IPC.action, handle);
					};
				}
			},
			research: {
				acknowledgeIntent: (id) => unwrap(electron.ipcRenderer.invoke(RESEARCH_IPC.acknowledgeIntent, id)),
				acquire: () => unwrap(electron.ipcRenderer.invoke(RESEARCH_IPC.acquire)),
				release: (lease) => unwrap(electron.ipcRenderer.invoke(RESEARCH_IPC.release, lease)),
				setTheme: (lease, theme) => unwrap(electron.ipcRenderer.invoke(RESEARCH_IPC.theme, lease, theme)),
				setVisible: (lease, visible) => unwrap(electron.ipcRenderer.invoke(RESEARCH_IPC.visible, lease, visible)),
				subscribeInvalid: (listener) => {
					const handle = (_event, lease) => {
						if (typeof lease === "string") listener(lease);
					};
					electron.ipcRenderer.on(RESEARCH_IPC.invalid, handle);
					return () => {
						electron.ipcRenderer.off(RESEARCH_IPC.invalid, handle);
					};
				},
				subscribeAction: (listener) => {
					const handle = (_event, notice) => listener(notice);
					electron.ipcRenderer.on(RESEARCH_IPC.action, handle);
					return () => {
						electron.ipcRenderer.off(RESEARCH_IPC.action, handle);
					};
				}
			},
			aigc: {
				subscribeAction: (listener) => {
					const handle = (_event, value) => listener(value);
					electron.ipcRenderer.on(AIGC_IPC.action, handle);
					return () => {
						electron.ipcRenderer.off(AIGC_IPC.action, handle);
					};
				},
				interactionReady: (id, visible = true) => unwrap(electron.ipcRenderer.invoke(AIGC_IPC.interactionReady, id, visible)),
				acquire: () => unwrap(electron.ipcRenderer.invoke(AIGC_IPC.acquire)),
				release: (lease) => unwrap(electron.ipcRenderer.invoke(AIGC_IPC.release, lease)),
				setTheme: (lease, theme) => unwrap(electron.ipcRenderer.invoke(AIGC_IPC.theme, lease, theme)),
				setVisible: (lease, visible) => unwrap(electron.ipcRenderer.invoke(AIGC_IPC.visible, lease, visible)),
				subscribeInvalid: (listener) => {
					const handle = (_event, lease) => {
						if (typeof lease === "string") listener(lease);
					};
					electron.ipcRenderer.on(AIGC_IPC.invalid, handle);
					return () => {
						electron.ipcRenderer.off(AIGC_IPC.invalid, handle);
					};
				}
			},
			community: {
				acquire: (target) => unwrap(electron.ipcRenderer.invoke(COMMUNITY_IPC.acquire, target)),
				release: (lease) => unwrap(electron.ipcRenderer.invoke(COMMUNITY_IPC.release, lease)),
				setTheme: (lease, theme) => unwrap(electron.ipcRenderer.invoke(COMMUNITY_IPC.theme, lease, theme)),
				setVisible: (lease, visible) => unwrap(electron.ipcRenderer.invoke(COMMUNITY_IPC.visible, lease, visible)),
				subscribeInvalid: (listener) => {
					const handle = (_event, lease) => {
						if (typeof lease === "string") listener(lease);
					};
					electron.ipcRenderer.on(COMMUNITY_IPC.invalid, handle);
					return () => {
						electron.ipcRenderer.off(COMMUNITY_IPC.invalid, handle);
					};
				},
				subscribeNavigation: (listener) => {
					const handle = (_event, notice) => listener(notice);
					electron.ipcRenderer.on(COMMUNITY_IPC.navigation, handle);
					return () => {
						electron.ipcRenderer.off(COMMUNITY_IPC.navigation, handle);
					};
				}
			},
			business: { invoke: (method, args) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.business, method, args)) },
			embedded: {
				acquire: (target) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedAcquire, target)),
				release: (lease) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedRelease, lease)),
				setTheme: (lease, theme) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.embeddedTheme, lease, theme)),
				subscribeInvalid: (listener) => {
					const handle = (_event, lease) => {
						if (typeof lease === "string") listener(lease);
					};
					electron.ipcRenderer.on(STUDYBUDDY_IPC.embeddedInvalid, handle);
					return () => {
						electron.ipcRenderer.off(STUDYBUDDY_IPC.embeddedInvalid, handle);
					};
				}
			},
			tools: {
				acquire: (target) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.toolsAcquire, target)),
				resize: (lease, bounds) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.toolsResize, lease, bounds)),
				setVisible: (lease, visible) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.toolsVisible, lease, visible)),
				setTheme: (lease, theme) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.toolsTheme, lease, theme)),
				release: (lease) => unwrap(electron.ipcRenderer.invoke(STUDYBUDDY_IPC.toolsRelease, lease)),
				subscribeInvalid: (listener) => {
					const callback = (_event, lease) => listener(lease);
					electron.ipcRenderer.on(STUDYBUDDY_IPC.toolsInvalid, callback);
					return () => {
						electron.ipcRenderer.off(STUDYBUDDY_IPC.toolsInvalid, callback);
					};
				}
			},
			subscribeNavigation: (listener) => {
				const callback = (_event, notice) => listener(notice);
				electron.ipcRenderer.on(STUDYBUDDY_IPC.toolNavigation, callback);
				return () => {
					electron.ipcRenderer.off(STUDYBUDDY_IPC.toolNavigation, callback);
				};
			}
		});
	}
	electron.contextBridge.exposeInMainWorld("studybuddy", api);
}
//#endregion
//#region lib/types/image-context-target.js
/** Accepted displayed-image URL families. Filesystem paths are never IPC inputs. */
function validImageSource(src) {
	if (typeof src !== "string" || src.length === 0 || src.length > 8192) return false;
	try {
		const url = new URL(src);
		return url.protocol === "dsh-app:" && url.hostname === "app" && url.pathname.startsWith("/api/") || (url.protocol === "https:" || url.protocol === "http:") && url.username === "" && url.password === "" || url.protocol === "blob:" && src.startsWith("blob:dsh-app://app/");
	} catch {
		return false;
	}
}
/** @returns the originating Chat even when its enlarged image is portalled to document.body. */
function imageContextTarget(target, document) {
	if (!(target instanceof HTMLImageElement) || !target.complete || target.naturalWidth === 0) return void 0;
	const src = target.currentSrc || target.src;
	if (!validImageSource(src)) return void 0;
	let owner = target.closest("[data-chat-session]");
	if (owner === null && target.closest("[data-image-lightbox]") !== null) {
		for (const image of document.querySelectorAll("[data-chat-session] img")) if ((image.currentSrc || image.src) === src) {
			owner = image.closest("[data-chat-session]");
			break;
		}
	}
	const sessionId = owner?.dataset.chatSession;
	if (sessionId === void 0 || sessionId.length === 0 || sessionId.length > 200) return void 0;
	return {
		src,
		sessionId,
		name: (target.alt || "image").slice(0, 160)
	};
}
//#endregion
//#region lib/types/preload-images.js
/** Image-only DOM capture and a disposable notice bridge for the application top frame. */
function createDesktopImageBridge() {
	return { subscribe(listener) {
		const handle = (_event, action) => {
			listener(action);
		};
		electron.ipcRenderer.on(DESKTOP_IPC.imageAction, handle);
		return () => {
			electron.ipcRenderer.off(DESKTOP_IPC.imageAction, handle);
		};
	} };
}
function installImageContextMenu() {
	window.addEventListener("contextmenu", (event) => {
		const target = imageContextTarget(event.target, document);
		if (target === void 0) return;
		event.preventDefault();
		event.stopPropagation();
		electron.ipcRenderer.invoke(DESKTOP_IPC.imageContext, {
			...target,
			x: event.clientX,
			y: event.clientY
		}).catch(() => {});
	}, true);
}
//#endregion
//#region lib/types/preload-app.js
/** Origin-scoped boot, native directory selection, host paths of picked files, and update presentation with native confirmation actions. */
exposeStudyBuddy();
function createProductApi() {
	return {
		protocolVersion: 1,
		images: createDesktopImageBridge(),
		browser: createDesktopBrowserBridge(),
		deviceInfo: () => electron.ipcRenderer.invoke(DESKTOP_IPC.deviceInfo),
		keyboard: {
			closeWindow: (revision) => electron.ipcRenderer.invoke(DESKTOP_IPC.shortcutsCloseWindow, revision),
			subscribe: (listener) => {
				const handle = (_event, input) => {
					if (input.kind === "iframe") {
						const element = document.activeElement;
						if (!(element instanceof HTMLIFrameElement) || !element.isConnected || !element.matches("iframe[data-sidebar-browser-frame], iframe[data-html-preview]")) return;
						if (input.frameName === "" || element.name !== input.frameName) return;
					}
					if (input.kind === "webview") {
						const element = document.activeElement;
						if (element?.matches("webview[data-sidebar-browser-frame]") !== true || !element.isConnected || input.frameName === "" || element.getAttribute("name") !== input.frameName) return;
					}
					listener(input);
				};
				electron.ipcRenderer.on(DESKTOP_IPC.shortcutsInput, handle);
				return () => {
					electron.ipcRenderer.off(DESKTOP_IPC.shortcutsInput, handle);
				};
			}
		},
		shortcuts: {
			get: (definitions) => electron.ipcRenderer.invoke(DESKTOP_IPC.shortcutsGet, definitions),
			edit: (edit, revision) => electron.ipcRenderer.invoke(DESKTOP_IPC.shortcutsEdit, edit, revision),
			recording: (active) => electron.ipcRenderer.invoke(DESKTOP_IPC.shortcutsRecording, active),
			subscribe(listener) {
				const handle = (_event, snapshot) => {
					listener(snapshot);
				};
				electron.ipcRenderer.on(DESKTOP_IPC.shortcutsChanged, handle);
				return () => {
					electron.ipcRenderer.off(DESKTOP_IPC.shortcutsChanged, handle);
				};
			}
		},
		updates: {
			status: () => electron.ipcRenderer.invoke(DESKTOP_IPC.updatesStatus),
			open: () => electron.ipcRenderer.invoke(DESKTOP_IPC.updatesOpen),
			subscribe(listener) {
				const handle = (_event, state) => {
					listener(state);
				};
				electron.ipcRenderer.on(DESKTOP_IPC.updatesPresentation, handle);
				return () => {
					electron.ipcRenderer.off(DESKTOP_IPC.updatesPresentation, handle);
				};
			}
		}
	};
}
if (location.protocol === `dsh-app:` && location.hostname === "app") {
	electron.contextBridge.exposeInMainWorld("dshOnboarding", {
		hasApiKey: () => electron.ipcRenderer.invoke(DESKTOP_IPC.onboardingApiKey),
		setActive: (active) => {
			electron.ipcRenderer.send(DESKTOP_IPC.onboardingActive, active);
		}
	});
	electron.ipcRenderer.on(DESKTOP_IPC.enterWorkspace, () => {
		const body = document.body;
		const previous = body.getAttribute("tabindex");
		body.tabIndex = -1;
		body.focus({ preventScroll: true });
		if (previous === null) body.removeAttribute("tabindex");
		else body.setAttribute("tabindex", previous);
	});
	syncWindowsAppearance();
	if (process.platform === "win32") installMandatoryUpdateOverlay();
	electron.contextBridge.exposeInMainWorld("__DSH_DIRECTORY_PICKER__", { pick: () => electron.ipcRenderer.invoke(DESKTOP_IPC.directoryPick) });
	electron.contextBridge.exposeInMainWorld("__DSH_HOST_PATHS__", { pathFor: (file) => electron.webUtils.getPathForFile(file) });
	electron.contextBridge.exposeInMainWorld("dshDesktopBoot", {
		ready: () => electron.ipcRenderer.invoke(DESKTOP_IPC.boot),
		failed: (message) => electron.ipcRenderer.invoke(DESKTOP_IPC.bootFailed, message)
	});
	electron.contextBridge.exposeInMainWorld("dshPlatform", {
		open: (page, bounds) => electron.ipcRenderer.invoke(PLATFORM_IPC.open, page, bounds),
		setBounds: (bounds) => electron.ipcRenderer.invoke(PLATFORM_IPC.bounds, bounds),
		close: () => electron.ipcRenderer.invoke(PLATFORM_IPC.close)
	});
}
markDocumentPlatform();
if (location.protocol === `dsh-app:` && location.hostname === "app" && process.isMainFrame) installImageContextMenu();
syncWindowFullscreen();
syncNativeTheme();
electron.contextBridge.exposeInMainWorld("dshDesktop", location.protocol === `dsh-app:` && location.hostname === "app" && process.isMainFrame ? createProductApi() : { protocolVersion: 1 });
if (location.protocol === `dsh-app:` && location.hostname === "app") electron.contextBridge.exposeInMainWorld("__DSH_LOCALE__", {
	read: () => electron.ipcRenderer.invoke(DESKTOP_IPC.localeBootstrap),
	onChange: (locale) => {
		electron.ipcRenderer.send(DESKTOP_IPC.localeChanged, locale);
	}
});
//#endregion
