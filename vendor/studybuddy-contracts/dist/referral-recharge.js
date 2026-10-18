import { parseGatewayReference, } from "./model-routing.js";
export const RECHARGE_PAYMENT_MODES = ["mock", "wechat_native"];
export const RECHARGE_ORDER_STATES = [
    "PENDING",
    "PAID",
    "COMPLETED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
    "REFUNDED",
    "RECONCILIATION_REQUIRED",
];
const COUPON_ID_PATTERN = /^sbcp_[A-Za-z0-9_-]{43}$/;
const ORDER_ID_PATTERN = /^sbrc_[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INVITE_CODE_PATTERN = /^sbi_[A-Za-z0-9_-]{22}$/;
const MOCK_RECHARGE_QR_PATTERN = /^studybuddy-mock:\/\/pay\/sbrc_[A-Za-z0-9_-]{43}$/;
const WECHAT_NATIVE_QR_PREFIX = "weixin://wxpay/";
const WECHAT_NATIVE_QR_MAX_LENGTH = 2048;
const COUPON_STATUSES = new Set([
    "PENDING",
    "AVAILABLE",
    "RESERVED",
    "REDEEMED",
    "REVOKED",
]);
const ORDER_STATES = new Set(RECHARGE_ORDER_STATES);
const TIER_GROSS_FEN = {
    "recharge-20": 2000,
    "recharge-50": 5000,
    "recharge-100": 10000,
    "recharge-200": 20000,
};
const TIER_MAX_COUPONS = {
    "recharge-20": 2,
    "recharge-50": 5,
    "recharge-100": 10,
    "recharge-200": 20,
};
export function parseReferralAttributionInput(value) {
    const error = "REFERRAL_ATTRIBUTION_INPUT_INVALID";
    const record = exactRecord(value, ["token"], error);
    if (typeof record.token !== "string" || !isCanonicalReferralToken(record.token)) {
        throw new TypeError(error);
    }
    return { token: record.token };
}
export function parseRechargeOrderSource(value) {
    const error = "RECHARGE_ORDER_SOURCE_INVALID";
    const record = exactRecord(value, ["backend", "backendInstanceId", "sourceOrderId"], error);
    try {
        const reference = parseGatewayReference({
            backend: record.backend,
            backendInstanceId: record.backendInstanceId,
            sourceId: record.sourceOrderId,
        });
        return {
            backend: reference.backend,
            backendInstanceId: reference.backendInstanceId,
            sourceOrderId: reference.sourceId,
        };
    }
    catch {
        throw new TypeError(error);
    }
}
export function isCanonicalRechargeOrderId(value) {
    return isCanonicalMaskedId(value, "sbrc_");
}
export function isCanonicalRechargeCouponId(value) {
    return isCanonicalMaskedId(value, "sbcp_");
}
export function parseReferralInviteAttributionInput(value) {
    const error = "REFERRAL_INVITE_ATTRIBUTION_INPUT_INVALID";
    const record = exactRecord(value, ["code"], error);
    if (typeof record.code !== "string" || !INVITE_CODE_PATTERN.test(record.code)) {
        throw new TypeError(error);
    }
    return { code: record.code };
}
export function parseReferralInviteView(value) {
    const error = "REFERRAL_INVITE_VIEW_INVALID";
    const record = exactRecord(value, ["code"], error);
    if (typeof record.code !== "string" || !INVITE_CODE_PATTERN.test(record.code)) {
        throw new TypeError(error);
    }
    return { code: record.code };
}
export function parseReferralSummaryView(value) {
    const error = "REFERRAL_SUMMARY_INVALID";
    const record = exactRecord(value, ["invitedCount", "rewardAvailability"], error);
    if (!isNonNegativeSafeInteger(record.invitedCount)) {
        throw new TypeError(error);
    }
    return {
        invitedCount: record.invitedCount,
        rewardAvailability: parseReferralRewardAvailability(record.rewardAvailability, error),
    };
}
export function parseReferralRecordPage(value) {
    const error = "REFERRAL_RECORD_PAGE_INVALID";
    const record = parsePage(value, error);
    return {
        items: record.items.map((item) => parseReferralRecord(item, error)),
        total: record.total,
        page: record.page,
        pageSize: record.pageSize,
    };
}
export function parseRechargeTierList(value, catalogVersion) {
    const error = "RECHARGE_TIER_LIST_INVALID";
    if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4) || !isClosedArray(value)
        || (catalogVersion !== undefined && catalogVersion !== 1 && catalogVersion !== 2)
        || (catalogVersion === 1 && value.length !== 3) || (catalogVersion === 2 && value.length !== 4)) {
        throw new TypeError(error);
    }
    const tiers = value.map((item) => parseRechargeTier(item, error));
    const expectedCodes = [
        ...(value.length === 4 ? ["recharge-20"] : []),
        "recharge-50",
        "recharge-100",
        "recharge-200",
    ];
    if (tiers.some((tier, index) => tier.tierCode !== expectedCodes[index])) {
        throw new TypeError(error);
    }
    return tiers;
}
export function parseRechargeCouponPage(value) {
    const error = "RECHARGE_COUPON_PAGE_INVALID";
    const record = parsePage(value, error);
    return {
        items: record.items.map((item) => parseRechargeCoupon(item, error)),
        total: record.total,
        page: record.page,
        pageSize: record.pageSize,
    };
}
export function parseCreateRechargeOrderInput(value) {
    const error = "RECHARGE_ORDER_INPUT_INVALID";
    const record = exactRecord(value, ["tierCode", "couponIds", "idempotencyKey"], error);
    const tierCode = parseTierCode(record.tierCode, error);
    if (!Array.isArray(record.couponIds) ||
        record.couponIds.length > 20 ||
        record.couponIds.length > TIER_MAX_COUPONS[tierCode] ||
        !isClosedArray(record.couponIds) ||
        typeof record.idempotencyKey !== "string" ||
        !UUID_PATTERN.test(record.idempotencyKey)) {
        throw new TypeError(error);
    }
    const couponIds = record.couponIds.map((couponId) => {
        if (typeof couponId !== "string" || !COUPON_ID_PATTERN.test(couponId)) {
            throw new TypeError(error);
        }
        return couponId;
    });
    if (couponIds.some((couponId, index) => index > 0 && couponId <= couponIds[index - 1])) {
        throw new TypeError(error);
    }
    return { tierCode, couponIds, idempotencyKey: record.idempotencyKey };
}
export function parseRechargeOrderView(value) {
    const error = "RECHARGE_ORDER_INVALID";
    const hasPaymentMode = typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.hasOwn(value, "paymentMode");
    const record = exactRecord(value, [
        "orderId",
        "tierCode",
        "currency",
        "grossFen",
        "discountFen",
        "payableFen",
        "creditedFen",
        "couponCount",
        "state",
        "testMode",
        ...(hasPaymentMode ? ["paymentMode"] : []),
        "qrPayload",
        "expiresAt",
        "createdAt",
        "updatedAt",
        "nextPollAfterMs",
    ], error);
    const tierCode = parseTierCode(record.tierCode, error);
    const paymentMode = parseRechargePaymentMode(record, hasPaymentMode, error);
    if (typeof record.orderId !== "string" ||
        !ORDER_ID_PATTERN.test(record.orderId) ||
        record.currency !== "CNY" ||
        record.grossFen !== TIER_GROSS_FEN[tierCode] ||
        !isNonNegativeSafeInteger(record.discountFen) ||
        !isNonNegativeSafeInteger(record.payableFen) ||
        !isNonNegativeSafeInteger(record.creditedFen) ||
        !isNonNegativeSafeInteger(record.couponCount) ||
        record.couponCount > TIER_MAX_COUPONS[tierCode] ||
        typeof record.state !== "string" ||
        !ORDER_STATES.has(record.state) ||
        typeof record.testMode !== "boolean" ||
        !isRechargeModePair(record.testMode, paymentMode) ||
        !isCanonicalIsoTimestamp(record.createdAt) ||
        !isCanonicalIsoTimestamp(record.updatedAt) ||
        !isValidRechargeAmounts(record, tierCode) ||
        !isValidRechargePaymentState(record, record.orderId, paymentMode)) {
        throw new TypeError(error);
    }
    return {
        orderId: record.orderId,
        tierCode,
        currency: "CNY",
        grossFen: record.grossFen,
        discountFen: record.discountFen,
        payableFen: record.payableFen,
        creditedFen: record.creditedFen,
        couponCount: record.couponCount,
        state: record.state,
        testMode: record.testMode,
        paymentMode,
        qrPayload: record.qrPayload,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        nextPollAfterMs: record.nextPollAfterMs,
    };
}
function parseReferralRecord(value, error) {
    const record = exactRecord(value, [
        "recordId",
        "inviteeMask",
        "digitalOrderState",
        "paidAt",
        "rewardAvailability",
    ], error);
    if (!isCanonicalMaskedId(record.recordId, "sbrf_") ||
        !isCanonicalMaskedId(record.inviteeMask, "sbu_") ||
        (record.digitalOrderState !== "FULFILLED" &&
            record.digitalOrderState !== "REFUNDED") ||
        !isCanonicalIsoTimestamp(record.paidAt)) {
        throw new TypeError(error);
    }
    return {
        recordId: record.recordId,
        inviteeMask: record.inviteeMask,
        digitalOrderState: record.digitalOrderState,
        paidAt: record.paidAt,
        rewardAvailability: parseReferralRewardAvailability(record.rewardAvailability, error),
    };
}
function parseReferralRewardAvailability(value, error) {
    const record = exactRecord(value, ["status", "reason"], error);
    if (record.status !== "UNAVAILABLE" ||
        record.reason !== "NO_AUTHORITATIVE_COUPON_LEDGER") {
        throw new TypeError(error);
    }
    return {
        status: "UNAVAILABLE",
        reason: "NO_AUTHORITATIVE_COUPON_LEDGER",
    };
}
function parseRechargeTier(value, error) {
    const record = exactRecord(value, ["tierCode", "currency", "grossFen", "testMode", "paymentMode"], error);
    const tierCode = parseTierCode(record.tierCode, error);
    if (record.currency !== "CNY" ||
        record.grossFen !== TIER_GROSS_FEN[tierCode] ||
        typeof record.testMode !== "boolean" ||
        (record.paymentMode !== "mock" && record.paymentMode !== "wechat_native") ||
        !isRechargeModePair(record.testMode, record.paymentMode)) {
        throw new TypeError(error);
    }
    return {
        tierCode,
        currency: "CNY",
        grossFen: record.grossFen,
        testMode: record.testMode,
        paymentMode: record.paymentMode,
    };
}
export function isRechargePaymentPresentation(value) {
    if (!isRechargeModePair(value.testMode, value.paymentMode))
        return false;
    return value.paymentMode === "mock"
        ? MOCK_RECHARGE_QR_PATTERN.test(value.qrPayload)
        : isWechatNativeQr(value.qrPayload);
}
function parseRechargePaymentMode(record, hasPaymentMode, error) {
    if (record.paymentMode === "mock" || record.paymentMode === "wechat_native") {
        return record.paymentMode;
    }
    if (!hasPaymentMode &&
        record.testMode === true &&
        typeof record.orderId === "string" &&
        record.qrPayload === `studybuddy-mock://pay/${record.orderId}`) {
        return "mock";
    }
    throw new TypeError(error);
}
function isRechargeModePair(testMode, paymentMode) {
    return paymentMode === "mock" ? testMode : !testMode;
}
function isWechatNativeQr(value) {
    return (typeof value === "string" &&
        value.length > WECHAT_NATIVE_QR_PREFIX.length &&
        value.length <= WECHAT_NATIVE_QR_MAX_LENGTH &&
        value.startsWith(WECHAT_NATIVE_QR_PREFIX) &&
        !/[\u0000-\u0020\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u.test(value));
}
function parseRechargeCoupon(value, error) {
    const record = exactRecord(value, ["couponId", "valueFen", "status", "availableAt", "reservedOrderId"], error);
    if (typeof record.couponId !== "string" ||
        !COUPON_ID_PATTERN.test(record.couponId) ||
        record.valueFen !== 1000 ||
        typeof record.status !== "string" ||
        !COUPON_STATUSES.has(record.status) ||
        !isCanonicalIsoTimestamp(record.availableAt) ||
        !isCouponReservationShape(record.status, record.reservedOrderId)) {
        throw new TypeError(error);
    }
    return {
        couponId: record.couponId,
        valueFen: 1000,
        status: record.status,
        availableAt: record.availableAt,
        reservedOrderId: record.reservedOrderId,
    };
}
function parsePage(value, error) {
    const record = exactRecord(value, ["items", "total", "page", "pageSize"], error);
    if (!Array.isArray(record.items) ||
        record.items.length > 100 ||
        !isClosedArray(record.items) ||
        !isNonNegativeSafeInteger(record.total) ||
        !isBoundedSafeInteger(record.page, 1, 1000) ||
        !isBoundedSafeInteger(record.pageSize, 1, 100) ||
        record.items.length > record.pageSize) {
        throw new TypeError(error);
    }
    return record;
}
function parseTierCode(value, error) {
    if (value === "recharge-20" || value === "recharge-50" || value === "recharge-100" || value === "recharge-200") {
        return value;
    }
    throw new TypeError(error);
}
function exactRecord(value, keys, error) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
        throw new TypeError(error);
    }
    const record = value;
    const actualKeys = Reflect.ownKeys(record);
    if (actualKeys.length !== keys.length ||
        actualKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
        throw new TypeError(error);
    }
    return record;
}
function isClosedArray(value) {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
        return false;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1)
        return false;
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index))
            return false;
    }
    return keys.every((key) => key === "length" ||
        (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < value.length));
}
function isCanonicalReferralToken(value) {
    if (!TOKEN_PATTERN.test(value))
        return false;
    const alphabetIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(value[value.length - 1]);
    return (alphabetIndex & 0b11) === 0;
}
function isNonNegativeSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isBoundedSafeInteger(value, minimum, maximum) {
    return isNonNegativeSafeInteger(value) && value >= minimum && value <= maximum;
}
function isCanonicalIsoTimestamp(value) {
    if (typeof value !== "string")
        return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}
