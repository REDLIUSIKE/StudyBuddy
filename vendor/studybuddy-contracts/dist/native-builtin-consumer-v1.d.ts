/** Built-in consumer authority is independent of every external ToolId.
 * Codecs check syntax and internal consistency, never mint or refresh authority.
 * Private material must stay on native/Main/Host channels, outside renderer DTOs. */
import type { NativeProtocol } from './native-tools.js';
import type { OwnedScope } from './harness-account.js';
export declare const NATIVE_BUILTIN_CONSUMER_ID: 'studybuddy_harness';
export declare const NATIVE_BUILTIN_CONSUMER_VERSION: '1';
export declare const NATIVE_BUILTIN_REQUEST_TICKET_HEADER: 'X-StudyBuddy-Request-Ticket';
export declare const NATIVE_BUILTIN_GATEWAY_PROVIDERS: readonly ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo'];
export type NativeBuiltinGatewayProviderId = typeof NATIVE_BUILTIN_GATEWAY_PROVIDERS[number];
export type NativeBuiltinProviderId = NativeBuiltinGatewayProviderId | 'openai' | 'anthropic';
export type NativeBuiltinFundingSource = 'user_api' | 'platform';
export type NativeBuiltinModelAuthorityV1 = Readonly<{
    logicalModelId: string;
    providerId: NativeBuiltinProviderId;
    exactModelId: string;
    displayName: string;
    protocol: NativeProtocol;
    contextWindow: number;
    maxOutputTokens: number | null;
    capabilityFlags: readonly string[];
    evidenceSha256: string;
    membershipRevision: string;
    capabilityRevision: string;
    adapterRevision: string;
    priceAuthorityRevision: string | null;
    availability: 'available';
}>;
export type NativeBuiltinSourceV1 = Readonly<{
    backendInstanceId: string;
    accountOwner: string;
    sourceId: string;
    localRef: string;
    providerId: NativeBuiltinGatewayProviderId;
    credentialReference: string;
    credentialRevision: string;
    baseUrl: string;
}>;
export type NativeBuiltinConsumerScopeV1 = NativeBuiltinSourceV1 & Readonly<{
    deviceId: string;
    protocol: NativeProtocol;
    consumerId: typeof NATIVE_BUILTIN_CONSUMER_ID;
    consumerVersion: typeof NATIVE_BUILTIN_CONSUMER_VERSION;
    fundingSource: NativeBuiltinFundingSource;
}>;
export type NativeBuiltinSourceGrantV1 = Readonly<{
    schemaVersion: 1;
    grantRevision: string;
    catalogRevision: string;
    scope: NativeBuiltinConsumerScopeV1;
    allowedModels: readonly NativeBuiltinModelAuthorityV1[];
}>;
export type NativeBuiltinBindingV1 = Readonly<{
    schemaVersion: 1;
    userId: number;
    tokenId: number;
    connectionId: string;
    operationId: string;
    grant: NativeBuiltinSourceGrantV1;
    policyRevision: string;
    tokenGroup: string;
    /** Personal Key directories use 0/0 for no expiry; old positive timestamps are history, not a Key lifetime. */
    pendingExpiresAt: number;
    authorityExpiresAt: number;
    state: 'pending' | 'active' | 'revoked';
    hostCatalogVersion: string | null;
}>;
/** Server-only managed actor: client claims never substitute for account lookup. */
export type NativeBuiltinServiceActorV1 = Readonly<{
    schemaVersion: 1;
    userId: number;
    expectedUsername: string;
    expectedManagedMarker: string;
}>;
export type NativePrivateCredentialReceiptV1 = Readonly<{
    schemaVersion: 1;
    source: NativeBuiltinSourceV1;
    state: 'synced' | 'revoked';
    operationId: string;
}>;
export type NativeBuiltinRequestPurposeV1 = 'chat' | 'validation' | 'diagnostic';
export type NativeBuiltinRequestReceiptV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    requestId: string;
    purpose: NativeBuiltinRequestPurposeV1;
    requestTicket: string | null;
    expiresAt: number;
    state: 'prepared' | 'dispatch_started' | 'terminal';
}>;
export type NativeBuiltinSelectionRefV1 = Readonly<{
    routeId: string;
    sourceId: string;
    localRef: string;
    providerId: NativeBuiltinProviderId;
    exactModelId: string;
    protocol: NativeProtocol;
    connectionId: string;
    credentialRevision: string;
    grantRevision: string;
    fundingSource: NativeBuiltinFundingSource;
}>;
export type NativeBuiltinGatewayRouteV1 = Readonly<{
    mode: 'gateway';
    routeId: string;
    displayName: string;
    gatewayOrigin: string;
    apiKey: string;
    binding: NativeBuiltinBindingV1;
}>;
/** Local direct authority is issued by the owned native store. No domestic
 * Source/Binding/Token is created for these credentials. */
