import { type NativeProtocol, type NativeToolDefinition, type NativeToolId } from './native-tools.js';
import { type ToolConnectionPermissionState, type ToolConnectionState } from './tool-connection.js';
export type NativeCatalogProviderV2 = 'deepseek' | 'kimi' | 'hunyuan' | 'zhipu' | 'minimax' | 'mimo' | 'volcengine';
export type NativeCatalogModelV2 = Readonly<{
    logicalModelId: string;
    providerId: NativeCatalogProviderV2;
    exactModelId: string;
    displayName: string;
    toolId: NativeToolId;
    protocol: NativeProtocol;
    contextWindow: number;
    maxOutputTokens: number | null;
    capabilityFlags: readonly string[];
    evidenceSha256: string;
    membershipRevision: string;
    availability: 'available' | 'unavailable';
}>;
export type NativeToolCatalogV2 = Readonly<{
    schemaVersion: 2;
    catalogRevision: string;
    tools: readonly NativeToolDefinition[];
    models: readonly NativeCatalogModelV2[];
}>;
export type NativeToolMaterialRequestV2 = Readonly<{
    audience: 'studybuddy-native-tools-v2';
    toolId: NativeToolId;
    selectedModelId: string;
    selectedProtocol: NativeProtocol;
    catalogRevision: string;
    materialNonce: string;
    receiptRevision: number;
}>;
export type NativeToolUserAPICredentialV2 = Readonly<{
    providerId: 'deepseek' | 'kimi';
    baseUrl: string;
    apiKey: string;
    credentialReference: string;
    credentialRevision: string;
}>;
export type NativeToolUserAPIMaterialRequestV2 = NativeToolMaterialRequestV2 & Readonly<{
    userApi: NativeToolUserAPICredentialV2;
}>;
export type NativeToolUserAPIBindingV2 = Readonly<{
    connectionId: string;
    credentialReference: string;
    credentialRevision: string;
}>;
export type NativeToolMaterialV2 = Readonly<{
    schemaVersion: 2;
    connectionId: string;
    accountOwner: string;
    deviceId: string;
    toolId: NativeToolId;
    fundingSource: 'platform' | 'user_api';
    userApi?: NativeToolUserAPIBindingV2;
    selectedProviderId: NativeCatalogProviderV2;
    gatewayOrigin: string;
    protocol: NativeProtocol;
    selectedModelId: string;
    authorizedModelIds: readonly string[];
    authorizedModels: readonly NativeCatalogModelV2[];
    membershipRevision: string;
    apiKey: string;
    authorityHandle: string;
    pendingBindingRevision: string;
    credentialRevision: number;
    receiptRevision: number;
    catalogRevision: string;
    policyRevision: string;
    pendingExpiresAt: string;
}>;
export type NativeToolAuthorityV2 = Readonly<{
    schemaVersion: 2;
    toolId: NativeToolId;
    protocol: NativeProtocol;
    state: ToolConnectionState | 'pending';
    permissionState: ToolConnectionPermissionState;
    accountOwner: string;
    deviceId: string;
    fundingSource: 'platform' | 'user_api';
    userApi?: NativeToolUserAPIBindingV2;
    authorizedModelIds: readonly string[];
    authorizedModels: readonly NativeCatalogModelV2[] | null;
    membershipRevision: string | null;
    bindingRevision: string | null;
    authorityHandle: string | null;
    credentialRevision: number | null;
    receiptRevision: number | null;
    catalogRevision: string;
    policyRevision: string | null;
    lastVerifiedAt: string | null;
}>;
/** Proof fields only. Identity comes from authenticated server principal/device.
 * A decoder is not an issuer or authorization check. The server must bind the
 * entire tuple before activate/status/cancel/revoke and enforce the token policy.
 */
