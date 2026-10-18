/** Electron single-instance ownership before any Desktop profile lifecycle begins. */
/**
 * Claim the process-lifetime Desktop lock and route later launches to the owner.
 * @param application - Electron application singleton.
 * @param focusOwner - focus or recreate the primary window after a later launch.
 * @returns true only in the process that may access the Desktop profile.
 */
export function claimDesktopSingleInstance(application, focusOwner) {
    if (!application.requestSingleInstanceLock()) {
        application.quit();
        return false;
    }
    application.on('second-instance', focusOwner);
    return true;
}
//# sourceMappingURL=single-instance.js.map