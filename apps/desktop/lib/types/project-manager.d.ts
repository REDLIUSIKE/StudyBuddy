/** Desktop profile initialization and native recovery. */
import type { DesktopPaths } from './paths.ts';
import type { DesktopRelease } from './release.ts';
/** Initializes the Desktop profile and disables third-party bundles during recovery. */
export declare class DesktopProjectManager {
    readonly paths: DesktopPaths;
    readonly runtime: {
        readonly dsh: string;
    };
    /**
     * @param paths - Electron-owned package state and reserved desktop profile paths.
     * @param runtime - location of the bundled application runtime.
     */
    constructor(paths: DesktopPaths, runtime: {
        readonly dsh: string;
    });
    /**
     * Back up the profile patch and disable third-party bundles without loading application resources.
     * The caller must stop the Host first.
     * @returns Backup path after the locked profile write, or undefined if the patch was absent.
     */
    disableAllPlugins(): Promise<string | undefined>;
    /**
     * Load application metadata and prepare the external plugin profile without installing packages.
     */
    applyRelease(): Promise<void>;
    private withLock;
}
/** Create build-only project metadata for materializing the signed runtime. */
export declare function createRuntimeProjectMetadata(projectDir: string, release: DesktopRelease): void;
/**
 * Create metadata for the unpackaged development project that links the current workspace.
 * @param projectDir - Disposable development profile directory.
 * @param release - Release identity shared by the linked CLI package and Electron shell.
 */
export declare function createDevelopmentProjectMetadata(projectDir: string, release: DesktopRelease): void;
/** Create the first external plugin profile without running a package manager. */
export declare function createPluginProfile(projectDir: string): void;
//# sourceMappingURL=project-manager.d.ts.map