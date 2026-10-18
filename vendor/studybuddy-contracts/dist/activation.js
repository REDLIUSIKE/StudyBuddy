const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function parseActivationClaimResponse(value) {
    const record = exactRecord(value, ["claimId", "accessLevel", "grantedAt"], "activation claim response");
    if (typeof record.claimId !== "string" || record.claimId.length === 0) {
        throw new TypeError("claimId must be a non-empty string");
    }
    if (record.accessLevel !== "lifetime") {
        throw new TypeError("accessLevel must be lifetime");
    }
    if (typeof record.grantedAt !== "string" ||
        !CANONICAL_UTC_INSTANT_PATTERN.test(record.grantedAt) ||
        Number.isNaN(Date.parse(record.grantedAt)) ||
        new Date(record.grantedAt).toISOString() !== record.grantedAt) {
        throw new TypeError("grantedAt must be a canonical UTC ISO-8601 timestamp");
    }
    return {
        claimId: record.claimId,
        accessLevel: "lifetime",
        grantedAt: record.grantedAt,
    };
}
export function parseUsbIdentityEnvelope(value) {
    const record = exactRecord(value, ["payloadBase64url", "signatureBase64url"], "USB identity envelope");
    return {
        payloadBase64url: base64urlString(record.payloadBase64url, "payloadBase64url", 4_096),
        signatureBase64url: base64urlString(record.signatureBase64url, "signatureBase64url", 64, 64),
    };
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
function base64urlString(value, name, maxBytes, exactBytes) {
    if (typeof value !== "string" ||
        value.length === 0 ||
        !BASE64URL_PATTERN.test(value) ||
        !isCanonicalBase64url(value)) {
        throw new TypeError(`${name} must be a bounded base64url string`);
    }
    const decodedLength = Math.floor((value.length * 6) / 8);
    if (decodedLength > maxBytes ||
        (exactBytes !== undefined && decodedLength !== exactBytes)) {
        throw new TypeError(`${name} must be a bounded base64url string`);
    }
    return value;
}
function isCanonicalBase64url(value) {
    const remainder = value.length % 4;
    if (remainder === 1)
        return false;
    if (remainder === 0)
        return true;
    const lastCharacter = value[value.length - 1];
    if (lastCharacter === undefined)
        return false;
    const alphabetIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(lastCharacter);
    return remainder === 2
        ? (alphabetIndex & 0b1111) === 0
        : (alphabetIndex & 0b11) === 0;
}
//# sourceMappingURL=activation.js.map