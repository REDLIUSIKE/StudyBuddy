import { StudyBuddySearchRuntime } from "./studybuddy/search-runtime.js";
import { WINDOWS_TITLEBAR_HEIGHT } from "./windows-layout.js";
import { settleCleanup } from "./settle-cleanup.js";
import { createStudyBuddyCapabilities } from "./studybuddy/capabilities/service.js";
import { CapabilityProjectNavigation } from "./studybuddy/capabilities/navigation.js";
/** Electron shell: desktop project ownership, custom protocol, windows, and lifecycle. */
import { readFile, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { DesktopImageActions, verifyImageTarget } from "./image-actions.js";
import { randomUUID } from 'node:crypto';
import { installSupportBridge } from "./studybuddy/support-bridge.js";
import { createSupportDiagnostics } from "./studybuddy/support-diagnostics.js";
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, safeStorage, BrowserWindow, WebContentsView, dialog, ipcMain, Menu, powerMonitor, nativeImage, nativeTheme, net, protocol, session, shell, } from 'electron';
import { resolveDesktopPaths, resolveDesktopUserDataPath } from "./paths.js";
import { DesktopProjectManager } from "./project-manager.js";
import { DesktopHostFatalError, DesktopHostProcess, DesktopHostUncleanExitError } from "./host-process.js";
import { DesktopPlatformView, PLATFORM_IPC, platformBounds } from "./platform-view.js";
import { installDesktopDirectoryPicker } from "./directory-picker.js";
import { installMicrophonePermissions } from "./microphone-permissions.js";
import { DesktopBackendController } from "./backend-controller.js";
import { DESKTOP_IPC, SCHEME, assertDesktopSender } from "./ipc.js";
import { readDeviceInfo } from "./device-info.js";
import { desktopUpdateReadyConfirmation, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale } from "./locale.js";
import { claimDesktopSingleInstance } from "./single-instance.js";
import { DesktopUpdateCoordinator } from "./update-coordinator.js";
import { DesktopCommandManager } from "./command-management.js";
import { serveWebDocument, authenticateWebHost, forwardWebRequest } from "./web-document.js";
import { DesktopFatalRecovery } from "./fatal-recovery.js";
import { desktopErrorState } from "./startup-error.js";
import { pruneCrashReports, RendererConsoleTail, writeCrashReport } from "./crash-report.js";
import { connectAuthenticatedDesktopWelcome } from "./welcome-backend.js";
import { DesktopUpdateJournal } from "./update-journal.js";
import { DesktopUpdatePreparationError } from "./update-error.js";
import { DesktopUpdateSchedule, resolveDesktopUpdateScheduleConfig } from "./update-schedule.js";
import { desktopUpdateErrorSummary, presentDesktopUpdate } from "./update-presentation.js";
import { readDesktopLoginShellEnvironment, resolveDesktopLoginShellConfig } from "./login-shell-environment.js";
import { DesktopMandatoryUpdatePolicy, resolveDesktopPolicyConfig } from "./mandatory-update-policy.js";
import { desktopClientMetadata, desktopClientVersion } from "./client-metadata.js";
import { DesktopMandatoryUpdateWindow } from "./mandatory-update-window.js";
import { DesktopPolicyTestAuth } from "./policy-test-auth.js";
import { readDesktopSettings } from "./settings.js";
import { DesktopUpdateDialog } from "./update-dialog.js";
import { readDesktopRuntime } from "./runtime-tree.js";
import { DesktopBrowserGuests } from "./browser-guests.js";
import { installDesktopShortcuts } from "./keyboard.js";
import { DesktopUpdateOverlays } from "./update-overlay.js";
import { DesktopQuitConfirmation } from "./quit-confirmation.js";
import { DesktopTray } from "./tray.js";
import { DesktopBackgroundNotice } from "./background-notice.js";
import { StudyBuddyAuth } from "./studybuddy/services.js";
import { StudyBuddyCloudClient, assertBusinessSender, BusinessFailure } from "./studybuddy/business-api.js";
import { StudyBuddyEmbeddedGuests } from "./studybuddy/embedded-guests.js";
import { downloadGrowthPng, persistGrowthPng } from "./studybuddy/growth-image.js";
import { NativeAccountClient, NATIVE_OPERATIONS, trustedNativeRuntime } from "./studybuddy/native-account-client.js";
import { BuiltinCoordinator } from "./studybuddy/builtin-coordinator.js";
import { AigcRuntime, accountAigcDirectory } from "./studybuddy/aigc-runtime.js";
import { launchAigcProcess } from "./studybuddy/aigc-process.js";
import { AigcGateway } from "./studybuddy/aigc-gateway.js";
import { AigcMediaClient } from "./studybuddy/aigc-media.js";
import { DiskMediaKeyJournal } from "./studybuddy/media-key-journal.js";
import { DiskMediaImageStore } from "./studybuddy/media-image-store.js";
import { DiskMediaAudioStore } from "./studybuddy/media-audio-store.js";
import { builtinNativeInvoker } from "./studybuddy/builtin-native-invoker.js";
import { HarnessMediaBridge } from "./studybuddy/media-bridge.js";
import { DiskMediaRequestJournal } from "./studybuddy/media-journal.js";
import { StudyBuddyAigc } from "./studybuddy/aigc.js";
import { loadAigcResources } from "./studybuddy/aigc-resource-identity.js";
import { AigcDomainRuntime } from "./studybuddy/aigc-domain-runtime.js";
import { AigcBridge } from "./studybuddy/aigc-bridge.js";
import { loadAigcNativeResources, resolveAigcResourceLocation } from "./studybuddy/aigc-native-resources.js";
import { AIGC_NATIVE_RUNTIME_PIN } from "./studybuddy/aigc-native-pin.js";
import { AIGC_DEVELOPMENT_NATIVE_RUNTIME_PIN } from "./studybuddy/aigc-development-native-pin.js";
import { ResearchRuntime } from "./studybuddy/research-runtime.js";
import { ResearchBridge } from "./studybuddy/research-bridge.js";
import { ResearchNativeToolBridge } from "./studybuddy/research-tool-bridge.js";
import { StudyBuddyResearch } from "./studybuddy/research.js";
import { loadResearchResources, resolveResearchResourceLocation } from "./studybuddy/research-resource-identity.js";
import { RESEARCH_RUNTIME_PIN } from "./studybuddy/research-resource-pin.js";
import { RESEARCH_DEVELOPMENT_RUNTIME_PIN } from "./studybuddy/research-development-resource-pin.js";
import { VideoRuntime } from "./studybuddy/video-runtime.js";
import { VideoBridge } from "./studybuddy/video-bridge.js";
import { VideoMediaAdapter } from "./studybuddy/video-media.js";
import { StudyBuddyVideo } from "./studybuddy/video.js";
import { loadVideoResources } from "./studybuddy/video-resources.js";
import { VIDEO_RUNTIME_PIN, VIDEO_DEVELOPMENT_RUNTIME_PIN, VIDEO_DEVELOPMENT_DIRECTORY } from "./studybuddy/video-resource-pin.js";
import { parseNativeBuiltinValidationRequestV1, parseNativeUserSourceSaveRequestV3, parseNativeUserSourceSaveResultV3, } from '@studybuddy/contracts';
import { verifyTrustedNativeRuntime } from "./studybuddy/trusted-native-runtime.js";
import { PlatformModels } from "./studybuddy/platform-models.js";
import { ResearchUsageClient } from "./studybuddy/research-usage.js";
import { ModelCatalogSync } from "./studybuddy/model-catalog-sync.js";
import { ToolCenterViews } from "./studybuddy/tool-center-views.js";
import { ToolCenterBridge } from "./studybuddy/tool-center-bridge.js";
import { StudyBuddyCommunity } from "./studybuddy/community.js";
import { StudyBuddyPrompts } from "./studybuddy/prompts.js";
import { trustedSkillsRuntime } from "./studybuddy/skill-native-client.js";
import { SkillSafetyMain } from "./studybuddy/skill-safety-main.js";
import { SkillSafetyError } from '@deepseek-ai/dsh-skill-safety-assistant';
import { SkillScannerResourceError } from "./studybuddy/skill-safety-release.js";
import { studyBuddyVault } from "./studybuddy/vault.js";
import { STUDYBUDDY_IPC } from "./studybuddy/types.js";
import { openStudyBuddyLogin } from "./studybuddy/login-window.js";
import { StudyBuddyAuthorizationWindow } from "./studybuddy/authorization-window.js";
import { studyBuddyWorkspaceTransition } from "./studybuddy/workspace-transition.js";
import { serveStudyBuddyShellDocument } from "./studybuddy/shell-document.js";
let focusPrimaryWindow = () => { };
let stopForRecovery = async () => { };
let shuttingDown = false;
/**
 * Set by quit entries that must not ask: crash recovery exit and restart, and the
 * development restart command. The installer handoff has its own before-quit branch.
 */
let skipQuitConfirmation = false;
let windowsLanguage;
/**
 * Whether the backend has reached ready: false until the first ready, back to
 * false when a restart returns it to starting, frozen during shutdown so a
 * failure while tearing down a ready backend still reads as `running`.
 */
let backendReady = false;
/** Error-level console output of the primary window, attached to crash reports. */
const rendererConsole = new RendererConsoleTail();
// Platform-conventional logs directory (macOS ~/Library/Logs/<name>, otherwise under userData);
// set before ready so the first fatal report already resolves under it.
app.setName('StudyBuddy');
if (process.platform === 'win32')
    app.setAppUserModelId('com.studybuddy.desktop');
