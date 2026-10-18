import { type SkillListingStatus } from "./skill-marketplace.js";
export declare const SKILL_TOOL_IDS: readonly ["chatgpt_desktop", "claude_code", "codex_cli", "deepseek_harness", "hermes_desktop", "kimi_cli", "openclaw", "workbuddy"];
export type SkillToolId = typeof SKILL_TOOL_IDS[number];
export type SkillScope = "user" | "project" | "builtin" | "hub";
export type SkillIntroduction = {
    title: string;
    summary: string;
    inputDescription: string;
    outputDescription: string;
    example: string;
    features?: string[];
    category: string;
    usageInstructions: string;
    dependencies: string[];
    declaredTools: SkillToolId[];
};
export type GithubReference = {
    repositoryUrl: string;
    subdirectory: string | null;
    ref: string | null;
};
export type GithubSkillMetadata = GithubReference & {
    projectType: "skill" | "project";
    originalAuthor: string | null;
    stars: number | null;
    language: string | null;
    license: string | null;
    readmeSections: string[];
    readmeTruncated: boolean;
    retrievedAt: string | null;
};
export type SkillPackageIdentity = {
    publicationId: string;
    sha256: string;
    canonicalName: string | null;
    declaredVersion: string | null;
    updateNotes: string | null;
};
export type SkillCoverChange = {
    action: "keep";
} | {
    action: "clear";
} | {
    action: "replace";
    uploadId: string;
};
type SkillEntryBase = {
    id: string;
    revision: number;
    publisherKind: "user" | "platform_admin";
    introduction: SkillIntroduction;
    attribution: {
        role: "creator" | "sharer" | "platform";
        displayName: string;
    };
    isCurated: boolean;
    status: SkillListingStatus;
    coverUrl: string | null;
    updatedAt: string;
    isFavorite: boolean;
    metadataState: "complete" | "legacy_incomplete";
    verifiedTools: {
        toolId: SkillToolId;
        evidenceId: string;
        checkedAt: string;
    }[];
};
export type SkillEntryView = SkillEntryBase & ({
    sourceKind: "hosted_package";
    package: SkillPackageIdentity;
    github: null;
} | {
    sourceKind: "github_project";
    package: null;
    github: GithubSkillMetadata;
});
export type SkillPublicationInputV2 = {
    introduction: SkillIntroduction;
    cover: SkillCoverChange;
} & ({
    sourceKind: "hosted_package";
    uploadId: string;
    updateNotes: string | null;
} | {
    sourceKind: "github_project";
    github: GithubReference;
    projectType: "skill" | "project";
});
export type SkillPublicationUpdateInputV2 = SkillPublicationInputV2 & {
    expectedRevision: number;
};
export type SkillEntryQuery = {
    view: "curated" | "community" | "favorites" | "published";
    query: string | null;
    category: string | null;
};
export type SkillPackageUploadInputV2 = {
    packageSha256: string;
    packageBytes: string;
};
export type SkillUploadCapability = {
    uploadId: string;
    expiresAt: string;
};
export type SkillUploadTarget = {
    url: string;
    requiredHeaders: Record<string, string>;
};
export type SkillPackageUploadCapabilityV2 = SkillUploadCapability & {
    package: SkillUploadTarget;
};
export type SkillCoverUploadCapability = SkillUploadCapability & {
    cover: SkillUploadTarget;
};
export declare function skillInvalid(): never;
export declare function skillRecord(value: unknown): Record<string, unknown>;
export declare function skillExact(value: Record<string, unknown>, keys: readonly string[]): void;
export declare function skillText(value: unknown, max: number, allowEmpty?: boolean): string;
export declare function skillNullableText(value: unknown, max: number): string | null;
export declare function skillChoice<T extends string>(value: unknown, choices: readonly T[]): T;
export declare function skillInteger(value: unknown, min?: number, max?: number): number;
export declare function skillBoolean(value: unknown): boolean;
export declare function skillArray<T>(value: unknown, max: number, parser: (value: unknown) => T): T[];
export declare function skillUuid(value: unknown): string;
export declare function skillOpaqueId(value: unknown): string;
export declare function skillSha256(value: unknown): string;
export declare function skillTimestamp(value: unknown): string;
export declare function skillTool(value: unknown): SkillToolId;
export declare function skillUrl(value: unknown): string;
export declare function parseSkillIntroduction(value: unknown, allowIncomplete?: boolean): SkillIntroduction;
export declare function parseGithubReference(value: unknown): GithubReference;
export declare function parseGithubSkillMetadata(value: unknown): GithubSkillMetadata;
export declare function parseSkillPackageIdentity(value: unknown): SkillPackageIdentity;
export declare function parseSkillCoverChange(value: unknown): SkillCoverChange;
export declare function parseSkillPublication(value: unknown): SkillPublicationInputV2;
export declare function parseSkillPublicationUpdate(value: unknown): SkillPublicationUpdateInputV2;
export declare function parseSkillEntry(value: unknown): SkillEntryView;
export declare function parseSkillPackageUploadV2(value: unknown): SkillPackageUploadInputV2;
export declare function parseSkillEntryQuery(value: unknown): SkillEntryQuery;
export declare function parseSkillUploadTarget(value: unknown): SkillUploadTarget;
export declare function parseSkillPackageUploadCapabilityV2(value: unknown): SkillPackageUploadCapabilityV2;
export declare function parseSkillCoverUploadCapability(value: unknown): SkillCoverUploadCapability;
export {};
