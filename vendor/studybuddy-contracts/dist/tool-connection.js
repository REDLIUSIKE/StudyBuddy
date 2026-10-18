export const TOOL_CONNECTION_TOOL_IDS = ["codex", "claude_code"];
export const TOOL_CONNECTION_STATES = [
    "available",
    "connected",
    "revocation_pending",
    "conflict",
    "unavailable",
];
export const TOOL_CONNECTION_PERMISSION_STATES = [
    "eligible",
    "funding_required",
    "membership_reconnect_required",
    "unavailable",
];
export const TOOL_CONNECTION_MAX_AUTHORIZED_MODELS = 64;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function parseToolConnectionToolId(value) {
    if (value !== "codex" && value !== "claude_code") {
        throw new TypeError("TOOL_CONNECTION_TOOL_INVALID");
    }
    return value;
}
export function parseToolConnectionBody(value) {
    const record = exactRecord(value, ["modelId"], "TOOL_CONNECTION_BODY_INVALID");
    return { modelId: exactModelId(record.modelId, "TOOL_CONNECTION_BODY_INVALID") };
}
export function parseToolConnectionAuthorityView(value) {
    const error = "TOOL_CONNECTION_AUTHORITY_VIEW_INVALID";
    const record = exactRecord(value, [
        "toolId",
        "state",
        "permissionState",
        "accountOwner",
        "deviceId",
        "fundingSource",
        "authorizedModelIds",
        "authorizedModels",
        "bindingRevision",
        "authorityHandle",
        "credentialRevision",
        "receiptRevision",
        "lastVerifiedAt",
    ], error);
    const state = exactConnectionState(record.state, error);
    const permissionState = exactPermissionState(record.permissionState, error);
    const authorizedModelIds = exactAuthorizedModelIds(record.authorizedModelIds, error, true);
    const authorizedModels = exactAuthorizedModels(record.authorizedModels, error);
    const bindingRevision = nullableRevision(record.bindingRevision, error);
    const authorityHandle = nullableUuid(record.authorityHandle, error);
    const credentialRevision = nullablePositiveRevision(record.credentialRevision, error);
    const receiptRevision = nullablePositiveRevision(record.receiptRevision, error);
    const bindingAbsent = bindingRevision === null
        && authorityHandle === null
        && credentialRevision === null
        && receiptRevision === null;
    const bindingPresent = bindingRevision !== null
        && authorityHandle !== null
        && credentialRevision !== null
        && receiptRevision !== null;
    const activeShape = bindingPresent && authorizedModelIds.length > 0;
    const absentShape = bindingAbsent && authorizedModelIds.length === 0;
    const cleanupState = state === "revocation_pending" || state === "conflict";
    const exactProviderProjection = authorizedModels !== null
        && authorizedModels.length === authorizedModelIds.length
        && authorizedModels.every((model, index) => model.modelId === authorizedModelIds[index]);
    if (record.fundingSource !== "platform"
        || !isCanonicalUuid(record.accountOwner)
        || !isCanonicalUuid(record.deviceId)
        || !isNullableCanonicalInstant(record.lastVerifiedAt)
        || (!bindingAbsent && !bindingPresent)
        || (state === "connected" && (!activeShape || permissionState === "unavailable"))
        || ((state === "available" || state === "unavailable") && !absentShape)
        || (cleanupState && (!activeShape && !absentShape))
        || (cleanupState && permissionState === "eligible")
        || (state === "unavailable" && permissionState !== "unavailable")
        || (state === "available" && permissionState === "membership_reconnect_required")
        || (authorizedModels !== null && !exactProviderProjection)
        || (state === "connected" && authorizedModels === null)
        || (absentShape && !exactProviderProjection)
        || (authorizedModels === null
            && (!cleanupState || permissionState !== "unavailable" || !activeShape))) {
        throw new TypeError(error);
    }
    return {
        toolId: parseToolConnectionToolId(record.toolId),
        state,
        permissionState,
        accountOwner: record.accountOwner,
        deviceId: record.deviceId,
        fundingSource: "platform",
        authorizedModelIds,
        authorizedModels,
        bindingRevision,
        authorityHandle,
        credentialRevision,
        receiptRevision,
        lastVerifiedAt: record.lastVerifiedAt,
    };
}
export function parseNativeToolConnectionView(value) {
    const error = "NATIVE_TOOL_CONNECTION_VIEW_INVALID";
    const record = exactRecord(value, [
        "toolId",
        "state",
        "permissionState",
        "savedDefaultModelId",
        "authorizedModelIds",
        "fundingSource",
        "activeBindingRevision",
        "selectionRevision",
        "lastVerifiedAt",
    ], error);
    const state = exactConnectionState(record.state, error);
    const permissionState = exactPermissionState(record.permissionState, error);
    const savedDefaultModelId = record.savedDefaultModelId === null
        ? null
        : exactModelId(record.savedDefaultModelId, error);
    const authorizedModelIds = record.authorizedModelIds === null
        ? null
        : exactAuthorizedModelIds(record.authorizedModelIds, error, true);
    const fundingSource = record.fundingSource === null
        ? null
        : record.fundingSource === "platform" ? "platform" : invalid(error);
    const activeBindingRevision = nullableRevision(record.activeBindingRevision, error);
    const selectionRevision = nullablePositiveRevision(record.selectionRevision, error);
    const hasSavedState = savedDefaultModelId !== null
        && fundingSource === "platform"
        && selectionRevision !== null;
    const hasNoSavedState = savedDefaultModelId === null
        && fundingSource === null
        && selectionRevision === null;
    const freshActive = authorizedModelIds !== null
        && authorizedModelIds.length > 0
        && state === "connected"
        && permissionState !== "unavailable"
        && hasSavedState
        && authorizedModelIds.includes(savedDefaultModelId)
        && activeBindingRevision !== null
        && record.lastVerifiedAt !== null;
    const unknownAuthority = authorizedModelIds === null
        && state === "unavailable"
        && permissionState === "unavailable"
        && activeBindingRevision === null
        && record.lastVerifiedAt === null
        && (hasSavedState || hasNoSavedState);
    const freshKnownConflict = authorizedModelIds !== null
        && authorizedModelIds.length > 0
        && state === "conflict"
        && permissionState !== "eligible"
        && hasSavedState
        && authorizedModelIds.includes(savedDefaultModelId)
        && activeBindingRevision === null
        && record.lastVerifiedAt !== null;
    const knownAbsent = authorizedModelIds !== null
        && authorizedModelIds.length === 0
        && state !== "connected"
        && state !== "unavailable"
        && activeBindingRevision === null
        && (hasSavedState || hasNoSavedState)
        && !(state === "available" && !hasNoSavedState)
        && !(state === "available" && permissionState === "membership_reconnect_required")
        && !((state === "revocation_pending" || state === "conflict")
            && permissionState === "eligible");
    if (!isNullableCanonicalInstant(record.lastVerifiedAt)
        || (!freshActive && !unknownAuthority && !freshKnownConflict && !knownAbsent)) {
        throw new TypeError(error);
    }
    return {
        toolId: parseToolConnectionToolId(record.toolId),
        state,
        permissionState,
        savedDefaultModelId,
        authorizedModelIds,
        fundingSource,
        activeBindingRevision,
        selectionRevision,
        lastVerifiedAt: record.lastVerifiedAt,
    };
}
export function parseNativeToolMaterialRequest(value) {
    const error = "NATIVE_TOOL_MATERIAL_REQUEST_INVALID";
    const record = exactRecord(value, ["audience", "selectedModelId", "materialNonce", "receiptRevision"], error);
    if (record.audience !== "studybuddy-native-v1"
        || typeof record.materialNonce !== "string"
        || !NONCE.test(record.materialNonce)
        || !isPositiveRevision(record.receiptRevision)) {
        throw new TypeError(error);
    }
    return {
        audience: record.audience,
        selectedModelId: exactModelId(record.selectedModelId, error),
        materialNonce: record.materialNonce,
        receiptRevision: record.receiptRevision,
    };
}
export function parseNativeToolMaterial(value) {
    const error = "NATIVE_TOOL_MATERIAL_INVALID";
    const record = exactRecord(value, [
        "connectionId",
        "accountOwner",
        "deviceId",
        "toolId",
        "fundingSource",
        "selectedProviderId",
        "gatewayOrigin",
        "protocol",
        "selectedModelId",
        "authorizedModelIds",
        "apiKey",
        "authorityHandle",
        "pendingBindingRevision",
        "credentialRevision",
        "receiptRevision",
        "pendingExpiresAt",
    ], error);
    const toolId = parseToolConnectionToolId(record.toolId);
    const protocol = toolId === "codex" ? "openai_responses" : "anthropic_messages";
    const selectedModelId = exactModelId(record.selectedModelId, error);
    const authorizedModelIds = exactAuthorizedModelIds(record.authorizedModelIds, error, false);
    if (!isCanonicalUuid(record.connectionId, NONCE)
        || !isCanonicalUuid(record.accountOwner)
        || !isCanonicalUuid(record.deviceId)
        || record.fundingSource !== "platform"
        || (record.selectedProviderId !== "deepseek" && record.selectedProviderId !== "kimi")
        || record.protocol !== protocol
        || !authorizedModelIds.includes(selectedModelId)
        || typeof record.apiKey !== "string"
        || record.apiKey.length === 0
        || record.apiKey.length > 4096
        || /\s/u.test(record.apiKey)
        || !isCanonicalUuid(record.authorityHandle)
        || !isExactRevision(record.pendingBindingRevision)
        || !isPositiveRevision(record.credentialRevision)
        || !isPositiveRevision(record.receiptRevision)
        || !isCanonicalInstant(record.pendingExpiresAt)
        || typeof record.gatewayOrigin !== "string"
        || !isPublicHttpsOrigin(record.gatewayOrigin))
        throw new TypeError(error);
    return {
        connectionId: record.connectionId,
        accountOwner: record.accountOwner,
        deviceId: record.deviceId,
        toolId,
        fundingSource: "platform",
        selectedProviderId: record.selectedProviderId,
        gatewayOrigin: record.gatewayOrigin,
        protocol,
        selectedModelId,
        authorizedModelIds,
        apiKey: record.apiKey,
        authorityHandle: record.authorityHandle,
        pendingBindingRevision: record.pendingBindingRevision,
        credentialRevision: record.credentialRevision,
        receiptRevision: record.receiptRevision,
        pendingExpiresAt: record.pendingExpiresAt,
    };
}
function exactConnectionState(value, error) {
    if (!TOOL_CONNECTION_STATES.includes(value))
        invalid(error);
    return value;
}
function exactPermissionState(value, error) {
    if (!TOOL_CONNECTION_PERMISSION_STATES.includes(value)) {
        invalid(error);
    }
    return value;
}
function exactModelId(value, error) {
    if (typeof value !== "string"
        || !MODEL_ID.test(value)
        || value === "deepseek-v4-pro") {
        throw new TypeError(error);
    }
    return value;
}
function exactAuthorizedModelIds(value, error, allowEmpty) {
    if (!Array.isArray(value)
        || value.length > TOOL_CONNECTION_MAX_AUTHORIZED_MODELS
        || (!allowEmpty && value.length === 0)) {
        throw new TypeError(error);
    }
    const result = value.map((modelId) => exactModelId(modelId, error));
    if (new Set(result).size !== result.length)
        throw new TypeError(error);
    const canonical = [...result].sort();
    if (result.some((modelId, index) => modelId !== canonical[index])) {
        throw new TypeError(error);
    }
    return result;
}
function exactAuthorizedModels(value, error) {
    if (value === null)
        return null;
    if (!Array.isArray(value) || value.length > TOOL_CONNECTION_MAX_AUTHORIZED_MODELS) {
        throw new TypeError(error);
    }
    return value.map((candidate) => {
        const record = exactRecord(candidate, ["modelId", "providerId"], error);
        if (record.providerId !== "deepseek" && record.providerId !== "kimi")
            invalid(error);
        return {
            modelId: exactModelId(record.modelId, error),
            providerId: record.providerId,
        };
    });
}
function nullableRevision(value, error) {
    if (value === null)
        return null;
    if (!isExactRevision(value))
        invalid(error);
    return value;
}
function nullableUuid(value, error) {
    if (value === null)
        return null;
    if (!isCanonicalUuid(value))
        invalid(error);
    return value;
}
function nullablePositiveRevision(value, error) {
    if (value === null)
        return null;
    if (!isPositiveRevision(value))
        invalid(error);
    return value;
}
function exactRecord(value, keys, error) {
    if (typeof value !== "object"
        || value === null
        || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(error);
    }
    const record = value;
    const actual = Object.keys(record);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
        throw new TypeError(error);
    }
    return record;
}
function isCanonicalInstant(value) {
    return typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value))
        && new Date(value).toISOString() === value;
}
function isNullableCanonicalInstant(value) {
    return value === null || isCanonicalInstant(value);
}
function isPositiveRevision(value) {
    return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}
function isExactRevision(value) {
    return typeof value === "string"
        && value.length > 0
        && value.length <= 128
        && value.trim() === value
        && ![...value].some((character) => /\p{Cc}/u.test(character));
}
function isCanonicalUuid(value, pattern = CANONICAL_UUID) {
    return typeof value === "string" && pattern.test(value);
}
function isPublicHttpsOrigin(value) {
    const match = /^https:\/\/([^/?#@\s]+)$/u.exec(value);
    if (match?.[1] === undefined)
        return false;
    const host = match[1].replace(/:\d+$/u, "").toLowerCase();
    return !["localhost", "127.0.0.1", "[::1]"].includes(host);
}
function invalid(error) {
    throw new TypeError(error);
}
//# sourceMappingURL=tool-connection.js.map