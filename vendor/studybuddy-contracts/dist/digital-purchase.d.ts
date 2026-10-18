export declare const DIGITAL_PURCHASE_PRODUCT_CODE: "studybuddy-digital-lifetime-v2";
export declare const LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE: "studybuddy-digital-lifetime-v1";
export declare const DIGITAL_PURCHASE_DISPLAY_NAME: "StudyBuddy 数字版终身资格";
export declare const DIGITAL_PURCHASE_CURRENCY: "CNY";
export declare const DIGITAL_PURCHASE_AMOUNT_FEN: 9800;
export declare const LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN: 8000;
export type DigitalPurchaseProductCode = typeof DIGITAL_PURCHASE_PRODUCT_CODE | typeof LEGACY_DIGITAL_PURCHASE_PRODUCT_CODE;
export type DigitalPurchaseAmountFen = typeof DIGITAL_PURCHASE_AMOUNT_FEN | typeof LEGACY_DIGITAL_PURCHASE_AMOUNT_FEN;
export type DigitalPurchaseState = "CREATED" | "PENDING" | "PAID" | "FULFILLED" | "FAILED" | "EXPIRED" | "CANCELLED";
export type DigitalPurchaseAvailabilityReason = "available" | "payment_closed" | "already_eligible" | "account_not_ready" | "active_order";
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
export type MockPaymentAction = "payment_succeeded" | "payment_failed" | "order_expired" | "order_cancelled" | "duplicate_last" | "delayed_success" | "replay_fulfillment";
export type MockPaymentActionInput = {
    action: MockPaymentAction;
    confirmed: true;
};
export declare function parseCreateDigitalPurchaseInput(value: unknown): CreateDigitalPurchaseInput;
export declare function parseDigitalPurchaseAvailability(value: unknown): DigitalPurchaseAvailability;
export declare function parseDigitalPurchaseOrderView(value: unknown): DigitalPurchaseOrderView;
export declare function isSupportedDigitalPurchaseIdentity(productCode: unknown, amountFen: unknown): productCode is DigitalPurchaseProductCode;
export declare function parseMockPaymentActionInput(value: unknown): MockPaymentActionInput;
