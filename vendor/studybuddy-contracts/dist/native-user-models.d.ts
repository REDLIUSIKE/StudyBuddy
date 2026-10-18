import type { NativeProtocol } from './native-tools.js';
import { type NativeToolMaterialRequestV2 } from './native-tool-connection-v2.js';
export type NativeUserModelDraftV1 = Readonly<{
    schemaVersion: 1;
    internalId: string | null;
    expectedLocalRevision: string | null;
    name: string;
    baseUrl: string;
    anthropicUrl: string | null;
    apiKey: string;
    modelId: string;
    protocols: readonly NativeProtocol[];
}>;
export type NativeUserModelProbeV1 = Readonly<{
    protocol: NativeProtocol;
    success: boolean;
    latencyMs: number;
    returnedModel: string | null;
    response: string | null;
    errorCode: string | null;
}>;
export type NativeUserModelProbeResultV1 = Readonly<{
    schemaVersion: 1;
    probes: readonly NativeUserModelProbeV1[];
    verificationId: string | null;
    verifiedAt: string | null;
    expiresAt: string | null;
}>;
export type NativeUserModelSaveRequestV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    draft: NativeUserModelDraftV1;
    verificationId: string;
}>;
export type NativeUserModelRegistrationV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    credentialId: string;
    credentialRevision: string;
    localRef: string;
    state: 'prepared' | 'active' | 'expired';
    providerId: 'deepseek' | 'kimi';
    modelId: string;
    protocols: readonly NativeProtocol[];
    catalogRevision: string;
    membershipRevision: string;
    verifiedAt: string;
}>;
export type NativeUserModelSaveResultV1 = Readonly<{
    state: 'saved' | 'pending';
    localRef: string;
    registration: NativeUserModelRegistrationV1;
}>;
export type NativeUserCredentialPrepareV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    localRef: string;
    expectedCredentialRevision: string | null;
    providerId: 'deepseek' | 'kimi';
    baseUrl: string;
    anthropicUrl: string | null;
    apiKey: string;
    modelId: string;
    protocols: readonly NativeProtocol[];
    catalogRevision: string;
    membershipRevision: string;
    clientVerifiedAt: string;
}>;
export type NativeUserCredentialRefV1 = Readonly<{
    schemaVersion: 1;
    operationId: string;
    credentialId: string;
    credentialRevision: string;
    localRef: string;
}>;
export type NativeRegisteredUserAPIMaterialRequestV2 = NativeToolMaterialRequestV2 & Readonly<{
    registration: Readonly<{
        credentialId: string;
        credentialRevision: string;
        localRef: string;
    }>;
}>;
export declare function parseNativeUserModelDraftV1(value: unknown): NativeUserModelDraftV1;
export declare function parseNativeUserModelProbeResultV1(value: unknown): NativeUserModelProbeResultV1;
export declare function parseNativeUserModelSaveRequestV1(value: unknown): NativeUserModelSaveRequestV1;
export declare function parseNativeUserModelRegistrationV1(value: unknown): NativeUserModelRegistrationV1;
export declare function parseNativeUserModelSaveResultV1(value: unknown): NativeUserModelSaveResultV1;
export declare function parseNativeUserCredentialPrepareV1(value: unknown): NativeUserCredentialPrepareV1;
export declare function parseNativeUserCredentialRefV1(value: unknown): NativeUserCredentialRefV1;
export declare function parseNativeRegisteredUserAPIMaterialRequestV2(value: unknown): NativeRegisteredUserAPIMaterialRequestV2;
