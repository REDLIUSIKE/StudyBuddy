import { z } from 'zod';
import type { SkillSafetyActor, SkillSafetyArtifactId, SkillSafetyArtifactView, SkillSafetyJobId } from '@deepseek-ai/dsh-skill-safety-assistant/types';
/** A private exact locator, never supplied by a model or renderer. */
export declare const skillSafetyLocatorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"installed">;
    instanceId: z.ZodString;
    revision: z.ZodString;
    sourceDigest: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"github">;
    owner: z.ZodString;
    repository: z.ZodString;
    revision: z.ZodString;
    path: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        relativePath: z.ZodString;
        sha: z.ZodString;
        size: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>], "kind">;
/** Source metadata retained only by Main. */
export type SkillSafetyLocator = z.infer<typeof skillSafetyLocatorSchema>;
/** Private evidence needed for scanner invocation, not public tool presentation. */
export interface SkillSafetyPrivateArtifact {
    readonly directory: string;
    readonly source: SkillSafetyLocator;
    readonly files: readonly {
        relativePath: string;
        sha256: string;
        byteLength: number;
    }[];
    readonly view: SkillSafetyArtifactView;
}
/** Fixed private storage, live scope admission and complete snapshot bounds. */
export interface SkillSafetyArtifactOptions {
    root: string;
    isCurrentScope(actor: SkillSafetyActor): boolean;
    maxBytes: number;
    maxFiles: number;
}
/** Owns private files outside active skill and project roots. */
export declare class SkillSafetyArtifacts {
    private readonly options;
    private readonly root;
    constructor(options: SkillSafetyArtifactOptions);
    /**
     * Create an isolated empty staging directory for public-source bytes.
     * @param actor - Current account/session.
     * @returns A newly owned directory; never an active skill root.
     */
    createStage(actor: SkillSafetyActor): Promise<string>;
    /**
     * Save a new private JSON identity atomically without overwriting another record.
     * @param actor - Current account/session.
     * @param kind - Private record owner.
     * @param id - Opaque owner-issued identity; hashed before path construction.
     * @param value - Owner-validated private data, never credential material.
     */
    saveJson(actor: SkillSafetyActor, kind: 'catalog' | 'artifact', id: string, value: object): Promise<void>;
    /**
     * Read a bounded private record without granting any operation.
     * @param actor - Current account/session.
     * @param kind - Record owner.
     * @param id - Opaque owner-issued identity.
     * @returns Undecoded data for the owning strict schema.
     */
    readJson(actor: SkillSafetyActor, kind: 'catalog' | 'artifact', id: string): Promise<unknown>;
    /**
     * Admit checked snapshot bytes and retain their immutable identity.
     * @param actor - Current account/session.
     * @param jobId - Source lookup that owns this snapshot.
     * @param source - Exact private locator.
     * @param directory - Trusted native snapshot or owned public staging directory.
     * @param files - Actual file witnesses from native copying or blob acquisition.
     * @returns Keyless identity only; no path enters a tool result.
     */
    accept(actor: SkillSafetyActor, jobId: SkillSafetyJobId, source: SkillSafetyLocator, directory: string, files: SkillSafetyPrivateArtifact['files']): Promise<SkillSafetyArtifactView>;
    /**
     * Recheck the stored manifest and every byte before scanner/installation use.
     * @param actor - Current account/session.
     * @param artifactId - Owned immutable identity.
     * @returns Private invocation data; changed or extra files fail closed.
     */
    readSkillArtifact(actor: SkillSafetyActor, artifactId: SkillSafetyArtifactId): Promise<SkillSafetyPrivateArtifact>;
    private recordPath;
    private assertScope;
    private ensureRoot;
    private verifyFiles;
}
/**
 * Reject traversal, Windows device/stream names and ambiguous filename spellings.
 * @param value - Repository-relative regular-file path.
 */
export declare function validateRelative(value: string): void;
//# sourceMappingURL=skill-safety-artifacts.d.ts.map