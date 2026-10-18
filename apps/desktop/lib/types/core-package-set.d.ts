/** Signed local npm package set that supplies the Desktop-owned dsh runtime and private Host. */
/** Descriptor copied beside every Desktop profile's local core tarballs. */
export declare const DESKTOP_PACKAGE_SET_FILE = "desktop-packages.json";
/** Profile-relative directory containing immutable core npm tarballs. */
export declare const DESKTOP_PACKAGES_DIR = "desktop-packages";
/** Private package installed beside dsh to boot the Desktop Host process. */
export declare const DESKTOP_HOST_PACKAGE = "@deepseek-ai/dsh-desktop-host";
/** Package-relative Desktop Host files required before a profile can boot. */
export declare const DESKTOP_HOST_RUNTIME_FILES: readonly ["lib/index.js", "lib/cli.js"];
/** One immutable npm tarball in the Desktop core package set. */
export interface DesktopCorePackageRecord {
    readonly name: string;
    readonly version: string;
    readonly file: string;
    readonly bytes: number;
    readonly integrity: string;
}
/** Complete union of the first-party package closures rooted at dsh and its private Desktop Host. */
export interface DesktopCorePackageSet {
    readonly schemaVersion: 1;
    readonly packages: readonly DesktopCorePackageRecord[];
}
/**
 * Validate package-set data read from a release artifact or active profile.
 * @param value - Parsed descriptor JSON.
 * @param expectedReleaseVersion - Required dsh and Desktop Host version when validating one release.
 * @returns The normalized package set in deterministic name order.
 */
export declare function parseDesktopCorePackageSet(value: unknown, expectedReleaseVersion?: string): DesktopCorePackageSet;
/** Read and structurally validate one profile's core package descriptor. */
export declare function readDesktopCorePackageSet(projectDir: string, expectedReleaseVersion?: string): DesktopCorePackageSet;
/** Return the project-relative `file:` spec for one local core tarball. */
export declare function desktopCorePackageSpec(record: DesktopCorePackageRecord): string;
/** Return the exact pnpm override map that keeps every core package off registries. */
export declare function desktopCorePackageOverrides(packageSet: DesktopCorePackageSet): Record<string, string>;
/** Return the local direct dependency spec for the dsh package. */
export declare function desktopDshPackageSpec(packageSet: DesktopCorePackageSet): string;
/**
 * Verify every local tarball and reject extra package files before pnpm executes them.
 * @param projectDir - Build directory containing the package set.
 * @param expectedReleaseVersion - Exact dsh and Desktop Host version bound to Electron.
 * @returns The verified package set.
 */
export declare function verifyDesktopCorePackageSet(projectDir: string, expectedReleaseVersion: string): DesktopCorePackageSet;
/** Copy a verified release package set into one disposable runtime project without recursive directory copying. */
export declare function stageDesktopCorePackageSet(source: string, destination: string, expectedReleaseVersion: string): void;
/**
 * Reject a lockfile that resolved any packaged core name through a registry version.
 * @param lockfile - Generated pnpm lockfile text.
 * @param packageSet - Verified local core package set.
 */
export declare function verifyDesktopCoreLockfile(lockfile: string, packageSet: DesktopCorePackageSet): void;
//# sourceMappingURL=core-package-set.d.ts.map