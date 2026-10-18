import type { AigcRuntimeManifest } from './aigc-types.ts';
/** Reject links in a path and every existing ancestor.
 * @param path - Absolute source or resource path.
 * @returns Completion once the path has no linked ancestor. */
export declare function assertAigcPath(path: string): Promise<void>;
/** Verify the complete resource byte inventory, including the portable runtime.
 * @param directory - Main-owned resource directory.
 * @returns The validated source and resource identities. */
export declare function verifyAigcRuntime(directory: string): Promise<AigcRuntimeManifest>;
//# sourceMappingURL=aigc-resources.d.ts.map