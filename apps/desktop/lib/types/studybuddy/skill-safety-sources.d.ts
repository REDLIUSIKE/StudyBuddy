import { z } from 'zod';
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyArtifactView, SkillSafetyCandidateId, SkillSafetyCandidateSet, SkillSafetyJobId, SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types';
import { type SkillSafetyPrivateArtifact } from './skill-safety-artifacts.ts';
/** Native-only installed metadata, without filesystem paths or runtime authority. */
export declare const skillSafetyNativeInventorySchema: z.ZodObject<{
    revision: z.ZodString;
    complete: z.ZodBoolean;
    instances: z.ZodArray<z.ZodObject<{
        instanceId: z.ZodString;
        toolId: z.ZodString;
        displayName: z.ZodString;
        purpose: z.ZodString;
        contentSha256: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Strict native inventory reply at the private process boundary. */
export type SkillSafetyNativeInventory = z.infer<typeof skillSafetyNativeInventorySchema>;
/** Regular-file witnesses from one native-owned snapshot. */
export declare const skillSafetyNativeSnapshotSchema: z.ZodObject<{
    directory: z.ZodString;
    revision: z.ZodString;
    instanceId: z.ZodString;
    sourceDigest: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        relativePath: z.ZodString;
        sha256: z.ZodString;
        byteLength: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Strict private snapshot reply; never a model-visible value. */
export type SkillSafetyNativeSnapshot = z.infer<typeof skillSafetyNativeSnapshotSchema>;
/** Exact native source identities and bounded public requests. */
export interface SkillSafetySourcesOptions {
    root: string;
    isCurrentScope(actor: SkillSafetyActor): boolean;
    native: {
        inventory(actor: SkillSafetyActor, signal: AbortSignal): Promise<SkillSafetyNativeInventory>;
        snapshot(actor: SkillSafetyActor, input: {
            instanceId: string;
            revision: string;
            maxBytes: number;
            maxFiles: number;
        }, signal: AbortSignal): Promise<SkillSafetyNativeSnapshot>;
        verify(actor: SkillSafetyActor, input: {
            instanceId: string;
            revision: string;
            maxBytes: number;
            maxFiles: number;
            files: SkillSafetyNativeSnapshot['files'];
        }, signal: AbortSignal): Promise<void>;
    };
    request(url: URL, signal: AbortSignal): Promise<Response>;
    limits: {
        maxCandidates: number;
        maxDownloadBytes: number;
        maxStagedBytes: number;
        maxFiles: number;
        maxRedirects: number;
        acquisitionTimeoutMs: number;
    };
}
/** Finds real metadata and retains private snapshots outside active skills. */
export declare class SkillSafetySources {
    private readonly options;
    private readonly artifacts;
    private readonly journal;
    constructor(options: SkillSafetySourcesOptions);
    /**
     * Find real named installed copies, then public sources only after a complete no-match.
     * @param actor - Current native account/session.
     * @param requestId - Stable operation identity.
     * @param query - Name/search terms or a public GitHub URL.
     * @param signal - Turn cancellation.
     * @returns Keyless real candidates; errors/incomplete lookup are not no-match.
     */
    findSkillSources(actor: SkillSafetyActor, requestId: SkillSafetyRequestId, query: string, signal: AbortSignal): Promise<SkillSafetyCandidateSet>;
    /**
     * Snapshot only a previously resolved source after native confirmation.
     * @param actor - Current native account/session.
     * @param jobId - Owned lookup.
     * @param candidateId - One candidate from that lookup.
     * @param signal - Turn cancellation.
     * @returns Immutable keyless artifact identity; target code is not executed.
     */
    snapshotSkillSource(actor: SkillSafetyActor, jobId: SkillSafetyJobId, candidateId: SkillSafetyCandidateId, signal: AbortSignal): Promise<SkillSafetyArtifactView>;
    /**
     * Recheck private snapshot and original installed identity before using it.
     * @param actor - Current native account/session.
     * @param artifactId - Accepted snapshot.
     * @returns Private scanner data, never a model or renderer result.
     */
    readSkillArtifact(actor: SkillSafetyActor, artifactId: SkillSafetyArtifactId): Promise<SkillSafetyPrivateArtifact>;
    private nativeIdentity;
    private acquisition;
    private assertScope;
    private githubCandidates;
    private json;
}
//# sourceMappingURL=skill-safety-sources.d.ts.map