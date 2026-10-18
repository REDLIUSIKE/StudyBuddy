/** Private product channels; no renderer-supplied URL or token is accepted. */
export const STUDYBUDDY_IPC = {
    status: 'studybuddy:auth-status', start: 'studybuddy:auth-start',
    cancel: 'studybuddy:auth-cancel', logout: 'studybuddy:auth-logout',
    state: 'studybuddy:auth-state', updates: 'studybuddy:updates-check',
    business: 'studybuddy:business-invoke',
    embeddedAcquire: 'studybuddy:embedded-acquire', embeddedRelease: 'studybuddy:embedded-release', embeddedTheme: 'studybuddy:embedded-theme',
    embeddedInvalid: 'studybuddy:embedded-invalid',
    toolsAcquire: 'studybuddy:tools-acquire', toolsResize: 'studybuddy:tools-resize', toolsVisible: 'studybuddy:tools-visible', toolsTheme: 'studybuddy:tools-theme', toolsRelease: 'studybuddy:tools-release', toolsInvalid: 'studybuddy:tools-invalid',
    toolPageState: 'studybuddy:tool-page-state', toolOperation: 'studybuddy:tool-operation', toolNavigate: 'studybuddy:tool-navigate', toolInstallSubscribe: 'studybuddy:tool-install-subscribe', toolInstallUnsubscribe: 'studybuddy:tool-install-unsubscribe', toolInstallEvent: 'studybuddy:tool-install-event', toolNavigation: 'studybuddy:tool-navigation',
};
//# sourceMappingURL=types.js.map