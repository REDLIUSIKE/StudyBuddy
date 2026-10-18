import { type AiGatewayBackend } from "./model-routing.js";
export type RechargeCouponStatus = "PENDING" | "AVAILABLE" | "RESERVED" | "REDEEMED" | "REVOKED";
export type ReferralAttributionInput = {
    token: string;
};
export type ReferralInviteAttributionInput = {
    code: string;
};
export type ReferralInviteView = {
    code: string;
};
export declare const RECHARGE_PAYMENT_MODES: readonly ["mock", "wechat_native"];
export type RechargePaymentMode = (typeof RECHARGE_PAYMENT_MODES)[number];
export declare const RECHARGE_ORDER_STATES: readonly ["PENDING", "PAID", "COMPLETED", "FAILED", "EXPIRED", "CANCELLED", "REFUNDED", "RECONCILIATION_REQUIRED"];
export type RechargeOrderState = (typeof RECHARGE_ORDER_STATES)[number];
export type RechargeOrderSource = Readonly<{
    backend: AiGatewayBackend;
    backendInstanceId: string;
    sourceOrderId: string;
}>;
export type RechargePaymentPresentation = Readonly<{
    testMode: boolean;
    paymentMode: RechargePaymentMode;
    qrPayload: string;
}>;
export type RechargeTier = {
    tierCode: "recharge-20" | "recharge-50" | "recharge-100" | "recharge-200";
    currency: "CNY";
    grossFen: 2000 | 5000 | 10000 | 20000;
    testMode: boolean;
    paymentMode: RechargePaymentMode;
};
export type RechargeTierCatalogVersion = 1 | 2;
export type RechargeCouponView = {
    couponId: string;
    valueFen: 1000;
    status: RechargeCouponStatus;
    availableAt: string;
    reservedOrderId: string | null;
};
export type RechargeCouponPage = {
    items: RechargeCouponView[];
    total: number;
    page: number;
    pageSize: number;
};
export type ReferralRewardAvailability = {
    status: "UNAVAILABLE";
    reason: "NO_AUTHORITATIVE_COUPON_LEDGER";
};
export type ReferralRecordView = {
    recordId: string;
    inviteeMask: string;
    digitalOrderState: "FULFILLED" | "REFUNDED";
    paidAt: string;
    rewardAvailability: ReferralRewardAvailability;
};
export type ReferralRecordPage = {
    items: ReferralRecordView[];
    total: number;
    page: number;
    pageSize: number;
};
export type RechargeOrderView = {
    orderId: string;
    tierCode: RechargeTier["tierCode"];
    currency: "CNY";
    grossFen: 2000 | 5000 | 10000 | 20000;
    discountFen: number;
    payableFen: number;
    creditedFen: number;
    couponCount: number;
    state: RechargeOrderState;
    testMode: boolean;
    paymentMode: RechargePaymentMode;
    qrPayload: string | null;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
    nextPollAfterMs: 2000 | 5000 | null;
};
export type CreateRechargeOrderInput = {
    tierCode: RechargeTier["tierCode"];
    couponIds: string[];
    idempotencyKey: string;
};
export type ReferralSummaryView = {
    invitedCount: number;
    rewardAvailability: ReferralRewardAvailability;
};
export declare function parseReferralAttributionInput(value: unknown): ReferralAttributionInput;
export declare function parseRechargeOrderSource(value: unknown): RechargeOrderSource;
export declare function isCanonicalRechargeOrderId(value: unknown): value is string;
export declare function isCanonicalRechargeCouponId(value: unknown): value is string;
export declare function parseReferralInviteAttributionInput(value: unknown): ReferralInviteAttributionInput;
export declare function parseReferralInviteView(value: unknown): ReferralInviteView;
export declare function parseReferralSummaryView(value: unknown): ReferralSummaryView;
export declare function parseReferralRecordPage(value: unknown): ReferralRecordPage;
export declare function parseRechargeTierList(value: unknown, catalogVersion?: RechargeTierCatalogVersion): RechargeTier[];
export declare function parseRechargeCouponPage(value: unknown): RechargeCouponPage;
export declare function parseCreateRechargeOrderInput(value: unknown): CreateRechargeOrderInput;
export declare function parseRechargeOrderView(value: unknown): RechargeOrderView;
export declare function isRechargePaymentPresentation(value: RechargePaymentPresentation): boolean;