function isCouponReservationShape(status, reservedOrderId) {
    if (status === "RESERVED") {
        return typeof reservedOrderId === "string" && ORDER_ID_PATTERN.test(reservedOrderId);
    }
    return reservedOrderId === null;
}
function isValidRechargeAmounts(record, tierCode) {
    const grossFen = TIER_GROSS_FEN[tierCode];
    const couponCount = record.couponCount;
    const expectedDiscountFen = Math.min(couponCount * 1000, grossFen - 100);
    return (record.discountFen === expectedDiscountFen &&
        record.payableFen === grossFen - expectedDiscountFen &&
        record.creditedFen === grossFen);
}
function isValidRechargePaymentState(record, orderId, paymentMode) {
    const state = record.state;
    const hasClosedMockQr = typeof orderId === "string" &&
        record.qrPayload === `studybuddy-mock://pay/${orderId}`;
    const hasCanonicalExpiry = isCanonicalIsoTimestamp(record.expiresAt);
    const hasPollingInterval = record.nextPollAfterMs === 2000 || record.nextPollAfterMs === 5000;
    if (state === "PENDING") {
        const hasValidQr = paymentMode === "mock" ? hasClosedMockQr : isWechatNativeQr(record.qrPayload);
        return hasValidQr && hasCanonicalExpiry && hasPollingInterval;
    }
    return (record.qrPayload === null &&
        record.expiresAt === null &&
        record.nextPollAfterMs === null);
}
function isCanonicalMaskedId(value, prefix) {
    if (typeof value !== "string" ||
        !new RegExp(`^${prefix}[A-Za-z0-9_-]{43}$`, "u").test(value))
        return false;
    const last = value[value.length - 1];
    if (last === undefined)
        return false;
    const index = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        .indexOf(last);
    return index >= 0 && (index & 0b11) === 0;
}
//# sourceMappingURL=referral-recharge.js.map