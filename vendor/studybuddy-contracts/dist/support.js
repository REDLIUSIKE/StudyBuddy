/** `last_24_hours` includes the time window plus all events in the latest three launch sessions. */
export const SUPPORT_LOG_RANGE_SEMANTICS = {
    last_24_hours: "union of events from the last 24 hours and events belonging to the latest three recorded launch sessions",
    last_3_days: "events from the last three days",
    all_30_days: "events from the last 30 days",
};
const FORBIDDEN_FIELD_NAME = /(authorization|cookie|password|secret|token|apikey|verificationcode|paymentkey|paymentpayload|paymentsecret|prompt|conversation|body|clipboard|userfile|filecontent)/i;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export function parseClientLogEvent(value) {
    const r = exactRecord(value, ["schemaVersion", "occurredAt", "level", "eventName", "component", "sessionId", "operationId", "requestId", "appVersion", "buildNumber", "platform", "architecture", "routeId", "outcome", "errorCode", "durationMs", "fields"], "client log event");
    if (r.schemaVersion !== 1 || !isTime(r.occurredAt) || !oneOf(r.level, ["info", "warn", "error", "fatal"]) || !boundedString(r.eventName, 1, 160) || !boundedString(r.component, 1, 80) || !isUuid(r.sessionId) || !nullableUuid(r.operationId) || !nullableUuid(r.requestId) || typeof r.appVersion !== "string" || !SEMVER.test(r.appVersion) || !boundedString(r.buildNumber, 1, 80) || !oneOf(r.platform, ["windows", "macos"]) || !oneOf(r.architecture, ["x64", "aarch64"]) || !nullableString(r.routeId, 80) || !oneOf(r.outcome, ["started", "succeeded", "failed", "cancelled", "observed"]) || !nullableString(r.errorCode, 120) || !(r.durationMs === null || (typeof r.durationMs === "number" && Number.isSafeInteger(r.durationMs) && r.durationMs >= 0)) || typeof r.fields !== "object" || r.fields === null || Array.isArray(r.fields) || Object.getPrototypeOf(r.fields) !== Object.prototype)
        throw new TypeError("invalid client log event");
    const fields = r.fields;
    if (Object.keys(fields).length > 128)
        throw new TypeError("client log fields exceed maximum");
    for (const [key, field] of Object.entries(fields)) {
        const normalizedKey = key.replace(/[^a-z0-9]/gi, "");
        if (key.length > 80 || !key || FORBIDDEN_FIELD_NAME.test(normalizedKey))
            throw new TypeError("invalid client log field name");
        if (!(field === null || typeof field === "string" || typeof field === "number" || typeof field === "boolean") || (typeof field === "string" && field.length > 1024) || (typeof field === "number" && !Number.isFinite(field)))
            throw new TypeError("invalid client log field value");
    }
    return r;
}
export function parseCreateSupportLogUploadRequest(value) { const r = exactRecord(value, ["platform", "architecture", "appVersion", "buildNumber", "range", "compressedBytes", "sha256", "eventCount", "firstOccurredAt", "lastOccurredAt"], "support log upload request"); validateManifest(r); return r; }
export function parseSupportUploadIdempotencyKey(value) { if (!isUuid(value))
    throw new TypeError("invalid support log upload idempotency key"); return value; }
export function parseCreateSupportLogUploadV2Request(value) { const r = exactRecord(value, ["platform", "architecture", "appVersion", "buildNumber", "range", "compressedBytes", "sha256", "eventCount", "firstOccurredAt", "lastOccurredAt", "uploadKind", "clientBuild"], "support log upload request"); validateManifest(r); if (!oneOf(r.uploadKind, ["MANUAL_DIAGNOSTIC", "INSTALL_FAILURE", "UPDATE_FAILURE", "STARTUP_FAILURE", "DETECTION_FAILURE"]))
    throw new TypeError("invalid support log upload request"); const build = exactRecord(r.clientBuild, ["buildId", "sourceGitSha"], "support log upload client build"); if (typeof build.buildId !== "string" || !/^[0-9a-f]{32}$/.test(build.buildId) || typeof build.sourceGitSha !== "string" || !/^[0-9a-f]{40}$/.test(build.sourceGitSha))
    throw new TypeError("invalid support log upload request"); return r; }
