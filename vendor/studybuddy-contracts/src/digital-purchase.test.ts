import { describe, expect, it } from "vitest";

import {
  DIGITAL_PURCHASE_PRODUCT_CODE,
  isSupportedDigitalPurchaseIdentity,
  parseCreateDigitalPurchaseInput,
  parseDigitalPurchaseAvailability,
  parseDigitalPurchaseOrderView,
  parseMockPaymentActionInput,
} from "./digital-purchase.js";

const orderId = `sbdp_${"A".repeat(43)}`;
const idempotencyKey = "01234567-89ab-4def-8123-456789abcdef";

describe("digital purchase contract", () => {
  it("accepts the exact fixed-product create input", () => {
    expect(
      parseCreateDigitalPurchaseInput({
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        idempotencyKey,
      }),
    ).toEqual({
      productCode: "studybuddy-digital-lifetime-v2",
      idempotencyKey,
    });
  });

  it.each([
    { productCode: "studybuddy_digital", idempotencyKey },
    { productCode: "studybuddy-digital-lifetime-v1", idempotencyKey },
    { productCode: DIGITAL_PURCHASE_PRODUCT_CODE, idempotencyKey: idempotencyKey.toUpperCase() },
    { productCode: DIGITAL_PURCHASE_PRODUCT_CODE, idempotencyKey, amountFen: 1 },
    { productCode: DIGITAL_PURCHASE_PRODUCT_CODE, idempotencyKey, provider: "studybuddy_mock" },
    { productCode: DIGITAL_PURCHASE_PRODUCT_CODE, idempotencyKey, callbackUrl: "https://example.invalid" },
  ])("rejects non-closed create input %#", (input) => {
    expect(() => parseCreateDigitalPurchaseInput(input)).toThrowError(
      "DIGITAL_PURCHASE_INPUT_INVALID",
    );
  });

  it("accepts the exact closed availability response", () => {
    expect(
      parseDigitalPurchaseAvailability({
        product: {
          productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
          displayName: "StudyBuddy 数字版终身资格",
          currency: "CNY",
          amountFen: 9800,
        },
        checkoutMode: "mock",
        canPurchase: false,
        reason: "active_order",
        activeOrderId: orderId,
      }),
    ).toEqual({
      product: {
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        displayName: "StudyBuddy 数字版终身资格",
        currency: "CNY",
        amountFen: 9800,
      },
      checkoutMode: "mock",
      canPurchase: false,
      reason: "active_order",
      activeOrderId: orderId,
    });
  });

  it("accepts WeChat Native checkout availability for the fixed product", () => {
    expect(
      parseDigitalPurchaseAvailability({
        product: {
          productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
          displayName: "StudyBuddy 数字版终身资格",
          currency: "CNY",
          amountFen: 9800,
        },
        checkoutMode: "wechat_native",
        canPurchase: true,
        reason: "available",
        activeOrderId: null,
      }),
    ).toMatchObject({
      checkoutMode: "wechat_native",
      product: { amountFen: 9800 },
    });
  });

  it.each([
    { checkoutMode: "live", canPurchase: true, reason: "available", activeOrderId: null },
    { checkoutMode: "mock", canPurchase: "true", reason: "available", activeOrderId: null },
    { checkoutMode: "mock", canPurchase: true, reason: "unknown", activeOrderId: null },
    { checkoutMode: "mock", canPurchase: true, reason: "available", activeOrderId: orderId },
  ])("rejects invalid availability values %#", (partial) => {
    expect(() =>
      parseDigitalPurchaseAvailability({
        product: {
          productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
          displayName: "StudyBuddy 数字版终身资格",
          currency: "CNY",
          amountFen: 9800,
        },
        ...partial,
      }),
    ).toThrowError("DIGITAL_PURCHASE_AVAILABILITY_INVALID");
  });

  it.each([
    "CREATED",
    "PENDING",
    "PAID",
    "FULFILLED",
    "FAILED",
    "EXPIRED",
    "CANCELLED",
  ] as const)("accepts the public %s order state", (state) => {
    expect(
      parseDigitalPurchaseOrderView({
        orderId,
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        displayName: "StudyBuddy 数字版终身资格",
        currency: "CNY",
        amountFen: 9800,
        state,
        testMode: true,
        qrPayload: state === "PENDING" ? `studybuddy-mock://pay/${orderId}` : null,
        expiresAt: state === "PENDING" ? "2026-08-14T02:00:00.000Z" : null,
        createdAt: "2026-08-14T01:00:00.000Z",
        updatedAt: "2026-08-14T01:01:00.000Z",
        nextPollAfterMs: state === "PENDING" ? 2000 : null,
      }).state,
    ).toBe(state);
  });

  it("accepts a pending live order only with a bounded WeChat Native code URL", () => {
    expect(
      parseDigitalPurchaseOrderView({
        orderId,
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        displayName: "StudyBuddy 数字版终身资格",
        currency: "CNY",
        amountFen: 9800,
        state: "PENDING",
        testMode: false,
        qrPayload: "weixin://wxpay/bizpayurl?pr=example-native-code",
        expiresAt: "2026-08-14T02:00:00.000Z",
        createdAt: "2026-08-14T01:00:00.000Z",
        updatedAt: "2026-08-14T01:01:00.000Z",
        nextPollAfterMs: 2000,
      }),
    ).toMatchObject({ testMode: false, amountFen: 9800 });
  });

  it("reads an immutable legacy v1/80 order without treating it as the current price", () => {
    expect(
      parseDigitalPurchaseOrderView({
        orderId,
        productCode: "studybuddy-digital-lifetime-v1",
        displayName: "StudyBuddy 数字版终身资格",
        currency: "CNY",
        amountFen: 8000,
        state: "FULFILLED",
        testMode: false,
        qrPayload: null,
        expiresAt: null,
        createdAt: "2026-08-14T01:00:00.000Z",
        updatedAt: "2026-08-14T01:01:00.000Z",
        nextPollAfterMs: null,
      }),
    ).toMatchObject({
      productCode: "studybuddy-digital-lifetime-v1",
      amountFen: 8000,
    });
  });

  it.each([
    ["studybuddy-digital-lifetime-v1", 9800],
    ["studybuddy-digital-lifetime-v2", 8000],
    ["studybuddy-digital-lifetime-v3", 9800],
  ])("rejects a crossed or unknown product identity %s/%s", (productCode, amountFen) => {
    expect(isSupportedDigitalPurchaseIdentity(productCode, amountFen)).toBe(false);
  });

  it.each([
    { state: "UNKNOWN" },
    { testMode: false, qrPayload: `studybuddy-mock://pay/${orderId}` },
    { testMode: false, qrPayload: "https://example.invalid/pay" },
    { testMode: false, qrPayload: `weixin://wxpay/${"a".repeat(2049)}` },
    { state: "PAID", qrPayload: `studybuddy-mock://pay/${orderId}` },
    { amountFen: "9800" },
    { orderId: "1001" },
    { nextPollAfterMs: 3000 },
    { createdAt: "2026-08-14" },
    { updatedAt: "2026-08-14T01:01:00Z" },
    { extra: true },
  ])("rejects non-closed order values %#", (replacement) => {
    expect(() =>
      parseDigitalPurchaseOrderView({
        orderId,
        productCode: DIGITAL_PURCHASE_PRODUCT_CODE,
        displayName: "StudyBuddy 数字版终身资格",
        currency: "CNY",
        amountFen: 9800,
        state: "PENDING",
        testMode: true,
        qrPayload: `studybuddy-mock://pay/${orderId}`,
        expiresAt: "2026-08-14T02:00:00.000Z",
        createdAt: "2026-08-14T01:00:00.000Z",
        updatedAt: "2026-08-14T01:01:00.000Z",
        nextPollAfterMs: 2000,
        ...replacement,
      }),
    ).toThrowError("DIGITAL_PURCHASE_ORDER_INVALID");
  });

  it.each([
    "payment_succeeded",
    "payment_failed",
    "order_expired",
    "order_cancelled",
    "duplicate_last",
    "delayed_success",
    "replay_fulfillment",
  ] as const)("accepts the exact mock action %s", (action) => {
    expect(parseMockPaymentActionInput({ action, confirmed: true })).toEqual({
      action,
      confirmed: true,
    });
  });

  it.each([
    { action: "payment_succeeded", confirmed: false },
    { action: "paid", confirmed: true },
    { action: "payment_succeeded", confirmed: true, amount: "0.01" },
    { action: "payment_succeeded", confirmed: true, rawEvent: {} },
  ])("rejects non-closed mock action input %#", (input) => {
    expect(() => parseMockPaymentActionInput(input)).toThrowError(
      "MOCK_PAYMENT_ACTION_INVALID",
    );
  });

});
