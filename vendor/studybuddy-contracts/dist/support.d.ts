export type ClientLogLevel = "info" | "warn" | "error" | "fatal";
export type ClientLogOutcome = "started" | "succeeded" | "failed" | "cancelled" | "observed";
export type SupportLogRange = "last_24_hours" | "last_3_days" | "all_30_days";
/** `last_24_hours` includes the time window plus all events in the latest three launch sessions. */
export declare const SUPPORT_LOG_RANGE_SEMANTICS: Record<SupportLogRange, string>;
export type SupportUploadStatus = "CREATED" | "UPLOADED" | "AVAILABLE" | "EXPIRED" | "REJECTED";
export type SupportIssueStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export type ClientLogEvent = {
    schemaVersion: 1;
    occurredAt: string;
    level: ClientLogLevel;
    eventName: string;
    component: string;
    sessionId: string;
    operationId: string | null;
    requestId: string | null;
    appVersion: string;
    buildNumber: string;
    platform: "windows" | "macos";
    architecture: "x64" | "aarch64";
    routeId: string | null;
    outcome: ClientLogOutcome;
    errorCode: string | null;
    durationMs: number | null;
    fields: Record<string, string | number | boolean | null>;
};
export type CreateSupportLogUploadRequest = {
    platform: "windows" | "macos";
    architecture: "x64" | "aarch64";
    appVersion: string;
    buildNumber: string;
    range: SupportLogRange;
    compressedBytes: string;
    sha256: string;
    eventCount: number;
    firstOccurredAt: string;
    lastOccurredAt: string;
};
export type CreateSupportLogUploadResponse = {
    uploadId: string;
    uploadUrl: string;
    expiresInSeconds: number;
    requiredHeaders: Record<string, string>;
};
export type SupportUploadKind = "MANUAL_DIAGNOSTIC" | "INSTALL_FAILURE" | "UPDATE_FAILURE" | "STARTUP_FAILURE" | "DETECTION_FAILURE";
export type CreateSupportLogUploadV2Request = CreateSupportLogUploadRequest & {
    uploadKind: SupportUploadKind;
    clientBuild: {
        buildId: string;
        sourceGitSha: string;
    };
};
export type CreateSupportLogUploadV2Response = {
    uploadId: string;
    publicCode: string;
    uploadKind: SupportUploadKind;
    buildIdentityStatus: "UNKNOWN" | "VERIFIED_REFERENCE" | "MISMATCH";
    requestFingerprint: string;
} & ({
    status: "CREATED";
    uploadUrl: string;
    expiresInSeconds: number;
    requiredHeaders: Record<string, string>;
} | {
    status: "AVAILABLE";
    uploadUrl?: never;
    expiresInSeconds?: never;
    requiredHeaders?: never;
});
export type CompleteSupportLogUploadRequest = {
    uploadId: string;
    sha256: string;
    compressedBytes: string;
};
export type CreateSupportIssueAttachmentRequest = {
    mediaType: "image/png" | "image/jpeg" | "image/webp";
    bytes: string;
    sha256: string;
};
export type CompleteSupportIssueAttachmentRequest = {
    attachmentId: string;
    sha256: string;
    bytes: string;
};
export type SupportLogUploadView = CreateSupportLogUploadRequest & {
    id: string;
    publicCode: string;
    status: SupportUploadStatus;
    createdAt: string;
    completedAt: string | null;
    expiresAt: string;
};
export type CreateSupportIssueRequest = {
    logUploadId: string;
    title: string;
    description: string;
    attachmentIds: string[];
};
export type SupportIssueView = {
    id: string;
    publicCode: string;
    logUploadId: string;
    title: string;
    description: string;
    status: SupportIssueStatus;
    createdAt: string;
    updatedAt: string;
};
export declare function parseClientLogEvent(value: unknown): ClientLogEvent;
export declare function parseCreateSupportLogUploadRequest(value: unknown): CreateSupportLogUploadRequest;
export declare function parseSupportUploadIdempotencyKey(value: unknown): string;
export declare function parseCreateSupportLogUploadV2Request(value: unknown): CreateSupportLogUploadV2Request;
export declare function parseCompleteSupportLogUploadRequest(value: unknown): CompleteSupportLogUploadRequest;
export declare function parseCreateSupportLogUploadResponse(value: unknown): CreateSupportLogUploadResponse;
export declare function parseCreateSupportLogUploadV2Response(value: unknown): CreateSupportLogUploadV2Response;
export declare function parseCreateSupportIssueAttachmentRequest(value: unknown): CreateSupportIssueAttachmentRequest;
export declare function parseCompleteSupportIssueAttachmentRequest(value: unknown): CompleteSupportIssueAttachmentRequest;
export declare function parseCreateSupportIssueRequest(value: unknown): CreateSupportIssueRequest;
export declare function parseSupportLogUploadView(value: unknown): SupportLogUploadView;
export declare function parseSupportIssueView(value: unknown): SupportIssueView;
