/** Filesystem ownership for the Electron-managed desktop installation. */
/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
    readonly profile: string;
    readonly lock: string;
}
/**
 * Select the browser and account data directory before acquiring the instance lock.
 * @param appData - Operating system application-data directory.
 * @param isPackaged - Whether the installed application owns the established profile.
 * @param developmentUserData - Explicit user-data-dir supplied by the development launcher.
 * @returns Absolute development directory, or the established StudyBuddy profile.
 */
export declare function resolveDesktopUserDataPath(appData: string, isPackaged: boolean, developmentUserData: string): string;
/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export declare function resolveDesktopPaths(dshHome?: string): DesktopPaths;
//# sourceMappingURL=paths.d.ts.map