export const ACCOUNT_USE_POLICY_REVISION = "account-open-v1";
/** Parse the versioned account-access response at the HTTP boundary. */
export function parseAccountUseAccessResponse(value) {
    const response = exactRecord(value, ["schemaVersion", "accountAccess", "serviceBackendStatus"]);
    const access = exactRecord(response.accountAccess, ["allowed", "policyRevision", "accountRevision"]);
    if (response.schemaVersion !== 1 || typeof access.allowed !== "boolean" ||
        access.policyRevision !== ACCOUNT_USE_POLICY_REVISION) {
        throw new TypeError("Unsupported account access response");
    }
    const revision = access.accountRevision;
    if (typeof revision !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(revision) ||
        Number.isNaN(Date.parse(revision)) || new Date(revision).toISOString() !== revision) {
        throw new TypeError("accountRevision must be a canonical UTC instant");
    }
    return {
        schemaVersion: 1,
        accountAccess: { allowed: access.allowed, policyRevision: ACCOUNT_USE_POLICY_REVISION, accountRevision: revision },
        serviceBackendStatus: parseServiceBackendProvisioningStatus(response.serviceBackendStatus),
    };
}
export function parseServiceBackendProvisioningStatus(value) {
    if (value === "pending" || value === "processing" || value === "ready" ||
        value === "retrying" || value === "failed")
        return value;
    throw new TypeError("serviceBackendStatus must be a supported status");
}
function exactRecord(value, keys) {
    if (typeof value !== "object" || value === null || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype)
        throw new TypeError("Expected a plain object");
    const record = value;
    const actual = Object.keys(record);
    if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) {
        throw new TypeError("Account access contains unknown or missing fields");
    }
    return record;
}
//# sourceMappingURL=account-use-access.js.map