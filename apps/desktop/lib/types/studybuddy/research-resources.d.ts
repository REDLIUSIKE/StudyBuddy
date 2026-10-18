import type { ResearchResourcePin, ResearchRuntimeManifest } from './research-types.ts';
/** Refuse junctions/symlinks through all existing ancestors.
 * @param value - Main-owned absolute resource or data path.
 * @returns Completion after path admission. */
export declare function assertResearchPath(value: string): Promise<void>;
/** Check identity, links and the complete compiled research inventory before launch.
 * @param directory - Candidate's admitted resource directory.
 * @param pin - Trusted source and byte identities compiled with Main.
 * @returns Validated manifest. */
export declare function verifyResearchRuntime(directory: string, pin: ResearchResourcePin): Promise<ResearchRuntimeManifest>;
//# sourceMappingURL=research-resources.d.ts.map