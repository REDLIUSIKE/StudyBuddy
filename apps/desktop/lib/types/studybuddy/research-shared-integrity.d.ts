import type { ResearchSharedDshResolution, ResearchSharedDshScope, ResearchSharedIntegrity, ResearchSharedIntegrityRoots } from './research-shared-integrity-types.ts';
export type { ResearchSharedDshResolution, ResearchSharedDshScope, ResearchSharedFile, ResearchSharedIntegrity, ResearchSharedIntegrityRoots, } from './research-shared-integrity-types.ts';
/** Validate portable manifest fields and their complete canonical inventory digests without reading files.
 * @param value - Untrusted parsed manifest integrity object.
 * @returns A strict, path-sorted actual-byte identity. */
export declare function parseResearchSharedIntegrity(value: unknown): ResearchSharedIntegrity;
/** Freeze complete primary bytes and explicitly selected shared research package runtime roots.
 * @param roots - Main-selected installations whose bytes are bound without copying.
 * @param options - Reviewed package scopes, helper source hash and optional canonical development workspace.
 * @returns An identity after hashing all files and checking that the complete snapshot stayed unchanged. */
export declare function createResearchSharedIntegrity(roots: ResearchSharedIntegrityRoots, options: {
    dshScopes: ResearchSharedDshScope[];
    dshResolutions?: ResearchSharedDshResolution[];
    generatorSha256: string;
    workspaceDirectory?: string;
}): Promise<ResearchSharedIntegrity>;
/** Rehash the complete selected installations and reject missing, extra, linked or changed runtime bytes.
 * @param expected - Integrity frozen into the reviewed production manifest.
 * @param roots - Main-selected current shared installations.
 * @param options - Canonical workspace allowance for explicitly selected development package junctions only.
 * @returns After exact inventory and hash equality; normal Python cache writes are not ignored. */
export declare function verifyResearchSharedIntegrity(expected: ResearchSharedIntegrity, roots: ResearchSharedIntegrityRoots, options?: {
    workspaceDirectory?: string;
}): Promise<void>;
//# sourceMappingURL=research-shared-integrity.d.ts.map