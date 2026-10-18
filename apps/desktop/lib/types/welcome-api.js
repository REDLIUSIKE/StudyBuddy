/** Operations available to the isolated native welcome renderer. */
/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
    saveApiKey: 'dsh-welcome:save-api-key',
    analytics: 'dsh-welcome:analytics',
    analyticsEnabled: 'dsh-welcome:analytics-enabled',
    skip: 'dsh-welcome:skip',
    start: 'dsh-welcome:start',
    cancel: 'dsh-welcome:cancel',
    copyLink: 'dsh-welcome:copy-link',
    state: 'dsh-welcome:state',
    takeNotice: 'dsh-welcome:take-notice',
};
/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * @param authentication - current account and independently stored API-key facts.
 * @returns true only when neither authentication route is configured.
 */
export function needsWelcome(authentication) {
    return !authentication.loggedIn && !authentication.hasApiKey;
}
//# sourceMappingURL=welcome-api.js.map