/** Origin-scoped boot, native directory selection, host paths of picked files, and update presentation with native confirmation actions. */
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { DESKTOP_IPC, SCHEME } from "./ipc.js";
import { PLATFORM_IPC } from "./platform-ipc.js";
import { markDocumentPlatform, syncWindowFullscreen } from "./preload-platform.js";
import { syncNativeTheme } from "./preload-theme.js";
import { syncWindowsAppearance } from "./preload-windows.js";
import { installMandatoryUpdateOverlay } from "./preload-mandatory-overlay.js";
import { createDesktopBrowserBridge } from "./preload-browser.js";
import { exposeStudyBuddy } from "./studybuddy/preload.js";
import { createDesktopImageBridge, installImageContextMenu } from "./preload-images.js";
exposeStudyBuddy();
function createProductApi() {
    return {
        protocolVersion: 1,
        images: createDesktopImageBridge(),
        browser: createDesktopBrowserBridge(),
        deviceInfo: () => ipcRenderer.invoke(DESKTOP_IPC.deviceInfo),
        keyboard: {
            closeWindow: revision => ipcRenderer.invoke(DESKTOP_IPC.shortcutsCloseWindow, revision),
            subscribe: (listener) => {
                const handle = (_event, input) => {
                    if (input.kind === 'iframe') {
                        const element = document.activeElement;
                        if (!(element instanceof HTMLIFrameElement) || !element.isConnected
                            || !element.matches('iframe[data-sidebar-browser-frame], iframe[data-html-preview]'))
                            return;
                        if (input.frameName === '' || element.name !== input.frameName)
                            return;
                    }
                    if (input.kind === 'webview') {
                        const element = document.activeElement;
                        if (element?.matches('webview[data-sidebar-browser-frame]') !== true || !element.isConnected
                            || input.frameName === '' || element.getAttribute('name') !== input.frameName)
                            return;
                    }
                    listener(input);
                };
                ipcRenderer.on(DESKTOP_IPC.shortcutsInput, handle);
                return () => { ipcRenderer.off(DESKTOP_IPC.shortcutsInput, handle); };
            },
        },
        shortcuts: {
            get: definitions => ipcRenderer.invoke(DESKTOP_IPC.shortcutsGet, definitions),
            edit: (edit, revision) => ipcRenderer.invoke(DESKTOP_IPC.shortcutsEdit, edit, revision),
            recording: active => ipcRenderer.invoke(DESKTOP_IPC.shortcutsRecording, active),
            subscribe(listener) {
                const handle = (_event, snapshot) => { listener(snapshot); };
                ipcRenderer.on(DESKTOP_IPC.shortcutsChanged, handle);
                return () => { ipcRenderer.off(DESKTOP_IPC.shortcutsChanged, handle); };
            },
        },
        updates: {
            status: () => ipcRenderer.invoke(DESKTOP_IPC.updatesStatus),
            open: () => ipcRenderer.invoke(DESKTOP_IPC.updatesOpen),
            subscribe(listener) {
                const handle = (_event, state) => { listener(state); };
                ipcRenderer.on(DESKTOP_IPC.updatesPresentation, handle);
                return () => { ipcRenderer.off(DESKTOP_IPC.updatesPresentation, handle); };
            },
        },
    };
}
if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
    contextBridge.exposeInMainWorld('dshOnboarding', {
        hasApiKey: () => ipcRenderer.invoke(DESKTOP_IPC.onboardingApiKey),
        setActive: (active) => { ipcRenderer.send(DESKTOP_IPC.onboardingActive, active); },
    });
    ipcRenderer.on(DESKTOP_IPC.enterWorkspace, () => {
        const body = document.body;
        const previous = body.getAttribute('tabindex');
        body.tabIndex = -1;
        body.focus({ preventScroll: true });
        if (previous === null)
            body.removeAttribute('tabindex');
        else
            body.setAttribute('tabindex', previous);
    });
    syncWindowsAppearance();
    if (process.platform === 'win32')
        installMandatoryUpdateOverlay();
    contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', {
        pick: () => ipcRenderer.invoke(DESKTOP_IPC.directoryPick),
    });
    // The composer cites dropped, picked, and pasted files and folders that
    // have a real path as `@path` references instead of uploading them; a
    // File without one (pasted bytes) answers '' and uploads as before.
    contextBridge.exposeInMainWorld('__DSH_HOST_PATHS__', {
        pathFor: (file) => webUtils.getPathForFile(file),
    });
    contextBridge.exposeInMainWorld('dshDesktopBoot', {
        ready: () => ipcRenderer.invoke(DESKTOP_IPC.boot),
        failed: (message) => ipcRenderer.invoke(DESKTOP_IPC.bootFailed, message),
    });
    contextBridge.exposeInMainWorld('dshPlatform', {
        open: (page, bounds) => ipcRenderer.invoke(PLATFORM_IPC.open, page, bounds),
        setBounds: (bounds) => ipcRenderer.invoke(PLATFORM_IPC.bounds, bounds),
        close: () => ipcRenderer.invoke(PLATFORM_IPC.close),
    });
}
markDocumentPlatform();
if (location.protocol === `${SCHEME}:` && location.hostname === 'app' && process.isMainFrame)
    installImageContextMenu();
syncWindowFullscreen();
syncNativeTheme();
// Main-process IPC also verifies the owning window and top frame.
contextBridge.exposeInMainWorld('dshDesktop', location.protocol === `${SCHEME}:` && location.hostname === 'app' && process.isMainFrame ? createProductApi() : { protocolVersion: 1 });
if (location.protocol === `${SCHEME}:` && location.hostname === 'app') {
    contextBridge.exposeInMainWorld('__DSH_LOCALE__', {
        read: () => ipcRenderer.invoke(DESKTOP_IPC.localeBootstrap),
        onChange: (locale) => { ipcRenderer.send(DESKTOP_IPC.localeChanged, locale); },
    });
}
//# sourceMappingURL=preload-app.js.map