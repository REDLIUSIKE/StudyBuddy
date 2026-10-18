export const DIGITAL_PURCHASE_PRODUCT_CODE =
  "studybuddy-digital-lifetime-v2" as const;
export const LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE =
  "studybuddy-digital-lifetime-v1" as const;
export const DIGITAL_PURCHASE_DISPLAY_NAME =
  "StudyBuddy 数字版终身资格" as const;
export const DIGITAL_PURCHASE_CURRENCY = "CNY" as const;
export const DIGITAL_PURCHASE_AMOUNT_FEN = 9800 as const;
export const LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN = 8000 as const;

export type DigitalPurchaseProductCode =
  | typeof DIGITAL_PURCHASE_PRODUCT_CODE
  | typeof LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE;
export type DigitalPurchaseAmountFen =
  | typeof DIGITAL_PURCHASE_AMOUNT_FEN
  | typeof LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUBLIC_ORDER_ID_PATTERN = /^sbdp_[A-Za-z0-9_-]{43}$/;
const MOCK_QR_PATTERN = /^studybuddy-mock:\/\/pay\/[A-Za-z0-9_-]{1,128}$/;
const WECHAT_NATIVE_QR_PREFIX = "weixin://wxpay/";
const WECHAT_NATIVE_QR_MAX_LENGTH = 2048;

const DIGITAL_PURCHASE_STATES = new Set<DigitalPurchaseState>([
  "CREATED",
  "PENDING",
  "PAID",
  "FULFILLED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
]);
const AVAILABILITY_REASONS = new Set<DigitalPurchaseAvailabilityReason>([
  "available",
  "payment_closed",
  "already_eligible",
  "account_not_ready",
  "active_order",
]);
const MOCK_PAYMENT_ACTIONS = new Set<MockPaymentAction>([
  "payment_succeeded",
  "payment_failed",
  "order_expired",
  "order_cancelled",
  "duplicate_last",
  "delayed_success",
  "replay_fulfillment",
]);

export type DigitalPurchaseState =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "FULFILLED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type DigitalPurchaseAvailabilityReason =
  | "available"
  | "payment_closed"
  | "already_eligible"
  | "account_not_ready"
  | "active_order";

export type DigitalPurchaseAvailability = {
  product: {
    productCode: typeof DIGITAL_PURCHASE_PRODUCT_CODE;
    displayName: typeof DIGITAL_PURCHASE_DISPLAY_NAME;
    currency: typeof DIGITAL_PURCHASE_CURRENCY;
    amountFen: typeof DIGITAL_PURCHASE_AMOUNT_FEN;
  };
  checkoutMode: "closed" | "mock" | "wechat_native";
  canPurchase: boolean;
  reason: DigitalPurchaseAvailabilityReason;
  activeOrderId: string | null;
};

export type DigitalPurchaseOrderView = {
  orderId: string;
  productCode: DigitalPurchaseProductCode;
  displayName: typeof DIGITAL_PURCHASE_DISPLAY_NAME;
  currency: typeof DIGITAL_PURCHASE_CURRENCY;
  amountFen: DigitalPurchaseAmountFen;
  state: DigitalPurchaseState;
  testMode: boolean;
  qrPayload: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextPollAfterMs: 2000 | 5000 | null;
};

export type CreateDigitalPurchaseInput = {
  productCode: typeof DIGITAL_PURCHASE_PRODUCT_CODE;
  idempotencyKey: string;
};

export type MockPaymentAction =
  | "payment_succeeded"
  | "payment_failed"
  | "order_expired"
  | "order_cancelled"
  | "duplicate_last"
  | "delayed_success"
  | "replay_fulfillment";

export type MockPaymentActionInput = {
  action: MockPaymentAction;
  confirmed: true;
};

export function parseCreateDigitalPurchaseInput(
  value: unknown,
): CreateDigitalPurchaseInput {
  const record = exactRecord(
    value,
    ["productCode", "idempotencyKey"],
    "DIGITAL_PURCHASE_INPUT_INVALID",
  );
  if (
    record.productCode !== DIGITAL_PURCHASE_PRODUCT_CODE ||
    typeof record.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(record.idempotencyKey)
  ) {
    throw new TypeError("DIGITAL_PURCHASE_INPUT_INVALID");
  }
  return {
    productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
    idempotencyKey: record.idempotencyKey,
  };
}

export function parseDigitalPurchaseAvailability(
  value: unknown,
): DigitalPurchaseAvailability {
  const errorCode = "DIGITAL_PURCHASE_AVAILABILITY_INVALID";
  const record = exactRecord(
    value,
    ["product", "checkoutMode", "canPurchase", "reason", "activeOrderId"],
    errorCode,
  );
  const product = parseFixedProduct(record.product, errorCode);
  if (
    (record.checkoutMode !== "closed" &&
      record.checkoutMode !== "mock" &&
      record.checkoutMode !== "wechat_native") ||
    typeof record.canPurchase !== "boolean" ||
    typeof record.reason !== "string" ||
    !AVAILABILITY_REASONS.has(
      record.reason as DigitalPurchaseAvailabilityReason,
    ) ||
    !isNullableOrderId(record.activeOrderId) ||
    !validAvailabilityCombination(
      record.checkoutMode,
      record.canPurchase,
      record.reason as DigitalPurchaseAvailabilityReason,
      record.activeOrderId,
    )
  ) {
    throw new TypeError(errorCode);
  }
  return {
    product,
    checkoutMode: record.checkoutMode,
    canPurchase: record.canPurchase,
    reason: record.reason as DigitalPurchaseAvailabilityReason,
    activeOrderId: record.activeOrderId,
  };
}

