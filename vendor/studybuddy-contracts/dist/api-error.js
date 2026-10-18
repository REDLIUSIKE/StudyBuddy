const CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function parseApiErrorResponse(value) {
    const record = exactRecord(value, ["code", "message", "requestId", "details"], "API error response", true);
    const code = nonEmptyString(record.code, "code");
    const message = nonEmptyString(record.message, "message");
    const requestId = nonEmptyString(record.requestId, "requestId");
    if (!("details" in record)) {
        return { code, message, requestId };
    }
    if (code !== "DEVICE_TRANSFER_COOLDOWN") {
        throw new TypeError("details are only allowed for transfer cooldown");
    }
    const details = exactRecord(record.details, ["availableAt"], "API error details");
    return {
        code,
        message,
        requestId,
        details: {
            availableAt: canonicalUtcInstant(details.availableAt, "availableAt"),
        },
    };
}
function exactRecord(value, keys, name, optionalFinalKey = false) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(`${name} must be an object`);
    }
    const record = value;
    const actualKeys = Object.keys(record);
    const requiredKeys = optionalFinalKey ? keys.slice(0, -1) : keys;
    if (actualKeys.some((key) => !keys.includes(key)) ||
        requiredKeys.some((key) => !(key in record))) {
        throw new TypeError(`${name} contains unknown or missing fields`);
    }
    return record;
}
function nonEmptyString(value, name) {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
    }
    return value;
}
function canonicalUtcInstant(value, name) {
    if (typeof value !== "string" ||
        !CANONICAL_UTC_INSTANT_PATTERN.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString() !== value) {
        throw new TypeError(`${name} must be a canonical UTC ISO-8601 timestamp`);
    }
    return value;
}
//# sourceMappingURL=api-error.js.map