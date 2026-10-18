import { describe, expect, it } from "vitest";

import {
  isCanonicalRechargeCouponId,
  isCanonicalRechargeOrderId,
  isRechargePaymentPresentation,
  parseCreateRechargeOrderInput,
  parseRechargeCouponPage,
  parseRechargeOrderSource,
  parseRechargeOrderView,
  parseRechargeTierList,
  parseReferralAttributionInput,
  parseReferralInviteAttributionInput,
  parseReferralInviteView,
  parseReferralRecordPage,
  parseReferralSummaryView,
  RECHARGE_ORDER_STATES,
} from "./referral-recharge.js";
import { parseRechargeTierList as parseRechargeTierListFromRoot } from "./index.js";

const couponA = `sbcp_${"A".repeat(43)}`;
const couponB = `sbcp_${"B".repeat(43)}`;
const orderId = `sbrc_${"C".repeat(43)}`;
const idempotencyKey = "01234567-89ab-4def-8123-456789abcdef";
const timestamp = "2026-08-15T00:00:00.000Z";

function rechargeOrder(replacement: Record<string, unknown> = {}) {
  return {
    orderId,
    tierCode: "recharge-100",
    currency: "CNY",
    grossFen: 10000,
    discountFen: 2000,
    payableFen: 8000,
    creditedFen: 10000,
    couponCount: 2,
    state: "PENDING",
    testMode: true,
    paymentMode: "mock",
    qrPayload: `studybuddy-mock://pay/${orderId}`,
    expiresAt: "2026-08-15T00:05:00.000Z",
    createdAt: timestamp,
    updatedAt: timestamp,
    nextPollAfterMs: 2000,
    ...replacement,
  };
}

