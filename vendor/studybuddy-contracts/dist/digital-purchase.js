export const DIGITAL_PURCHASE_PRODUCT_CODE = "studybuddy-digital-lifetime-v2";
export const LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE = "studybuddy-digital-lifetime-v1";
export const DIGITAL_PURCHASE_DISPLAY_NAME = "StudyBuddy 数字版终身资格";
export const DIGITAL_PURCHASE_CURRENCY = "CNY";
export const DIGITAL_PURCHASE_AMOUNT_FEN = 9800;
export const LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN = 8000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_ORDER_ID_PATTERN = /^sbdp_[A-Za-z0-9_-]{43}$/;
const MOCK_QR_PATTERN = /^studybuddy-mock:\/\/pay\/[A-Za-z0-9_-]{1,128}$/;
const WECHAT_NATIVE_QR_PREFIX = "weixin://wxpay/";
const WECHAT_NATIVE_QR_MAX_LENGTH = 2048;
const DIGITAL_PURCHASE_STATES = new Set([
    "CREATED",
    "PENDING",
    "PAID",
    "FULFILLED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
]);
const AVAILABILITY_REASONS = new Set([
    "available",
    "payment_closed",
    "already_eligible",
    "account_not_ready",
    "active_order",
]);
const MOCK_PAYMENT_ACTIONS = new Set([
    "payment_succeeded",
    "payment_failed",
    "order_expired",
    "order_cancelled",
    "duplicate_last",
    "delayed_success",
    "replay_fulfillment",
]);
export function parseCreateDigitalPurchaseInput(value) {
    const record = exactRecord(value, ["productCode", "idempotencyKey"], "DIGITAL_PURCHASE_INPUT_INVALID");
    if (record.productCode !== DIGITAL_PURCHASE_PRODUCT_CODE ||
        typeof record.idempotencyKey !== "string" ||
        !UUID_PATTERN.test(record.idempotencyKey)) {
        throw new TypeError("DIGITAL_PURCHASE_INPUT_INVALID");
    }
    return {
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        idempotencyKey: record.idempotencyKey,
    };
}
export function parseDigitalPurchaseAvailability(value) {
    const errorCode = "DIGITAL_PURCHASE_AVAILABILITY_INVALID";
    const record = exactRecord(value, ["product", "checkoutMode", "canPurchase", "reason", "activeOrderId"], errorCode);
    const product = parseFixedProduct(record.product, errorCode);
    if ((record.checkoutMode !== "closed" &&
        record.checkoutMode !== "mock" &&
        record.checkoutMode !== "wechat_native") ||
        typeof record.canPurchase !== "boolean" ||
        typeof record.reason !== "string" ||
        !AVAILABILITY_REASONS.has(record.reason) ||
        !isNullableOrderId(record.activeOrderId) ||
        !validAvailabilityCombination(record.checkoutMode, record.canPurchase, record.reason, record.activeOrderId)) {
        throw new TypeError(errorCode);
    }
    return {
        product,
        checkoutMode: record.checkoutMode,
        canPurchase: record.canPurchase,
        reason: record.reason,
        activeOrderId: record.activeOrderId,
    };
}
export function parseDigitalPurchaseOrderView(value) {
    const errorCode = "DIGITAL_PURCHASE_ORDER_INVALID";
    const record = exactRecord(value, [
        "orderId",
        "productCode",
        "displayName",
        "currency",
        "amountFen",
        "state",
        "testMode",
        "qrPayload",
        "expiresAt",
        "createdAt",
        "updatedAt",
        "nextPollAfterMs",
    ], errorCode);
    if (typeof record.orderId !== "string" ||
        !PUBLIC_ORDER_ID_PATTERN.test(record.orderId) ||
        record.displayName !== DIGITAL_PURCHASE_DISPLAY_NAME ||
        record.currency !== DIGITAL_PURCHASE_CURRENCY ||
        !isSupportedDigitalPurchaseIdentity(record.productCode, record.amountFen) ||
        typeof record.state !== "string" ||
        !DIGITAL_PURCHASE_STATES.has(record.state) ||
        typeof record.testMode !== "boolean" ||
        !isNullableQr(record.qrPayload, record.testMode) ||
        (record.qrPayload !== null && record.state !== "PENDING") ||
        !isNullableIsoTimestamp(record.expiresAt) ||
        !isCanonicalIsoTimestamp(record.createdAt) ||
        !isCanonicalIsoTimestamp(record.updatedAt) ||
        (record.nextPollAfterMs !== null &&
            record.nextPollAfterMs !== 2000 &&
            record.nextPollAfterMs !== 5000)) {
        throw new TypeError(errorCode);
    }
    return {
        orderId: record.orderId,
        productCode: record.productCode,
        displayName: DIGITAL_PURCHASE_DISPLAY_NAME,
        currency: DIGITAL_PURCHASE_CURRENCY,
        amountFen: record.amountFen,
        state: record.state,
        testMode: record.testMode,
        qrPayload: record.qrPayload,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        nextPollAfterMs: record.nextPollAfterMs,
    };
}
export function isSupportedDigitalPurchaseIdentity(productCode, amountFen) {
    return ((productCode === DIGITAL_PURCHASE_PRODUCT_CODE &&
        amountFen === DIGITAL_PURCHASE_AMOUNT_FEN) ||
        (productCode === LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE &&
            amountFen === LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN));
}
export function parseMockPaymentActionInput(value) {
    const errorCode = "MOCK_PAYMENT_ACTION_INVALID";
    const record = exactRecord(value, ["action", "confirmed"], errorCode);
    if (typeof record.action !== "string" ||
        !MOCK_PAYMENT_ACTIONS.has(record.action) ||
        record.confirmed !== true) {
        throw new TypeError(errorCode);
    }
    return { action: record.action, confirmed: true };
}
function parseFixedProduct(value, errorCode) {
    const record = exactRecord(value, ["productCode", "displayName", "currency", "amountFen"], errorCode);
    if (record.productCode !== DIGITAL_PURCHASE_PRODUCT_CODE ||
        record.displayName !== DIGITAL_PURCHASE_DISPLAY_NAME ||
        record.currency !== DIGITAL_PURCHASE_CURRENCY ||
        record.amountFen !== DIGITAL_PURCHASE_AMOUNT_FEN) {
        throw new TypeError(errorCode);
    }
    return {
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        displayName: DIGITAL_PURCHASE_DISPLAY_NAME,
        currency: DIGITAL_PURCHASE_CURRENCY,
        amountFen: DIGITAL_PURCHASE_AMOUNT_FEN,
    };
}
function validAvailabilityCombination(checkoutMode, canPurchase, reason, activeOrderId) {
    if (reason === "active_order") {
        return !canPurchase && activeOrderId !== null;
    }
    if (activeOrderId !== null)
        return false;
    if (checkoutMode === "closed") {
        return !canPurchase && reason === "payment_closed";
    }
    return canPurchase === (reason === "available");
}
function exactRecord(value, keys, errorCode) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(errorCode);
    }
    const record = value;
    const actualKeys = Object.keys(record);
    if (actualKeys.length !== keys.length ||
        actualKeys.some((key) => !keys.includes(key))) {
        throw new TypeError(errorCode);
    }
    return record;
}
function isNullableOrderId(value) {
    return (value === null ||
        (typeof value === "string" && PUBLIC_ORDER_ID_PATTERN.test(value)));
}
function isNullableQr(value, testMode) {
    if (value === null)
        return true;
    if (typeof value !== "string")
        return false;
    if (testMode) {
        return value.length <= 256 && MOCK_QR_PATTERN.test(value);
    }
    return (value.length <= WECHAT_NATIVE_QR_MAX_LENGTH &&
        value.startsWith(WECHAT_NATIVE_QR_PREFIX) &&
        value.length > WECHAT_NATIVE_QR_PREFIX.length);
}
function isNullableIsoTimestamp(value) {
    return value === null || isCanonicalIsoTimestamp(value);
}
function isCanonicalIsoTimestamp(value) {
    if (typeof value !== "string")
        return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}
//# sourceMappingURL=digital-purchase.js.map