export function parseCompleteSupportLogUploadRequest(value) { const r = exactRecord(value, ["uploadId", "sha256", "compressedBytes"], "complete support log upload request"); validateUuidShaBytes(r.uploadId, r.sha256, r.compressedBytes, "complete support log upload request"); return r; }
export function parseCreateSupportLogUploadResponse(value) { const r = exactRecord(value, ["uploadId", "uploadUrl", "expiresInSeconds", "requiredHeaders"], "support log upload response"); validateWriteCapability(r); if (!isUuid(r.uploadId))
    throw new TypeError("invalid support log upload response"); return r; }
export function parseCreateSupportLogUploadV2Response(value) { if (!isPlainRecord(value))
    throw new TypeError("support log upload response must be an object"); const base = ["uploadId", "publicCode", "uploadKind", "buildIdentityStatus", "requestFingerprint", "status"]; if (value.status === "AVAILABLE") {
    const r = exactRecord(value, base, "support log upload response");
    validateUploadV2ResponseIdentity(r);
    return r;
} const r = exactRecord(value, [...base, "uploadUrl", "expiresInSeconds", "requiredHeaders"], "support log upload response"); validateUploadV2ResponseIdentity(r); validateWriteCapability(r); if (r.status !== "CREATED")
    throw new TypeError("invalid support log upload response"); return r; }
export function parseCreateSupportIssueAttachmentRequest(value) { const r = exactRecord(value, ["mediaType", "bytes", "sha256"], "support issue attachment request"); if (!oneOf(r.mediaType, ["image/png", "image/jpeg", "image/webp"]) || !boundedBytes(r.bytes, 5 * 1024 * 1024) || !isSha(r.sha256))
    throw new TypeError("invalid support issue attachment request"); return r; }
export function parseCompleteSupportIssueAttachmentRequest(value) { const r = exactRecord(value, ["attachmentId", "sha256", "bytes"], "complete support issue attachment request"); if (!isUuid(r.attachmentId) || !isSha(r.sha256) || !boundedBytes(r.bytes, 5 * 1024 * 1024))
    throw new TypeError("invalid support issue attachment completion"); return r; }
export function parseCreateSupportIssueRequest(value) { const r = exactRecord(value, ["logUploadId", "title", "description", "attachmentIds"], "support issue request"); if (!isUuid(r.logUploadId) || !boundedString(r.title, 1, 80) || !boundedString(r.description, 1, 2000) || !Array.isArray(r.attachmentIds) || r.attachmentIds.length > 3 || r.attachmentIds.some((id) => !isUuid(id)))
    throw new TypeError("invalid support issue request"); return r; }
