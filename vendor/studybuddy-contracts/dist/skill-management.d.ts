import { type SkillPackageIdentity, type SkillScope, type SkillToolId } from "./skill-center.js";
import { type SkillLibraryMetadata } from "./skill-library.js";
export type SkillDestination = {
    toolId: SkillToolId;
    scopeId: string;
};
export type SkillToolView = {
    toolId: SkillToolId;
    displayName: string;
    installed: boolean;
    adapterState: "verified" | "pending" | "unavailable";
    reasonCode: string | null;
    executorId: string;
    destinations: SkillDestination[];
    destinationLabels?: Record<string, {
        scope: "user" | "project";
        displayName: string;
    }>;
};
export type SkillRecognition = "pending" | "recognized" | "failed";
export type SkillRuntime = "unverified" | "passed" | "failed";
export type SkillInstanceView = {
    instanceId: string;
    scopeId: string;
    displayName: string;
    contentSha256: string;
    toolId: SkillToolId;
    scope: SkillScope;
    description: string | null;
    managed: boolean;
    listingId: string | null;
    package: SkillPackageIdentity | null;
    compatibility: {
        state: "compatible" | "pending" | "incompatible";
        reasonCode: string | null;
    };
    recognition: SkillRecognition;
    runtime: SkillRuntime;
    library?: SkillLibraryMetadata;
};
export type SkillAuthorizedProjectView = {
    scopeId: string;
    displayName: string;
};
export type SkillInventorySnapshot = {
    revision: string;
    instances: SkillInstanceView[];
    tools: SkillToolView[];
    scanErrors: {
        toolId: SkillToolId;
        scopeId: string | null;
        code: string;
    }[];
    projects?: SkillAuthorizedProjectView[];
};
type OperationBase = {
    operationId: string;
    targets: SkillDestination[];
    conflictPolicy: "keep" | "replace_confirmed";
};
export type SkillCopyRequest = OperationBase & {
    instanceId: string;
    scanRevision: string;
    mode: "copy" | "link";
};
export type SkillInstallRequest = OperationBase & {
    listingId: string;
    expectedPublicationId: string;
};
export type SkillManageRequest = OperationBase & {
    instanceId: string;
    scanRevision: string;
    action: "import" | "enable" | "disable" | "remove" | "update";
    expectedPublicationId: string | null;
};
export type SkillTargetOperationResult = {
    target: SkillDestination;
    status: "copied" | "linked" | "already_present" | "conflict" | "failed" | "blocked" | "cancelled" | "imported" | "removed" | "disabled";
    reasonCode: string | null;
    instanceId: string | null;
    recognition: SkillRecognition;
    runtime: SkillRuntime;
};
export type SkillOperationResult = {
    operationId: string;
    results: SkillTargetOperationResult[];
};
export declare function parseSkillDestination(value: unknown): SkillDestination;
export declare function parseSkillCopy(value: unknown): SkillCopyRequest;
export declare function parseSkillInstall(value: unknown): SkillInstallRequest;
export declare function parseSkillManage(value: unknown): SkillManageRequest;
export declare function parseSkillInstance(value: unknown): SkillInstanceView;
export declare function parseSkillSnapshot(value: unknown): SkillInventorySnapshot;
export declare function parseSkillOperationResult(value: unknown): SkillOperationResult;
export {};
