import { type NativeProtocol, type NativeToolId } from './native-tools.js';
import { type NativeRegisteredSourceMaterialRequestV2 } from './native-user-sources.js';
import { type NativeCatalogModelV2, type NativeToolMaterialV2, type NativeToolBindingRequestV2, type NativeToolAuthorityV2, type NativeToolUsagePageV2, type NativeToolUserUsageV2, type NativeToolUsageCursorV2 } from './native-tool-connection-v2.js';
export type NativeSourceGrantModelV1 = NativeCatalogModelV2 & Readonly<{
    capabilityRevision: string;
    adapterRevision: string;
    priceAuthorityRevision: string | null;
}>;
export type NativeSourceGrantV1 = Readonly<{
    schemaVersion: 1;
    grantRevision: string;
    scope: Readonly<{
        ownerReference: string;
        deviceReference: string;
        toolId: NativeToolId;
        providerId: 'deepseek' | 'kimi';
        baseUrl: string;
        credentialReference: string;
        credentialRevision: string;
        protocol: NativeProtocol;
        fundingSource: 'user_api';
    }>;
    allowedModels: readonly NativeSourceGrantModelV1[];
}>;
export type NativeUserSourceMaterialRequestV3 = Omit<NativeRegisteredSourceMaterialRequestV2, 'audience'> & Readonly<{
    audience: 'studybuddy-native-tools-v3';
    installedToolVersion: string;
}>;
export type NativeToolMaterialV3 = Omit<NativeToolMaterialV2, 'schemaVersion' | 'authorizedModelIds' | 'authorizedModels' | 'membershipRevision'> & Readonly<{
    schemaVersion: 3;
    sourceGrant: NativeSourceGrantV1;
}>;
export type NativeToolBindingV3 = Omit<NativeToolBindingRequestV2, 'schemaVersion' | 'membershipRevision'> & Readonly<{
    schemaVersion: 3;
    grantRevision: string;
}>;
export type NativeToolAuthorityV3 = Omit<NativeToolAuthorityV2, 'schemaVersion' | 'authorizedModelIds' | 'authorizedModels' | 'membershipRevision'> & Readonly<{
    schemaVersion: 3;
    sourceGrant: NativeSourceGrantV1 | null;
}>;
export type NativeSourceGrantSelection = Readonly<{
    sourceGrant: NativeSourceGrantV1;
    selected: NativeSourceGrantModelV1;
    catalogRevision: string;
    authorityExpiresAt: string;
}>;
export type NativeUserAPIUsageRecordV3 = NativeToolUserUsageV2 & Readonly<{
    grantRevision: string;
    membershipRevision: string;
    capabilityRevision: string;
    adapterRevision: string;
    priceAuthorityRevision: string | null;
}>;
export type NativeToolUsagePageV3 = Omit<NativeToolUsagePageV2, 'schemaVersion' | 'binding' | 'records'> & Readonly<{
    schemaVersion: 3;
    binding: NativeToolBindingV3;
    records: readonly NativeUserAPIUsageRecordV3[];
}>;
/** Syntax-only codecs: none of these issue or refresh authority. */
export declare function parseNativeSourceGrantModelV1(value: unknown): NativeSourceGrantModelV1;
export declare function parseNativeSourceGrantV1(value: unknown): NativeSourceGrantV1;
export declare function parseNativeUserSourceMaterialRequestV3(value: unknown): NativeUserSourceMaterialRequestV3;
export declare function parseNativeToolMaterialV3(value: unknown): NativeToolMaterialV3;
export declare function parseNativeToolBindingV3(value: unknown): NativeToolBindingV3;
export declare function parseNativeToolUsageRequestV3(value: unknown): Readonly<{
    binding: NativeToolBindingV3;
    cursor: NativeToolUsageCursorV2;
    limit: number;
}>;
export declare function parseNativeToolAuthorityV3(value: unknown): NativeToolAuthorityV3;
export declare function parseNativeToolUsagePageV3(value: unknown): NativeToolUsagePageV3;
/** Syntax and terminal-count checks only; callers supply a separately verified
 * grant. A private gateway usage page need not invent a public receipt. */
export declare function parseNativeUserAPIUsageFactsV3(value: unknown, wire: NativeProtocol, grantRevision: string): Readonly<{
    records: readonly NativeUserAPIUsageRecordV3[];
    nextCursor: NativeToolUsageCursorV2 | null;
}>;
