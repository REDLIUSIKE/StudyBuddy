import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { NativeBuiltinCatalogAppliedV1, NativeBuiltinCatalogApplyV1, NativeBuiltinFrozenRequestV1, NativeBuiltinModelAuthorityV1, NativeBuiltinPreparedRouteV1, NativeBuiltinReadinessV1, NativeBuiltinRequestFreezeV1, NativeBuiltinSelectionRefV1, NativeBuiltinValidationRequestV1, NativeBuiltinValidationResultV1, OwnedScope } from '@studybuddy/contracts';
import type { BuiltinResponseFacts } from './studybuddy-builtin-terminal.ts';
/** Trusted process-local conversation audit sink; never accepted from request JSON. */
export interface BuiltinConversation {
    readonly sessionId: string;
    appendAudit(request: NativeBuiltinRequestFreezeV1): Promise<void>;
}
/** Private integrations owned by the Host composition. */
export interface BuiltinModelOptions {
    readonly hostGeneration: string;
    readonly createAdapter: (route: NativeBuiltinPreparedRouteV1, headers: Readonly<Record<string, string>>, facts?: BuiltinResponseFacts, purpose?: 'validation' | 'diagnostic') => LlmAdapter;
    readonly trustedConversation: (options: GenerateOptions) => BuiltinConversation | undefined;
    readonly admit: (capture: NativeBuiltinRequestFreezeV1) => Promise<NativeBuiltinFrozenRequestV1>;
}
/** Detached exact source reference used by acknowledgements and request freezes.
 * @param route - Native-issued private route.
 * @param authority - Exact member of that route's grant.
 * @returns The complete source, connection, funding, and model identity. */
export declare function builtinSelectionRef(route: NativeBuiltinPreparedRouteV1, authority: NativeBuiltinModelAuthorityV1): NativeBuiltinSelectionRefV1;
/** Exact model routing and private Main acknowledgement owner. */
export declare class BuiltinModelDirectory extends LlmAdapter {
    private readonly ctx;
    private readonly options;
    private routes;
    private readonly installed;
    private published;
    private knownRoutes;
    private latestOperationId;
    private registration;
    private owner;
    private epoch;
    private readonly revoked;
    private readonly sourceEpochs;
    private readonly versions;
    constructor(ctx: Context, options: BuiltinModelOptions);
    /** Install one complete private catalog atomically; failed candidates retain the prior catalog.
     * @param input - Native-issued material bound to the current Host and account.
     * @returns Readback of the exact installed source/model references. */
    apply(input: NativeBuiltinCatalogApplyV1): Promise<NativeBuiltinCatalogAppliedV1>;
    /** Read the installed catalog for the current account without private material.
     * @param scope - Main-owned account generation.
     * @param operationId - Original saved-source operation; omission addresses the latest installed source.
     * @returns The current Host acknowledgement, detached from owned state. */
    readback(scope: OwnedScope, operationId?: string | undefined): Promise<NativeBuiltinCatalogAppliedV1>;
    /** Publish only the exact models whose current private snapshot native has confirmed ready.
     * @param input - Native-confirmed secret-free readiness, bound to this source acknowledgement. */
    publishReady(input: NativeBuiltinReadinessV1): void;
    private replacePublished;
    private localRef;
    /** Close future admission for one account, including already prepared calls.
     * @param scope - Main-owned account generation to revoke. */
    revoke(scope: OwnedScope): void;
    /** Remove one source while retaining other independent catalogs.
     * @param scope - Current Main-owned account generation.
     * @param localRef - Native source row being rotated or revoked. */
    revokeSource(scope: OwnedScope, localRef: string): void;
    private assertScope;
    private exact;
    catalogVisible(provider: string): boolean;
    /** Current exact owned admission used by explicit Session/default selectors.
     * @param provider - Native-owned route identity.
     * @param model - Exact manually admitted model id.
     * @returns Whether the source is published, unexpired and available for that model. */
    selectionAllowed(provider: string, model: string): boolean;
    /** Secret-free tool choices from the current published native catalog.
     * Each provider remains its exact source/funding route; stale or revoked
     * grants and models without canonical image input never become helpers. */
    imageToolModels(): readonly {
        provider: string;
        model: string;
    }[];
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** Execute a Main-only user-authorized validation against an installed exact source.
     * @param input - Closed private command; renderer call options never enter this boundary.
     * @returns Actual provider identity, terminal facts, and measured visible-text timing. */
    validate(input: NativeBuiltinValidationRequestV1): Promise<NativeBuiltinValidationResultV1>;
    private assertCapture;
    private admit;
    private dispatch;
}
//# sourceMappingURL=studybuddy-builtin-models.d.ts.map