export type NativeBuiltinLocalGrantV1 = Readonly<{
    schemaVersion: 1;
    grantRevision: string;
    catalogRevision: string;
    accountOwner: string;
    deviceId: string;
    sourceId: string;
    localRef: string;
    connectionId: string;
    credentialRevision: string;
    protocol: NativeProtocol;
    authorityExpiresAt: number;
    allowedModels: readonly NativeBuiltinModelAuthorityV1[];
}>;
export type NativeBuiltinLocalDirectRouteV1 = Readonly<{
    mode: 'local_direct';
    routeId: string;
    displayName: string;
    baseUrl: string;
    apiKey: string;
    grant: NativeBuiltinLocalGrantV1;
}>;
export type NativeBuiltinPreparedRouteV1 = NativeBuiltinGatewayRouteV1 | NativeBuiltinLocalDirectRouteV1;
export type NativeBuiltinHostContextV1 = Readonly<{
    scope: OwnedScope;
    hostGeneration: string;
}>;
export type NativeBuiltinCatalogApplyV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    scope: OwnedScope;
    hostGeneration: string;
    catalogVersion: string;
    catalogDigest: string;
    routes: readonly NativeBuiltinPreparedRouteV1[];
}>;
export type NativeBuiltinCatalogAppliedV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    scope: OwnedScope;
    hostGeneration: string;
    catalogVersion: string;
    catalogDigest: string;
    applied: readonly NativeBuiltinSelectionRefV1[];
}>;
export type NativeBuiltinPhaseV1 = 'registered' | 'credential_sync' | 'grant_prepare' | 'grant_apply' | 'grant_confirm' | 'validation' | 'host_apply' | 'ready';
export type NativeBuiltinReadinessV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    localRef: string;
    sourceRevision: string;
    state: 'pending' | 'ready' | 'failed' | 'unsupported';
    phase: NativeBuiltinPhaseV1;
    catalogVersion: string | null;
    catalogDigest: string | null;
    hostApplied: NativeBuiltinCatalogAppliedV1 | null;
    appliedModels: readonly NativeBuiltinSelectionRefV1[];
    errorCode: string | null;
}>;
export type NativeBuiltinPreparedSourceV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    localRef: string;
    sourceRevision: string;
    routes: readonly NativeBuiltinPreparedRouteV1[];
}>;
export type NativeBuiltinRequestFreezeV1 = Readonly<{
    schemaVersion: 1;
    scope: OwnedScope;
    hostGeneration: string;
    catalogVersion: string;
    catalogDigest: string;
    selection: NativeBuiltinSelectionRefV1;
    authority: NativeBuiltinModelAuthorityV1;
    clientRequestId: string;
    sessionId: string | null;
    purpose: NativeBuiltinRequestPurposeV1;
}>;
export type NativeBuiltinFrozenRequestV1 = Readonly<{
    schemaVersion: 1;
    clientRequestId: string;
    selection: NativeBuiltinSelectionRefV1;
    authority: NativeBuiltinModelAuthorityV1;
    sessionId: string | null;
    purpose: NativeBuiltinRequestPurposeV1;
    requestReceipt: NativeBuiltinRequestReceiptV1 | null;
}>;
/** Closed private capability map. These operations are not Renderer IPC. */
export interface NativeBuiltinPrivateApi {
    getNativeBuiltinCatalog(): Promise<import('./native-user-source-v3.js').NativeBuiltinPublicCatalogV1>;
    getBuiltinSourceDetail(localRef: string): Promise<NativeBuiltinSourceDetailV1>;
    refreshBuiltinBalance(localRef: string): Promise<NativeBuiltinBalanceReceiptV1>;
    prepareBuiltinSource(operationId: string, hostContext: NativeBuiltinHostContextV1): Promise<NativeBuiltinReadinessV1>;
    resumeBuiltinSource(operationId: string, hostContext: NativeBuiltinHostContextV1): Promise<NativeBuiltinReadinessV1>;
    getBuiltinSourceMaterial(operationId: string, hostContext: NativeBuiltinHostContextV1): Promise<NativeBuiltinPreparedSourceV1>;
    acknowledgeBuiltinCatalog(ack: NativeBuiltinCatalogAppliedV1): Promise<NativeBuiltinReadinessV1>;
    listBuiltinReadiness(hostContext: NativeBuiltinHostContextV1): Promise<readonly NativeBuiltinReadinessV1[]>;
    revokeBuiltinSource(localRef: string): Promise<void>;
    prepareBuiltinKeyRequest(request: NativeBuiltinRequestFreezeV1): Promise<NativeBuiltinFrozenRequestV1>;
    acknowledgeBuiltinLocalValidation(proof: NativeBuiltinLocalValidationV1): Promise<NativeBuiltinReadinessV1>;
}
export type NativeBuiltinPrivateOperationMap = {
    [K in keyof NativeBuiltinPrivateApi]: NativeBuiltinPrivateApi[K] extends (...args: infer A) => Promise<infer R> ? Readonly<{
        args: A;
        result: R;
    }> : never;
};
/** Native authenticated business API bodies. Source ids and upstream actors
 * are loaded by the backend, never accepted from these clients. */
