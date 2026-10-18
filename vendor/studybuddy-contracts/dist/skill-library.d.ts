import { type SkillToolId } from "./skill-center.js";
import { type SkillCopyRequest, type SkillDestination } from "./skill-management.js";
export type SkillLibraryMetadata = {
    sourceKind: "tool" | "local_folder" | "local_archive" | "hosted_package";
    sourceToolId: SkillToolId | null;
    declaredVersion: string | null;
    tags: string[];
};
export type SkillLibraryMetadataRequest = {
    operationId: string;
    instanceId: string;
    scanRevision: string;
    tags: string[];
};
export type SkillLocalImportRequest = {
    operationId: string;
    kind: "folder" | "archive";
};
export type SkillLocalImportResult = {
    selected: boolean;
    results: {
        name: string;
        status: "imported" | "already_present" | "failed";
        reasonCode: string | null;
        instanceId: string | null;
    }[];
};
export type SkillExportRequest = {
    operationId: string;
    scanRevision: string;
    instanceIds: string[];
};
export type SkillExportResult = {
    selected: boolean;
    count: number;
};
export type SkillCopyPreflight = {
    operationId: string;
    source: {
        instanceId: string;
        contentSha256: string;
    };
    results: {
        target: SkillDestination;
        status: "ready" | "already_present" | "conflict" | "blocked";
        reasonCode: string | null;
    }[];
};
export type SkillWatchNotice = {
    generation: string;
    reason: "changed" | "invalidated";
};
export type SkillAiAction = "enable" | "status" | "revoke";
export type SkillAiPlanView = {
    id: string;
    sourceName: string;
    request: SkillCopyRequest;
    preview: SkillCopyPreflight;
    state: "pending" | "approved" | "executed" | "expired";
    expiresAt: number;
};
export type SkillAiSessionView = {
    enabled: boolean;
    sessionId: string | null;
    plans: SkillAiPlanView[];
};
export declare function parseSkillTags(value: unknown): string[];
export declare function parseSkillLibraryMetadata(value: unknown): SkillLibraryMetadata;
export declare function parseSkillLibraryMetadataRequest(value: unknown): SkillLibraryMetadataRequest;
export declare function parseSkillLocalImportRequest(value: unknown): SkillLocalImportRequest;
export declare function parseSkillLocalImportResult(value: unknown): SkillLocalImportResult;
export declare function parseSkillExportRequest(value: unknown): SkillExportRequest;
export declare function parseSkillExportResult(value: unknown): SkillExportResult;
export declare function parseSkillCopyPreflight(value: unknown): SkillCopyPreflight;
export declare function parseSkillWatchNotice(value: unknown): SkillWatchNotice;
export declare function parseSkillAiPlanView(value: unknown): SkillAiPlanView;
export declare function parseSkillAiSessionView(value: unknown): SkillAiSessionView;
