import { ObservableState, sameScope, errorCode } from "./observable.js";
const initial = (scope) => ({ scope, tiers: [], coupons: null, referral: null, referralRecords: null, order: null, pendingCreation: null, busy: false, closed: false, errorCode: null });
const terminal = (order) => ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED', 'REFUNDED'].includes(order.state);
export function fenText(fen) { if (!Number.isSafeInteger(fen) || fen < 0)
    throw new Error('RECHARGE_AMOUNT_INVALID'); return '¥' + Math.floor(fen / 100) + '.' + String(fen % 100).padStart(2, '0'); }
export class RechargeController extends ObservableState {
    api;
    refreshBalance;
    schedule;
    #epoch = 0;
    #stop;
    #completed = new Set();
    #creation = null;
    #failures = 0;
    constructor(api, refreshBalance, schedule = (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); }) {
        super(initial(null));
        this.api = api;
        this.refreshBalance = refreshBalance;
        this.schedule = schedule;
    }
    setScope(scope) {
        if (sameScope(scope, this.snapshot.scope))
            return;
        ++this.#epoch;
        this.#stop?.();
        this.#stop = undefined;
        this.#completed.clear();
        this.#creation = null;
        this.#failures = 0;
        this.publish(initial(scope));
    }
    accept(order) {
        this.publish({ ...this.snapshot, order, pendingCreation: null });
        if (order.state === 'COMPLETED' && !this.#completed.has(order.orderId)) {
            this.#completed.add(order.orderId);
            void this.refreshBalance();
        }
        if (terminal(order))
            this.#creation = null;
        this.pollLater();
    }
    pollLater() {
        this.#stop?.();
        this.#stop = undefined;
        const order = this.snapshot.order, epoch = this.#epoch;
        if (!order || terminal(order) || this.snapshot.scope === null)
            return;
        const delay = Math.min(30_000, (order.nextPollAfterMs ?? 5000) * 2 ** Math.min(this.#failures, 4));
        this.#stop = this.schedule(() => { if (epoch === this.#epoch) {
            if (this.snapshot.busy)
                this.pollLater();
            else
                void this.query();
        } }, delay);
    }
    load = async () => {
        if (this.snapshot.scope === null || this.snapshot.busy)
            return;
        const epoch = this.#epoch;
        this.publish({ ...this.snapshot, busy: true, errorCode: null });
        const reads = await Promise.allSettled([this.api.listRechargeTiers(), this.api.listRechargeCoupons(), this.api.getReferralSummary(), this.api.listReferralRecords(), this.api.getActiveRechargeOrder()]);
        if (epoch !== this.#epoch)
            return;
        const [tiers, coupons, referral, records, active] = reads;
        this.publish({ ...this.snapshot,
            tiers: tiers.status === 'fulfilled' ? tiers.value : this.snapshot.tiers,
            coupons: coupons.status === 'fulfilled' ? coupons.value : this.snapshot.coupons,
            referral: referral.status === 'fulfilled' ? referral.value : this.snapshot.referral,
            referralRecords: records.status === 'fulfilled' ? records.value : this.snapshot.referralRecords,
            busy: false, closed: reads.some(result => result.status === 'rejected' && errorCode(result.reason) === 'RECHARGE_PAYMENT_CLOSED'),
            errorCode: reads.some(result => result.status === 'rejected') ? 'RECHARGE_READ_FAILED' : null,
        });
        if (active.status === 'fulfilled') {
            if (active.value !== null) {
                if (this.snapshot.order && !terminal(this.snapshot.order) && this.snapshot.order.orderId !== active.value.orderId) {
                    this.publish({ ...this.snapshot, errorCode: 'RECHARGE_ORDER_MISMATCH' });
                    return;
                }
                this.accept(active.value);
            }
            else if (this.snapshot.order && !terminal(this.snapshot.order))
                await this.query();
        }
    };
    create = async (tierCode, couponIds) => {
        if (this.snapshot.scope === null || this.snapshot.busy || this.snapshot.closed)
            return;
        if (this.snapshot.order && !terminal(this.snapshot.order)) {
            await this.query();
            return;
        }
        if (this.#creation && (this.#creation.tierCode !== tierCode || JSON.stringify(this.#creation.couponIds) !== JSON.stringify(couponIds))) {
            this.publish({ ...this.snapshot, errorCode: 'RECHARGE_CREATION_PENDING' });
            return;
        }
        if (!this.snapshot.tiers.some(tier => tier.tierCode === tierCode)) {
            this.publish({ ...this.snapshot, errorCode: 'RECHARGE_TIERS_UNAVAILABLE' });
            return;
        }
        this.#creation ??= { tierCode, couponIds: [...couponIds], idempotencyKey: crypto.randomUUID() };
        const creation = this.#creation, epoch = this.#epoch;
        this.publish({ ...this.snapshot, busy: true, errorCode: null, pendingCreation: { tierCode: creation.tierCode, couponIds: creation.couponIds } });
        try {
            const order = await this.api.createRechargeOrder(creation.tierCode, creation.couponIds, creation.idempotencyKey);
            if (epoch === this.#epoch)
                this.accept(order);
        }
        catch (error) {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, errorCode: errorCode(error), closed: errorCode(error) === 'RECHARGE_PAYMENT_CLOSED' });
        }
        finally {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, busy: false });
        }
    };
    retryCreation = async () => { const original = this.#creation; if (original)
        await this.create(original.tierCode, [...original.couponIds]); };
    query = async () => {
        const order = this.snapshot.order;
        if (!order || this.snapshot.scope === null || this.snapshot.busy)
            return;
        const epoch = this.#epoch;
        this.publish({ ...this.snapshot, busy: true, errorCode: null });
        try {
            const next = await this.api.getRechargeOrder(order.orderId);
            if (epoch !== this.#epoch)
                return;
            if (next.orderId !== order.orderId)
                throw new Error('RECHARGE_ORDER_MISMATCH');
            this.#failures = 0;
            this.accept(next);
        }
        catch (error) {
            if (epoch === this.#epoch) {
                this.#failures++;
                this.publish({ ...this.snapshot, errorCode: errorCode(error) });
                this.pollLater();
            }
        }
        finally {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, busy: false });
        }
    };
    cancel = async () => {
        const order = this.snapshot.order;
        if (!order || this.snapshot.scope === null || this.snapshot.busy)
            return;
        const epoch = this.#epoch;
        this.publish({ ...this.snapshot, busy: true, errorCode: null });
        try {
            const next = await this.api.cancelRechargeOrder(order.orderId);
            if (epoch === this.#epoch) {
                if (next.orderId !== order.orderId)
                    throw new Error('RECHARGE_ORDER_MISMATCH');
                this.accept(next);
            }
        }
        catch (error) {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, errorCode: errorCode(error) });
        }
        finally {
            if (epoch === this.#epoch)
                this.publish({ ...this.snapshot, busy: false });
        }
    };
    coupons = async (page) => { if (!this.snapshot.scope)
        return; const epoch = this.#epoch; try {
        const coupons = await this.api.listRechargeCoupons(page);
        if (epoch === this.#epoch)
            this.publish({ ...this.snapshot, coupons });
    }
    catch (error) {
        if (epoch === this.#epoch)
            this.publish({ ...this.snapshot, errorCode: errorCode(error) });
    } };
    referrals = async (page) => { if (!this.snapshot.scope)
        return; const epoch = this.#epoch; try {
        const referralRecords = await this.api.listReferralRecords(page);
        if (epoch === this.#epoch)
            this.publish({ ...this.snapshot, referralRecords });
    }
    catch (error) {
        if (epoch === this.#epoch)
            this.publish({ ...this.snapshot, errorCode: errorCode(error) });
    } };
    dispose() { this.setScope(null); super.dispose(); }
}
//# sourceMappingURL=recharge-controller.js.map