app.setPath('userData', resolveDesktopUserDataPath(app.getPath('appData'), app.isPackaged, app.commandLine.getSwitchValue('user-data-dir')));
app.setAppLogsPath();
function currentDesktopLocale() {
    return resolveDesktopLocale(windowsLanguage ?? app.getLocale());
}
/** Quit without the task confirmation; the caller has already decided the application must stop. */
function quitWithoutConfirmation() {
    skipQuitConfirmation = true;
    app.quit();
}
const recovery = new DesktopFatalRecovery({
    messages: () => currentDesktopLocale().messages,
    show: options => dialog.showMessageBox(options),
    stop: () => { shuttingDown = true; return stopForRecovery(); },
    disablePlugins: async () => {
        const manager = new DesktopProjectManager(resolveDesktopPaths(), runtimeResources());
        const backupPath = await manager.disableAllPlugins();
        console.info('Desktop profile recovery completed:', { profilePatchBackup: backupPath ?? null, homePatch: 'unchanged' });
    },
    exit: () => { quitWithoutConfirmation(); },
    restart: () => { app.relaunch(); quitWithoutConfirmation(); },
    writeReport: (error, source) => persistCrashReport(error, source),
});
let recordSupportFailure;
function persistCrashReport(error, source) {
    recordSupportFailure?.(source);
    return writeCrashReport(app.getPath('logs'), {
        source,
        phase: backendReady ? 'running' : 'startup',
        error,
        ...(error instanceof DesktopHostFatalError && error.diagnostic !== undefined ? { hostDiagnostic: error.diagnostic } : {}),
        rendererConsole: rendererConsole.snapshot(),
        app: {
            name: app.name, version: app.getVersion(), platform: process.platform, arch: process.arch,
            electron: process.versions.electron, node: process.versions.node, locale: currentDesktopLocale().id,
        },
        time: new Date(),
    });
}
function reportFatal(error, source) {
    console.error(error);
    if (shuttingDown) {
        // No dialog during shutdown, but the report still records what failed on the way out.
        void persistCrashReport(error, source);
        return;
    }
    void recovery.report(error, source).catch((failure) => { console.error(failure); app.exit(1); });
}
protocol.registerSchemesAsPrivileged([{
        scheme: SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
            codeCache: true,
        },
    }, { scheme: 'dsh-tools', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
function runtimeResources() {
    const development = !app.isPackaged;
    const node = process.execPath;
    const nodeBin = development ? join(app.getAppPath(), 'scripts', 'node-bin') : join(process.resourcesPath, 'runtime', 'bin');
    const pnpm = (development ? process.env.DSH_DESKTOP_PNPM_ENTRY : undefined)
        ?? (development ? join(app.getAppPath(), 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
            : join(process.resourcesPath, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'));
    const dsh = (development ? process.env.DSH_DESKTOP_DSH_DIR : undefined)
        ?? (development ? join(app.getAppPath(), '.desktop-build', 'development', 'project') : join(app.getAppPath(), 'dsh'));
    return { node, nodeBin, pnpm, dsh };
}
function developmentPrimaryRuntime() {
    const directory = process.env.DSH_DESKTOP_PRIMARY_RUNTIME_DIR;
    if (directory === undefined || directory === '') {
        throw new Error('dsh desktop: DSH_DESKTOP_PRIMARY_RUNTIME_DIR is required for an unpackaged launch');
    }
    return directory;
}
function developmentHostInspectPort(enabled) {
    const configured = process.env.DSH_DESKTOP_HOST_INSPECT_PORT;
    if (!enabled || configured === undefined || configured === '')
        return undefined;
    const port = Number(configured);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error('dsh desktop: DSH_DESKTOP_HOST_INSPECT_PORT must be an integer from 1 through 65535');
    }
    return port;
}
/**
 * Opaque chrome fallback matching the built-in sidebar palette (the resolved
 * `--dsw-static-neutral-bluish-900` / `-50` tokens). An approximation for
 * custom themes: Windows swaps in the renderer's measured palette over the
 * windowsAppearance IPC, and macOS shows it only while minimized or hidden.
 * @returns the sidebar fill hex for the active system color scheme.
 */
function chromeFallbackFill() {
    return nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb';
}
/**
 * Add the effective Desktop palette to a Platform authorization URL so the
 * login page opens in the application's theme. `system` resolves through
 * `nativeTheme.shouldUseDarkColors`, which follows the theme source the
 * application preload publishes.
 * @param authorizeUrl - validated Platform authorization URL.
 * @returns the authorization URL carrying `theme=light` or `theme=dark`.
 */
function createWindow(preload, show = false, primary = false) {
    const window = new BrowserWindow({
        width: 1280,
        icon: join(app.getAppPath(), 'resources/icon-windows.png'),
        height: 820,
        minWidth: 520,
        minHeight: 600,
        show,
        ...(process.platform === 'win32' && primary ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: { height: WINDOWS_TITLEBAR_HEIGHT, color: chromeFallbackFill(),
                symbolColor: nativeTheme.shouldUseDarkColors ? '#f9fafb' : '#0f1115' },
        } : {}),
        // hiddenInset places traffic lights inside the sidebar; sidebar vibrancy
        // needs a transparent window background to show through the page.
        ...(process.platform === 'darwin' ? {
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 16, y: 18 },
            vibrancy: 'sidebar',
            // 'active' keeps the vibrancy material stable when the window blurs;
            // 'followWindow' washes the sidebar out behind an unfocused window.
            visualEffectState: 'active',
            backgroundColor: '#00000000',
        } : {}),
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: primary,
            devTools: true,
        },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (['http:', 'https:'].includes(new URL(url).protocol))
            void shell.openExternal(url);
        return { action: 'deny' };
    });
    if (process.platform === 'darwin' || process.platform === 'win32') {
        // Fullscreen hides native window controls; overlays drop their caption clearance.
        const sendFullscreen = () => {
            if (!window.isDestroyed())
                window.webContents.send(DESKTOP_IPC.windowFullscreen, window.isFullScreen());
        };
        window.on('enter-full-screen', sendFullscreen);
        window.on('leave-full-screen', sendFullscreen);
        // Reloads and navigations re-register the preload listener; resend the
        // current state so a fullscreen reload does not fall back to windowed CSS.
        window.webContents.on('did-finish-load', sendFullscreen);
    }
    if (process.platform === 'darwin') {
        // Deminiaturize reattaches the NSVisualEffectView material late
        // (electron/electron#25368), so a transparent window shows the desktop
        // through the sidebar until then. Paint an opaque base while minimized or
        // hidden so the deminiaturize animation and the reattachment gap show a
        // solid fill; restoring flips back, and the null -> 'sidebar' transition
        // forces the material to reattach.
        const applyBackdrop = () => {
            if (window.isDestroyed())
                return;
            if (window.isMinimized() || !window.isVisible()) {
                window.setVibrancy(null);
                window.setBackgroundColor(chromeFallbackFill());
            }
            else {
                window.setVibrancy('sidebar');
                window.setBackgroundColor('#00000000');
            }
        };
        window.on('minimize', applyBackdrop);
        window.on('hide', applyBackdrop);
        window.on('restore', applyBackdrop);
        window.on('show', applyBackdrop);
    }
    window.webContents.on('context-menu', (_event, { isEditable, selectionText, editFlags }) => {
        const items = [];
        if (isEditable) {
            items.push({ role: 'undo', enabled: editFlags.canUndo }, { role: 'redo', enabled: editFlags.canRedo }, { type: 'separator' }, { role: 'cut', enabled: editFlags.canCut }, { role: 'copy', enabled: editFlags.canCopy }, { role: 'paste', enabled: editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll', enabled: editFlags.canSelectAll });
        }
        else if (selectionText.length > 0) {
            items.push({ role: 'copy', enabled: editFlags.canCopy });
        }
        // Empty accelerators suppress Electron's default shortcut labels for native roles.
        if (items.length > 0) {
            const messages = currentDesktopLocale().messages;
            Menu.buildFromTemplate(items.map(item => ({
                ...item,
                ...(process.platform === 'win32' && item.role !== undefined && item.role in messages
                    ? { label: messages[item.role] } : {}),
                accelerator: '',
            }))).popup({ window });
        }
    });
    window.webContents.on('will-navigate', (event, url) => {
        const destination = new URL(url);
        const current = new URL(window.webContents.getURL());
        if (destination.protocol !== `${SCHEME}:`
            && !(destination.protocol === 'http:' && destination.origin === current.origin)) {
            event.preventDefault();
            if (['http:', 'https:'].includes(destination.protocol))
                void shell.openExternal(url);
        }
    });
    return window;
}
async function main() {
    const businessRuntimeRoot = app.isPackaged ? join(process.resourcesPath, 'studybuddy-business') :
        fileURLToPath(new URL('../../../.dsh-build/studybuddy-business/', import.meta.url));
    const studybuddyNative = new NativeAccountClient(trustedNativeRuntime(businessRuntimeRoot));
    const builtinCoordinator = {};
    const platformModels = {};
    const aigcCleanup = {};
    const researchCleanup = {};
    const videoCleanup = {};
    const skillSafetyCleanup = {};
    const authorizationWindow = new StudyBuddyAuthorizationWindow(() => welcomeWindow ?? mainWindow, () => { void studybuddy.cancel(); });
    const studybuddy = new StudyBuddyAuth({
        fetch: (url, init) => net.fetch(url, init),
        vault: studyBuddyVault(join(app.getPath('userData'), 'studybuddy-session.json'), safeStorage),
        openBrowser: url => authorizationWindow.open(url),
        schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => { clearTimeout(timer); }; },
        logoutSession: async (session) => {
            await aigcCleanup.current?.();
            await researchCleanup.current?.();
            await videoCleanup.current?.();
            await skillSafetyCleanup.current?.();
            await platformModels.current?.revoke(session.scope).catch(() => undefined);
            await builtinCoordinator.current?.revoke(session.scope).catch(() => undefined);
            const outcome = await studybuddyNative.logout(session);
            if (outcome.localCleared && outcome.remoteRevoked && !outcome.persistentCleanupRequired)
                await platformModels.current?.clearConfirmed(session.scope);
            return outcome;
        },
        logoutRecovery: { recover: () => studybuddyNative.recoverLogout(), acknowledge: () => studybuddyNative.acknowledgeLogout() },
    });
    let initialAccount;
    const initialAccountReady = studybuddy.restore().then(() => {
        initialAccount = studybuddy.state.account?.id;
        // Account restoration must finish before selecting a profile or starting its Host.
        process.env.DSH_HOME = join(app.getPath('userData'), 'harness', initialAccount ?? 'signed-out');
    });
    const desktopSettings = readDesktopSettings(app.getPath('userData'));
    void pruneCrashReports(app.getPath('logs'));
    const journalDirectory = process.env.DSH_DESKTOP_UPDATE_JOURNAL_DIR;
    const updateJournal = journalDirectory === undefined ? undefined : new DesktopUpdateJournal(journalDirectory, app.getVersion());
    const resources = runtimeResources();
    const development = !app.isPackaged;
    const primaryRuntime = development
        ? developmentPrimaryRuntime()
        : join(process.resourcesPath, 'runtime', 'primary-runtime');
    const manager = initialAccountReady.then(() => new DesktopProjectManager(resolveDesktopPaths(), resources));
    // Dock and Finder launches inherit only launchd's environment; every Host shares one login-shell read.
    const loginShellRead = new AbortController();
    // The probe runs in its own process group, which outlives Desktop unless the read is aborted.
    app.on('will-quit', () => { loginShellRead.abort(); });
    const loginShell = initialAccountReady.then(() => readDesktopLoginShellEnvironment(process.env, resolveDesktopLoginShellConfig(process.env), {
        signal: loginShellRead.signal,
    })).then((result) => {
        for (const failure of result.failures)
            console.warn(`desktop login shell: ${failure.shell} failed (${failure.reason})`);
        return result.environment;
    });
    let hostEnvironment = process.env;
    const prepareHostEnvironment = async () => { hostEnvironment = await loginShell; };
    let quitting = false;
    let startup;
    const initialBackendStarting = Promise.withResolvers();
    let startupCatalogs = Promise.resolve();
    let stopStudyBuddy = () => { };
    let workspaceRecovery;
    let mainWindow;
    let welcomeWindow;
    let enteredWorkspace = false;
    let initialLoadingDismissed = false;
    // NSIS passes --updated when it launches the application after installation.
    let raiseAfterUpdate = process.platform === 'win32' && process.argv.includes('--updated');
    let shellInstallerOwnsQuit = false;
    let requireCleanStop = false;
    let updateStoppedHost = false;
    let updateStopFailure;
    let updateState = { phase: 'idle' };
    const systemLanguages = app.getPreferredSystemLanguages();
    let locale = resolveDesktopStartupLocale(null, systemLanguages);
    windowsLanguage = locale.id;
    let mandatoryPolicy;
    let mandatoryUI;
    let policyAuth;
    let tray;
    /**
     * The operating system is ending the session: the quit skips its confirmation. Windows sets it
     * on the definitive session-end message. macOS sets it on the power-off notification, which
     * another application can still cancel, so the next focus or show of the main window clears it.
     */
    let sessionEnding = false;
    const isQuitting = () => quitting;
    const currentMainWindow = () => mainWindow;
    const ordinaryDialogs = new Set();
    const currentDialogWindow = () => welcomeWindow ?? mainWindow;
    const updateOverlays = new DesktopUpdateOverlays();
    const updateDialog = new DesktopUpdateDialog(fileURLToPath(new URL('./preload-update-dialog.cjs', import.meta.url)), () => locale, updateOverlays);
    const isMandatory = () => mandatoryPolicy?.state.blocking === true;
    const ordinaryMessageBox = async (options) => {
        const controller = new AbortController();
        ordinaryDialogs.add(controller);
        try {
            const parent = currentDialogWindow();
            if (parent === undefined)
                return { response: options.cancelId ?? 0, checkboxChecked: false };
            return await updateDialog.show(parent, { ...options, signal: controller.signal });
        }
        finally {
            ordinaryDialogs.delete(controller);
        }
    };
    // Copy comes from the same locale as the update prompts so the dialog
    // chrome and its content never mix languages.
    const showAbout = async () => {
        await ordinaryMessageBox({ type: 'info', title: locale.messages.aboutMenu, message: locale.messages.aboutProduct,
            detail: formatDesktopMessage(locale.messages.aboutVersion, { version: app.getVersion() }),
            buttons: [locale.messages.updateAcknowledge], cancelId: 0 });
    };
    const commandManager = new DesktopCommandManager({
        resources: process.resourcesPath,
        isPackaged: app.isPackaged,
        isInstalledLocation: () => process.platform !== 'darwin' || app.isInApplicationsFolder(),
        isInstalling: () => updateState.phase === 'installing',
        isQuitting,
        messages: () => currentDesktopLocale().messages,
        show: ordinaryMessageBox,
    });
    const appPreload = fileURLToPath(new URL('./preload-app.cjs', import.meta.url));
    const applicationUrl = `${SCHEME}://app/`;
    let hostUrl;
    let hostCookie;
    const browserGuests = new DesktopBrowserGuests(() => hostUrl);
    let injections = [];
    let welcomeBackend;
    let reportedLaunch = false;
    let analyticsEnabled = false;
    const track = async (eventName, attributes) => {
        const event = { eventName, attributes, timestamp: Date.now() };
        try {
            if (analyticsEnabled)
                await welcomeBackend?.report(event);
        }
        catch (_error) { /* Analytics cannot interrupt native actions. */ }
    };
    let stopAccount;
    const assertProductSender = (event) => {
        assertDesktopSender(event, ['app']);
        if (mainWindow === undefined || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents
            || event.senderFrame === null || event.senderFrame !== mainWindow.webContents.mainFrame) {
            throw new Error('dsh desktop: rejected IPC from an unowned renderer');
        }
    };
    let navigation;
    const navigateMain = (url) => {
        const window = mainWindow;
        if (quitting || window === undefined || window.isDestroyed())
            return Promise.resolve();
        if (navigation?.window === window && navigation.url === url)
            return navigation.promise;
        const next = { window, url, promise: Promise.resolve() };
        next.promise = window.loadURL(url).catch((error) => {
            if (quitting || shuttingDown || window.isDestroyed() || navigation !== next
                || (error instanceof Error && 'code' in error && error.code === 'ERR_ABORTED'))
                return;
            navigation = undefined;
            throw error;
        });
        navigation = next;
        return next.promise;
    };
    const platformView = new DesktopPlatformView(join(app.getAppPath(), 'lib', 'preload-platform-account.cjs'), () => locale.id === 'zh-CN' ? 'zh_CN' : 'en_US', process.platform === 'win32' ? 'win32' : 'darwin');
    let searchRuntime;
    let mediaBridge;
    let researchToolBridge;
    let videoToolBridge;
    let aigcToolBridge;
    let skillSafety;
    let mediaHost;
    let capabilities;
    let capabilityNavigation;
    const backend = new DesktopBackendController((onFailure) => {
        const hostInspectPort = developmentHostInspectPort(development);
        const host = new DesktopHostProcess(resources.node, resources.dsh, resolveDesktopPaths().profile, hostInspectPort, { ...hostEnvironment, DSH_CLIENT_VERSION: desktopClientVersion() }, onFailure, primaryRuntime, resources, (next) => { platformView.setSession(next); }, (request) => {
            if (builtinCoordinator.current === undefined)
                return Promise.reject(new Error('BUILTIN_HOST_UNAVAILABLE'));
            return builtinCoordinator.current.admit(request);
        }, request => { if (platformModels.current === undefined)
            return Promise.reject(new Error('BUILTIN_PLATFORM_UNAVAILABLE')); return platformModels.current.admit(request); }, (request, signal) => { if (!mediaBridge)
            return Promise.reject(Error('HARNESS_MEDIA_UNAVAILABLE')); return mediaBridge.handle(request, request.context.hostGeneration, signal); }, (request, signal) => researchToolBridge ? researchToolBridge.handle(request, signal) : Promise.reject(Error('HARNESS_RESEARCH_TOOL_UNAVAILABLE')), (request, signal) => skillSafety ? skillSafety.handle(request, signal) : Promise.reject(new Error('SKILL_SAFETY_UNAVAILABLE')), (request, signal) => searchRuntime ? searchRuntime.execute(request.context.scope, request.request, signal) : Promise.reject(Error('STUDYBUDDY_SEARCH_UNAVAILABLE')), (request, signal) => aigcToolBridge ? aigcToolBridge(request, signal) : Promise.reject(Error('AIGC_HOST_UNAVAILABLE')), (request, signal) => videoToolBridge ? videoToolBridge(request, signal) : Promise.reject(Error('VIDEO_HOST_UNAVAILABLE')), (request, signal) => capabilities ? capabilities.service.handle(request, signal) : Promise.reject(Error('CAPABILITY_HOST_UNAVAILABLE')));
        mediaHost = host;
        return {
            start: async () => {
                const ready = await host.start();
                await host.mediaApply(studybuddy.scope());
                await host.capabilityApply(studybuddy.scope(), studybuddy.scope() ? capabilities?.service.ids() ?? [] : []);
                hostCookie = await authenticateWebHost(ready.url);
                hostUrl = ready.url;
                if (ready.injections === undefined)
                    throw new Error('Desktop Host did not provide boot injections');
                injections = ready.injections;
                welcomeBackend = await connectAuthenticatedDesktopWelcome(ready.url, hostCookie);
                analyticsEnabled = await welcomeBackend.analyticsEnabled().catch(() => false);
                if (!reportedLaunch) {
                    reportedLaunch = true;
                    void track('desktop_app_launch', {});
                }
                stopAccount?.();
                // Product sign-in belongs to StudyBuddy; no upstream account watcher can open its login window.
            },
            stop: async () => {
                analyticsEnabled = false;
                stopAccount?.();
                try {
                    await host.stop(requireCleanStop);
                }
                catch (error) {
                    if (!requireCleanStop || !(error instanceof DesktopHostUncleanExitError))
                        throw error;
                    // Backend cleanup succeeded; installation still rejects the unsuccessful task teardown.
                    updateStopFailure = error;
                }
            },
            updateTasks: (action) => host.updateTasks(action),
            inspectQuit: () => host.inspectQuit(),
            platformApply: (snapshot) => host.platformApply(snapshot),
            platformRevoke: (scope) => host.platformRevoke(scope),
            builtinContext: (scope) => host.builtinContext(scope),
            builtinApply: (snapshot) => host.builtinApply(snapshot),
            builtinReadback: (scope, operationId) => host.builtinReadback(scope, operationId),
            builtinPublish: (proof) => host.builtinPublish(proof),
            builtinRevoke: (scope, localRef) => host.builtinRevoke(scope, localRef),
            builtinValidate: (request) => host.builtinValidate(request),
            researchCommand: (action, data) => host.researchCommand(action, data),
            videoCommand: (action, data, signal) => host.videoCommand(action, data, signal),
            aigcCommand: (action, data, signal) => host.aigcCommand(action, data, signal),
            skillSafetyCommand: (action, data) => host.skillSafetyCommand(action, data),
        };
    }, (state) => {
        if (state.phase === 'error') {
            void capabilities?.revoke().catch(() => console.error('Capability cleanup failed'));
            reportFatal(state.failure, 'host');
        }
        else if (!shuttingDown)
            backendReady = state.phase === 'ready';
    });
    const updateErrors = new WeakMap();
    const showUpdateFailure = (state) => {
        if (state.phase !== 'error')
            return Promise.resolve();
        if (isMandatory()) {
            mandatoryUI?.sync();
            return Promise.resolve();
        }
        let shown = updateErrors.get(state);
        if (shown === undefined) {
            shown = ordinaryMessageBox({ type: 'error', title: locale.messages.updateFailedTitle,
                message: desktopUpdateErrorSummary(state, locale.messages),
                technicalDetails: state.technicalDetails ?? state.message ?? '' }).then(() => { });
            updateErrors.set(state, shown);
        }
        return shown;
    };
    const publishUpdate = (state) => {
        updateJournal?.state(state);
        updateState = state;
        mandatoryUI?.sync();
        for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send(DESKTOP_IPC.updatesPresentation, presentDesktopUpdate(state));
        }
        if (state.phase === 'error' && state.failedOperation !== 'check') {
            const restoreHost = state.failedOperation === 'install' && updateStoppedHost && !quitting;
            shellInstallerOwnsQuit = false;
            updateStoppedHost = false;
            if (restoreHost) {
                // Only confirmed process exit permits replacement before another installation confirmation.
                const hostReady = backend.start(prepareHostEnvironment);
                startup = hostReady;
                const recovery = hostReady.then(async () => {
                    if (quitting)
                        return;
                    const currentScope = studybuddy.scope();
                    if (currentScope !== null) {
                        await builtinCoordinator.current?.restore(currentScope).catch(() => undefined);
                        await platformModels.current?.restore(currentScope).then(() => platformModels.current?.initializeKey(currentScope)).catch(() => { console.error('BUILTIN_PLATFORM_CATALOG_UNAVAILABLE'); });
                    }
                    // A replacement Host can have a new port, cookie, or boot injections even at the same URL.
                    navigation = undefined;
                    await navigateMain(applicationUrl);
                    if (backend.host !== undefined)
                        updateJournal?.action('workspace-ready');
                });
                workspaceRecovery = recovery;
                void recovery.catch((error) => { reportFatal(error, 'main'); }).finally(() => {
                    if (startup === hostReady)
                        startup = undefined;
                    if (workspaceRecovery === recovery)
                        workspaceRecovery = undefined;
                });
            }
            void showUpdateFailure(state).catch((error) => { console.error(error); });
        }
        return state;
    };
    stopForRecovery = () => backend.close();
    const reconcileBackend = () => {
        startup ??= (async () => {
            await openInitialWindow();
            if (isQuitting() || recovery.active)
                return;
            await backend.start(async () => {
                await Promise.all([manager.then(current => current.applyRelease()), prepareHostEnvironment()]);
            });
            if (isQuitting() || recovery.active)
                return;
            startupCatalogs = (async () => {
                if (!isQuitting() && backend.host !== undefined)
                    catalogSync.start({ platformAlreadyLoading: true });
                const currentScope = studybuddy.scope();
                if (currentScope !== null) {
                    await builtinCoordinator.current?.restore(currentScope).catch(() => undefined);
                    await platformModels.current?.restore(currentScope).then(() => platformModels.current?.initializeKey(currentScope)).catch(() => { console.error('BUILTIN_PLATFORM_CATALOG_UNAVAILABLE'); });
                }
            })();
            if (backend.host !== undefined)
                updateJournal?.action('workspace-ready');
            // The existing Web document resumes through the boot IPC response.
        })().catch((error) => {
            updateJournal?.action('workspace-failed');
            reportFatal(error, 'main');
            throw error;
        }).finally(() => { startup = undefined; });
        return startup;
    };
    const updates = new DesktopUpdateCoordinator(publishUpdate, async () => {
        await commandManager.idle();
        await workspaceRecovery;
        await startup?.catch(() => undefined);
        await startupCatalogs;
        const host = backend.host;
        if (host === undefined)
            throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable);
        const active = await host.updateTasks('inspect');
        const ready = desktopUpdateReadyConfirmation(locale.messages, updates.state.version ?? '', process.platform);
        const confirmation = {
            type: active ? 'warning' : 'info', title: locale.messages.updateTitle,
            message: active ? locale.messages.updateActiveTasks : ready.message,
            detail: active ? locale.messages.updateActiveTasksDetail : ready.detail,
            buttons: active ? [locale.messages.updateStopTasks, locale.messages.updateLater] : [locale.messages.installAndRestart],
            defaultId: 1, cancelId: 1,
        };
        if (isMandatory()) {
            if (!await mandatoryUI?.confirm(updates.state.version ?? '', active))
                return false;
        }
        else {
            const parent = currentDialogWindow();
            if (parent === undefined)
                return false;
            const result = await updateDialog.show(parent, confirmation);
            if (result.response !== 0 || isMandatory())
                return false;
        }
        // The update lock rejects new HTTP requests, including analytics intake.
        await track('desktop_upgrade_install_restart_click', {});
        if (backend.host !== host)
            throw new DesktopUpdatePreparationError('tasks-unavailable', locale.messages.updateTasksUnavailable);
        try {
            const stillActive = await host.updateTasks('lock');
            if (stillActive && !active)
                throw new DesktopUpdatePreparationError('tasks-changed', locale.messages.updateTasksChanged);
            mandatoryUI?.preparingRestart(stillActive);
            await aigcCleanup.current?.();
            await researchCleanup.current?.();
            await videoCleanup.current?.();
            await skillSafetyCleanup.current?.();
            // The embedded Platform document holds credentials issued by the Host that is about to stop.
            await platformView.closeAndWait();
            requireCleanStop = true;
            updateStopFailure = undefined;
            await backend.stop();
            updateStoppedHost = true;
            // The backend's async cleanup callback can assign this after the reset above.
            const stopFailure = updateStopFailure;
            if (stopFailure !== undefined)
                throw new DesktopUpdatePreparationError('stop-failed', locale.messages.updateStopFailed, stopFailure.message);
            updateJournal?.action('install-confirmed');
            shellInstallerOwnsQuit = true;
        }
        catch (error) {
            if (!updateStoppedHost)
                await host.updateTasks('unlock').catch((unlockError) => { console.error(unlockError); });
            throw error;
        }
        finally {
            requireCleanStop = false;
        }
        return true;
    }, undefined, undefined, undefined, (success, reason) => {
        void track('desktop_upgrade_download_result', { is_success: success,
            ...reason === undefined ? {} : { error_reason: reason } });
    });
    const updateSchedule = new DesktopUpdateSchedule(updates, resolveDesktopUpdateScheduleConfig(process.env));
    const downloadUpdate = async (version) => {
        void track('desktop_upgrade_click', {});
        updateJournal?.action('download-requested');
        const state = await updates.download(version);
        if (state.phase !== 'ready' || quitting)
            return state;
        // Only a completed user-driven download opens this prompt; cancelling installation does not reopen it.
        // A confirmation on a hidden window would go unseen, so it waits for the next show; the mandatory
        // flow keeps its own taskbar and Dock attention instead.
        if (!isMandatory())
            await windowShown();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A quit can begin while the show is awaited.
        if (quitting)
            return state;
        return updates.install(version);
    };
    const windowShown = () => new Promise((resolve) => {
        const window = currentDialogWindow();
        if (window === undefined || window.isDestroyed() || window.isVisible()) {
            resolve();
            return;
        }
        window.once('show', () => { resolve(); });
        window.once('closed', () => { resolve(); });
    });
    protocol.handle(SCHEME, (request) => {
        const url = new URL(request.url);
        // Shell-owned documents live in the application bundle and never pass through the Host.
        if (url.hostname === 'shell')
            return serveStudyBuddyShellDocument(request, app.getAppPath());
        if (url.hostname === 'app') {
            if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')
                || url.pathname.startsWith('/brand/') || ['/favicon.svg', '/favicon.png', '/manifest.webmanifest'].includes(url.pathname)) {
                return serveWebDocument(request, join(resources.dsh, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist'));
            }
            if (studybuddy.state.phase !== 'authenticated' || backend.host === undefined || hostUrl === undefined || hostCookie === undefined) {
                return Promise.resolve(new Response(null, { status: 503 }));
            }
            return forwardWebRequest(request, hostUrl, hostCookie);
        }
        return Promise.resolve(new Response(null, { status: 404 }));
    });
    installDesktopDirectoryPicker(() => mainWindow);
    installMicrophonePermissions(session.defaultSession, () => mainWindow?.webContents);
    const shortcuts = installDesktopShortcuts(() => mainWindow, app.getPath('userData'), process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux', () => {
        refreshApplicationMenu();
    }, window => updateOverlays.input(window));
    app.on('will-quit', () => { shortcuts.dispose(); });
    const assertStudyBuddySender = (event) => {
        assertDesktopSender(event, ['app', 'shell']);
        const frame = event.senderFrame;
        const ownMain = event.sender === mainWindow?.webContents && frame === mainWindow.webContents.mainFrame;
        const ownLogin = event.sender === welcomeWindow?.webContents && frame === welcomeWindow.webContents.mainFrame;
        if ((!ownMain && !ownLogin) || (ownLogin && new URL(frame.url).pathname !== '/welcome.html')) {
            throw new Error('StudyBuddy: rejected unowned renderer');
        }
    };
    const studybuddyCloud = new StudyBuddyCloudClient(studybuddy, (url, init) => net.fetch(url, init));
    const studybuddyEmbedded = new StudyBuddyEmbeddedGuests(studybuddy, (url, init) => net.fetch(url, init), partition => session.fromPartition(partition), async (owner, version) => {
        try {
            return await studybuddy.withSession(async (privateSession) => {
                const window = mainWindow;
                if (!window || window.isDestroyed() || window.webContents !== owner)
                    throw new Error('PROFILE_OWNER_MISMATCH');
                const bytes = await downloadGrowthPng(version, privateSession.accessToken, (url, init) => net.fetch(url, init));
                const stillOwner = () => !window.isDestroyed() && window.webContents === owner &&
                    studybuddy.scope() === privateSession.scope;
                if (!stillOwner())
                    throw new Error('ACCOUNT_SCOPE_CHANGED');
                const selected = await dialog.showSaveDialog(window, {
                    title: locale.messages.growthSaveTitle, defaultPath: locale.messages.growthSaveFilename, filters: [{ name: locale.messages.growthSaveFilter, extensions: ['png'] }],
                });
                if (selected.canceled || !selected.filePath)
                    return 'cancelled';
                await persistGrowthPng(selected.filePath, bytes, stillOwner);
                return 'saved';
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'AUTH_REQUIRED')
                void studybuddy.restore();
            return 'failed';
        }
    }, (owner, lease) => { if (!owner.isDestroyed())
        owner.send(STUDYBUDDY_IPC.embeddedInvalid, lease); });
    const toolViews = new ToolCenterViews({
        scope: () => studybuddy.scope(), owner: () => mainWindow, runtime: () => verifyTrustedNativeRuntime(businessRuntimeRoot), summary: async (scope) => {
            if (studybuddy.scope()?.accountId !== scope.accountId ||
                studybuddy.scope()?.generation !== scope.generation)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            return studybuddyCloud.invoke('getAiAccountSummary', []);
        }, create: options => new WebContentsView(options), session: partition => session.fromPartition(partition), preload: fileURLToPath(new URL('./preload-studybuddy-tools.cjs', import.meta.url)), released: lease => toolBridge.release(lease), invalidated: (lease) => {
            if (mainWindow &&
                !mainWindow.isDestroyed())
                mainWindow.webContents.send(STUDYBUDDY_IPC.toolsInvalid, lease.lease);
        },
    });
    const toolNative = {
        invoke: (scope, method, args) => studybuddy.withSession(async (privateSession) => {
            if (privateSession.scope.accountId !== scope.accountId ||
                privateSession.scope.generation !== scope.generation)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            studybuddyNative.useSession(privateSession);
            return studybuddyNative.invoke(scope, method, args);
        }),
        subscribeInstallEvents: (scope, listener) => studybuddyNative.subscribeInstallEvents(scope, listener),
        subscribeInstallStream: (scope, listener) => studybuddyNative.subscribeInstallStream(scope, listener),
    };
    const toolBridge = new ToolCenterBridge(toolViews, toolNative, async (window) => {
        const selected = await dialog.showOpenDialog(window, { title: '选择工具工作目录', properties: ['openDirectory'] });
        return selected.canceled ? null : selected.filePaths[0] ?? null;
    }, url => shell.openExternal(url), (notice) => {
        if (mainWindow &&
            !mainWindow.isDestroyed())
            mainWindow.webContents.send(STUDYBUDDY_IPC.toolNavigation, notice);
    }, {
        invoke: (owner, method, args) => skillSafety ? skillSafety.manual(owner, method, args) : Promise.reject(new Error('SKILL_SAFETY_UNAVAILABLE')),
        release: owner => skillSafety?.releaseManual(owner),
    });
    const builtins = new BuiltinCoordinator({
        host: () => backend.host,
        isCurrent: scope => studybuddy.scope()?.accountId === scope.accountId && studybuddy.scope()?.generation === scope.generation,
        ownedOperations: scope => studybuddy.withSession(async (privateSession) => {
            if (privateSession.scope.accountId !== scope.accountId ||
                privateSession.scope.generation !== scope.generation)
                throw new Error('BUILTIN_SCOPE_REVOKED');
            studybuddyNative.useSession(privateSession);
            const sources = await studybuddyNative.invoke(scope, 'listNativeUserSourcesV3', []);
            return sources.flatMap(source => source.operationId === null ? [] : [source.operationId]);
        }),
        native: {
            invokeBuiltin: builtinNativeInvoker({ withSession: run => studybuddy.withSession(run), native: studybuddyNative }),
        },
        requestVault: (owner, requestId) => {
            const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
            if (!uuid.test(owner) || !uuid.test(requestId))
                throw Error('BUILTIN_REQUEST_RECOVERY_INVALID');
            return studyBuddyVault(join(app.getPath('userData'), 'harness', owner, 'model-key-requests', requestId + '.json'), safeStorage);
        },
        fetch: (url, init) => net.fetch(url, init),
    });
    builtinCoordinator.current = builtins;
    platformModels.current = new PlatformModels({
        host: () => backend.host, isCurrent: scope => studybuddy.scope()?.accountId === scope.accountId && studybuddy.scope()?.generation === scope.generation,
        withSession: (scope, run) => studybuddy.withSession(session => { if (session.scope.accountId !== scope.accountId || session.scope.generation !== scope.generation)
            throw new Error('ACCOUNT_SCOPE_CHANGED'); return run(session); }),
        fetch: (url, init) => net.fetch(url, init),
        vault: owner => studyBuddyVault(join(app.getPath('userData'), 'harness', owner, 'platform-model-material.json'), safeStorage),
        audit: async (scope, request, authority) => {
            const vault = studyBuddyVault(join(app.getPath('userData'), 'harness', scope.accountId, 'platform-model-last-request.json'), safeStorage);
            await vault.write(JSON.stringify({ request, authority, fundingSource: 'platform' }));
        },
    });
    const catalogSync = new ModelCatalogSync({
        scope: () => studybuddy.scope(),
        platform: async (scope) => { await platformModels.current.restore(scope); await platformModels.current.initializeKey(scope); },
        tools: scope => toolNative.invoke(scope, 'syncNativeModelCatalogs', []),
        changed: scope => toolViews.refresh(scope),
        failed: source => console.error(source === 'platform' ? 'BUILTIN_PLATFORM_CATALOG_SYNC_UNAVAILABLE' : 'NATIVE_MODEL_CATALOG_SYNC_UNAVAILABLE'),
        schedule: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); return () => clearTimeout(timer); },
    });
    const aigcResource = resolveAigcResourceLocation({ packaged: app.isPackaged, appDirectory: app.getAppPath(),
        resourcesDirectory: process.resourcesPath, productionPin: AIGC_NATIVE_RUNTIME_PIN,
        developmentPin: AIGC_DEVELOPMENT_NATIVE_RUNTIME_PIN });
    const aigcRoot = aigcResource.directory;
    const currentAigcScope = (scope) => studybuddy.scope()?.accountId === scope.accountId && studybuddy.scope()?.generation === scope.generation;
    searchRuntime = new StudyBuddySearchRuntime({ isCurrent: currentAigcScope, keyMaterial: scope => platformModels.current.keyMaterial(scope),
        fetch: (url, init) => net.fetch(url, init), journal: (scope, id) => studyBuddyVault(join(app.getPath('userData'), 'harness', scope.accountId, 'search-requests', id + '.json'), safeStorage) });
    const aigcMedia = new AigcMediaClient({ isCurrent: currentAigcScope,
        target: scope => platformModels.current.keyMaterial(scope),
        journal: new DiskMediaKeyJournal(join(app.getPath('userData'), 'studybuddy-media', 'key-requests')),
        images: new DiskMediaImageStore(join(app.getPath('userData'), 'studybuddy-media', 'image-results')),
        audioResults: new DiskMediaAudioStore(join(app.getPath('userData'), 'studybuddy-media', 'audio-results')),
        fetch: (url, init) => net.fetch(url, init) });
    mediaBridge = new HarnessMediaBridge({ scope: () => studybuddy.scope() ?? undefined, api: aigcMedia,
        journal: new DiskMediaRequestJournal(join(app.getPath('userData'), 'studybuddy-media', 'requests')) });
    const imageActions = new DesktopImageActions({
        window: () => mainWindow,
        scope: () => { const scope = studybuddy.scope(); return scope === null || scope === undefined ? 'local' : `${scope.accountId}:${scope.generation}`; },
        messages: () => currentDesktopLocale().messages,
        verify: verifyImageTarget,
        popup: (window, template) => { Menu.buildFromTemplate(template).popup({ window }); },
        reveal: path => { shell.showItemInFolder(path); },
        fileExists: path => { try {
            return statSync(path).isFile();
        }
        catch {
            return false;
        } },
        downloadsDirectory: () => app.getPath('downloads'),
    });
    ipcMain.handle(DESKTOP_IPC.imageContext, async (event, target) => {
        assertProductSender(event);
        await imageActions.open(target);
    });
    app.on('will-quit', () => { ipcMain.removeHandler(DESKTOP_IPC.imageContext); imageActions.dispose(); });
    const aigcGateway = new AigcGateway({ isCurrent: currentAigcScope, consumer: builtins,
        platform: platformModels.current, media: aigcMedia,
        logRoot: scope => join(accountAigcDirectory(app.getPath('userData'), scope.accountId), 'gateway-journal') });
    const nativeAigcPin = aigcResource.pin;
    const aigcBridge = new AigcBridge({ userDataRoot: app.getPath('userData'), isCurrent: currentAigcScope,
        hostContext: scope => { if (!backend.host)
            throw Error('AIGC_HOST_UNAVAILABLE'); return backend.host.builtinContext(scope); },
        command: async (action, data, signal) => {
            if (!backend.host) {
                if (action === 'scope' && data === null)
                    return null;
                throw Error('AIGC_HOST_UNAVAILABLE');
            }
            return backend.host.aigcCommand(action, data, signal);
        }, nativeModel: (scope, providerId, modelId) => aigcGateway.nativeModel(scope, providerId, modelId),
        budget: async (caller, input, signal) => { signal.throwIfAborted(); if (!mediaHost)
            throw Error('CAPABILITY_HOST_UNAVAILABLE'); return mediaHost.capabilityCommand('budget', { caller, ...input }); },
        releaseCaller: async (scope, grantRef) => { await nativeAigcRuntime.invoke(scope, { operation: 'capability-release-caller', grantRef }, new AbortController().signal); } });
    const nativeAigcRuntime = new AigcDomainRuntime({ userDataRoot: app.getPath('userData'), isCurrent: currentAigcScope,
        resources: () => {
            if (!nativeAigcPin)
                return Promise.reject(Error('AIGC_RESOURCE_NOT_PREPARED'));
            return loadAigcNativeResources(aigcRoot, nativeAigcPin, { primaryRuntimeDirectory: primaryRuntime,
                dshDirectory: app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'dsh') : resources.dsh,
                ...(app.isPackaged ? {} : { workspaceDirectory: join(app.getAppPath(), '../..') }) });
        }, gateway: scope => aigcGateway.start(scope), launch: launchAigcProcess,
        native: (scope, operation, input, signal) => operation === 'question' ? aigcBridge.question(scope, input, signal) : operation === 'budget' ? aigcBridge.budget(scope, input, signal) : aigcBridge.temporaryCommand(scope, input, signal),
        invalidated: () => { void studybuddyAigc.revoke().catch(() => { console.error('StudyBuddy AIGC cleanup failed'); }); },
    });
    if (nativeAigcPin)
        aigcToolBridge = (request, signal) => aigcBridge.tool(request, (scope, input, signal) => nativeAigcRuntime.invoke(scope, input, signal), signal);
    const aigcRuntime = nativeAigcPin ? nativeAigcRuntime : new AigcRuntime({ userDataRoot: app.getPath('userData'), isCurrent: currentAigcScope,
        resources: () => loadAigcResources(aigcRoot), gateway: scope => aigcGateway.start(scope),
        launch: launchAigcProcess,
        invalidated: () => { void studybuddyAigc.revoke().catch(() => { console.error('StudyBuddy AIGC cleanup failed'); }); },
    });
    const studybuddyAigc = new StudyBuddyAigc({ auth: studybuddy, runtime: aigcRuntime,
        ...(nativeAigcPin ? { bridge: aigcBridge, preload: fileURLToPath(new URL('./preload-studybuddy-aigc.cjs', import.meta.url)) } : {}),
        fromPartition: partition => session.fromPartition(partition), revokeGateway: () => aigcGateway.revoke(),
        prepareCanvas: async (scope, directory, controllerRef) => {
            if (!capabilities)
                throw Error('AIGC_CANVAS_OWNER_UNAVAILABLE');
            const context = await aigcBridge.bind(scope, directory, undefined, false);
            await capabilities.prepareCanvas({ scope, hostGeneration: context.hostGeneration, callerSessionId: context.sessionId, workspaceId: context.workspaceId, toolCallId: 'canvas-handoff' }, context.projectId, controllerRef);
        } });
    aigcCleanup.current = async () => { capabilityNavigation?.revoke(); await capabilities?.revoke(); aigcMedia.clearTransient(); await studybuddyAigc.revoke(); };
    const researchResources = resolveResearchResourceLocation({ packaged: app.isPackaged,
        appDirectory: app.getAppPath(), resourcesDirectory: process.resourcesPath,
        productionPin: RESEARCH_RUNTIME_PIN, developmentPin: RESEARCH_DEVELOPMENT_RUNTIME_PIN });
    const researchBridge = new ResearchBridge({ userDataRoot: app.getPath('userData'), isCurrent: currentAigcScope,
        speech: (scope, input, signal, context) => aigcMedia.transcribe(scope, input, signal, context),
        settlements: (scope, input, signal) => new ResearchUsageClient({ current: currentAigcScope, withSession: run => studybuddy.withSession(run), fetch: (url, init) => net.fetch(url, init) }).read(scope, input, signal),
        hostContext: scope => { if (!backend.host)
            throw Error('HARNESS_RESEARCH_HOST_UNAVAILABLE'); return backend.host.builtinContext(scope); },
        command: async (action, data) => {
            if (!backend.host) {
                if (action === 'scope' && data === null)
                    return null;
                throw Error('HARNESS_RESEARCH_HOST_UNAVAILABLE');
            }
            return backend.host.researchCommand(action, data);
        } });
    const researchRuntime = new ResearchRuntime({ userDataRoot: app.getPath('userData'), isCurrent: currentAigcScope,
        resources: () => loadResearchResources(researchResources.directory, { primaryRuntimeDirectory: primaryRuntime,
            dshDirectory: app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'dsh') : resources.dsh,
            ...(app.isPackaged ? {} : { workspaceDirectory: join(app.getAppPath(), '../..') }) }, researchResources.pin),
        invoke: (scope, request, signal) => researchBridge.invoke(scope, request, signal), launch: launchAigcProcess,
        invalidated: () => { void studybuddyResearch.revoke().catch(() => { console.error('StudyBuddy research cleanup failed'); }); } });
    const studybuddyResearch = new StudyBuddyResearch({ userDataRoot: app.getPath('userData'), auth: studybuddy, runtime: researchRuntime, bridge: researchBridge,
        preload: fileURLToPath(new URL('./preload-studybuddy-research.cjs', import.meta.url)), fromPartition: partition => session.fromPartition(partition), openExternal: url => shell.openExternal(url) });
    researchToolBridge = new ResearchNativeToolBridge({ isCurrent: currentAigcScope, binding: async (scope, projectId, sessionId) => researchBridge.bound(scope, projectId, sessionId),
        origin: async (scope) => (await researchRuntime.ensure(scope)).origin, headers: (scope, url) => researchRuntime.toolHeaders(scope, url), fetch });
    researchCleanup.current = () => studybuddyResearch.revoke();
    const videoPin = app.isPackaged ? VIDEO_RUNTIME_PIN : VIDEO_DEVELOPMENT_RUNTIME_PIN;
    const videoDirectory = app.isPackaged ? join(process.resourcesPath, 'studybuddy-video') : join(app.getAppPath(), '../..', '.dsh-build', VIDEO_DEVELOPMENT_DIRECTORY);
    const videoRuntime = new VideoRuntime({ userDataRoot: app.getPath('userData'), isCurrent: currentAigcScope,
        resources: () => loadVideoResources(videoDirectory, videoPin, { primary: primaryRuntime, dsh: app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'dsh') : resources.dsh, aigc: aigcRoot, ...(app.isPackaged ? {} : { workspace: join(app.getAppPath(), '../..') }) }),
        invoke: (_scope, request, signal) => videoBridge.capability(request, signal), launch: launchAigcProcess,
        invalidated: () => { void studybuddyVideo.revoke().catch(() => { console.error('StudyBuddy video cleanup failed'); }); } });
    const videoBridge = new VideoBridge({ userDataRoot: app.getPath('userData'), runtime: videoRuntime, isCurrent: currentAigcScope,
        hostContext: scope => { if (!backend.host)
            throw Error('VIDEO_HOST_UNAVAILABLE'); return backend.host.builtinContext(scope); },
        command: async (action, data, signal) => { if (!backend.host) {
            if (action === 'scope' && data === null)
                return null;
            throw Error('VIDEO_HOST_UNAVAILABLE');
        } return backend.host.videoCommand(action, data, signal); },
        mediaChoices: (scope, signal, caller) => videoMedia.catalog(scope, signal, caller), mediaRequest: (request, signal) => videoMedia.request(request, signal) });
    const videoMedia = new VideoMediaAdapter({ binding: videoBridge.binding, isCurrent: videoBridge.current, api: aigcMedia, pollIntervalMs: 1000, timeoutMs: 300000, authorize: async (request, modelId, signal) => { signal.throwIfAborted(); if (!request.caller || !mediaHost)
            throw Error('VIDEO_BUDGET_UNAVAILABLE'); const caller = videoBridge.capabilityCaller(request.scope, request.caller); await mediaHost.capabilityCommand('budget', { caller, requestId: request.requestId, modelId, fundingSource: 'platform' }); signal.throwIfAborted(); } });
    const studybuddyVideo = new StudyBuddyVideo({ auth: studybuddy, runtime: videoRuntime, bridge: videoBridge, prepared: videoPin !== null,
        preload: fileURLToPath(new URL('./preload-studybuddy-video.cjs', import.meta.url)), fromPartition: partition => session.fromPartition(partition), imageFromBytes: bytes => nativeImage.createFromBuffer(Buffer.from(bytes)),
        showOpenDialog: (owner, options) => { const window = BrowserWindow.fromWebContents(owner); if (!window || window.isDestroyed())
            throw Error('VIDEO_SCOPE_REVOKED'); return dialog.showOpenDialog(window, options); } });
    videoToolBridge = (request, signal) => videoBridge.tool(request, signal);
    videoCleanup.current = () => { videoMedia.clear(); return studybuddyVideo.revoke(); };
    capabilityNavigation = new CapabilityProjectNavigation({ assert: caller => { if (!capabilities)
            throw Error('CAPABILITY_UNAVAILABLE'); capabilities.service.assert(caller); }, notify: (caller, target, id) => { if (!mainWindow || mainWindow.isDestroyed())
            throw Error('CAPABILITY_SHELL_UNAVAILABLE'); mainWindow.webContents.send(STUDYBUDDY_IPC.toolNavigation, { scope: caller.scope, target: target.moduleId, capabilityAction: id }); }, open: async (caller, target, signal) => { if (!capabilities)
            throw Error('CAPABILITY_UNAVAILABLE'); await capabilities.service.openProject(caller, target, signal); } });
    capabilities = createStudyBuddyCapabilities({ userDataRoot: app.getPath('userData'), nativeModuleAnchor: join(app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked', 'dsh') : resources.dsh, 'package.json'),
        owner: () => { const scope = studybuddy.scope(); return scope && backend.host ? backend.host.builtinContext(scope) : null; },
        associated: async (caller, target) => { if (!mediaHost)
            throw Error('CAPABILITY_HOST_UNAVAILABLE'); return await mediaHost.capabilityCommand('associated', { caller, target }) === true; },
        destination: async (caller, signal) => { signal.throwIfAborted(); if (!mediaHost)
            throw Error('CAPABILITY_HOST_UNAVAILABLE'); const value = await mediaHost.capabilityCommand('destination', { caller }); if (typeof value?.directory !== 'string')
            throw Error('CAPABILITY_DESTINATION_UNAVAILABLE'); return value.directory; },
        open: async (caller, target, signal) => { if (!capabilities || !capabilityNavigation)
            throw Error('CAPABILITY_UNAVAILABLE'); await capabilities.service.prepareOpen(caller, target, signal); await capabilityNavigation.open(caller, target, signal); },
        ...(nativeAigcPin ? { aigc: { bridge: aigcBridge, runtime: nativeAigcRuntime, create: options => new WebContentsView(options), session: partition => session.fromPartition(partition) } } : {}),
        ...(videoPin ? { video: { bridge: videoBridge, runtime: videoRuntime } } : {}) });
    if (mediaHost)
        void mediaHost.capabilityApply(studybuddy.scope(), studybuddy.scope() ? capabilities.service.ids() : []).catch(error => { if (!(error instanceof Error && error.message === 'BUILTIN_HOST_UNAVAILABLE'))
            console.error('Capability scope update failed'); });
    let businessScope = studybuddy.scope();
    const assertBusiness = (event) => assertBusinessSender({
        ownerId: mainWindow?.webContents.id, senderId: event.sender.id,
        mainFrameId: mainWindow?.webContents.mainFrame.routingId, frameId: event.senderFrame?.routingId,
        url: event.senderFrame?.url ?? '', authenticated: studybuddy.state.phase === 'authenticated',
    });
    ipcMain.handle('studybuddy:capability-open', async (event, id) => { try {
        assertBusiness(event);
        const scope = studybuddy.scope();
        if (!scope || typeof id !== 'string' || !capabilityNavigation)
            throw Error('CAPABILITY_OPEN_NOT_AUTHORIZED');
        await capabilityNavigation.complete(id, scope);
        return { ok: true, data: null };
    }
    catch {
        return { ok: false, error: { code: 'CAPABILITY_OPEN_FAILED' } };
    } });
    ipcMain.handle('studybuddy:capability-project-open', async (event, id) => { try {
        assertBusiness(event);
        const scope = studybuddy.scope();
        if (!scope || typeof id !== 'string' || !capabilities)
            throw Error('CAPABILITY_OPEN_NOT_AUTHORIZED');
        await capabilities.service.openAction(id, scope, AbortSignal.timeout(60_000));
        return { ok: true, data: null };
    }
    catch {
        return { ok: false, error: { code: 'CAPABILITY_OPEN_FAILED' } };
    } });
    const supportDiagnostics = createSupportDiagnostics({
        readScope: () => studybuddy.scope() ?? undefined,
        metadata: { appVersion: process.env.DSH_CLIENT_VERSION ?? app.getVersion(), buildNumber: app.getVersion(),
            platform: process.platform === 'darwin' ? 'macos' : 'windows', architecture: process.arch === 'arm64' ? 'aarch64' : 'x64',
            sessionId: randomUUID() },
        transport: (scope, batch) => studybuddy.withSession(async (privateSession) => {
            if (scope.accountId !== privateSession.scope.accountId || scope.generation !== privateSession.scope.generation)
                throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
            studybuddyNative.useSession(privateSession);
            return studybuddyNative.invokeSupport(scope, 'recordHarnessDiagnostics', [batch]);
        }),
    });
    const supportBridge = installSupportBridge({
        readScope: () => studybuddy.scope() ?? undefined, withSession: run => studybuddy.withSession(run),
        native: studybuddyNative, diagnostics: supportDiagnostics,
        isTrustedSender: sender => sender.id === mainWindow?.webContents.id && sender.mainFrame &&
            /^dsh-app:\/\/app\//u.test(sender.url) && studybuddy.state.phase === 'authenticated',
        register: (channel, handler) => {
            ipcMain.handle(channel, (event, ...args) => handler({ id: event.sender.id,
                mainFrame: event.senderFrame?.routingId === mainWindow?.webContents.mainFrame.routingId,
                url: event.senderFrame?.url ?? '' }, args));
            return () => ipcMain.removeHandler(channel);
        },
        emit: (sender, channel, payload) => {
            if (sender.id === mainWindow?.webContents.id && !mainWindow.isDestroyed())
                mainWindow.webContents.send(channel, payload);
        },
        pickScreenshots: async () => {
            if (!mainWindow || mainWindow.isDestroyed())
                throw new BusinessFailure('BUSINESS_SENDER_DENIED');
            const selected = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'],
                filters: [{ name: 'PNG / JPEG / WebP', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
            return selected.canceled ? [] : selected.filePaths;
        },
    });
    recordSupportFailure = source => supportDiagnostics.record({ source: source === 'host' ? 'host' : 'desktop_main',
        eventName: source === 'host' ? 'harness_host_terminated' : 'harness_window_failed', outcome: 'failed',
        errorCode: 'HARNESS_PROCESS_FAILED' });
    supportDiagnostics.record({ source: 'desktop_main', eventName: 'harness_started', outcome: 'observed' });
    const skillRuntimeRoot = app.isPackaged ? join(process.resourcesPath, 'studybuddy-skills-native') : fileURLToPath(new URL('../../../.dsh-build/studybuddy-skills-native/', import.meta.url));
    skillSafety = new SkillSafetyMain({ auth: studybuddy, host: () => backend.host,
        userDataDirectory: app.getPath('userData'), runtimeDirectory: primaryRuntime,
        releaseFile: app.isPackaged ? join(process.resourcesPath, 'skill-scanner-release.json') : fileURLToPath(new URL('../.desktop-build/targets/win-x64/skill-scanner-publication/release.json', import.meta.url)),
        harnessHome: () => { const value = process.env.DSH_HOME; if (!value)
            throw new Error('SKILL_SAFETY_UNAVAILABLE'); return value; },
        version: desktopClientVersion(), nativeRuntime: trustedSkillsRuntime(skillRuntimeRoot), consumer: builtins, platform: platformModels.current, fetch: (url, init) => net.fetch(url, init) });
    skillSafetyCleanup.current = () => skillSafety.revoke();
    const studybuddyCommunity = new StudyBuddyCommunity({
        auth: studybuddy, fetch: (url, init) => net.fetch(url, init), session: partition => session.fromPartition(partition), window: () => mainWindow,
        runtime: trustedSkillsRuntime(skillRuntimeRoot), home: () => { const home = process.env.DSH_HOME; if (!home)
            throw new Error('SKILL_NATIVE_BOOTSTRAP_INVALID'); return home; },
        version: process.env.DSH_CLIENT_VERSION ?? app.getVersion(), preload: fileURLToPath(new URL('./preload-studybuddy-skills.cjs', import.meta.url)),
        pick: async (window, command, input) => {
            if (command === 'skill_center_export') {
                const selected = await dialog.showSaveDialog(window, { title: '导出所选 Skill', defaultPath: 'studybuddy-skills.zip', filters: [{ name: 'Skill ZIP', extensions: ['zip'] }] });
                return selected.canceled ? null : selected.filePath ?? null;
            }
            const request = input.request && typeof input.request === 'object' && !Array.isArray(input.request) ? input.request : null;
            if (command === 'skill_center_import_local' && request?.kind !== 'folder' && request?.kind !== 'archive')
                throw new Error('SKILL_REQUEST_INVALID');
            const archive = command === 'skill_center_import_local' && request?.kind === 'archive';
            const selected = await dialog.showOpenDialog(window, { title: command === 'skill_center_pick_project' ? '选择 Skill 项目目录' : archive ? '选择 Skill ZIP 压缩包' : '选择要导入个人库的 Skill 文件夹', properties: archive ? ['openFile'] : ['openDirectory'], ...(archive ? { filters: [{ name: 'Skill ZIP', extensions: ['zip'] }] } : {}) });
            return selected.canceled ? null : selected.filePaths[0] ?? null;
        }, openPath: path => shell.openPath(path), openExternal: url => shell.openExternal(url),
    });
    studybuddyCommunity.register(ipcMain, assertBusiness);
    const stopPrompts = new StudyBuddyPrompts(studybuddy, (url, init) => net.fetch(url, init)).register(ipcMain, assertBusiness);
    app.on('will-quit', stopPrompts);
    studybuddyAigc.register(ipcMain, assertBusiness);
    studybuddyResearch.register(ipcMain, assertBusiness);
    studybuddyVideo.register(ipcMain, assertBusiness, event => assertBusinessSender({ ownerId: mainWindow?.webContents.id, senderId: event.sender.id, mainFrameId: mainWindow?.webContents.mainFrame.routingId, frameId: event.senderFrame?.routingId, url: event.senderFrame?.url ?? '', authenticated: true }));
    ipcMain.handle(STUDYBUDDY_IPC.business, async (event, method, args) => {
        try {
            assertBusiness(event);
            if (typeof method !== 'string' || !Array.isArray(args) || Buffer.byteLength(JSON.stringify(args), 'utf8') > 16 * 1024 * 1024)
                throw new BusinessFailure('BUSINESS_ARGS_INVALID');
            let data;
            if (['listNativeBuiltinReadiness', 'resumeNativeBuiltinSource', 'validateNativeBuiltinSource',
                'getNativeBuiltinSourceDetail', 'refreshNativeBuiltinBalance', 'runNativeBuiltinDiagnostic'].includes(method)) {
                data = await studybuddy.withSession(async (privateSession) => {
                    if (method === 'listNativeBuiltinReadiness' && args.length === 0)
                        return builtins.list(privateSession.scope);
                    if (method === 'runNativeBuiltinDiagnostic' &&
                        args.length === 1)
                        return builtins.diagnostic(privateSession.scope, parseNativeBuiltinValidationRequestV1(args[0]));
                    if (args.length !== 1 || typeof args[0] !== 'string')
                        throw new BusinessFailure('BUSINESS_ARGS_INVALID');
                    if (method === 'resumeNativeBuiltinSource')
                        return builtins.resume(privateSession.scope, args[0]);
                    if (method === 'validateNativeBuiltinSource') {
                        studybuddyNative.useSession(privateSession);
                        const rows = await studybuddyNative.invoke(privateSession.scope, 'listNativeUserSourcesV3', []);
                        const source = rows.find(row => row.operationId === args[0]);
                        if (source?.probeSelection === undefined || source.probeSelection === null ||
                            source.operationId === null)
                            throw new Error('BUILTIN_SELECTION_REQUIRED');
                        return builtins.prepareAndValidate(privateSession.scope, source.operationId, source.probeSelection);
                    }
                    if (method === 'getNativeBuiltinSourceDetail')
                        return builtins.detail(privateSession.scope, args[0]);
                    if (method === 'refreshNativeBuiltinBalance')
                        return builtins.refreshBalance(privateSession.scope, args[0]);
                    throw new BusinessFailure('BUSINESS_ARGS_INVALID');
                });
            }
            else if (NATIVE_OPERATIONS.includes(method)) {
                data = await studybuddy.withSession(async (session) => {
                    studybuddyNative.useSession(session);
                    const result = await studybuddyNative.invoke(session.scope, method, args);
                    if (method === 'saveNativeUserSourceV3') {
                        const request = parseNativeUserSourceSaveRequestV3(args[0]), saved = parseNativeUserSourceSaveResultV3(result);
                        if (saved.state === 'saved' &&
                            request.draft.probeSelection !== null)
                            await builtins.prepareAndValidate(session.scope, saved.operationId, request.draft.probeSelection).catch(() => undefined);
                    }
                    else if (method === 'resumeNativeUserSourceSaveV3') {
                        const saved = parseNativeUserSourceSaveResultV3(result);
                        if (saved.state === 'saved')
                            await builtins.resume(session.scope, saved.operationId).catch(() => undefined);
                    }
                    else if (method === 'deleteNativeUserModel' && result === true &&
                        typeof args[0] === 'string')
                        await builtins.forgetSource(session.scope, args[0]).catch(() => undefined);
                    return result;
                });
            }
            else if (method === 'getAiAccountSummary') {
                const requestScope = studybuddy.scope(), summary = await studybuddyCloud.invoke('getAiAccountSummary', []);
                if (!requestScope || studybuddy.scope()?.accountId !== requestScope.accountId ||
                    studybuddy.scope()?.generation !== requestScope.generation)
                    throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED');
                toolViews.refresh(requestScope, summary);
                data = summary;
            }
            else
                data = await studybuddyCloud.invoke(method, args);
            const currentScope = studybuddy.scope();
            if (currentScope !== null && [
                'saveNativeUserSourceV3', 'resumeNativeUserSourceSaveV3', 'saveNativeUserSource', 'resumeNativeUserSourceSave',
                'saveNativeUserModel', 'resumeNativeUserModelSave', 'addNativeUserModel', 'updateNativeUserModel',
                'deleteNativeUserModel', 'reorderNativeUserModels',
            ].includes(method))
                toolViews.refresh(currentScope);
            return { ok: true, data };
        }
        catch (error) {
            const code = error instanceof BusinessFailure ? error.code : error instanceof Error &&
                /^[A-Z0-9_]{1,128}$/u.test(error.message) ? error.message : 'BUSINESS_REQUEST_FAILED';
            if (code === 'AUTH_REQUIRED')
                void studybuddy.restore();
            return { ok: false, error: { code, ...(error instanceof BusinessFailure && error.operationId ? { operationId: error.operationId } : {}) } };
        }
    });
    ipcMain.handle(STUDYBUDDY_IPC.status, (event) => {
        assertStudyBuddySender(event);
        return { ...studybuddy.state, scope: studybuddy.scope() };
    });
    const embeddedCall = async (event, operation) => {
        try {
            assertBusiness(event);
            return { ok: true, data: await operation() };
        }
        catch (error) {
            const code = error instanceof Error && /^[A-Z0-9_]{1,128}$/u.test(error.message) ? error.message :
                'PROFILE_LOAD_FAILED';
            return { ok: false, error: { code } };
        }
    };
    ipcMain.handle(STUDYBUDDY_IPC.embeddedAcquire, (event, target) => embeddedCall(event, async () => {
        if (target !== 'personal_profile' && target !== 'model_insights')
            throw new Error('PROFILE_TARGET_DENIED');
        return studybuddyEmbedded.acquire(event.sender, target === 'model_insights' ? 'models' : 'profile');
    }));
    ipcMain.handle(STUDYBUDDY_IPC.embeddedRelease, (event, lease) => embeddedCall(event, () => studybuddyEmbedded.release(event.sender, lease)));
    ipcMain.handle(STUDYBUDDY_IPC.embeddedTheme, (event, lease, theme) => embeddedCall(event, () => studybuddyEmbedded.setTheme(event.sender, lease, theme)));
    ipcMain.handle(STUDYBUDDY_IPC.toolsAcquire, (event, target) => embeddedCall(event, () => studybuddy.withSession(async (privateSession) => {
        studybuddyNative.useSession(privateSession);
        if (target !== undefined && target !== 'tools' && target !== 'labs')
            throw new BusinessFailure('TOOL_VIEW_DENIED');
        return toolViews.acquire(privateSession.scope, target);
    })));
    const surfaceCall = async (event, id, run) => embeddedCall(event, async () => {
        const row = toolViews.get(id);
        if (row.window.webContents !== event.sender)
            throw new BusinessFailure('TOOL_VIEW_DENIED');
        await run(row.lease.lease);
    });
    ipcMain.handle(STUDYBUDDY_IPC.toolsResize, (event, id, bounds) => surfaceCall(event, id, key => toolViews.resize(key, bounds)));
    ipcMain.handle(STUDYBUDDY_IPC.toolsVisible, (event, id, visible) => surfaceCall(event, id, key => toolViews.setVisible(key, visible)));
    ipcMain.handle(STUDYBUDDY_IPC.toolsTheme, (event, id, theme) => surfaceCall(event, id, key => toolViews.setTheme(key, theme)));
    ipcMain.handle(STUDYBUDDY_IPC.toolsRelease, (event, id) => surfaceCall(event, id, key => toolViews.release(key)));
    const toolCall = async (operation) => {
        try {
            return { ok: true, data: await operation() };
        }
        catch (error) {
            const code = error instanceof BusinessFailure ? error.code : error instanceof SkillSafetyError || error instanceof SkillScannerResourceError ? error.code : 'TOOL_OPERATION_FAILED';
            return { ok: false, error: { code, ...(error instanceof BusinessFailure ? { message: error.message, ...(error.operationId ? {
                            operationId: error.operationId
                        } : {}), ...(error.requestId ? { requestId: error.requestId } : {}), ...(error.availableAt ? {
                            availableAt: error.availableAt
                        } : {}) } : {}) } };
        }
    };
    ipcMain.handle(STUDYBUDDY_IPC.toolPageState, event => toolCall(() => toolBridge.state(event)));
    ipcMain.handle(STUDYBUDDY_IPC.toolOperation, (event, id, method, args) => toolCall(() => toolBridge.invoke(event, id, method, args)));
    ipcMain.handle(STUDYBUDDY_IPC.toolNavigate, (event, id, target) => toolCall(() => toolBridge.navigation(event, id, target)));
    ipcMain.handle(STUDYBUDDY_IPC.toolInstallSubscribe, (event, id) => toolCall(() => toolBridge.subscribe(event, id)));
    ipcMain.handle(STUDYBUDDY_IPC.toolInstallUnsubscribe, (event, id) => toolCall(() => toolBridge.unsubscribe(event, id)));
    ipcMain.handle(STUDYBUDDY_IPC.start, (event) => {
        assertStudyBuddySender(event);
        if (studybuddy.state.phase === 'waiting')
            authorizationWindow.focus();
        return studybuddy.start();
    });
    ipcMain.handle(STUDYBUDDY_IPC.cancel, (event) => { assertStudyBuddySender(event); return studybuddy.cancel(); });
    ipcMain.handle(STUDYBUDDY_IPC.logout, (event) => { assertStudyBuddySender(event); return studybuddy.logout(); });
    ipcMain.handle(STUDYBUDDY_IPC.updates, async (event) => {
        assertStudyBuddySender(event);
        await openUpdatePrompt(true);
        const state = updates.state;
        return {
            phase: state.phase,
            ...(state.version === undefined ? {} : { version: state.version }),
            message: state.phase === 'error'
                ? desktopUpdateErrorSummary(state, locale.messages)
                : state.phase === 'idle'
                    ? locale.messages.updateCurrent
                    : state.phase === 'available'
                        ? formatDesktopMessage(locale.messages.updateAvailable, { version: state.version ?? '' })
                        : locale.messages.updateChecking,
        };
    });
    const onStudyBuddyState = (state) => {
        const currentScope = studybuddy.scope();
        void mediaHost?.mediaApply(currentScope).catch(() => { console.warn('STUDYBUDDY_MEDIA_SCOPE_UPDATE_FAILED'); });
        if (currentScope !== businessScope) {
            void capabilities?.revoke().then(() => mediaHost?.capabilityApply(currentScope, currentScope ? capabilities?.service.ids() ?? [] : [])).catch(() => console.error('Capability account cleanup failed'));
            supportBridge.revoke();
            void skillSafetyCleanup.current?.().catch(() => { console.warn('SKILL_SAFETY_CLEANUP_FAILED'); });
            if (businessScope !== null) {
                void builtins.revoke(businessScope).catch(() => undefined);
                void platformModels.current?.revoke(businessScope).catch(() => undefined);
            }
            void toolViews.revoke().catch(error => console.error('StudyBuddy tool view cleanup failed', error instanceof BusinessFailure ? error.code : 'TOOL_VIEW_FAILED'));
            studybuddyNative.revoke();
            void studybuddyEmbedded.revoke().catch(() => { console.error('StudyBuddy profile cleanup failed; its partition will not be reused'); });
            void studybuddyCommunity.revoke().catch(() => { console.error('StudyBuddy community cleanup failed; its partitions will not be reused'); });
            void studybuddyAigc.revoke().catch(() => { console.error('StudyBuddy AIGC cleanup failed; its authorization will not be reused'); });
            void studybuddyResearch.revoke().catch(() => { console.error('StudyBuddy research cleanup failed; its authorization will not be reused'); });
            void videoCleanup.current?.().catch(() => { console.error('StudyBuddy video cleanup failed'); });
            businessScope = currentScope;
            if (currentScope !== null) {
                supportDiagnostics.record({ source: 'desktop_main', eventName: 'harness_authenticated', outcome: 'succeeded' });
                if (backend.host !== undefined)
                    supportDiagnostics.record({ source: 'host', eventName: 'harness_host_started', outcome: 'observed' });
            }
        }
        authorizationWindow.synchronize(state);
        for (const window of [mainWindow, welcomeWindow]) {
            if (window !== undefined && !window.isDestroyed())
                window.webContents.send(STUDYBUDDY_IPC.state, {
                    ...state, scope: studybuddy.scope(),
                });
        }
        const transition = studyBuddyWorkspaceTransition(state, initialAccount, enteredWorkspace);
        if (transition === 'relaunch') {
            if (!quitting) {
                app.relaunch();
                quitWithoutConfirmation();
            }
        }
        else if (transition === 'lock') {
            enteredWorkspace = false;
            mainWindow?.hide();
            void showWelcome().catch((error) => { reportFatal(error, 'main'); });
        }
        else if (transition === 'resume') {
            void enterWorkspace().catch((error) => { reportFatal(error, 'main'); });
        }
    };
    const startStudyBuddySubscription = () => {
        businessScope = studybuddy.scope();
        stopStudyBuddy = studybuddy.subscribe(onStudyBuddyState);
    };
    app.on('will-quit', () => { stopStudyBuddy(); authorizationWindow.close(); studybuddy.dispose(); void studybuddyNative.dispose(); void studybuddyEmbedded.revoke().catch(() => { }); void studybuddyCommunity.revoke().catch(() => { }); });
    app.on('will-quit', () => { recordSupportFailure = undefined; supportBridge.dispose(); supportDiagnostics.dispose(); });
    ipcMain.handle(DESKTOP_IPC.boot, async (event) => {
        assertDesktopSender(event, ['app']);
        await initialBackendStarting.promise;
        await startup;
        if (backend.host === undefined || hostUrl === undefined)
            throw new Error('Desktop Host is unavailable');
        return { injections, streamBaseUrl: new URL(hostUrl).origin };
    });
    ipcMain.handle(DESKTOP_IPC.bootFailed, (event, message) => {
        assertDesktopSender(event, ['app']);
        if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
            throw new Error('dsh desktop: rejected startup failure from a non-primary frame');
        }
        if (typeof message !== 'string')
            throw new Error('dsh desktop: startup failure must be text');
        // The neutral loading document can be replaced by Welcome after a failed account restore.
        if (studybuddy.state.phase !== 'authenticated')
            return;
        reportFatal(new Error(message), 'web-boot');
    });
    ipcMain.handle(DESKTOP_IPC.browserAcquire, (event, workspace) => {
        assertProductSender(event);
        return browserGuests.acquire(event.sender, workspace);
    });
    ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease) => {
        assertProductSender(event);
        return browserGuests.release(event.sender, lease);
    });
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*', 'wss://127.0.0.1/*'] }, (details, callback) => {
        if (hostUrl === undefined || hostCookie === undefined || details.webContentsId !== mainWindow?.webContents.id) {
            callback({});
            return;
        }
        const target = new URL(hostUrl);
        const requested = new URL(details.url);
        if (requested.host !== target.host || requested.protocol !== (target.protocol === 'https:' ? 'wss:' : 'ws:')) {
            callback({});
            return;
        }
        const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([name, value]) => [name.toLowerCase(), value]));
        if (headers.origin !== 'dsh-app://app' || studybuddy.state.phase !== 'authenticated') {
            callback({ cancel: true });
            return;
        }
        callback({ requestHeaders: { ...headers, origin: target.origin, cookie: hostCookie, 'sec-fetch-site': 'same-origin' } });
    });
    const assertMainApplication = (event) => {
        const owner = mainWindow;
        if (owner === undefined || event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame
            || !event.senderFrame.url.startsWith('dsh-app://app/'))
            throw new Error('Rejected Platform command');
        return owner;
    };
    ipcMain.on(PLATFORM_IPC.bootstrap, (event) => {
        try {
            event.returnValue = platformView.bootstrap(event);
        }
        catch {
            event.returnValue = null;
        }
    });
    ipcMain.handle(PLATFORM_IPC.open, (event, page, bounds) => {
        const owner = assertMainApplication(event);
        if (page !== 'usage' && page !== 'top-up')
            throw new Error('Invalid Platform page');
        return platformView.open(owner, page, platformBounds(bounds));
    });
    ipcMain.handle(PLATFORM_IPC.bounds, (event, bounds) => {
        assertMainApplication(event);
        platformView.setBounds(platformBounds(bounds));
    });
    ipcMain.handle(PLATFORM_IPC.close, (event) => { assertMainApplication(event); platformView.close(); });
    // Only the main window may synchronize its palette with the native material.
    ipcMain.on(DESKTOP_IPC.nativeThemeSet, (event, source) => {
        if (mainWindow === undefined || event.sender !== mainWindow.webContents)
            return;
        if (source === 'light' || source === 'dark' || source === 'system')
            nativeTheme.themeSource = source;
    });
    ipcMain.handle(DESKTOP_IPC.localeBootstrap, async (event) => {
        if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame
            || new URL(event.senderFrame.url).origin !== new URL(applicationUrl).origin) {
            throw new Error('desktop welcome: rejected locale request from an unowned frame');
        }
        if (welcomeBackend === undefined)
            throw new Error('desktop welcome: backend unavailable');
        return { languages: systemLanguages, preference: await welcomeBackend.readLocalePreference() };
    });
    ipcMain.on(DESKTOP_IPC.localeChanged, (event, next) => {
        const window = mainWindow;
        if (window === undefined || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
            || typeof next !== 'string')
            return;
        const current = resolveDesktopStartupLocale(next, systemLanguages);
        if (current.id === locale.id)
            return;
        locale = current;
        platformView.notifyLocaleChanged();
        windowsLanguage = locale.id;
        refreshApplicationMenu();
    });
    ipcMain.handle(DESKTOP_IPC.updatesStatus, (event) => {
        assertProductSender(event);
        return presentDesktopUpdate(updates.state);
    });
    ipcMain.handle(DESKTOP_IPC.deviceInfo, (event) => {
        assertProductSender(event);
        return readDeviceInfo();
    });
    ipcMain.handle(DESKTOP_IPC.onboardingApiKey, async (event) => {
        assertProductSender(event);
        if (welcomeBackend === undefined)
            throw new Error('desktop welcome: backend unavailable');
        return (await welcomeBackend.read()).hasApiKey;
    });
    ipcMain.on(DESKTOP_IPC.onboardingActive, (event, active) => {
        const window = mainWindow;
        if (window === undefined || window.isDestroyed() || event.sender !== window.webContents
            || event.senderFrame !== window.webContents.mainFrame
            || !event.senderFrame.url.startsWith(`${SCHEME}://app/`) || typeof active !== 'boolean')
            return;
        window.setMinimumSize(active ? 960 : 520, 600);
        if (active) {
            const { width, height } = window.getBounds();
            if (width < 960)
                window.setSize(960, height);
        }
    });
    ipcMain.handle(DESKTOP_IPC.updatesOpen, async (event) => {
        assertProductSender(event);
        await openUpdatePrompt();
    });
    let promptOperation;
    let policyAuthenticationQueued = false;
    const openUpdatePrompt = (manual = false) => {
        if (authenticationOperation !== undefined) {
            policyAuth?.focus();
            updateDialog.focus();
        }
        let failedOperation = 'check';
        promptOperation ??= Promise.resolve().then(async () => {
            if (manual)
                updateJournal?.action('check-requested');
            const joinedPolicyAuthentication = authenticationOperation !== undefined;
            if (joinedPolicyAuthentication)
                await authenticatePolicy();
            if (isMandatory()) {
                mandatoryUI?.focus();
                if (manual)
                    await Promise.all([checkPolicyManually(), updateSchedule.check(true)]);
                return;
            }
            let controller;
            let progress;
            try {
                let state = updates.state;
                if (manual || state.phase === 'idle' || (state.phase === 'error' && state.failedOperation === 'check')) {
                    controller = new AbortController();
                    ordinaryDialogs.add(controller);
                    const parent = currentDialogWindow();
                    progress = parent === undefined ? Promise.resolve() : updateDialog.show(parent, {
                        type: 'info', title: locale.messages.updateCheckTitle,
                        message: locale.messages.updateChecking, buttons: [locale.messages.later], cancelId: 0, signal: controller.signal,
                    });
                    if (!joinedPolicyAuthentication) {
                        void checkPolicyManually('deferred').catch((error) => { console.error(error); });
                    }
                    state = await updateSchedule.check(true);
                }
                if (isMandatory()) {
                    mandatoryUI?.focus();
                    return;
                }
                if (state.phase === 'error' && state.failedOperation === 'check') {
                    await showUpdateFailure(state);
                    return;
                }
                if (state.phase === 'idle') {
                    await ordinaryMessageBox({ type: 'info', title: locale.messages.updateCheckTitle,
                        message: locale.messages.updateCurrent,
                        detail: formatDesktopMessage(locale.messages.updateCurrentDetail, { version: app.getVersion() }) });
                    return;
                }
                if (state.phase === 'ready' || (state.phase === 'error' && state.failedOperation === 'install')) {
                    if (state.version !== undefined) {
                        failedOperation = 'install';
                        await showUpdateFailure(await updates.install(state.version));
                    }
                    return;
                }
                if (state.phase !== 'available' && !(state.phase === 'error' && state.failedOperation === 'download'))
                    return;
                if (manual) {
                    const result = await ordinaryMessageBox({ title: locale.messages.updateCheckTitle,
                        message: formatDesktopMessage(locale.messages.updateAvailable, { version: state.version ?? '' }),
                        detail: locale.messages.updateDetail,
                        buttons: [locale.messages.updateDownload], cancelId: 1 });
                    if (result.response !== 0)
                        return;
                }
                if (!isMandatory() && state.version !== undefined) {
                    controller?.abort();
                    failedOperation = 'download';
                    await showUpdateFailure(await downloadUpdate(state.version));
                }
            }
            finally {
                controller?.abort();
                if (controller !== undefined)
                    ordinaryDialogs.delete(controller);
                await progress;
            }
        }).catch((error) => showUpdateFailure({ phase: 'error', failedOperation,
            message: desktopErrorState(error).message }))
            .finally(() => { promptOperation = undefined; flushQueuedPolicyAuthentication(); });
        return promptOperation;
    };
    let authenticationOperation;
    const authenticatePolicy = () => {
        if (authenticationOperation !== undefined) {
            policyAuth?.focus();
            updateDialog.focus();
        }
        authenticationOperation ??= runPolicyAuthentication().finally(() => { authenticationOperation = undefined; });
        return authenticationOperation;
    };
    const flushQueuedPolicyAuthentication = () => {
        if (!policyAuthenticationQueued || promptOperation !== undefined || authenticationOperation !== undefined
            || isMandatory() || quitting)
            return;
        policyAuthenticationQueued = false;
        void authenticatePolicy().catch((error) => { console.error(error); });
    };
    const queuePolicyAuthentication = () => {
        if (!desktopSettings.updates.allowTestAuthPopupWindow)
            return;
        if (authenticationOperation !== undefined) {
            policyAuth?.focus();
            updateDialog.focus();
            return;
        }
        policyAuthenticationQueued = true;
        flushQueuedPolicyAuthentication();
    };
    const runPolicyAuthentication = async () => {
        if (!desktopSettings.updates.allowTestAuthPopupWindow
            || policyAuth === undefined || mandatoryPolicy === undefined || quitting)
            return undefined;
        const parent = mandatoryUI?.confirmationWindow ?? currentDialogWindow();
        if (parent === undefined)
            return undefined;
        const consent = await updateDialog.show(parent, { type: 'info', title: locale.messages.policyLoginTitle,
            message: locale.messages.policyLoginRequired, buttons: [locale.messages.policyLogin, locale.messages.later], cancelId: 1 });
        if (consent.response !== 0 || isQuitting())
            return undefined;
        const outcome = await policyAuth.login();
        if (isQuitting() || outcome === 'cancelled')
            return undefined;
        if (outcome === 'failed') {
            await updateDialog.show(parent, { type: 'error', title: locale.messages.policyLoginTitle,
                message: locale.messages.policyLoginFailed, buttons: [locale.messages.updateAcknowledge], cancelId: 0 });
            return undefined;
        }
        // Drain a pre-login request before asking the server to evaluate the new cookies.
        await mandatoryPolicy.check('login-return');
        if (isQuitting())
            return undefined;
        return mandatoryPolicy.check('login-return', true);
    };
    const checkPolicyManually = async (authentication = 'immediate') => {
        if (authenticationOperation !== undefined)
            return authenticatePolicy();
        const policy = await mandatoryPolicy?.check('manual', true);
        if (policy?.error !== 'authentication-required' || !desktopSettings.updates.allowTestAuthPopupWindow)
            return policy;
        if (authentication === 'immediate')
            return authenticatePolicy();
        queuePolicyAuthentication();
        return policy;
    };
    const automaticCheck = () => {
        if (!quitting)
            void mandatoryPolicy?.check('foreground-or-resume').catch((error) => { console.error(error); });
        if (!quitting)
            void updateSchedule.check().catch((error) => { console.error(error); });
    };
    powerMonitor.on('resume', automaticCheck);
    app.on('will-quit', () => {
        updateSchedule.dispose();
        powerMonitor.off('resume', automaticCheck);
        updates.dispose();
    });
    const applicationIconPath = development ? join(app.getAppPath(), 'resources', 'icon-windows.png')
        : join(process.resourcesPath, 'icon.png');
    app.setAboutPanelOptions({
        applicationName: 'StudyBuddy',
        applicationVersion: app.getVersion(),
        // The release has no separate build number; omit Electron's bundle version.
        version: '',
        copyright: '',
        iconPath: applicationIconPath,
    });
    // A custom application menu replaces Electron's default menu, so macOS needs
    // its standard menus and application hide commands declared explicitly.
    // Keep app.name stable: Electron derives its default userData directory from it.
    const darwin = process.platform === 'darwin';
    const platformMenus = () => darwin
        ? [shortcuts.fileMenu(currentDesktopLocale().messages), { role: 'editMenu' }, { role: 'windowMenu' }]
        : [{ role: 'editMenu' }];
    const hideCommands = darwin
        ? [{ role: 'hide', label: currentDesktopLocale().messages.hideApplication },
            { role: 'hideOthers', label: currentDesktopLocale().messages.hideOtherApplications },
            { role: 'unhide', label: currentDesktopLocale().messages.showAllApplications }, { type: 'separator' }]
        : [];
    const applicationItems = () => [
        // Windows has no system About panel; Electron's fallback is a plain
        // message box, so the shell shows its own dimmed dialog instead.
        process.platform === 'win32'
            ? { label: currentDesktopLocale().messages.aboutMenu,
                click: () => { void showAbout().catch((error) => { console.error(error); }); } }
            : { label: currentDesktopLocale().messages.aboutMenu, role: 'about' },
        { type: 'separator' },
        { label: currentDesktopLocale().messages.checkUpdatesMenu, click: () => { void openUpdatePrompt(true); } },
        ...process.platform === 'darwin' || process.platform === 'win32'
            ? [{ label: currentDesktopLocale().messages.cliCommandMenu, click: () => { void commandManager.show(); } }] : [],
        ...development ? [
            { type: 'separator' },
            { label: currentDesktopLocale().messages.reloadPageMenu, role: 'reload' },
            { label: currentDesktopLocale().messages.restartAppHostMenu, click: () => {
                    if (quitting)
                        return;
                    app.relaunch();
                    quitWithoutConfirmation();
                } },
        ] : [],
        { type: 'separator' },
        ...hideCommands,
        { role: 'quit', ...(darwin ? { label: currentDesktopLocale().messages.quitApplication }
                : process.platform === 'win32' ? { label: currentDesktopLocale().messages.exitApplication } : {}) },
    ];
    const devToolsItems = [
        { role: 'toggleDevTools', visible: false },
        { role: 'toggleDevTools', visible: false, accelerator: 'F12' },
    ];
    const refreshApplicationMenu = () => {
        Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'win32' ? devToolsItems : [{
                label: darwin ? app.name : currentDesktopLocale().messages.application,
                submenu: [...applicationItems(), ...devToolsItems],
            }, ...platformMenus()]));
        tray?.relabel();
    };
    refreshApplicationMenu();
    const trayIconPath = development ? join(app.getAppPath(), 'resources', 'tray-windows.ico') : join(process.resourcesPath, 'tray.ico');
    if (process.platform === 'win32') {
        // The tray is the way back to a hidden window; without it, relaunching the application still focuses it.
        try {
            tray = new DesktopTray({ iconPath: trayIconPath, locale: currentDesktopLocale,
                open: () => { focusPrimaryWindow(); }, quit: () => { app.quit(); } });
        }
        catch (error) {
            console.warn('desktop tray: unavailable', error);
        }
    }
    const backgroundNotice = process.platform === 'win32'
        ? new DesktopBackgroundNotice({ markerPath: join(app.getPath('userData'), 'background-close-confirmed'),
            locale: () => locale, show: ordinaryMessageBox, focus: () => { updateDialog.focus(); } })
        : undefined;
    const quitConfirmation = new DesktopQuitConfirmation({
        locale: () => locale,
        inspect: () => backend.host?.inspectQuit(),
        // No owner window: a hidden window stays hidden and the native box is its own top-level window.
        show: options => dialog.showMessageBox(options),
        // macOS raises the open alert with the application; Electron exposes no handle to the Windows task
        // dialog, so a repeated request there only joins the open decision.
        focus: () => { if (process.platform === 'darwin')
            app.focus({ steal: true }); },
        // The task dialog draws its main icon at the system icon size; the multi-size ICO yields that
        // size directly, where the 1024 px PNG would be scaled down by GDI.
        ...(process.platform === 'win32' ? { icon: nativeImage.createFromPath(trayIconPath) } : {}),
    });
    if (process.platform === 'win32') {
        ipcMain.handle(DESKTOP_IPC.windowsMenu, (event, name, x, y) => {
            assertDesktopSender(event, ['app']);
            if (mainWindow === undefined || event.sender !== mainWindow.webContents
                || event.senderFrame !== mainWindow.webContents.mainFrame)
                throw new Error('desktop menu: rejected sender');
            if ((name !== 'application' && name !== 'edit')
                || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
                || x < 0 || y < 0 || x > 100_000 || y > 100_000)
                throw new Error('desktop menu: invalid popup request');
            const window = mainWindow;
            // Editor-owned history listens to key events rather than Chromium's native undo stack.
            const editItem = (label, keyCode, modifiers, accelerator) => ({
                label,
                ...(accelerator === undefined ? {} : { accelerator }),
                click: () => {
                    shortcuts.sendEditingKey(keyCode, modifiers);
                },
            });
            const items = name === 'application' ? applicationItems() : [
                editItem(currentDesktopLocale().messages.undo, 'Z', ['control'], 'Ctrl+Z'),
                editItem(currentDesktopLocale().messages.redo, 'Y', ['control'], 'Ctrl+Y'),
                { type: 'separator' },
                editItem(currentDesktopLocale().messages.cut, 'X', ['control'], 'Ctrl+X'),
                editItem(currentDesktopLocale().messages.copy, 'C', ['control'], 'Ctrl+C'),
                editItem(currentDesktopLocale().messages.paste, 'V', ['control'], 'Ctrl+V'),
                editItem(currentDesktopLocale().messages.delete, 'Delete', []),
                { type: 'separator' },
                editItem(currentDesktopLocale().messages.selectAll, 'A', ['control'], 'Ctrl+A'),
            ];
            const zoom = mainWindow.webContents.getZoomFactor();
            return new Promise((resolve) => {
                Menu.buildFromTemplate(items).popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve });
            });
        });
        ipcMain.on(DESKTOP_IPC.windowsAppearance, (event, language, color, symbolColor) => {
            if (mainWindow === undefined || event.sender !== mainWindow.webContents
                || event.senderFrame !== mainWindow.webContents.mainFrame)
                return;
            if (!event.senderFrame.url.startsWith(`${SCHEME}://app/`))
                return;
            if (typeof language === 'string' && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) {
                windowsLanguage = language;
            }
            // Empty colors precede client stylesheet installation; only CSS color values cross IPC.
            const validColor = (value) => typeof value === 'string'
                && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value);
            if (validColor(color) && validColor(symbolColor))
                mainWindow.setTitleBarOverlay({ color, symbolColor });
        });
    }
    const hideMainWindow = (window) => {
        if (!enteredWorkspace)
            initialLoadingDismissed = true;
        if (process.platform === 'darwin' && window.isFullScreen()) {
            // Hiding a fullscreen window leaves an empty black space; leave fullscreen first.
            window.once('leave-full-screen', () => { if (!window.isDestroyed())
                window.hide(); });
            window.setFullScreen(false);
        }
        else {
            window.hide();
        }
    };
    const createMainWindow = () => {
        const window = createWindow(appPreload, false, true);
        mainWindow = window;
        browserGuests.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name), (src, partition) => studybuddyEmbedded.recognizes(window.webContents, src, partition)
            || studybuddyCommunity.recognizes(window.webContents, src, partition) || studybuddyAigc.recognizes(window.webContents, src, partition) || studybuddyResearch.recognizes(window.webContents, src, partition) || studybuddyVideo.recognizes(window.webContents, src, partition));
        studybuddyEmbedded.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name), (src, partition) => browserGuests.recognizes(window.webContents, src, partition)
            || studybuddyCommunity.recognizes(window.webContents, src, partition) || studybuddyAigc.recognizes(window.webContents, src, partition) || studybuddyResearch.recognizes(window.webContents, src, partition) || studybuddyVideo.recognizes(window.webContents, src, partition));
        studybuddyCommunity.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name), (src, partition) => browserGuests.recognizes(window.webContents, src, partition)
            || studybuddyEmbedded.recognizes(window.webContents, src, partition) || studybuddyAigc.recognizes(window.webContents, src, partition) || studybuddyResearch.recognizes(window.webContents, src, partition) || studybuddyVideo.recognizes(window.webContents, src, partition));
        studybuddyAigc.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name), (src, partition) => browserGuests.recognizes(window.webContents, src, partition)
            || studybuddyEmbedded.recognizes(window.webContents, src, partition) || studybuddyCommunity.recognizes(window.webContents, src, partition) || studybuddyResearch.recognizes(window.webContents, src, partition) || studybuddyVideo.recognizes(window.webContents, src, partition));
        studybuddyResearch.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name), (src, partition) => browserGuests.recognizes(window.webContents, src, partition) || studybuddyEmbedded.recognizes(window.webContents, src, partition)
            || studybuddyCommunity.recognizes(window.webContents, src, partition) || studybuddyAigc.recognizes(window.webContents, src, partition) || studybuddyVideo.recognizes(window.webContents, src, partition));
        studybuddyVideo.bind(window, (guest, name) => shortcuts.attachGuest(window, guest, name), (src, partition) => browserGuests.recognizes(window.webContents, src, partition) || studybuddyEmbedded.recognizes(window.webContents, src, partition) || studybuddyCommunity.recognizes(window.webContents, src, partition) || studybuddyAigc.recognizes(window.webContents, src, partition) || studybuddyResearch.recognizes(window.webContents, src, partition));
        shortcuts.attach(window);
        window.on('focus', automaticCheck);
        // Closing hides: the page and the Host keep running, and the next show resumes the same document.
        window.on('close', (event) => {
            if (quitting || shellInstallerOwnsQuit || sessionEnding)
                return;
            event.preventDefault();
            if (updateDialog.isOpen) {
                updateDialog.focus();
                return;
            }
            const hide = () => {
                if (!quitting && !shellInstallerOwnsQuit && !sessionEnding && !window.isDestroyed())
                    hideMainWindow(window);
            };
            if (backgroundNotice === undefined)
                hide();
            else
                backgroundNotice.close(hide);
        });
        if (process.platform === 'win32') {
            // Shutdown, restart, and log-off must not wait on a confirmation. query-session-end is only a
            // question that another application can veto without any follow-up message, so it does not count.
            window.on('session-end', () => { sessionEnding = true; });
        }
        else {
            // The macOS power-off notification arrives before the terminate request; a cancelled shutdown
            // leaves the process running, and user attention on the window shows the session continues.
            window.on('focus', () => { sessionEnding = false; });
            window.on('show', () => { sessionEnding = false; });
        }
        window.on('closed', () => { if (mainWindow === window)
            mainWindow = undefined; });
        window.webContents.on('console-message', (details) => {
            if (details.level !== 'error')
                return;
            rendererConsole.push(`${details.sourceId}:${String(details.lineNumber)} ${details.message}`);
        });
        window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
            if (isMainFrame && code !== -3 && !quitting && !window.isDestroyed()) {
                reportFatal(new Error(`Desktop page failed to load: ${url} (${String(code)}: ${description})`), 'renderer');
            }
        });
        window.webContents.on('preload-error', (_event, _path, error) => {
            if (!quitting && !window.isDestroyed())
                reportFatal(error, 'renderer');
        });
        window.webContents.on('render-process-gone', (_event, details) => {
            navigation = undefined;
            if (!quitting && !window.isDestroyed() && details.reason !== 'clean-exit') {
                reportFatal(new Error(`Desktop renderer exited: ${details.reason}`), 'renderer');
            }
        });
        return window;
    };
    const enterWorkspace = async ({ activate = true } = {}) => {
        if (quitting)
            return;
        const window = mainWindow ?? createMainWindow();
        await navigateMain(applicationUrl);
        if (isQuitting() || recovery.active || window.isDestroyed())
            return;
        const reveal = enteredWorkspace || !initialLoadingDismissed;
        initialLoadingDismissed = false;
        if (reveal) {
            if (activate)
                window.show();
            else
                window.showInactive();
        }
        enteredWorkspace = true;
        if (welcomeWindow !== undefined) {
            welcomeWindow.close();
            window.webContents.send(DESKTOP_IPC.enterWorkspace);
        }
        welcomeWindow = undefined;
        if (raiseAfterUpdate) {
            raiseAfterUpdate = false;
            if (reveal) {
                window.moveTop();
                window.focus();
            }
        }
        if (reveal && activate && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS !== '0') {
            window.webContents.openDevTools({ mode: 'detach' });
        }
    };
    let openingWelcome;
    const showWelcome = () => {
        if (quitting)
            return Promise.resolve();
        if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed()) {
            welcomeWindow.show();
            welcomeWindow.focus();
            return Promise.resolve();
        }
        openingWelcome ??= (async () => {
            welcomeWindow = await openStudyBuddyLogin(locale, (window) => { welcomeWindow = window; });
            const window = welcomeWindow;
            window.once('closed', () => {
                if (welcomeWindow === window)
                    welcomeWindow = undefined;
                if (!enteredWorkspace && !quitting && !recovery.active)
                    app.quit();
            });
            if (isQuitting() || recovery.active || enteredWorkspace)
                window.close();
            else
                mainWindow?.hide();
        })().finally(() => { openingWelcome = undefined; });
        return openingWelcome;
    };
    const openInitialWindow = async () => {
        if (quitting || recovery.active)
            return;
        locale = resolveDesktopStartupLocale(null, systemLanguages);
        windowsLanguage = locale.id;
        refreshApplicationMenu();
        if (studybuddy.state.phase !== 'authenticated') {
            // A later login must retain its own activation policy instead of replaying startup focus.
            raiseAfterUpdate = false;
            await showWelcome();
        }
        else {
            await enterWorkspace();
        }
    };
    focusPrimaryWindow = () => {
        if (quitting)
            return;
        if (isMandatory()) {
            mandatoryUI?.focus();
            return;
        }
        const window = welcomeWindow ?? mainWindow;
        if (window === undefined || window.isDestroyed()) {
            try {
                createMainWindow();
            }
            catch (error) {
                reportFatal(error, 'main');
                return;
            }
            void (backend.state.phase === 'ready' ? openInitialWindow() : navigateMain(applicationUrl)).catch((error) => { reportFatal(error, 'main'); });
            return;
        }
        // Startup and sign-out select the visible window before activation may reveal the workspace.
        if (window === mainWindow && !enteredWorkspace)
            return;
        if (window.isMinimized())
            window.restore();
        window.show();
        window.focus();
    };
    if (app.isPackaged || process.env.DSH_DESKTOP_DEV_APP === '1')
        app.setAsDefaultProtocolClient('studybuddy');
    app.on('open-url', (event, url) => {
        event.preventDefault();
        if (url === 'studybuddy://open' || url === 'studybuddy://open/')
            focusPrimaryWindow();
    });
    app.on('activate', (_event, hasVisibleWindows) => {
        if (!hasVisibleWindows)
            focusPrimaryWindow();
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin')
            app.quit();
    });
    if (process.platform !== 'win32')
        powerMonitor.on('shutdown', () => { sessionEnding = true; });
    const finishQuit = () => {
        quitting = true;
        shuttingDown = true;
        updateJournal?.action('quit-requested');
        quitConfirmation.dispose();
        backgroundNotice?.dispose();
        tray?.dispose();
        stopAccount?.();
        if (welcomeWindow !== undefined && !welcomeWindow.isDestroyed())
            welcomeWindow.hide();
        if (mainWindow !== undefined && !mainWindow.isDestroyed())
            mainWindow.hide();
        updateSchedule.dispose();
        updateDialog.dispose();
        mandatoryUI?.dispose();
        void settleCleanup([
            startupCatalogs,
            catalogSync.dispose(),
            Promise.resolve(mandatoryPolicy?.dispose()).then(() => policyAuth?.dispose()),
            studybuddyAigc.revoke(), studybuddyResearch.revoke(), studybuddyVideo.revoke(), skillSafety?.dispose(), backend.close(), toolViews.dispose(), studybuddyNative.dispose(), studybuddyEmbedded.revoke(), studybuddyCommunity.revoke(),
            // A Platform cleanup failure is logged without cutting the remaining Host shutdown short.
            platformView.dispose().catch((error) => { console.error(error); })
        ])
            .catch((error) => { console.error(error); }).finally(() => { app.quit(); });
    };
    app.on('before-quit', (event) => {
        if (shellInstallerOwnsQuit) {
            shuttingDown = true;
            quitConfirmation.dispose();
            backgroundNotice?.dispose();
            updateJournal?.action('quit-requested');
            tray?.dispose();
            updateDialog.dispose();
            mandatoryUI?.dispose();
            // Installation preparation already awaited Platform storage cleanup.
            void platformView.dispose().catch((error) => { console.error(error); });
            return;
        }
        if (quitting)
            return;
        event.preventDefault();
        if (skipQuitConfirmation || sessionEnding) {
            finishQuit();
            return;
        }
        void quitConfirmation.confirm().then((approved) => {
            if (quitting || shellInstallerOwnsQuit)
                return;
            if (approved) {
                finishQuit();
                return;
            }
            // A quit that started from closing the welcome window destroyed it; a cancelled quit needs it back.
            if (!enteredWorkspace && !recovery.active)
                void showWelcome().catch((error) => { reportFatal(error, 'main'); });
        }).catch((error) => { console.error(error); if (!quitting && !shellInstallerOwnsQuit)
            finishQuit(); });
    });
    const manifest = JSON.parse(await readFile(join(app.getAppPath(), 'package.json'), 'utf8'));
    if (typeof manifest !== 'object' || manifest === null)
        throw new Error('desktop policy: invalid application manifest');
    const developmentPolicy = app.isPackaged ? undefined : process.env.DSH_DESKTOP_MANDATORY_UPDATE_CONFIG;
    const policyInput = app.isPackaged
        ? ('dshMandatoryUpdatePolicy' in manifest ? manifest.dshMandatoryUpdatePolicy : undefined)
        : developmentPolicy === undefined ? undefined : JSON.parse(developmentPolicy);
    const policyConfig = resolveDesktopPolicyConfig(policyInput, !app.isPackaged);
    // Resolve configuration before loading the renderer. Its preload requests
    // status immediately, so both configured and unconfigured shells need a reply.
    mainWindow = createMainWindow();
    if (policyConfig !== undefined) {
        if (policyConfig.authentication === 'feishu-test') {
            policyAuth = new DesktopPolicyTestAuth(policyConfig.origin, policyConfig.allowedAuthOrigins, locale, () => mandatoryUI?.confirmationWindow ?? currentDialogWindow(), (event) => { console.info(`desktop policy authentication: ${event}`); updateJournal?.action(`policy-login-${event}`); });
        }
        if (!['win32', 'darwin'].includes(process.platform) || !['x64',
            'arm64'].includes(process.arch))
            throw new Error('desktop policy: unsupported platform');
        let wasBlocking = false;
        mandatoryPolicy = new DesktopMandatoryUpdatePolicy(policyConfig, {
            platform: process.platform, arch: process.arch,
            channel: 'latest',
            bundledDshVersion: app.isPackaged ? readDesktopRuntime(resources.dsh).release.version : app.getVersion(),
        }, (state) => {
            if (state.error !== 'authentication-required')
                policyAuthenticationQueued = false;
            if (state.blocking) {
                for (const controller of ordinaryDialogs)
                    controller.abort();
                if (!wasBlocking)
                    updateDialog.cancel();
            }
            mandatoryUI?.sync();
            if (state.blocking && !wasBlocking)
                void updateSchedule.check(false, true).catch((error) => { console.error(error); });
            wasBlocking = state.blocking;
        }, policyAuth?.request, () => desktopClientMetadata(locale.id));
        const policy = mandatoryPolicy;
        mandatoryUI = new DesktopMandatoryUpdateWindow({
            overlays: updateOverlays,
            preload: fileURLToPath(new URL('./preload-mandatory.cjs', import.meta.url)), locale,
            allowedPageOrigins: policyConfig.allowedPageOrigins, parent: () => mainWindow,
            policy: () => policy.state, update: () => updates.state,
            refresh: async () => { await Promise.all([checkPolicyManually(), updateSchedule.check(true)]); },
            download: downloadUpdate, install: version => updates.install(version),
        });
        void mandatoryPolicy.check('launch').then((state) => {
            if (app.isPackaged && state.error === 'authentication-required' && !isQuitting())
                queuePolicyAuthentication();
        }).catch((error) => { console.error(error); });
    }
    else {
        mandatoryUI = new DesktopMandatoryUpdateWindow({
            overlays: updateOverlays,
            preload: fileURLToPath(new URL('./preload-mandatory.cjs', import.meta.url)), locale,
            allowedPageOrigins: [], parent: () => mainWindow,
            policy: () => ({ blocking: false, checking: false }), update: () => updates.state,
            refresh: async () => { }, download: downloadUpdate, install: version => updates.install(version),
        });
    }
    automaticCheck();
    const initialWorkspaceStartup = (async () => {
        await initialAccountReady;
        if (isQuitting() || recovery.active)
            return;
        startStudyBuddySubscription();
        if (studybuddy.state.phase === 'authenticated') {
            const starting = reconcileBackend();
            initialBackendStarting.resolve();
            await starting.catch(() => undefined);
        }
        else {
            initialBackendStarting.resolve();
            await showWelcome();
        }
    })();
    await Promise.all([
        initialWorkspaceStartup,
        (async () => {
            await navigateMain(applicationUrl);
            if (studybuddy.state.phase === 'starting' && !isQuitting() && !recovery.active
                && mainWindow !== undefined && !mainWindow.isDestroyed())
                mainWindow.show();
        })(),
    ]);
    // Window lifecycle callbacks run while backend startup is pending.
    if (isQuitting())
        return;
    const window = currentMainWindow();
    if (window !== undefined && development && process.env.DSH_DESKTOP_OPEN_DEVTOOLS === '1') {
        window.webContents.openDevTools({ mode: 'detach' });
    }
    publishUpdate(updateState);
}
const ownsDesktopInstance = claimDesktopSingleInstance(app, () => { focusPrimaryWindow(); });
if (ownsDesktopInstance)
    void app.whenReady().then(main).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(error);
        const diagnosticFile = process.env.DSH_DESKTOP_DIAGNOSTIC_FILE;
        if (diagnosticFile !== undefined) {
            await writeFile(diagnosticFile, `${error instanceof Error ? error.stack ?? message : message}\n`).catch(() => undefined);
        }
        reportFatal(error, 'main');
    }).catch((error) => {
        console.error(error);
        app.exit(1);
    });
//# sourceMappingURL=main.js.map