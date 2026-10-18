/** Electron single-instance ownership before any Desktop profile lifecycle begins. */
/** Minimal Electron application operations needed for instance ownership. */
export interface DesktopSingleInstanceApplication {
    requestSingleInstanceLock(): boolean;
    quit(): void;
    on(event: 'second-instance', listener: () => void): unknown;
}
/**
 * Claim the process-lifetime Desktop lock and route later launches to the owner.
 * @param application - Electron application singleton.
 * @param focusOwner - focus or recreate the primary window after a later launch.
 * @returns true only in the process that may access the Desktop profile.
 */
export declare function claimDesktopSingleInstance(application: DesktopSingleInstanceApplication, focusOwner: () => void): boolean;
//# sourceMappingURL=single-instance.d.ts.map