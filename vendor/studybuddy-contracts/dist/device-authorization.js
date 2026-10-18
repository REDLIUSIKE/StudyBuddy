const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export class DeviceMutationRequestParseError extends TypeError {
    kind;
    constructor(kind, message) {
        super(message);
        this.kind = kind;
        this.name = "DeviceMutationRequestParseError";
    }
}
export function parseDeviceChallengePurpose(value) {
    if (value === "bind" || value === "transfer" || value === "download") {
        return value;
    }
    throw new TypeError("purpose must be bind, transfer, or download");
}
export function parseCurrentDeviceResponse(value) {
    const record = exactRecord(value, ["device", "selfTransfer"], "current device response");
    const selfTransfer = exactRecord(record.selfTransfer, ["allowed", "availableAt"], "selfTransfer");
    if (typeof selfTransfer.allowed !== "boolean") {
        throw new TypeError("selfTransfer.allowed must be a boolean");
    }
    if (record.device === null) {
        if (selfTransfer.allowed !== false ||
            selfTransfer.availableAt !== null) {
            throw new TypeError("selfTransfer must be unavailable when device is null");
        }
        return {
            device: null,
            selfTransfer: { allowed: false, availableAt: null },
        };
    }
    const device = exactRecord(record.device, [
        "id",
        "displayName",
        "publicKeyFingerprint",
        "boundAt",
    ], "current device");
    const parsedDevice = {
        id: canonicalUuid(device.id, "device.id"),
        displayName: parseDeviceDisplayName(device.displayName),
        publicKeyFingerprint: sha256Hex(device.publicKeyFingerprint, "publicKeyFingerprint"),
        boundAt: canonicalUtcInstant(device.boundAt, "boundAt"),
    };
    if (selfTransfer.allowed) {
        if (selfTransfer.availableAt !== null) {
            throw new TypeError("selfTransfer.availableAt must be null when transfer is allowed");
        }
        return {
            device: parsedDevice,
            selfTransfer: { allowed: true, availableAt: null },
        };
    }
    return {
        device: parsedDevice,
        selfTransfer: {
            allowed: false,
            availableAt: canonicalUtcInstant(selfTransfer.availableAt, "availableAt"),
        },
    };
}
export function parseDeviceChallengeRequest(value) {
    const record = exactRecord(value, ["purpose"], "device challenge request");
    return {
        purpose: parseDeviceChallengePurpose(record.purpose),
    };
}
export function parseDeviceProofInput(value) {
    const record = exactRecord(value, ["challengeId", "publicKeyBase64url", "signatureBase64url"], "device proof");
    return {
        challengeId: canonicalUuid(record.challengeId, "challengeId"),
        publicKeyBase64url: base64urlString(record.publicKeyBase64url, "publicKeyBase64url", 128),
        signatureBase64url: base64urlString(record.signatureBase64url, "signatureBase64url", 64, 64),
    };
}
export function parseDeviceMutationRequest(value) {
    let record;
    let displayName;
    try {
        record = exactRecord(value, ["displayName", "proof"], "device mutation request");
        displayName = parseDeviceDisplayName(record.displayName);
    }
    catch {
        throw new DeviceMutationRequestParseError("request", "device mutation request is invalid");
    }
    let proof;
    try {
        proof = parseDeviceProofInput(record.proof);
    }
    catch {
        throw new DeviceMutationRequestParseError("proof", "device mutation request proof is invalid");
    }
    return {
        displayName,
        proof,
    };
}
export function parseDeviceDisplayName(value) {
    if (typeof value !== "string") {
        throw new TypeError("displayName must be a string");
    }
    const trimmed = value.trim();
    const codePointLength = Array.from(trimmed).length;
    if (codePointLength < 1 || codePointLength > 80) {
        throw new TypeError("displayName must contain between 1 and 80 Unicode characters");
    }
    return trimmed;
}
export function parseSupportResetRequest(value) {
    const record = exactRecord(value, ["operatorId", "reason"], "support reset request");
    if (typeof record.operatorId !== "string" ||
        !/^[\x21-\x7e]{3,80}$/.test(record.operatorId)) {
        throw new TypeError("operatorId must contain 3 to 80 visible ASCII characters");
    }
    if (typeof record.reason !== "string") {
        throw new TypeError("reason must be a string");
    }
    const reason = record.reason.trim();
    const reasonLength = Array.from(reason).length;
    if (reasonLength < 10 || reasonLength > 500) {
        throw new TypeError("reason must contain between 10 and 500 Unicode characters");
    }
    return {
        operatorId: record.operatorId,
        reason,
    };
}
export function parseIdempotencyKeyValue(value) {
    if (typeof value !== "string" ||
        value.length < 16 ||
        value.length > 128 ||
        !VISIBLE_ASCII_PATTERN.test(value)) {
        throw new TypeError("Idempotency-Key must contain 16 to 128 visible ASCII characters");
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
function boundedString(value, name, minLength, maxLength) {
    if (typeof value !== "string" ||
        value.length < minLength ||
        value.length > maxLength) {
        throw new TypeError(`${name} has an invalid length`);
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
function sha256Hex(value, name) {
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
        throw new TypeError(`${name} must be a lowercase SHA-256 hex digest`);
    }
    return value;
}
function base64urlString(value, name, maxBytes, exactBytes) {
    const parsed = boundedString(value, name, 1, Math.ceil((maxBytes * 4) / 3));
    if (!BASE64URL_PATTERN.test(parsed) || !isCanonicalBase64url(parsed)) {
        throw new TypeError(`${name} must be base64url`);
    }
    const decodedLength = Math.floor((parsed.length * 6) / 8);
    if (decodedLength > maxBytes ||
        (exactBytes !== undefined && decodedLength !== exactBytes)) {
        throw new TypeError(`${name} must be base64url`);
    }
    return parsed;
}
function canonicalUuid(value, name) {
    if (typeof value !== "string" || !CANONICAL_UUID_PATTERN.test(value)) {
        throw new TypeError(`${name} must be a canonical lowercase UUID`);
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
//# sourceMappingURL=device-authorization.js.map