export type NativeBuiltinSourceSyncRequestV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    localRef: string;
    localRevision: string;
    sourceRevision: string;
    inventoryRevision: string;
    providerId: NativeBuiltinGatewayProviderId;
    baseUrl: string;
    apiKey: string;
    expectedCredentialRevision: string | null;
    candidateModelIds: readonly string[];
}>;
export type NativeBuiltinSourceOperationV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    localRef: string;
    sourceRevision: string;
}>;
export type NativeBuiltinConnectionOperationV1 = NativeBuiltinSourceOperationV1 & Readonly<{
    protocol: NativeProtocol;
}>;
/** One explicit owned model is admitted per consumer preparation. Inventory
 * candidateModelIds are discovery facts and cannot imply paid validation. */
export type NativeBuiltinPrepareRequestV1 = NativeBuiltinConnectionOperationV1 & Readonly<{
    exactModelId: string;
}>;
export type NativeBuiltinConfirmRequestV1 = NativeBuiltinConnectionOperationV1 & Readonly<{
    hostApplied: NativeBuiltinCatalogAppliedV1;
}>;
export type NativeBuiltinRequestPrepareV1 = NativeBuiltinConnectionOperationV1 & Readonly<{
    clientRequestId: string;
    exactModelId: string;
    purpose: NativeBuiltinRequestPurposeV1;
    sessionId: string | null;
}>;
export type NativeBuiltinUsageCursorV1 = Readonly<{
    createdAt: number;
    requestId: string;
}>;
export type NativeBuiltinTerminalUsageV1 = Readonly<{
    inputTokens: number;
    outputTokens: number;
    inputTotalTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
    cacheWrite5mTokens: number | null;
    cacheWrite1hTokens: number | null;
}>;
export type NativeBuiltinUsageRecordV1 = Readonly<{
    schemaVersion: 1;
    projectionVersion: 1;
    requestId: string;
    operationId: string;
    purpose: NativeBuiltinRequestPurposeV1;
    scope: NativeBuiltinConsumerScopeV1;
    catalogRevision: string;
    grantRevision: string;
    connectionId: string;
    policyRevision: string;
    exactModelId: string;
    membershipRevision: string;
    capabilityRevision: string;
    adapterRevision: string;
    priceAuthorityRevision: string | null;
    providerResponseId: string;
    returnedModel: string;
    outcome: 'completed' | 'incomplete' | 'refused' | 'failed' | 'contract_invalid' | 'unknown';
    usage: NativeBuiltinTerminalUsageV1 | null;
    createdAt: number;
}>;
export type NativeBuiltinUsagePageV1 = Readonly<{
    records: readonly NativeBuiltinUsageRecordV1[];
    nextCursor: NativeBuiltinUsageCursorV1 | null;
}>;
export type NativeBuiltinSourceBalanceV1 = Readonly<{
    state: 'success' | 'stale' | 'error' | 'unsupported';
    checkedAt: number;
    lastSuccessAt: number | null;
    currencies: readonly Readonly<{
        currency: string;
        available: string;
        cash: string | null;
        grant: string | null;
    }>[];
    plan: null;
    classification: 'account_balance' | 'unknown';
    errorCode: string | null;
    officialUrl: string;
}>;
export type NativeBuiltinBalanceReceiptV1 = Readonly<{
    schemaVersion: 1;
    source: NativeBuiltinSourceV1;
    operationId: string;
    balance: NativeBuiltinSourceBalanceV1;
}>;
export type NativeBuiltinCatalogPublishV1 = Readonly<{
    schemaVersion: 1;
    readiness: NativeBuiltinReadinessV1;
}>;
export type NativeBuiltinValidationRequestV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    selection: NativeBuiltinSelectionRefV1;
    clientRequestId: string;
    purpose: 'validation' | 'diagnostic';
    prompt: string;
}>;
export type NativeBuiltinLocalValidationV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    clientRequestId: string;
    scope: OwnedScope;
    hostGeneration: string;
    catalogVersion: string;
    catalogDigest: string;
    selection: NativeBuiltinSelectionRefV1;
    providerResponseId: string;
    returnedModel: string;
    outcome: 'completed' | 'incomplete' | 'refused' | 'failed' | 'contract_invalid' | 'unknown';
    usageOrigin: 'provider_terminal';
    usage: NativeBuiltinTerminalUsageV1 | null;
}>;
export type NativeBuiltinValidationResultV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    clientRequestId: string;
    selection: NativeBuiltinSelectionRefV1;
    purpose: 'validation' | 'diagnostic';
    providerResponseId: string | null;
    returnedModel: string | null;
    outcome: NativeBuiltinUsageRecordV1['outcome'];
    usageOrigin: 'provider_terminal' | 'unknown';
    usage: NativeBuiltinTerminalUsageV1 | null;
    firstVisibleTextMs: number | null;
    dispatchToTerminalMs: number | null;
    errorCode: string | null;
}>;
export type NativeBuiltinSourceDetailV1 = Readonly<{
    schemaVersion: 1;
    localRef: string;
    readiness: NativeBuiltinReadinessV1 | null;
    balance: NativeBuiltinBalanceReceiptV1 | null;
    lastDiagnostics: readonly NativeBuiltinValidationResultV1[];
}>;
export declare function parseNativeBuiltinModelAuthorityV1(value: unknown): NativeBuiltinModelAuthorityV1;
export declare function parseNativeBuiltinSourceV1(value: unknown): NativeBuiltinSourceV1;
export declare function parseNativeBuiltinConsumerScopeV1(value: unknown): NativeBuiltinConsumerScopeV1;
export declare function parseNativeBuiltinSourceGrantV1(value: unknown): NativeBuiltinSourceGrantV1;
export declare function parseNativeBuiltinBindingV1(value: unknown): NativeBuiltinBindingV1;
export declare function parseNativePrivateCredentialReceiptV1(value: unknown): NativePrivateCredentialReceiptV1;
export declare function parseNativeBuiltinRequestReceiptV1(value: unknown): NativeBuiltinRequestReceiptV1;
export declare function parseNativeBuiltinSelectionRefV1(value: unknown): NativeBuiltinSelectionRefV1;
export declare function parseNativeBuiltinLocalGrantV1(value: unknown): NativeBuiltinLocalGrantV1;
export declare function parseNativeBuiltinPreparedRouteV1(value: unknown): NativeBuiltinPreparedRouteV1;
export declare function parseNativeBuiltinHostContextV1(value: unknown): NativeBuiltinHostContextV1;
export declare function parseNativeBuiltinCatalogApplyV1(value: unknown): NativeBuiltinCatalogApplyV1;
export declare function parseNativeBuiltinCatalogAppliedV1(value: unknown): NativeBuiltinCatalogAppliedV1;
export declare function parseNativeBuiltinReadinessV1(value: unknown): NativeBuiltinReadinessV1;
/** Cross-language hash payload: grantRevision is self-referential and excluded;
 * displayName is presentation. Every other exact authority field is retained. */
