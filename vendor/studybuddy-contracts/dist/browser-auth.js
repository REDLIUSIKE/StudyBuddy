const BASE64URL_43_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const AUTHORIZATION_CODE_PATTERN = /^dc1\.[A-Za-z0-9_-]{43}$/;
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;
export const DESKTOP_AUTH_REQUEST_TTL_SECONDS = 300;
export const DESKTOP_AUTH_CODE_TTL_SECONDS = 60;
export const DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS = 2_000;
export const CURRENT_TERMS_VERSION = "2026-08-08";
export const CURRENT_PRIVACY_VERSION = "2026-08-08";
export function parseDesktopAuthStartRequest(value) {
    const record = exactRecord(value, ["state", "codeChallenge", "codeChallengeMethod", "clientLabel"], "desktop auth start request");
    return {
        state: base64url43(record.state, "state"),
        codeChallenge: base64url43(record.codeChallenge, "codeChallenge"),
        codeChallengeMethod: exactLiteral(record.codeChallengeMethod, "S256", "codeChallengeMethod"),
        clientLabel: exactLiteral(record.clientLabel, "StudyBuddy Windows", "clientLabel"),
    };
}
export function parseDesktopAuthStartResponse(value) {
    const record = exactRecord(value, [
        "requestId",
        "authorizationUrl",
        "cancelToken",
        "pollToken",
        "nextPollAfterMs",
        "expiresInSeconds",
    ], "desktop auth start response");
    if (record.expiresInSeconds !== DESKTOP_AUTH_REQUEST_TTL_SECONDS) {
        throw new TypeError("expiresInSeconds must be 300");
    }
    if (record.nextPollAfterMs !== DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS) {
        throw new TypeError("nextPollAfterMs must be 2000");
    }
    const requestId = canonicalUuid(record.requestId, "requestId");
    return {
        requestId,
        authorizationUrl: desktopAuthorizationUrl(record.authorizationUrl, requestId),
        cancelToken: base64url43(record.cancelToken, "cancelToken"),
        pollToken: base64url43(record.pollToken, "pollToken"),
        nextPollAfterMs: DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS,
        expiresInSeconds: DESKTOP_AUTH_REQUEST_TTL_SECONDS,
    };
}
export function parseDesktopAuthRequestView(value) {
    const record = exactRecord(value, ["status"], "desktop auth request view");
    if (record.status !== "pending" &&
        record.status !== "approved" &&
        record.status !== "cancelled" &&
        record.status !== "expired") {
        throw new TypeError("status must be pending, approved, cancelled, or expired");
    }
    return { status: record.status };
}
export function parseDesktopAuthApproveResponse(value) {
    const record = exactRecord(value, ["redirectUrl"], "desktop auth approve response");
    if (typeof record.redirectUrl !== "string") {
        throw new TypeError("redirectUrl must be a desktop auth callback");
    }
    try {
        parseDesktopAuthCallback(record.redirectUrl);
    }
    catch {
        throw new TypeError("redirectUrl must be a desktop auth callback");
    }
    return { redirectUrl: record.redirectUrl };
}
export function parseDesktopAuthExchangeRequest(value) {
    const record = exactRecord(value, ["authorizationCode", "codeVerifier"], "desktop auth exchange request");
    return {
        authorizationCode: authorizationCode(record.authorizationCode),
        codeVerifier: base64url43(record.codeVerifier, "codeVerifier"),
    };
}
export function parseDesktopAuthCancelRequest(value) {
    const record = exactRecord(value, ["requestId", "cancelToken"], "desktop auth cancel request");
    return {
        requestId: canonicalUuid(record.requestId, "requestId"),
        cancelToken: base64url43(record.cancelToken, "cancelToken"),
    };
}
export function parseDesktopAuthPollRequest(value) {
    const record = exactRecord(value, ["requestId", "pollToken", "codeVerifier"], "desktop auth poll request");
    return {
        requestId: canonicalUuid(record.requestId, "requestId"),
        pollToken: base64url43(record.pollToken, "pollToken"),
        codeVerifier: base64url43(record.codeVerifier, "codeVerifier"),
    };
}
export function parseDesktopAuthPollResponse(value) {
    if (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        value.status === "pending") {
        const record = exactRecord(value, ["status", "nextPollAfterMs"], "desktop auth poll response");
        if (record.nextPollAfterMs !== DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS) {
            throw new TypeError("nextPollAfterMs must be 2000");
        }
        return {
            status: "pending",
            nextPollAfterMs: DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS,
        };
    }
    const record = exactRecord(value, [
        "status",
        "accessToken",
        "accessTokenExpiresInSeconds",
        "refreshToken",
        "refreshTokenExpiresInSeconds",
    ], "desktop auth poll response");
    if (record.status !== "authenticated") {
        throw new TypeError("status must be pending or authenticated");
    }
    if (record.accessTokenExpiresInSeconds !== 900) {
        throw new TypeError("accessTokenExpiresInSeconds must be 900");
    }
    if (record.refreshTokenExpiresInSeconds !== 2_592_000) {
        throw new TypeError("refreshTokenExpiresInSeconds must be 2592000");
    }
    return {
        status: "authenticated",
        accessToken: boundedVisibleToken(record.accessToken, "accessToken"),
        accessTokenExpiresInSeconds: 900,
        refreshToken: boundedVisibleToken(record.refreshToken, "refreshToken"),
        refreshTokenExpiresInSeconds: 2_592_000,
    };
}
export function parseDesktopAuthCallback(value) {
    if (typeof value !== "string" ||
        value.length > 256 ||
        !VISIBLE_ASCII_PATTERN.test(value)) {
        throw new TypeError("desktop auth callback is invalid");
    }
    let url;
    try {
        url = parseRuntimeUrl(value);
    }
    catch {
        throw new TypeError("desktop auth callback is invalid");
    }
    if (url.protocol !== "studybuddy:" ||
        url.hostname !== "auth" ||
        url.port !== "" ||
        url.pathname !== "/callback" ||
        url.username !== "" ||
        url.password !== "" ||
        url.hash !== "") {
        throw new TypeError("desktop auth callback is invalid");
    }
    const entries = [...url.searchParams.entries()];
    if (entries.length !== 2 ||
        entries.filter(([key]) => key === "code").length !== 1 ||
        entries.filter(([key]) => key === "state").length !== 1) {
        throw new TypeError("desktop auth callback is invalid");
    }
    try {
        return {
            authorizationCode: authorizationCode(url.searchParams.get("code")),
            state: base64url43(url.searchParams.get("state"), "state"),
        };
    }
    catch {
        throw new TypeError("desktop auth callback is invalid");
    }
}
export function isDesktopAuthCallback(value) {
    try {
        parseDesktopAuthCallback(value);
        return true;
    }
    catch {
        return false;
    }
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
function base64url43(value, name) {
    if (typeof value !== "string" || !BASE64URL_43_PATTERN.test(value)) {
        throw new TypeError(`${name} must be exactly 43 base64url characters`);
    }
    return value;
}
function boundedVisibleToken(value, name) {
    if (typeof value !== "string" ||
        value.length === 0 ||
        value.length > 4_096 ||
        !VISIBLE_ASCII_PATTERN.test(value)) {
        throw new TypeError(`${name} must be a bounded visible token`);
    }
    return value;
}
function authorizationCode(value) {
    if (typeof value !== "string" ||
        !AUTHORIZATION_CODE_PATTERN.test(value)) {
        throw new TypeError("authorizationCode must be dc1. followed by 43 base64url characters");
    }
    return value;
}
function canonicalUuid(value, name) {
    if (typeof value !== "string" || !CANONICAL_UUID_PATTERN.test(value)) {
        throw new TypeError(`${name} must be a canonical UUID`);
    }
    return value;
}
function exactLiteral(value, literal, name) {
    if (value !== literal) {
        throw new TypeError(`${name} must be ${literal}`);
    }
    return literal;
}
function desktopAuthorizationUrl(value, requestId) {
    const name = "authorizationUrl";
    if (typeof value !== "string" ||
        value.length > 2_048 ||
        !VISIBLE_ASCII_PATTERN.test(value)) {
        throw new TypeError(`${name} must be a bounded HTTPS URL`);
    }
    let url;
    try {
        url = parseRuntimeUrl(value);
    }
    catch {
        throw new TypeError(`${name} must be a bounded HTTPS URL`);
    }
    if (url.protocol !== "https:" ||
        url.hostname !== "guijitongzhuo.com" ||
        url.port !== "" ||
        url.pathname !== "/login/desktop" ||
        url.username !== "" ||
        url.password !== "" ||
        url.hash !== "" ||
        [...url.searchParams.entries()].length !== 1 ||
        url.searchParams.get("request") !== requestId) {
        throw new TypeError(`${name} must be a bounded HTTPS URL`);
    }
    const canonical = `https://guijitongzhuo.com/login/desktop?request=${requestId}`;
    if (value !== canonical) {
        throw new TypeError(`${name} must be a bounded HTTPS URL`);
    }
    return value;
}
function parseRuntimeUrl(value) {
    const UrlConstructor = globalThis.URL;
    if (UrlConstructor === undefined) {
        throw new TypeError("URL parser is unavailable");
    }
    return new UrlConstructor(value);
}
//# sourceMappingURL=browser-auth.js.map