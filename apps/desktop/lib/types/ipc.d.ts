/** Typed preload operations exposed only by the Electron shell. */
import type { DesktopKeyboardApi, DesktopShortcutsApi } from '@deepseek-ai/dsh-client-shortcuts/protocol';
import type { IpcMainInvokeEvent } from 'electron';
import type { DesktopBrowserBridge } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types';
/** IPC channel names kept private to the desktop application bundle. */
export declare const DESKTOP_IPC: {
    readonly imageContext: "dsh-desktop:image-context";
    readonly imageAction: "dsh-desktop:image-action";
    readonly shortcutsInput: "dsh-desktop:shortcuts-input";
    readonly shortcutsCloseWindow: "dsh-desktop:shortcuts-close-window";
    readonly shortcutsGet: "dsh-desktop:shortcuts-get";
    readonly shortcutsEdit: "dsh-desktop:shortcuts-edit";
    readonly shortcutsChanged: "dsh-desktop:shortcuts-changed";
    readonly shortcutsRecording: "dsh-desktop:shortcuts-recording";
    readonly boot: "dsh-desktop:boot";
    readonly enterWorkspace: "dsh-desktop:enter-workspace";
    readonly onboardingActive: "dsh-desktop:onboarding-active";
    readonly onboardingApiKey: "dsh-desktop:onboarding-api-key";
    readonly bootFailed: "dsh-desktop:boot-failed";
    readonly browserAcquire: "dsh-desktop:browser-acquire";
    readonly browserRelease: "dsh-desktop:browser-release";
    readonly browserOpenRequested: "dsh-desktop:browser-open-requested";
    readonly directoryPick: "dsh-desktop:directory-pick";
    readonly deviceInfo: "dsh-desktop:device-info";
    readonly localeBootstrap: "dsh-desktop:locale-bootstrap";
    readonly localeChanged: "dsh-desktop:locale-changed";
    readonly updatesStatus: "dsh-desktop:updates-status";
    readonly updatesOpen: "dsh-desktop:updates-open";
    readonly updatesPresentation: "dsh-desktop:updates-presentation";
    readonly nativeThemeSet: "dsh-desktop:native-theme-set";
    readonly windowFullscreen: "dsh-desktop:window-fullscreen";
    readonly windowsAppearance: "dsh-desktop:windows-appearance";
    readonly windowsMenu: "dsh-desktop:windows-menu";
};
/** Desktop release update state rendered by desktop-owned UI. */
export type DesktopUpdatePreparationFailureKind = 'stop-failed' | 'tasks-changed' | 'tasks-unavailable';
export interface DesktopUpdateState {
    readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error';
    readonly version?: string;
    readonly message?: string;
    /** Main-owned diagnostics without subprocess output or credentials; hidden until expanded. */
    readonly technicalDetails?: string;
    readonly percent?: number;
    readonly failedOperation?: 'check' | 'download' | 'install';
    /** Main-owned preparation cause; UI wording is selected by the active locale. */
    readonly preparationFailure?: DesktopUpdatePreparationFailureKind;
}
/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind = 'check' | 'check-network' | 'download' | 'download-network' | 'install' | 'install-network' | 'stop-failed' | 'tasks-changed' | 'tasks-unavailable';
/** Semantic status content; actions open main-process confirmation dialogs only. */
export interface DesktopUpdatePresentation {
    readonly phase: DesktopUpdateState['phase'];
    readonly version?: string;
    readonly percent?: number;
    readonly failure?: DesktopUpdateFailureKind;
}
/** Product documents cannot supply update versions, package URLs, or installation authorization. */
export interface DshDesktopProductApi {
    readonly protocolVersion: 1;
    readonly images: import('@deepseek-ai/dsh-client-ui-tool').DesktopImageBridge;
    readonly browser: DesktopBrowserBridge;
    readonly keyboard: DesktopKeyboardApi;
    readonly shortcuts: DesktopShortcutsApi;
    /**
     * Local machine description for the feedback questionnaire.
     * @returns `name=value` fields separated by `; `, with no hostname, user name, or serial number.
     */
    deviceInfo(): Promise<string>;
    readonly updates: {
        status(): Promise<DesktopUpdatePresentation>;
        open(): Promise<void>;
        subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void;
    };
}
/** Scheme of Desktop-owned application documents. */
export declare const SCHEME = "dsh-app";
/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export declare function assertDesktopSender(event: IpcMainInvokeEvent, hostnames: readonly string[]): void;
//# sourceMappingURL=ipc.d.ts.map