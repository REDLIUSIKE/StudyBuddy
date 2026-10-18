import type { NativeBuiltinFrozenRequestV1, NativeBuiltinReadinessV1, NativeBuiltinRequestFreezeV1, NativeBuiltinSourceDetailV1, NativeBuiltinValidationRequestV1, NativeBuiltinValidationResultV1, NativeProtocol, OwnedScope } from '@studybuddy/contracts';
import type { DesktopHostProcess } from '../host-process.ts';
import type { NativeAccountClient } from './native-account-client.ts';
import type { AigcPreparedRequest, AigcTextGrant, AigcTextRequest } from './aigc-types.ts';
import type { StudyBuddyFetch, StudyBuddyVault } from './services.ts';
/** Private controls supplied only by the running Desktop Host. */
export type BuiltinHost = Pick<DesktopHostProcess, 'builtinContext' | 'builtinApply' | 'builtinReadback' | 'builtinPublish' | 'builtinRevoke' | 'builtinValidate'>;
interface Dependencies {
    host(): BuiltinHost | undefined;
    isCurrent(scope: OwnedScope): boolean;
    /** Main refreshes current owned V3 registrations before restoring a login. */
    ownedOperations?(scope: OwnedScope): Promise<readonly string[]>;
    native: Pick<NativeAccountClient, 'invokeBuiltin'>;
    fetch?: StudyBuddyFetch;
    /** Per-request safeStorage envelope under the original account profile. */
    requestVault?(accountOwner: string, requestId: string): StudyBuddyVault;
}
/** Per-source catalogs, account fences, and user-authorized validation owner. */
export declare class BuiltinCoordinator {
    private readonly deps;
    private readonly keyRequests;
    private readonly installed;
    private readonly published;
    private readonly revoked;
    private readonly queues;
    private readonly diagnostics;
    private readonly sourceEpochs;
    private hostGeneration;
    constructor(deps: Dependencies);
    private assert;
    private enqueue;
    private install;
    private publish;
    private publicReadiness;
    private withdraw;
    private rememberDiagnostic;
    /** Resume the original journal stage; never issue another inference.
     * @param scope - Main-owned authenticated account generation.
     * @param operationId - Original source saved journal operation.
     * @returns Truthful current native readiness. */
    resume(scope: OwnedScope, operationId: string): Promise<NativeBuiltinReadinessV1>;
    /** User-authorized save/validation action: exactly one selected model, no automatic first model.
     * @param scope - Main-owned account generation.
     * @param operationId - Saved journal identity.
     * @param selection - Explicit human model/protocol membership selection.
     * @returns Native-confirmed readiness after real protected dispatch. */
    prepareAndValidate(scope: OwnedScope, operationId: string, selection: {
        exactModelId: string;
        protocol: NativeProtocol;
    }): Promise<NativeBuiltinReadinessV1>;
    /** Per-source login/Host restore uses existing protected source journals without a paid probe.
     * @param scope - New authenticated Main generation. */
    restore(scope: OwnedScope): Promise<void>;
    /** Read secret-free native readiness for the actual current Host.
     * @param scope - Main-owned authenticated generation.
     * @returns Independent readiness for each source. */
    list(scope: OwnedScope): Promise<readonly NativeBuiltinReadinessV1[]>;
    /** Read source diagnostics and balance metadata without dispatching or fetching balance.
     * @param scope - Authenticated Main owner.
     * @param localRef - Owned source row.
     * @returns Cached secret-free detail bound to the current installed proof. */
    detail(scope: OwnedScope, localRef: string): Promise<NativeBuiltinSourceDetailV1>;
    /** Execute only an explicit diagnostic from the signed-in source detail action.
     * @param scope - Main-authenticated owner; no renderer scope or authority is accepted.
     * @param input - Human-selected exact public source reference.
     * @returns Actual private adapter diagnostic, containing no Key or ticket. */
    diagnostic(scope: OwnedScope, input: NativeBuiltinValidationRequestV1): Promise<NativeBuiltinValidationResultV1>;
    /** Explicit balance refresh preserves native balance authority and never triggers model dispatch.
     * @param scope - Main owner.
     * @param localRef - Exact native source. */
    refreshBalance(scope: OwnedScope, localRef: string): Promise<Readonly<{
        schemaVersion: 1;
        source: import("@studybuddy/contracts").NativeBuiltinSourceV1;
        operationId: string;
        balance: import("@studybuddy/contracts").NativeBuiltinSourceBalanceV1;
    }>>;
    /** Admit freezes from the current Host or a Main-owned consumer.
     * @param input - Process-owned exact source request freeze.
     * @returns The exact Key-only request freeze; never passed to renderer IPC. */
    admit(input: NativeBuiltinRequestFreezeV1): Promise<NativeBuiltinFrozenRequestV1>;
    /** Read exact, published gateway choices without exposing private routes.
     * @param scope - Current Main account generation.
     * @returns Keyless choices; local direct credentials are excluded. */
    consumerCatalog(scope: OwnedScope): Promise<readonly AigcTextGrant[]>;
    /** Freeze one current gateway choice; revalidate all authority after native preparation.
     * @param scope - Main-owned authenticated generation.
     * @param input - Private local consumer request, never a renderer authority.
     * @returns The exact Key-only freeze and gateway route. */
    prepareConsumerRequest(scope: OwnedScope, input: AigcTextRequest): Promise<AigcPreparedRequest>;
    /** Read the native request journal without inferring billing from transport usage.
     * @param scope - Current Main account generation.
     * @param requestId - Original frozen request identity.
     * @returns Trusted native state or unknown; no request ticket leaves Main. */
    consumerRequestStatus(scope: OwnedScope, requestId: string): Promise<{
        requestTicket: null;
        schemaVersion: 1;
        operationId: string;
        requestId: string;
        purpose: import("@studybuddy/contracts").NativeBuiltinRequestPurposeV1;
        expiresAt: number;
        state: "prepared" | "dispatch_started" | "terminal";
    } | null>;
    /** Fence all old Main requests before awaiting the private Host revocation.
     * @param scope - Account generation being invalidated. */
    revoke(scope: OwnedScope): Promise<void>;
    /** Revoke one source independently, retaining every other private catalog.
     * @param scope - Current owner.
     * @param localRef - Native local source identifier. */
    revokeSource(scope: OwnedScope, localRef: string): Promise<void>;
    /** Close Host routing after native has confirmed an existing source delete/revoke.
     * @param scope - Current owner.
     * @param localRef - Already revoked native source. */
    forgetSource(scope: OwnedScope, localRef: string): Promise<void>;
}
export {};
//# sourceMappingURL=builtin-coordinator.d.ts.map