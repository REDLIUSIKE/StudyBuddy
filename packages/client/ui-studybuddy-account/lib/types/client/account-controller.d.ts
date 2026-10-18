/** One balance authority for the header, account page and completed recharge orders. */
import type { AiAccountSummary, CloudAccountApi, OwnedScope, CanonicalMoney } from '@studybuddy/contracts';
import { ObservableState } from './observable.ts';
export interface AccountSnapshot {
    readonly scope: OwnedScope | null;
    readonly summary: AiAccountSummary | null;
    readonly status: 'idle' | 'loading' | 'ready' | 'error';
    readonly stale: boolean;
    readonly errorCode: string | null;
}
export declare function moneyText(value: CanonicalMoney | undefined | null): string;
export declare class StudyBuddyAccountController extends ObservableState<AccountSnapshot> {
    #private;
    private readonly api;
    constructor(api: Pick<CloudAccountApi, 'getAiAccountSummary'>);
    setScope(scope: OwnedScope | null): void;
    /** Join the current scope's authoritative read; automatic refreshes cannot supersede it. */
    refreshSummary: () => Promise<void>;
    private readSummary;
    dispose(): void;
}
//# sourceMappingURL=account-controller.d.ts.map