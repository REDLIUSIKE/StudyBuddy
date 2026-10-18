import { type ProviderModel, type ProviderToolCapability } from "./provider-tool-capability.js";
export declare const TOOL_IDS: readonly ["codex", "claude_code"];
export type ToolId = (typeof TOOL_IDS)[number];
export type FundingSource = "platform" | "user_api";
export type ModelAvailability = "available" | "preparing" | "disabled";
export type ToolProtocol = "openai_responses" | "anthropic_messages";
export declare const AI_GATEWAY_BACKENDS: readonly ["primary_backend", "serviceBackend_legacy"];
export type AiGatewayBackend = (typeof AI_GATEWAY_BACKENDS)[number];
export type GatewayReference = Readonly<{
    backend: AiGatewayBackend;
    backendInstanceId: string;
    sourceId: string;
}>;
export type ToolCatalogItem = Readonly<{
    toolId: ToolId;
    displayName: string;
    protocol: ToolProtocol;
    displayOrder: number;
}>;
export type ModelCatalogItem = Readonly<{
    logicalModelId: string;
    displayName: string;
    provider: string;
    toolId: ToolId;
    availability: ModelAvailability;
    platformAvailable: boolean;
    userApiAvailable: boolean;
}>;
export type ToolModelSelection = Readonly<{
    toolId: ToolId;
    logicalModelId: string;
    fundingSource: FundingSource;
    providerConnectionId: string | null;
    revision: number;
}>;
export type ProviderConnectionView = Readonly<{
    providerConnectionId: string;
    provider: string;
    status: "healthy" | "unhealthy";
    compatibleModelIds: readonly string[];
}>;
export type ModelSelectionsProjection = Readonly<{
    tools: readonly ToolCatalogItem[];
    models: readonly ModelCatalogItem[];
    selections: readonly ToolModelSelection[];
    connections: readonly ProviderConnectionView[];
    providerModels?: readonly ProviderModel[];
    providerToolCapabilities?: readonly ProviderToolCapability[];
    defaults?: readonly DefaultToolModelSelection[];
    connectionAuthorities?: readonly ProviderConnectionAuthority[];
}>;
export type UpdateToolModelSelectionBody = Readonly<{
    expectedRevision: number;
    logicalModelId: string;
    fundingSource: FundingSource;
    providerConnectionId: string | null;
}>;
export type ConnectProviderBody = Readonly<{
    apiKey: string;
}>;
export type DefaultToolModelSelection = Readonly<{
    toolId: ToolId;
    defaultProviderModelId: string;
    fundingSource: FundingSource;
    defaultProviderConnectionId: string | null;
    defaultRevision: number;
    fundingAuthorityRevision: number;
}>;
export type ProviderConnectionAuthorityStatus = "available" | "invalid" | "insufficient_balance";
export type ProviderConnectionAuthority = Readonly<{
    providerConnectionId: string;
    providerId: string;
    status: ProviderConnectionAuthorityStatus;
    reason: "AVAILABLE" | "CONNECTION_INVALID" | "CONNECTION_BALANCE_INSUFFICIENT";
    nextAction: "replace_or_reverify_connection" | null;
    connectionRevision: number;
    capabilityRevision: number;
    verifierRevision: string;
    compatibleProviderModelIds: readonly string[];
}>;
export type UpdateDefaultToolModelSelectionBody = Readonly<{
    expectedDefaultRevision: number;
    expectedFundingAuthorityRevision: number;
    expectedProviderConnectionRevision: number | null;
    defaultProviderModelId: string;
    fundingSource: FundingSource;
    defaultProviderConnectionId: string | null;
}>;
export declare function parseGatewayReference(value: unknown): GatewayReference;
export declare function parseModelSelectionsProjection(value: unknown): ModelSelectionsProjection;
export declare function parseUpdateToolModelSelectionBody(value: unknown): UpdateToolModelSelectionBody;
export declare function parseConnectProviderBody(value: unknown): ConnectProviderBody;
export declare function parseDefaultToolModelSelections(value: unknown): readonly DefaultToolModelSelection[];
export declare function parseProviderConnectionAuthorities(value: unknown): readonly ProviderConnectionAuthority[];
export declare function parseUpdateDefaultToolModelSelectionBody(value: unknown): UpdateDefaultToolModelSelectionBody;
