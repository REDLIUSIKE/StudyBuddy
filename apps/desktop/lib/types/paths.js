/** Filesystem ownership for the Electron-managed desktop installation. */
import { join, resolve } from 'node:path';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
/**
 * Select the browser and account data directory before acquiring the instance lock.
 * @param appData - Operating system application-data directory.
 * @param isPackaged - Whether the installed application owns the established profile.
 * @param developmentUserData - Explicit user-data-dir supplied by the development launcher.
 * @returns Absolute development directory, or the established StudyBuddy profile.
 */
export function resolveDesktopUserDataPath(appData, isPackaged, developmentUserData) {
    // StudyBuddy 1.0.0 deliberately retains this internal profile name so an in-place
    // upgrade keeps the existing account and projects; package inputs never include it.
    return !isPackaged && developmentUserData !== ''
        ? resolve(developmentUserData)
        : join(appData, 'StudyBuddy-Harness');
}
/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome = resolveDshHome()) {
    return {
        profile: join(dshHome, 'profiles', 'desktop'),
        lock: join(dshHome, 'profiles', 'desktop', 'lock'),
    };
}
//# sourceMappingURL=paths.js.map