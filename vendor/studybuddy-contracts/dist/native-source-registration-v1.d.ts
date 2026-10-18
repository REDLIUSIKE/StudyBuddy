import { type NativeProtocol } from './native-tools.js';
import { type NativeToolConnectV2 } from './native-tool-connection-v2.js';
import { type NativeConnectionUiView } from './native-source-ui-v3.js';
export declare const SIX_TOOL_IDS: readonly ['claude_code', 'dsh', 'hermes', 'kimicode', 'openclaw', 'workbuddy'];
export type SixToolId = typeof SIX_TOOL_IDS[number];
export type AdditiveToolId = Exclude<SixToolId, 'claude_code'>;
export type NativeSourceChoiceV1 = Readonly<{
    kind: 'platform';
}> | Readonly<{
    kind: 'user_source';
    sourceRef: string;
    sourceRevision: string;
    inventoryRevision: string;
}>;
export type NativeSourceOptionV1 = Readonly<{
    toolId: SixToolId;
    source: NativeSourceChoiceV1;
    label: string;
    protocol: NativeProtocol;
    catalogRevision: string | null;
    policyRevision: string | null;
    installedToolVersion: string | null;
    bootstrapLogicalModelId: string | null;
    bootstrapExactModelId: string | null;
    authorizedModelIds: readonly string[];
    available: boolean;
    blockReason: string | null;
}>;
export type NativeSourceConfigurationContextV1 = Readonly<{
    schemaVersion: 1;
    capabilities: readonly ('source_configuration_v1' | 'source_registration_v1')[];
    toolId: SixToolId;
    options: readonly NativeSourceOptionV1[];
}>;
export type NativeSourceConfigurationRequestV1 = Readonly<{
    schemaVersion: 1;
    toolId: SixToolId;
    source: NativeSourceChoiceV1;
    protocol: NativeProtocol;
    catalogRevision: string;
    policyRevision: string;
    installedToolVersion: string;
    options: NativeToolConnectV2['options'];
}>;
export type NativeSourceRegistrationViewV1 = Readonly<{
    schemaVersion: 1;
    kind: 'source_registration';
    toolId: AdditiveToolId;
    state: 'unconfigured' | 'pending' | 'registered' | 'conflict' | 'unavailable' | 'revocation_pending';
    source: NativeSourceChoiceV1 | null;
    protocol: NativeProtocol | null;
    catalogRevision: string | null;
    grantRevision: string | null;
    credentialRevision: string | null;
    authorizedModelIds: readonly string[];
    nativeSelection: Readonly<{
        kind: 'owned' | 'external' | 'unknown';
        modelId: string | null;
    }>;
    errorCode: string | null;
}>;
/** Local directory facts only. No remote binding, credential or model authority. */
export type NativeToolDirectoryState = Readonly<{
    toolId: import('./native-tools.js').NativeToolId;
    hasKey: boolean;
}>;
export type NativeToolConfigurationViewV1 = NativeSourceRegistrationViewV1 | NativeConnectionUiView;
export declare function parseNativeSourceChoiceV1(value: unknown): NativeSourceChoiceV1;
export declare function parseNativeSourceConfigurationContextV1(value: unknown): NativeSourceConfigurationContextV1;
export declare function parseNativeSourceConfigurationRequestV1(value: unknown): NativeSourceConfigurationRequestV1;
export declare function parseNativeSourceRegistrationViewV1(value: unknown): NativeSourceRegistrationViewV1;
export declare function parseNativeToolConfigurationViewV1(value: unknown): NativeToolConfigurationViewV1;