describe("referral and recharge contracts", () => {
  it("accepts the exact four-tier catalog while keeping the legacy catalog versioned", () => {
    const tiers = [20, 50, 100, 200].map((amount) => ({
      tierCode: `recharge-${amount}`, currency: "CNY", grossFen: amount * 100,
      testMode: false, paymentMode: "wechat_native",
    }));
    expect(parseRechargeTierList(tiers, 2)).toEqual(tiers);
    expect(parseRechargeTierList(tiers.slice(1), 1)).toEqual(tiers.slice(1));
    expect(() => parseRechargeTierList(tiers.slice(1), 2)).toThrow("RECHARGE_TIER_LIST_INVALID");
    expect(() => parseRechargeTierList(tiers, 1)).toThrow("RECHARGE_TIER_LIST_INVALID");
    for (const invalid of [
      [tiers[0], tiers[0], tiers[2], tiers[3]],
      [tiers[1], tiers[0], tiers[2], tiers[3]],
      [tiers[0], tiers[2], tiers[3]],
    ]) expect(() => parseRechargeTierList(invalid, 2)).toThrow("RECHARGE_TIER_LIST_INVALID");
  });

  it("carries the CNY20 tier through native order input and exact fen settlement presentation", () => {
    const input = { tierCode: "recharge-20", couponIds: [], idempotencyKey };
    expect(parseCreateRechargeOrderInput(input)).toEqual(input);
    const view = rechargeOrder({
      tierCode: "recharge-20", grossFen: 2000, discountFen: 0, payableFen: 2000,
      creditedFen: 2000, couponCount: 0, testMode: false, paymentMode: "wechat_native",
      qrPayload: "weixin://wxpay/test-twenty",
    });
    expect(parseRechargeOrderView(view)).toEqual(view);
    for (const amount of [1999, 2001, 5000, "2000"]) {
      expect(() => parseRechargeOrderView({ ...view, grossFen: amount })).toThrow("RECHARGE_ORDER_INVALID");
      expect(() => parseRechargeOrderView({ ...view, payableFen: amount })).toThrow("RECHARGE_ORDER_INVALID");
      expect(() => parseRechargeOrderView({ ...view, creditedFen: amount })).toThrow("RECHARGE_ORDER_INVALID");
    }
  });

  it("recognizes only canonical public recharge masks", () => {
    expect(isCanonicalRechargeOrderId(`sbrc_${"A".repeat(43)}`)).toBe(true);
    expect(isCanonicalRechargeCouponId(`sbcp_${"A".repeat(43)}`)).toBe(true);
    expect(isCanonicalRechargeOrderId(`sbrc_${"A".repeat(42)}B`)).toBe(false);
    expect(isCanonicalRechargeCouponId(`sbcp_${"A".repeat(42)}B`)).toBe(false);
    expect(isCanonicalRechargeOrderId(`sbcp_${"A".repeat(43)}`)).toBe(false);
  });

  it("namespaces equal recharge order IDs by backend instance", () => {
    expect(parseRechargeOrderSource({
      backend: "primary_backend",
      backendInstanceId: "prod",
      sourceOrderId: "7",
    })).not.toEqual(parseRechargeOrderSource({
      backend: "serviceBackend_legacy",
      backendInstanceId: "legacy",
      sourceOrderId: "7",
    }));
    expect(() => parseRechargeOrderSource({
      backend: "primary_backend",
      backendInstanceId: "prod",
      sourceOrderId: "",
    })).toThrow("RECHARGE_ORDER_SOURCE_INVALID");
  });

  it("accepts a stable account invite code and its public view", () => {
    const code = `sbi_${"A".repeat(22)}`;
    expect(parseReferralInviteAttributionInput({ code })).toEqual({ code });
    expect(parseReferralInviteView({ code })).toEqual({ code });
  });

  it.each([
    { code: "sbi_short" },
    { code: `sbi_${"A".repeat(22)}`, extra: true },
    { token: "A".repeat(43) },
  ])("rejects malformed account invite payload %#", (input) => {
    expect(() => parseReferralInviteAttributionInput(input)).toThrowError(
      "REFERRAL_INVITE_ATTRIBUTION_INPUT_INVALID",
    );
  });

  it("accepts a canonical raw-base64url referral attribution token", () => {
    const input = { token: "A".repeat(43) };
    expect(parseReferralAttributionInput(input)).toEqual(input);
  });

  it.each([
    { token: "A".repeat(42) },
    { token: `${"A".repeat(42)}B` },
    { token: "A".repeat(42) + "=" },
    { token: "A".repeat(43), rawProviderToken: "secret" },
  ])("rejects non-closed referral attribution %#", (input) => {
    expect(() => parseReferralAttributionInput(input)).toThrowError(
      "REFERRAL_ATTRIBUTION_INPUT_INVALID",
    );
  });

  it("separates provable purchase counts from unavailable reward facts", () => {
    const summary = {
      invitedCount: 1,
      rewardAvailability: {
        status: "UNAVAILABLE",
        reason: "NO_AUTHORITATIVE_COUPON_LEDGER",
      },
    };
    expect(parseReferralSummaryView(summary)).toEqual(summary);
  });

  it.each([
    { invitedCount: -1 },
    { invitedCount: Number.MAX_SAFE_INTEGER + 1 },
    { rewardAvailability: { status: "AVAILABLE", reason: "NO_AUTHORITATIVE_COUPON_LEDGER" } },
    { rewardAvailability: { status: "UNAVAILABLE", reason: "DERIVED_FROM_PURCHASES" } },
    { pendingCouponCount: 0 },
    { revokedCouponCount: 0 },
    { internalId: "do-not-expose" },
  ])("rejects invalid summary count or shape %#", (replacement) => {
    expect(() =>
      parseReferralSummaryView({
        invitedCount: 0,
        rewardAvailability: {
          status: "UNAVAILABLE",
          reason: "NO_AUTHORITATIVE_COUPON_LEDGER",
        },
        ...replacement,
      }),
    ).toThrowError("REFERRAL_SUMMARY_INVALID");
  });

  it("accepts a strictly shaped referral record page", () => {
    const page = {
      items: [{
        recordId: `sbrf_${"A".repeat(43)}`,
        inviteeMask: `sbu_${"B".repeat(42)}A`,
        digitalOrderState: "FULFILLED",
        paidAt: timestamp,
        rewardAvailability: {
          status: "UNAVAILABLE",
          reason: "NO_AUTHORITATIVE_COUPON_LEDGER",
        },
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    expect(parseReferralRecordPage(page)).toEqual(page);
  });

  it.each([
    { digitalOrderState: "PAID" },
    { recordId: `sbrf_${"A".repeat(42)}!` },
    { inviteeMask: `sbu_${"A".repeat(42)}=` },
    { paidAt: "2026-08-15T00:00:00Z" },
    { rewardStatus: "AVAILABLE" },
    { availableAt: "2026-08-22T00:00:00.000Z" },
    { rewardAvailability: { status: "AVAILABLE", reason: "NO_AUTHORITATIVE_COUPON_LEDGER" } },
    { extra: true },
  ])("rejects non-closed referral records %#", (replacement) => {
    expect(() =>
      parseReferralRecordPage({
        items: [{
          recordId: `sbrf_${"A".repeat(43)}`,
          inviteeMask: `sbu_${"A".repeat(43)}`,
          digitalOrderState: "FULFILLED",
          paidAt: timestamp,
          rewardAvailability: {
            status: "UNAVAILABLE",
            reason: "NO_AUTHORITATIVE_COUPON_LEDGER",
          },
          ...replacement,
        }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toThrowError("REFERRAL_RECORD_PAGE_INVALID");
  });

  it("accepts the three test-only fixed recharge tiers", () => {
    expect(
      parseRechargeTierList([
        { tierCode: "recharge-50", currency: "CNY", grossFen: 5000, testMode: true, paymentMode: "mock" },
        { tierCode: "recharge-100", currency: "CNY", grossFen: 10000, testMode: true, paymentMode: "mock" },
        { tierCode: "recharge-200", currency: "CNY", grossFen: 20000, testMode: true, paymentMode: "mock" },
      ]),
    ).toEqual([
      { tierCode: "recharge-50", currency: "CNY", grossFen: 5000, testMode: true, paymentMode: "mock" },
      { tierCode: "recharge-100", currency: "CNY", grossFen: 10000, testMode: true, paymentMode: "mock" },
      { tierCode: "recharge-200", currency: "CNY", grossFen: 20000, testMode: true, paymentMode: "mock" },
    ]);
  });

  it("exports recharge contracts from the package root", () => {
    expect(
      parseRechargeTierListFromRoot([
        { tierCode: "recharge-50", currency: "CNY", grossFen: 5000, testMode: true, paymentMode: "mock" },
        { tierCode: "recharge-100", currency: "CNY", grossFen: 10000, testMode: true, paymentMode: "mock" },
        { tierCode: "recharge-200", currency: "CNY", grossFen: 20000, testMode: true, paymentMode: "mock" },
      ]),
    ).toHaveLength(3);
  });

  it.each([
    [{ tierCode: "recharge-50", currency: "CNY", grossFen: 5000, testMode: false, paymentMode: "mock" }],
    [{ tierCode: "recharge-50", currency: "CNY", grossFen: "5000", testMode: true, paymentMode: "mock" }],
    [{ tierCode: "recharge-300", currency: "CNY", grossFen: 30000, testMode: true, paymentMode: "mock" }],
  ])("rejects invalid recharge tiers %#", (tiers) => {
    expect(() => parseRechargeTierList(tiers)).toThrowError(
      "RECHARGE_TIER_LIST_INVALID",
    );
  });

  it("accepts a page of public recharge coupons", () => {
    const page = {
      items: [{
        couponId: couponA,
        valueFen: 1000,
        status: "AVAILABLE",
        availableAt: timestamp,
        reservedOrderId: null,
      }],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    expect(parseRechargeCouponPage(page)).toEqual(page);
  });

  it.each([
    { couponId: "1" },
    { valueFen: 1001 },
    { status: "EXPIRED" },
    { availableAt: "2026-08-15T00:00:00Z" },
    { reservedOrderId: "sbdp_internal" },
    { reservedOrderId: orderId, status: "AVAILABLE" },
    { extra: true },
  ])("rejects invalid coupon page values %#", (replacement) => {
    expect(() =>
      parseRechargeCouponPage({
        items: [{
          couponId: couponA,
          valueFen: 1000,
          status: "RESERVED",
          availableAt: timestamp,
          reservedOrderId: orderId,
          ...replacement,
        }],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toThrowError("RECHARGE_COUPON_PAGE_INVALID");
  });

  it("accepts sorted unique public coupons for a recharge order", () => {
    expect(
      parseCreateRechargeOrderInput({
        tierCode: "recharge-100",
        couponIds: [couponA, couponB],
        idempotencyKey,
      }),
    ).toEqual({
      tierCode: "recharge-100",
      couponIds: [couponA, couponB],
      idempotencyKey,
    });
  });

  it.each([
    "01234567-89ab-7def-8123-456789abcdef",
    "01234567-89ab-8def-a123-456789abcdef",
  ])("accepts a canonical modern UUID idempotency key %s", (modernIdempotencyKey) => {
    expect(
      parseCreateRechargeOrderInput({
        tierCode: "recharge-100",
        couponIds: [couponA, couponB],
        idempotencyKey: modernIdempotencyKey,
      }),
    ).toEqual({
      tierCode: "recharge-100",
      couponIds: [couponA, couponB],
      idempotencyKey: modernIdempotencyKey,
    });
  });

  it.each([
    { couponIds: [couponA, couponA] },
    { couponIds: [couponB, couponA] },
    { couponIds: Array.from({ length: 21 }, (_, index) => `sbcp_${String(index).padStart(43, "A")}`) },
    { tierCode: "recharge-50", couponIds: Array.from({ length: 6 }, (_, index) => `sbcp_${String(index).padStart(43, "A")}`) },
    { tierCode: "recharge-100", couponIds: Array.from({ length: 11 }, (_, index) => `sbcp_${String(index).padStart(43, "A")}`) },
    { tierCode: "recharge-200", couponIds: Array.from({ length: 21 }, (_, index) => `sbcp_${String(index).padStart(43, "A")}`) },
    { couponIds: ["coupon-1"] },
    { idempotencyKey: idempotencyKey.toUpperCase() },
    { idempotencyKey: "01234567-89ab-0def-8123-456789abcdef" },
    { idempotencyKey: "01234567-89ab-4def-c123-456789abcdef" },
    { amountFen: 1 },
  ])("rejects unsafe recharge order creation %#", (replacement) => {
    expect(() =>
      parseCreateRechargeOrderInput({
        tierCode: "recharge-100",
        couponIds: [couponA, couponB],
        idempotencyKey,
        ...replacement,
      }),
    ).toThrowError("RECHARGE_ORDER_INPUT_INVALID");
  });

  it("accepts a pending test-mode recharge order with only a closed mock QR payload", () => {
    expect(parseRechargeOrderView(rechargeOrder())).toEqual(rechargeOrder());
  });

  it.each([
    [
      {
        testMode: true,
        paymentMode: "mock" as const,
        qrPayload: `studybuddy-mock://pay/${orderId}`,
      },
      true,
    ],
    [
      {
        testMode: false,
        paymentMode: "wechat_native" as const,
        qrPayload: "weixin://wxpay/bizpayurl?pr=abc",
      },
      true,
    ],
    [
      {
        testMode: false,
        paymentMode: "mock" as const,
        qrPayload: `studybuddy-mock://pay/${orderId}`,
      },
      false,
    ],
    [
      {
        testMode: true,
        paymentMode: "wechat_native" as const,
        qrPayload: "weixin://wxpay/bizpayurl?pr=abc",
      },
      false,
    ],
  ])("rejects contradictory recharge payment presentation %#", (input, expected) => {
    expect(isRechargePaymentPresentation(input)).toBe(expected);
  });

  it("accepts refunded as a terminal recharge order state", () => {
    expect(RECHARGE_ORDER_STATES).toContain("REFUNDED");
    const order = rechargeOrder({
      state: "REFUNDED",
      qrPayload: null,
      expiresAt: null,
      nextPollAfterMs: null,
    });
    expect(parseRechargeOrderView(order)).toEqual(order);
  });

  it("normalizes one legacy mock order during a rolling deployment", () => {
    const { paymentMode: _omitted, ...legacy } = rechargeOrder();
    expect(parseRechargeOrderView(legacy)).toEqual(rechargeOrder());
  });

  it("rejects a pending mock QR payload for another recharge order", () => {
    expect(() =>
      parseRechargeOrderView(
        rechargeOrder({
          qrPayload: `studybuddy-mock://pay/sbrc_${"D".repeat(43)}`,
        }),
      ),
    ).toThrowError("RECHARGE_ORDER_INVALID");
  });

  it("accepts a completed recharge order after polling is closed", () => {
    expect(
      parseRechargeOrderView(
        rechargeOrder({
          state: "COMPLETED",
          qrPayload: null,
          expiresAt: null,
          nextPollAfterMs: null,
        }),
      ).state,
    ).toBe("COMPLETED");
  });

  it.each(["PAID", "COMPLETED", "FAILED", "EXPIRED", "CANCELLED"] as const)(
    "accepts exact closed payment fields for %s recharge orders",
    (state) => {
      const order = rechargeOrder({
        state,
        qrPayload: null,
        expiresAt: null,
        nextPollAfterMs: null,
      });
      expect(parseRechargeOrderView(order)).toEqual(order);
    },
  );

  it("accepts the alternate closed pending polling interval", () => {
    const order = rechargeOrder({ nextPollAfterMs: 5000 });
    expect(parseRechargeOrderView(order)).toEqual(order);
  });

  it.each([
    { state: "UNKNOWN" },
    { testMode: false },
    { grossFen: "10000" },
    { grossFen: 5000 },
    { discountFen: -1 },
    { couponCount: Number.MAX_SAFE_INTEGER + 1 },
    { payableFen: 99 },
    { creditedFen: 8000 },
    { qrPayload: "https://provider.example/secret" },
    { createdAt: "2026-08-15T00:00:00Z" },
    { state: "PAID", qrPayload: `studybuddy-mock://pay/${orderId}` },
    { state: "PAID", qrPayload: null, expiresAt: null, nextPollAfterMs: 2000 },
    { extra: true },
  ])("rejects non-closed recharge order values %#", (replacement) => {
    expect(() => parseRechargeOrderView(rechargeOrder(replacement))).toThrowError(
      "RECHARGE_ORDER_INVALID",
    );
  });

  it("rejects sparse and extended arrays at every public array boundary", () => {
    const sparseTiers = [
      { tierCode: "recharge-50", currency: "CNY", grossFen: 5000, testMode: true, paymentMode: "mock" },
      ,
      { tierCode: "recharge-200", currency: "CNY", grossFen: 20000, testMode: true, paymentMode: "mock" },
    ];
    const extendedCouponIds = [couponA, couponB] as string[] & { extra?: boolean };
    extendedCouponIds.extra = true;
    const sparseCouponItems = [
      {
        couponId: couponA,
        valueFen: 1000,
        status: "AVAILABLE",
        availableAt: timestamp,
        reservedOrderId: null,
      },
      ,
    ];
    const sparseReferralItems = [
      {
        recordId: `sbrf_${"A".repeat(43)}`,
        inviteeMask: `sbu_${"A".repeat(43)}`,
        digitalOrderState: "FULFILLED",
        paidAt: timestamp,
        rewardAvailability: {
          status: "UNAVAILABLE",
          reason: "NO_AUTHORITATIVE_COUPON_LEDGER",
        },
      },
      ,
    ];

    expect(() => parseRechargeTierList(sparseTiers)).toThrowError(
      "RECHARGE_TIER_LIST_INVALID",
    );
    expect(() =>
      parseCreateRechargeOrderInput({
        tierCode: "recharge-100",
        couponIds: extendedCouponIds,
        idempotencyKey,
      }),
    ).toThrowError("RECHARGE_ORDER_INPUT_INVALID");
    expect(() =>
      parseRechargeCouponPage({
        items: sparseCouponItems,
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toThrowError("RECHARGE_COUPON_PAGE_INVALID");
    expect(() =>
      parseReferralRecordPage({
        items: sparseReferralItems,
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    ).toThrowError("REFERRAL_RECORD_PAGE_INVALID");
  });
});