export type NativeToolBindingRequestV2 = Readonly<{
    schemaVersion: 2;
    toolId: NativeToolId;
    protocol: NativeProtocol;
    connectionId: string;
    authorityHandle: string;
    bindingRevision: string;
    credentialRevision: number;
    receiptRevision: number;
    catalogRevision: string;
    policyRevision: string;
    membershipRevision: string;
}>;
export type NativeToolUsageCursorV2 = Readonly<{
    createdAt: number;
    requestId: string;
}>;
export type NativeToolUsageRequestV2 = Readonly<{
    binding: NativeToolBindingRequestV2;
    cursor: NativeToolUsageCursorV2;
    limit: number;
}>;
export type NativeToolUserUsageV2 = Readonly<{
    requestId: string;
    providerResponseId: string;
    providerId: 'deepseek' | 'kimi';
    modelId: string;
    returnedModel: string;
    outcome: 'completed' | 'incomplete' | 'refused' | 'failed' | 'contract_invalid' | 'unknown';
    createdAt: number;
    inputTokens: number | null;
    outputTokens: number | null;
    inputTotalTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    reasoningTokens: number | null;
    cacheWrite5mTokens: number | null;
    cacheWrite1hTokens: number | null;
}>;
export type NativeToolUsagePageV2 = Readonly<{
    schemaVersion: 2;
    accountOwner: string;
    deviceId: string;
    toolId: NativeToolId;
    protocol: NativeProtocol;
    fundingSource: 'user_api';
    billingMode: 'external_provider';
    binding: NativeToolBindingRequestV2;
    records: readonly NativeToolUserUsageV2[];
    nextCursor: NativeToolUsageCursorV2 | null;
}>;
export type NativeToolConnectV2 = Readonly<{
    toolId: NativeToolId;
    protocol: NativeProtocol;
    logicalModelId: string;
    fundingSource: 'platform' | 'user_api';
    credentialRef?: string | null;
    options: Readonly<{
        relayMode?: boolean | null;
        webSearch?: boolean | null;
        oneMContext?: boolean | null;
    }>;
}>;
export type NativeToolConnectionViewV2 = Readonly<{
    schemaVersion: 2;
    toolId: NativeToolId;
    state: 'available' | 'pending' | 'connected' | 'conflict' | 'unavailable' | 'revocation_pending';
    protocol: NativeProtocol | null;
    fundingSource: 'platform' | 'user_api' | null;
    appliedLogicalModelId: string | null;
    appliedExactModelId: string | null;
    errorCode: string | null;
    authority: NativeToolAuthorityV2 | null;
}>;
export type NativeToolOwnedKeyV2 = Readonly<{
    toolId: NativeToolId;
    fundingSource: 'platform' | 'user_api';
    kind: 'gateway_user_key' | 'supplier_user_key';
    modelId: string;
    credentialRef: string | null;
    apiKey: string;
}>;
/** Syntax-only persisted fact snapshot for recovery/revocation. It does NOT
 * grant membership, configuration eligibility or new material authority. */
export declare function parseNativeToolFrozenModelV2(value: unknown): NativeCatalogModelV2;
export declare function parseNativeToolCatalogV2(value: unknown): NativeToolCatalogV2;
export declare function parseNativeToolMaterialRequestV2(value: unknown): NativeToolMaterialRequestV2;
export declare function parseNativeToolUserAPIMaterialRequestV2(value: unknown): NativeToolUserAPIMaterialRequestV2;
export declare function parseNativeToolMaterialV2(value: unknown): NativeToolMaterialV2;
export declare function parseNativeToolAuthorityV2(value: unknown): NativeToolAuthorityV2;
export declare function parseNativeToolBindingRequestV2(value: unknown): NativeToolBindingRequestV2;
/** Rebind before recording connection success; never grant authority from a
 * local receipt alone. The gateway must independently enforce this policy.
 */
export declare function parseNativeToolUsageRequestV2(value: unknown): NativeToolUsageRequestV2;
export declare function parseNativeToolUsagePageV2(value: unknown): NativeToolUsagePageV2;
export declare function bindNativeToolAuthorityV2(materialValue: unknown, authorityValue: unknown, owner: string, device: string, now: string): void;