export function parseSupportLogUploadView(value) { const r = exactRecord(value, ["platform", "architecture", "appVersion", "buildNumber", "range", "compressedBytes", "sha256", "eventCount", "firstOccurredAt", "lastOccurredAt", "id", "publicCode", "status", "createdAt", "completedAt", "expiresAt"], "support log upload view"); validateManifest(r); if (!isUuid(r.id) || typeof r.publicCode !== "string" || !/^LOG-[A-Z0-9]{8}$/.test(r.publicCode) || !oneOf(r.status, ["CREATED", "UPLOADED", "AVAILABLE", "EXPIRED", "REJECTED"]) || !isTime(r.createdAt) || !(r.completedAt === null || isTime(r.completedAt)) || !isTime(r.expiresAt) || new Date(r.expiresAt).getTime() <= new Date(r.createdAt).getTime() || new Date(r.expiresAt).getTime() > new Date(r.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    throw new TypeError("invalid support log upload view"); return r; }
export function parseSupportIssueView(value) { const r = exactRecord(value, ["id", "publicCode", "logUploadId", "title", "description", "status", "createdAt", "updatedAt"], "support issue view"); if (!isUuid(r.id) || typeof r.publicCode !== "string" || !/^(ISSUE)-[A-Z0-9]{8}$/.test(r.publicCode) || !isUuid(r.logUploadId) || !boundedString(r.title, 1, 80) || !boundedString(r.description, 1, 2000) || !oneOf(r.status, ["OPEN", "IN_PROGRESS", "RESOLVED"]) || !isTime(r.createdAt) || !isTime(r.updatedAt))
    throw new TypeError("invalid support issue view"); return r; }
function validateManifest(r) { if (!oneOf(r.platform, ["windows", "macos"]) || !oneOf(r.architecture, ["x64", "aarch64"]) || typeof r.appVersion !== "string" || !SEMVER.test(r.appVersion) || !boundedString(r.buildNumber, 1, 80) || !oneOf(r.range, ["last_24_hours", "last_3_days", "all_30_days"]) || !boundedBytes(r.compressedBytes, MAX_ARCHIVE_BYTES) || !isSha(r.sha256) || !positiveInt(r.eventCount) || !isTime(r.firstOccurredAt) || !isTime(r.lastOccurredAt) || new Date(r.firstOccurredAt) > new Date(r.lastOccurredAt))
    throw new TypeError("invalid support log upload request"); }
function validateUploadV2ResponseIdentity(r) { if (!isUuid(r.uploadId) || typeof r.publicCode !== "string" || !/^LOG-[A-Z0-9]{8}$/.test(r.publicCode) || !oneOf(r.uploadKind, ["MANUAL_DIAGNOSTIC", "INSTALL_FAILURE", "UPDATE_FAILURE", "STARTUP_FAILURE", "DETECTION_FAILURE"]) || !oneOf(r.buildIdentityStatus, ["UNKNOWN", "VERIFIED_REFERENCE", "MISMATCH"]) || !isSha(r.requestFingerprint))
    throw new TypeError("invalid support log upload response"); }
function validateWriteCapability(r) { let uploadUrl; try {
    const URLConstructor = globalThis.URL;
    uploadUrl = typeof r.uploadUrl === "string" && /^https:\/\//.test(r.uploadUrl) ? new URLConstructor(r.uploadUrl) : undefined;
}
catch {
    uploadUrl = undefined;
} if (!uploadUrl || uploadUrl.protocol !== "https:" || !uploadUrl.hostname || !positiveInt(r.expiresInSeconds) || !plainStringMap(r.requiredHeaders) || r.requiredHeaders["if-none-match"] !== "*")
    throw new TypeError("invalid support log upload response"); }
function validateUuidShaBytes(id, sha, bytes, name) { if (!isUuid(id) || !isSha(sha) || !boundedBytes(bytes, MAX_ARCHIVE_BYTES))
    throw new TypeError(`invalid ${name}`); }
function isPlainRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactRecord(value, keys, name) { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError(`${name} must be an object`); const r = value; const actual = Object.keys(r); if (actual.length !== keys.length || actual.some(k => !keys.includes(k)))
    throw new TypeError(`${name} contains unknown or missing fields`); return r; }
function isUuid(v) { return typeof v === "string" && UUID.test(v); }
function isSha(v) { return typeof v === "string" && SHA256.test(v); }
function isTime(v) { return typeof v === "string" && RFC3339.test(v) && new Date(v).toISOString() === v; }
function boundedString(v, min, max) { return typeof v === "string" && v.length >= min && v.length <= max; }
function nullableString(v, max) { return v === null || boundedString(v, 1, max); }
function nullableUuid(v) { return v === null || isUuid(v); }
function oneOf(v, values) { return typeof v === "string" && values.includes(v); }
function positiveInt(v) { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function boundedBytes(v, max) { return typeof v === "string" && /^[1-9]\d*$/.test(v) && BigInt(v) <= BigInt(max); }
function plainStringMap(v) { return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).every((x) => typeof x === "string"); }
//# sourceMappingURL=support.js.map