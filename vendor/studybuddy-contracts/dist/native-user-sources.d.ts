import type { NativeProtocol } from './native-tools.js';
import type { NativeUserModelProbeV1 } from './native-user-models.js';
import { type NativeUserCredentialPrepareV1, type NativeUserCredentialRefV1, type NativeUserModelRegistrationV1 } from './native-user-models.js';
import { type NativeToolMaterialRequestV2 } from './native-tool-connection-v2.js';
export type NativeSourceRoute = 'local_direct' | 'domestic_registered';
export type NativeSourceAdvancedV2 = Readonly<{
    baseUrl: string;
    anthropicUrl: string | null;
    modelsUrl: string | null;
    protocol: NativeProtocol | null;
}>;
export type NativeUserSourceDraftV2 = Readonly<{
    schemaVersion: 2;
    internalId: string | null;
    expectedLocalRevision: string | null;
    name: string;
    apiKey: string;
    sourcePresetId: string | null;
    advanced: NativeSourceAdvancedV2 | null;
}>;
/** Advertised lifecycle is retained for exclusion, never capability/price authority. */
export type DiscoveredModelV2 = Readonly<{
    exactModelId: string;
    ownedBy: string | null;
    lifecycle: 'active' | 'deprecated' | 'retired' | null;
    shutdownDate: string | null;
}>;
export type DiscoveredModelCatalogV2 = Readonly<{
    schemaVersion: 2;
    inventoryRevision: string;
    fetchedAt: string;
    endpoint: string;
    responseSha256: readonly string[];
    models: readonly DiscoveredModelV2[];
}>;
export type NativeSourcePingV2 = Readonly<{
    success: boolean;
    latencyMs: number;
    url: string;
    errorCode: string | null;
}>;
export type NativeUserSourceCheckV2 = Readonly<{
    schemaVersion: 2;
    route: NativeSourceRoute;
    sourceRevision: string | null;
    inventory: DiscoveredModelCatalogV2 | null;
    ping: NativeSourcePingV2;
    probe: NativeUserModelProbeV1 | null;
    verificationId: string | null;
    verifiedAt: string | null;
    expiresAt: string | null;
    errorCode: string | null;
}>;
export type NativeSourceMembershipV2 = Readonly<{
    exactModelId: string;
    protocol: NativeProtocol;
    membershipRevision: string;
}>;
export type NativeUserCredentialPrepareV2 = Readonly<{
    schemaVersion: 2;
    operationId: string;
    localRef: string;
    expectedCredentialRevision: string | null;
    expectedOperationId: string | null;
    sourceRevision: string;
    inventoryRevision: string;
    providerId: 'deepseek' | 'kimi';
    baseUrl: string;
    anthropicUrl: string | null;
    apiKey: string;
    catalogRevision: string;
    clientVerifiedAt: string;
    memberships: readonly NativeSourceMembershipV2[];
}>;
export type NativeRegisteredSourceRefV2 = Readonly<{
    operationId: string;
    credentialId: string;
    credentialRevision: string;
    localRef: string;
    sourceRevision: string;
}>;
export type NativeUserCredentialRefV2 = NativeRegisteredSourceRefV2 & Readonly<{
    schemaVersion: 2;
}>;
export type NativeRegisteredSourceMaterialRequestV2 = NativeToolMaterialRequestV2 & Readonly<{
    registration: NativeRegisteredSourceRefV2;
}>;
export type NativeUserCredentialPrepare = NativeUserCredentialPrepareV1 | NativeUserCredentialPrepareV2;
export type NativeUserCredentialRef = NativeUserCredentialRefV1 | NativeUserCredentialRefV2;
export type NativeUserCredentialRegistration = NativeUserModelRegistrationV1 | NativeUserSourceRegistrationV2;
export type NativeUserSourceRegistrationV2 = Readonly<{
    schemaVersion: 2;
    operationId: string;
    credentialId: string;
    credentialRevision: string;
    localRef: string;
    sourceRevision: string;
    inventoryRevision: string;
    state: 'prepared' | 'active' | 'expired';
    providerId: 'deepseek' | 'kimi';
    catalogRevision: string;
    memberships: readonly NativeSourceMembershipV2[];
    verifiedAt: string;
}>;
export type NativeUserSourceSaveRequestV2 = Readonly<{
    schemaVersion: 2;
    operationId: string;
    draft: NativeUserSourceDraftV2;
    verificationId: string;
}>;
export type NativeUserSourceSaveResultV2 = Readonly<{
    schemaVersion: 2;
    state: 'saved' | 'pending';
    route: NativeSourceRoute;
    localRef: string;
    sourceRevision: string;
    registration: NativeUserSourceRegistrationV2 | null;
    pendingPhase: 'local_publish' | 'server_commit' | null;
}>;
export type NativeUserSourceViewV2 = Readonly<{
    localRef: string;
    localRevision: string;
    sourceRevision: string | null;
    name: string;
    route: NativeSourceRoute;
    inventory: DiscoveredModelCatalogV2 | null;
    testedModelId: string | null;
    testedProtocol: NativeProtocol | null;
    state: 'legacy' | 'saved' | 'pending' | 'needs_detection';
    operationId: string | null;
    registration: NativeUserSourceRegistrationV2 | null;
}>;
export declare function parseNativeUserCredentialPrepareV2(value: unknown): NativeUserCredentialPrepareV2;
export declare function parseNativeRegisteredSourceRefV2(value: unknown): NativeRegisteredSourceRefV2;
export declare function parseNativeUserCredentialRefV2(value: unknown): NativeUserCredentialRefV2;
export declare function parseNativeRegisteredSourceMaterialRequestV2(value: unknown): NativeRegisteredSourceMaterialRequestV2;
export declare function parseNativeUserCredentialPrepare(value: unknown): NativeUserCredentialPrepare;
export declare function parseNativeUserCredentialRef(value: unknown): NativeUserCredentialRef;
export declare function parseNativeUserCredentialRegistration(value: unknown): NativeUserCredentialRegistration;
export declare function parseNativeUserSourceSaveRequestV2(value: unknown): NativeUserSourceSaveRequestV2;
export declare function parseNativeUserSourceSaveResultV2(value: unknown): NativeUserSourceSaveResultV2;
export declare function parseNativeUserSourceRegistrationV2(value: unknown): NativeUserSourceRegistrationV2;
export declare function parseNativeUserSourcesV2(value: unknown): NativeUserSourceViewV2[];
export declare function parseNativeUserSourceDraftV2(value: unknown): NativeUserSourceDraftV2;
export declare function parseDiscoveredModelCatalogV2(value: unknown): DiscoveredModelCatalogV2;
export declare function parseNativeUserSourceCheckV2(value: unknown): NativeUserSourceCheckV2;
