/** Retain Rust-issued exact plans privately. Unknown writes are queried, never replayed. */
import type { ActiveInstallView, InstallPlan, InstallRunView, NativeToolId, ToolInstallPreparationView, OwnedScope, ToolViewLease } from '@studybuddy/contracts';
import type { NativeAccountClient } from './native-account-client.ts';
type Native = Pick<NativeAccountClient, 'invoke'>;
/** A page never receives the private Rust authorizationId. Revocation retains journals. */
export declare class ToolInstallAuthorizations {
    private readonly native;
    private readonly grants;
    private readonly planning;
    private readonly uncertainPreparations;
    private readonly revoked;
    constructor(native: Native);
    private current;
    /** @param owner Current private view lease. @param toolId One admitted tool, never a page-selected component set.
     * @returns Public native evidence and exact issued plan, without the private authorization.
     */
    prepare(owner: ToolViewLease, toolId: NativeToolId): Promise<ToolInstallPreparationView>;
    private issue;
    private recover;
    /** Original zero-argument UI readback can recover a lost start, including terminal journals. */
    active(owner: ToolViewLease): Promise<ActiveInstallView | null>;
    start(owner: ToolViewLease, plan: InstallPlan): Promise<InstallRunView>;
    revoke(owner: ToolViewLease): void;
    revokeScope(scope: OwnedScope): void;
}
export {};
//# sourceMappingURL=tool-install-authorizations.d.ts.map