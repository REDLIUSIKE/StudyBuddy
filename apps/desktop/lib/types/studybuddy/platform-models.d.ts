import type { AigcPlatformTextGrant, AigcTextRequest } from './aigc-types.ts';
import type { OwnedScope } from '@studybuddy/contracts';
import type { PlatformSnapshot, PlatformRequest, PlatformPrepared } from '@deepseek-ai/dsh-llm-studybuddy-builtin';
import type { MainSession, StudyBuddyFetch, StudyBuddyVault } from './services.ts';
interface PlatformHost {
    builtinContext(scope: OwnedScope): {
        scope: OwnedScope;
        hostGeneration: string;
    };
    platformApply(snapshot: PlatformSnapshot): Promise<void>;
    platformRevoke(scope: OwnedScope): Promise<void>;
}
interface Dependencies {
    host(): PlatformHost | undefined;
    isCurrent(scope: OwnedScope): boolean;
    withSession<T>(scope: OwnedScope, run: (session: MainSession) => Promise<T>): Promise<T>;
    fetch: StudyBuddyFetch;
    vault(owner: string): StudyBuddyVault;
    audit(scope: OwnedScope, request: PlatformRequest, authority: PlatformPrepared['authority']): Promise<void>;
}
/** Publish catalog without inference, then admit exact platform requests independently of personal Keys. */
export declare class PlatformModels {
    private readonly deps;
    private snapshot;
    private readonly searchReady;
    private readonly searchInitializations;
    private readonly revoked;
    private queue;
    constructor(deps: Dependencies);
    /** Read the reusable configured Key privately; never refresh product login. */
    keyMaterial(scope: OwnedScope): Promise<{
        baseUrl: string;
        apiKey: string;
    }>;
    /** Account setup may issue the first Key. Inference and result reads only
     * consume keyMaterial and never enter this management operation. */
    initializeKey(scope: OwnedScope): Promise<void>;
    private startSearchInitialization;
    private initializeSearch;
    /** Reuse the reviewed platform catalog for the account-owned creation consumer. */
    consumerCatalog(scope: OwnedScope): Promise<readonly AigcPlatformTextGrant[]>;
    /** The model handle cannot select a credential, endpoint or alternate funding source. */
    prepareAigcRequest(scope: OwnedScope, input: AigcTextRequest): Promise<PlatformPrepared>;
    private assert;
    /** Restore only keyless visibility. Selection and default saving remain explicit Harness actions. */
    restore(scope: OwnedScope): Promise<void>;
    private restoreCurrent;
    /** The private Host supplies no credential, funding switch or arbitrary URL. */
    admit(input: PlatformRequest): Promise<PlatformPrepared>;
    private request;
    private binding;
    private configured;
    private prepare;
    /** Immediately fence old Host requests; keep protected recovery material until revocation is confirmed. */
    revoke(scope: OwnedScope): Promise<void>;
    /** Finish old presentation work while retaining the reusable protected Key. */
    clearConfirmed(_scope: OwnedScope): Promise<void>;
}
export {};
//# sourceMappingURL=platform-models.d.ts.map