export declare function canonicalNativeBuiltinGrantPayloadV1(value: unknown): string;
/** Catalog digest binds the complete private snapshot, including its material;
 * only the SHA-256 acknowledgement crosses into public state. Never log this. */
export declare function canonicalNativeBuiltinCatalogPayloadV1(value: unknown): string;
export declare function parseNativeBuiltinPreparedSourceV1(value: unknown): NativeBuiltinPreparedSourceV1;
export declare function parseNativeBuiltinRequestFreezeV1(value: unknown): NativeBuiltinRequestFreezeV1;
export declare function parseNativeBuiltinFrozenRequestV1(value: unknown): NativeBuiltinFrozenRequestV1;
export declare function parseNativeBuiltinSourceSyncRequestV1(value: unknown): NativeBuiltinSourceSyncRequestV1;
export declare function parseNativeBuiltinSourceOperationV1(value: unknown): NativeBuiltinSourceOperationV1;
export declare function parseNativeBuiltinConnectionOperationV1(value: unknown): NativeBuiltinConnectionOperationV1;
export declare function parseNativeBuiltinPrepareRequestV1(value: unknown): NativeBuiltinPrepareRequestV1;
export declare function parseNativeBuiltinConfirmRequestV1(value: unknown): NativeBuiltinConfirmRequestV1;
export declare function parseNativeBuiltinRequestPrepareV1(value: unknown): NativeBuiltinRequestPrepareV1;
export declare function parseNativeBuiltinUsageRecordV1(value: unknown): NativeBuiltinUsageRecordV1;
export declare function parseNativeBuiltinUsageCursorV1(value: unknown): NativeBuiltinUsageCursorV1;
export declare function parseNativeBuiltinUsagePageV1(value: unknown): NativeBuiltinUsagePageV1;
export declare function parseNativeBuiltinSourceBalanceV1(value: unknown): NativeBuiltinSourceBalanceV1;
export declare function parseNativeBuiltinBalanceReceiptV1(value: unknown): NativeBuiltinBalanceReceiptV1;
export declare function parseNativeBuiltinCatalogPublishV1(value: unknown): NativeBuiltinCatalogPublishV1;
export declare function parseNativeBuiltinValidationRequestV1(value: unknown): NativeBuiltinValidationRequestV1;
export declare function parseNativeBuiltinLocalValidationV1(value: unknown): NativeBuiltinLocalValidationV1;
export declare function parseNativeBuiltinValidationResultV1(value: unknown): NativeBuiltinValidationResultV1;
export declare function parseNativeBuiltinSourceDetailV1(value: unknown): NativeBuiltinSourceDetailV1;
