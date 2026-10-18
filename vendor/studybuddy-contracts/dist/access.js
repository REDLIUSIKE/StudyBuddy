import { parseServiceBackendProvisioningStatus } from "./account-use-access.js";
export { parseServiceBackendProvisioningStatus } from "./account-use-access.js";
const CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function parseAccessResponse(value) {
    const record = exactRecord(value, ["access", "serviceBackendStatus"], "access response");
    const access = exactRecord(record.access, ["eligible", "level", "productCode", "source", "grantedAt"], "access");
    const eligible = access.eligible;
    if (typeof eligible !== "boolean") {
        throw new TypeError("eligible must be a boolean");
    }
    const parsedAccess = eligible
        ? parseEligibleAccess(access)
        : parseIneligibleAccess(access);
    return {
        access: parsedAccess,
        serviceBackendStatus: parseServiceBackendProvisioningStatus(record.serviceBackendStatus),
    };
}
function parseEligibleAccess(access) {
    if (access.level !== "lifetime") {
        throw new TypeError("level must be lifetime for eligible access");
    }
    if (typeof access.productCode !== "string" ||
        access.productCode.length === 0) {
        throw new TypeError("productCode must be a non-empty string for eligible access");
    }
    if (access.source !== "usb_claim" &&
        access.source !== "digital_purchase") {
        throw new TypeError("source must be usb_claim or digital_purchase for eligible access");
    }
    const grantedAt = canonicalUtcInstant(access.grantedAt, "grantedAt");
    return {
        eligible: true,
        level: "lifetime",
        productCode: access.productCode,
        source: access.source,
        grantedAt,
    };
}
function parseIneligibleAccess(access) {
    if (access.level !== null ||
        access.productCode !== null ||
        access.source !== null ||
        access.grantedAt !== null) {
        throw new TypeError("ineligible access detail fields must be null");
    }
    return {
        eligible: false,
        level: null,
        productCode: null,
        source: null,
        grantedAt: null,
    };
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
function exactRecord(value, keys, name) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(`${name} must be an object`);
    }
    const record = value;
    const actualKeys = Object.keys(record);
    if (actualKeys.length !== keys.length ||
        actualKeys.some((key) => !keys.includes(key))) {
        throw new TypeError(`${name} contains unknown or missing fields`);
    }
    return record;
}
//# sourceMappingURL=access.js.map