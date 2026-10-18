/** Relocatable, integrity-recorded production packages carried by one Desktop release. */
import { type DesktopRelease } from './release.ts';
/** Descriptor at the root of the immutable Desktop resource tree. */
export declare const DESKTOP_RUNTIME_FILE = "desktop-runtime.json";
/** Host-owned package available to external plugins through a directory link. */
export interface DesktopSharedPackage {
    readonly name: string;
    readonly version: string;
    readonly path: string;
}
/** Final bytes and executable permissions of a runtime file. */
export interface DesktopRuntimeFile {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly executable: boolean;
}
/** One signed application's production dependency tree. */
export interface DesktopRuntimeDescriptor {
    readonly schemaVersion: 1;
    readonly release: DesktopRelease;
    readonly platform: NodeJS.Platform;
    readonly arch: string;
    readonly sharedPackages: readonly DesktopSharedPackage[];
    readonly files: readonly DesktopRuntimeFile[];
}
/**
 * Resolve one portable resource path without permitting traversal or absolute paths.
 * @param root - Runtime root.
 * @param path - Slash-separated relative path from durable metadata.
 * @returns Absolute resource path.
 */
export declare function runtimePath(root: string, path: string): string;
/**
 * Inventory a materialized runtime without following links or including its descriptor.
 * @param root - Self-contained runtime directory.
 * @returns Sorted final-file inventory; executable permissions are false on Windows.
 */
export declare function inventoryDesktopRuntime(root: string): DesktopRuntimeFile[];
/**
 * Seal the final runtime tree after materialization and native signing.
 * @param root - Runtime output directory.
 * @param release - Matching shell, dsh, Host, and executable versions.
 * @param sharedNames - Release-owned packages supplied to plugins.
 * @param target - Platform and architecture selected by runtime preparation.
 * @returns Descriptor written beside the production packages.
 */
export declare function writeDesktopRuntime(root: string, release: DesktopRelease, sharedNames: readonly string[], target?: {
    platform: NodeJS.Platform;
    arch: string;
}): DesktopRuntimeDescriptor;
/**
 * Read packaged metadata and check shared package records.
 * @param root - Current application's runtime resources.
 * @returns Runtime metadata whose release compatibility is verified during packaging.
 */
export declare function readDesktopRuntime(root: string): DesktopRuntimeDescriptor;
/**
 * Verify every packaged runtime file against its recorded bytes and permissions at build time.
 * @param root - Materialized runtime resources.
 * @param expectedVersion - Version the bundled runtime must declare: the product version ordinarily,
 * and a rewritten one for installed-update qualification.
 * @param target - Required execution target; defaults to the current process.
 * @returns Validated runtime descriptor.
 */
export declare function verifyDesktopRuntime(root: string, expectedVersion: string, target?: {
    platform: NodeJS.Platform;
    arch: string;
}): Promise<DesktopRuntimeDescriptor>;
//# sourceMappingURL=runtime-tree.d.ts.map