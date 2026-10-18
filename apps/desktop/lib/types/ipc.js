/** Typed preload operations exposed only by the Electron shell. */
/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
    imageContext: 'dsh-desktop:image-context',
    imageAction: 'dsh-desktop:image-action',
    shortcutsInput: 'dsh-desktop:shortcuts-input',
    shortcutsCloseWindow: 'dsh-desktop:shortcuts-close-window',
    shortcutsGet: 'dsh-desktop:shortcuts-get',
    shortcutsEdit: 'dsh-desktop:shortcuts-edit',
    shortcutsChanged: 'dsh-desktop:shortcuts-changed',
    shortcutsRecording: 'dsh-desktop:shortcuts-recording',
    boot: 'dsh-desktop:boot',
    enterWorkspace: 'dsh-desktop:enter-workspace',
    onboardingActive: 'dsh-desktop:onboarding-active',
    onboardingApiKey: 'dsh-desktop:onboarding-api-key',
    bootFailed: 'dsh-desktop:boot-failed',
    browserAcquire: 'dsh-desktop:browser-acquire',
    browserRelease: 'dsh-desktop:browser-release',
    browserOpenRequested: 'dsh-desktop:browser-open-requested',
    directoryPick: 'dsh-desktop:directory-pick',
    deviceInfo: 'dsh-desktop:device-info',
    localeBootstrap: 'dsh-desktop:locale-bootstrap',
    localeChanged: 'dsh-desktop:locale-changed',
    updatesStatus: 'dsh-desktop:updates-status',
    updatesOpen: 'dsh-desktop:updates-open',
    updatesPresentation: 'dsh-desktop:updates-presentation',
    nativeThemeSet: 'dsh-desktop:native-theme-set',
    windowFullscreen: 'dsh-desktop:window-fullscreen',
    windowsAppearance: 'dsh-desktop:windows-appearance',
    windowsMenu: 'dsh-desktop:windows-menu',
};
/** Scheme of Desktop-owned application documents. */
export const SCHEME = 'dsh-app';
/**
 * Reject IPC outside the allowed Desktop document origins.
 * @param event - IPC caller whose frame URL supplies the origin.
 * @param hostnames - Desktop document hosts allowed for this operation.
 */
export function assertDesktopSender(event, hostnames) {
    const senderFrame = event.senderFrame;
    if (senderFrame === null)
        throw new Error('dsh desktop: rejected IPC without a sender frame');
    const url = new URL(senderFrame.url);
    if (url.protocol !== `${SCHEME}:` || !hostnames.includes(url.hostname)) {
        throw new Error('dsh desktop: rejected IPC from an unowned renderer');
    }
}
//# sourceMappingURL=ipc.js.map