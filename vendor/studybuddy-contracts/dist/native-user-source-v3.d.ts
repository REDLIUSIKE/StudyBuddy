/** Neutral owned source persistence. A source check proves inventory and manual
 * selection only. Actual model validation belongs to the private built-in flow. */
import type { NativeProtocol } from './native-tools.js';
import { type DiscoveredModelCatalogV2, type NativeSourceAdvancedV2, type NativeSourcePingV2 } from './native-user-sources.js';
import { type NativeBuiltinModelAuthorityV1, type NativeBuiltinProviderId } from './native-builtin-consumer-v1.js';
export declare const NATIVE_USER_SOURCE_PRESETS_V3: readonly ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo', 'openai', 'anthropic'];
export type NativeUserSourceRouteV3 = 'local_direct' | 'domestic_private';
export type NativeUserSourceProbeSelectionV3 = Readonly<{
    exactModelId: string;
    protocol: NativeProtocol;
}>;
export type NativeUserSourceDraftV3 = Readonly<{
    schemaVersion: 3;
    internalId: string | null;
    expectedLocalRevision: string | null;
    name: string;
    apiKey: string;
    sourcePresetId: NativeBuiltinProviderId | null;
    advanced: NativeSourceAdvancedV2 | null;
    probeSelection: NativeUserSourceProbeSelectionV3 | null;
}>;
export type NativeUserSourceCheckV3 = Readonly<{
    schemaVersion: 3;
    route: NativeUserSourceRouteV3;
    state: 'discovered' | 'source_checked' | 'unsupported' | 'failed';
    sourceRevision: string | null;
    inventory: DiscoveredModelCatalogV2 | null;
    ping: NativeSourcePingV2;
    probe: null;
    probeSelection: NativeUserSourceProbeSelectionV3 | null;
    admittedModels: readonly NativeBuiltinModelAuthorityV1[];
    verificationId: string | null;
    verifiedAt: string | null;
    expiresAt: string | null;
    errorCode: string | null;
}>;
export type NativeUserSourceSaveRequestV3 = Readonly<{
    schemaVersion: 3;
    operationId: string;
    draft: NativeUserSourceDraftV3;
    verificationId: string;
}>;
export type NativeUserSourceSaveResultV3 = Readonly<{
    schemaVersion: 3;
    operationId: string;
    state: 'saved' | 'pending';
    route: NativeUserSourceRouteV3;
    localRef: string;
    localRevision: string;
    sourceRevision: string;
    inventoryRevision: string;
    pendingPhase: 'local_publish' | null;
}>;
export type NativeUserSourceConfigurationV3 = Readonly<{
    providerId: NativeBuiltinProviderId | null;
    sourcePresetId: NativeBuiltinProviderId | null;
    baseUrl: string;
    anthropicUrl: string | null;
}>;
export type NativeUserSourceViewV3 = Readonly<{
    schemaVersion: 3;
    localRef: string;
    localRevision: string;
    sourceRevision: string | null;
    name: string;
    route: NativeUserSourceRouteV3;
    inventory: DiscoveredModelCatalogV2 | null;
    probeSelection: NativeUserSourceProbeSelectionV3 | null;
    state: 'legacy' | 'saved' | 'pending' | 'needs_detection';
    operationId: string | null;
    configuration: NativeUserSourceConfigurationV3;
}>;
export type NativeBuiltinPublicTransportV1 = Readonly<{
    providerId: NativeBuiltinProviderId;
    protocol: NativeProtocol;
    baseUrl: string;
    adapterRevision: string;
    evidenceSha256: string;
}>;
export type NativeBuiltinPublicCatalogV1 = Readonly<{
    schemaVersion: 1;
    catalogRevision: string;
    checkedAt: string;
    expiresAt: string;
    models: readonly NativeBuiltinModelAuthorityV1[];
    transports: readonly NativeBuiltinPublicTransportV1[];
}>;
export interface NativeUserSourcePrivateApiV3 {
    checkNativeUserSourceV3(draft: NativeUserSourceDraftV3): Promise<NativeUserSourceCheckV3>;
    saveNativeUserSourceV3(request: NativeUserSourceSaveRequestV3): Promise<NativeUserSourceSaveResultV3>;
    resumeNativeUserSourceSaveV3(operationId: string): Promise<NativeUserSourceSaveResultV3>;
    listNativeUserSourcesV3(): Promise<readonly NativeUserSourceViewV3[]>;
}
export declare function parseNativeUserSourceDraftV3(v: unknown): NativeUserSourceDraftV3;
export declare function parseNativeUserSourceCheckV3(v: unknown): NativeUserSourceCheckV3;
export declare function parseNativeUserSourceSaveRequestV3(v: unknown): NativeUserSourceSaveRequestV3;
export declare function parseNativeUserSourceSaveResultV3(v: unknown): NativeUserSourceSaveResultV3;
export declare function parseNativeUserSourcesV3(v: unknown): NativeUserSourceViewV3[];
export declare function parseNativeBuiltinPublicCatalogV1(v: unknown): NativeBuiltinPublicCatalogV1;
