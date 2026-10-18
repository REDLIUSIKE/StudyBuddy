/** Retained orders, original idempotency and scope-owned polling. Closing the dialog does not cancel. */
import type { CloudAccountApi, OwnedScope, RechargeOrderView, RechargeTier, RechargeCouponPage, ReferralSummaryView, ReferralRecordPage } from '@studybuddy/contracts';
import { ObservableState } from './observable.ts';
type RechargeApi = Pick<CloudAccountApi, 'listRechargeTiers' | 'listRechargeCoupons' | 'createRechargeOrder' | 'getActiveRechargeOrder' | 'getRechargeOrder' | 'cancelRechargeOrder' | 'getReferralSummary' | 'listReferralRecords'>;
export interface RechargeSnapshot {
    scope: OwnedScope | null;
    tiers: readonly RechargeTier[];
    coupons: RechargeCouponPage | null;
    referral: ReferralSummaryView | null;
    referralRecords: ReferralRecordPage | null;
    order: RechargeOrderView | null;
    pendingCreation: {
        tierCode: RechargeTier['tierCode'];
        couponIds: readonly string[];
    } | null;
    busy: boolean;
    closed: boolean;
    errorCode: string | null;
}
export declare function fenText(fen: number): string;
export declare class RechargeController extends ObservableState<RechargeSnapshot> {
    #private;
    private readonly api;
    private readonly refreshBalance;
    private readonly schedule;
    constructor(api: RechargeApi, refreshBalance: () => Promise<void>, schedule?: (callback: () => void, delay: number) => () => void);
    setScope(scope: OwnedScope | null): void;
    accept(order: RechargeOrderView): void;
    private pollLater;
    load: () => Promise<void>;
    create: (tierCode: RechargeTier["tierCode"], couponIds: string[]) => Promise<void>;
    retryCreation: () => Promise<void>;
    query: () => Promise<void>;
    cancel: () => Promise<void>;
    coupons: (page: number) => Promise<void>;
    referrals: (page: number) => Promise<void>;
    dispose(): void;
}
export {};
//# sourceMappingURL=recharge-controller.d.ts.map