export function parseDigitalPurchaseOrderView(
  value: unknown,
): DigitalPurchaseOrderView {
  const errorCode = "DIGITAL_PURCHASE_ORDER_INVALID";
  const record = exactRecord(
    value,
    [
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
    ],
    errorCode,
  );
  if (
    typeof record.orderId !== "string" ||
    !PUBLIC_ORDER_ID_PATTERN.test(record.orderId) ||
    record.displayName !== DIGITAL_PURCHASE_DISPLAY_NAME ||
    record.currency !== DIGITAL_PURCHASE_CURRENCY ||
    !isSupportedDigitalPurchaseIdentity(record.productCode, record.amountFen) ||
    typeof record.state !== "string" ||
    !DIGITAL_PURCHASE_STATES.has(record.state as DigitalPurchaseState) ||
    typeof record.testMode !== "boolean" ||
    !isNullableQr(record.qrPayload, record.testMode) ||
    (record.qrPayload !== null && record.state !== "PENDING") ||
    !isNullableIsoTimestamp(record.expiresAt) ||
    !isCanonicalIsoTimestamp(record.createdAt) ||
    !isCanonicalIsoTimestamp(record.updatedAt) ||
    (record.nextPollAfterMs !== null &&
      record.nextPollAfterMs !== 2000 &&
      record.nextPollAfterMs !== 5000)
  ) {
    throw new TypeError(errorCode);
  }
  return {
    orderId: record.orderId,
    productCode: record.productCode,
    displayName: DIGITAL_PURCHASE_DISPLAY_NAME,
    currency: DIGITAL_PURCHASE_CURRENCY,
    amountFen: record.amountFen as DigitalPurchaseAmountFen,
    state: record.state as DigitalPurchaseState,
    testMode: record.testMode,
    qrPayload: record.qrPayload,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    nextPollAfterMs: record.nextPollAfterMs,
  };
}

export function isSupportedDigitalPurchaseIdentity(
  productCode: unknown,
  amountFen: unknown,
): productCode is DigitalPurchaseProductCode {
  return (
    (productCode === DIGITAL_PURCHASE_PRODUCT_CODE &&
      amountFen === DIGITAL_PURCHASE_AMOUNT_FEN) ||
    (productCode === LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE &&
      amountFen === LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN)
  );
}

export function parseMockPaymentActionInput(
  value: unknown,
): MockPaymentActionInput {
  const errorCode = "MOCK_PAYMENT_ACTION_INVALID";
  const record = exactRecord(value, ["action", "confirmed"], errorCode);
  if (
    typeof record.action !== "string" ||
    !MOCK_PAYMENT_ACTIONS.has(record.action as MockPaymentAction) ||
    record.confirmed !== true
  ) {
    throw new TypeError(errorCode);
  }
  return { action: record.action as MockPaymentAction, confirmed: true };
}

function parseFixedProduct(
  value: unknown,
  errorCode: string,
): DigitalPurchaseAvailability["product"] {
  const record = exactRecord(
    value,
    ["productCode", "displayName", "currency", "amountFen"],
    errorCode,
  );
  if (
    record.productCode !== DIGITAL_PURCHASE_PRODUCT_CODE ||
    record.displayName !== DIGITAL_PURCHASE_DISPLAY_NAME ||
    record.currency !== DIGITAL_PURCHASE_CURRENCY ||
    record.amountFen !== DIGITAL_PURCHASE_AMOUNT_FEN
  ) {
    throw new TypeError(errorCode);
  }
  return {
    productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
    displayName: DIGITAL_PURCHASE_DISPLAY_NAME,
    currency: DIGITAL_PURCHASE_CURRENCY,
    amountFen: DIGITAL_PURCHASE_AMOUNT_FEN,
  };
}

function validAvailabilityCombination(
  checkoutMode: "closed" | "mock" | "wechat_native",
  canPurchase: boolean,
  reason: DigitalPurchaseAvailabilityReason,
  activeOrderId: string | null,
): boolean {
  if (reason === "active_order") {
    return !canPurchase && activeOrderId !== null;
  }
  if (activeOrderId !== null) return false;
  if (checkoutMode === "closed") {
    return !canPurchase && reason === "payment_closed";
  }
  return canPurchase === (reason === "available");
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  errorCode: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(errorCode);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !keys.includes(key))
  ) {
    throw new TypeError(errorCode);
  }
  return record;
}

function isNullableOrderId(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && PUBLIC_ORDER_ID_PATTERN.test(value))
  );
}

function isNullableQr(value: unknown, testMode: boolean): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  if (testMode) {
    return value.length <= 256 && MOCK_QR_PATTERN.test(value);
  }
  return (
    value.length <= WECHAT_NATIVE_QR_MAX_LENGTH &&
    value.startsWith(WECHAT_NATIVE_QR_PREFIX) &&
    value.length > WECHAT_NATIVE_QR_PREFIX.length
  );
}

function isNullableIsoTimestamp(value: unknown): value is string | null {
  return value === null || isCanonicalIsoTimestamp(value);
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}
