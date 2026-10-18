import { parseServiceBackendProvisioningStatus, } from "./access.js";
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const MASKED_LOCAL_PART_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]\*{3}[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]?$/;
const PHONE_MASK_PATTERN = /^1\d{2}\*{4}\d{4}$/;
export const EMAIL_CHALLENGE_TTL_SECONDS = 300;
export const EMAIL_RESEND_SECONDS = 60;
export function normalizeEmailAddress(value) {
    if (typeof value !== "string") {
        throw new TypeError("email is invalid");
    }
    if (/[^\u0000-\u007f]/.test(value)) {
        throw new TypeError("email is invalid");
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 ||
        asciiByteLength(trimmed) > 254 ||
        /[\u0000-\u001f\u007f]/.test(trimmed)) {
        throw new TypeError("email is invalid");
    }
    const separator = trimmed.indexOf("@");
    if (separator < 1 || separator !== trimmed.lastIndexOf("@")) {
        throw new TypeError("email is invalid");
    }
    const local = trimmed.slice(0, separator);
    const domain = trimmed.slice(separator + 1).toLowerCase();
    if (asciiByteLength(local) > 64 ||
        !LOCAL_PART_PATTERN.test(local) ||
        local.startsWith(".") ||
        local.endsWith(".") ||
        local.includes("..") ||
        !isDnsDomain(domain)) {
        throw new TypeError("email is invalid");
    }
    return `${local}@${domain}`;
}
export function parseEmailChallengeResponse(value) {
    const record = exactRecord(value, ["challengeExpiresInSeconds", "resendAfterSeconds"], "email challenge response");
    if (record.challengeExpiresInSeconds !== EMAIL_CHALLENGE_TTL_SECONDS) {
        throw new TypeError("challengeExpiresInSeconds must be 300");
    }
    if (record.resendAfterSeconds !== EMAIL_RESEND_SECONDS) {
        throw new TypeError("resendAfterSeconds must be 60");
    }
    return {
        challengeExpiresInSeconds: EMAIL_CHALLENGE_TTL_SECONDS,
        resendAfterSeconds: EMAIL_RESEND_SECONDS,
    };
}
export function parseBrowserUserView(value) {
    const record = browserUserRecord(value);
    const hasEmailMasked = hasOwn(record, "emailMasked");
    const hasPhoneMasked = hasOwn(record, "phoneMasked");
    if (!hasEmailMasked && !hasPhoneMasked) {
        throw new TypeError("browser user view must contain a masked identity");
    }
    if (typeof record.id !== "string" ||
        !CANONICAL_UUID_PATTERN.test(record.id) ||
        (hasEmailMasked && !isEmailMasked(record.emailMasked)) ||
        (hasPhoneMasked &&
            (typeof record.phoneMasked !== "string" ||
                !PHONE_MASK_PATTERN.test(record.phoneMasked)))) {
        throw new TypeError("browser user view is invalid");
    }
    const user = {
        id: record.id,
        serviceBackendStatus: parseServiceBackendProvisioningStatus(record.serviceBackendStatus),
    };
    if (hasEmailMasked) {
        user.emailMasked = record.emailMasked;
    }
    if (hasPhoneMasked) {
        user.phoneMasked = record.phoneMasked;
    }
    return user;
}
function isEmailMasked(value) {
    if (typeof value !== "string") {
        return false;
    }
    const separator = value.indexOf("@");
    return (separator > 0 &&
        separator === value.lastIndexOf("@") &&
        MASKED_LOCAL_PART_PATTERN.test(value.slice(0, separator)) &&
        isDnsDomain(value.slice(separator + 1)));
}
function isDnsDomain(domain) {
    const labels = domain.split(".");
    return (labels.length >= 2 &&
        labels.every((label) => label.length >= 1 &&
            label.length <= 63 &&
            /^[a-z0-9-]+$/.test(label) &&
            !label.startsWith("-") &&
            !label.endsWith("-")));
}
function browserUserRecord(value) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError("browser user view must be an object");
    }
    const record = value;
    const allowedKeys = ["id", "emailMasked", "phoneMasked", "serviceBackendStatus"];
    if (!hasOwn(record, "id") ||
        !hasOwn(record, "serviceBackendStatus") ||
        Object.keys(record).some((key) => !allowedKeys.includes(key))) {
        throw new TypeError("browser user view contains unknown or missing fields");
    }
    return record;
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
function hasOwn(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key);
}
function asciiByteLength(value) {
    return value.length;
}
//# sourceMappingURL=email-auth.js.map