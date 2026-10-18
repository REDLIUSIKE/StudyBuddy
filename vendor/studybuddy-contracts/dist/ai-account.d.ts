export declare const PLATFORM_AI_COMBINATION_ID: "codex.deepseek.deepseek-flash";
export declare const RETIRED_PLATFORM_DEEPSEEK_V4_FLASH_COMBINATION_ID: "codex.deepseek.deepseek-v4-flash";
export declare const PLATFORM_AI_USAGE_IDENTITIES: readonly [{
    readonly combinationId: "codex.deepseek.deepseek-flash";
    readonly tool: "codex";
    readonly model: "deepseek-flash";
}, {
    readonly combinationId: "claude_code.deepseek.deepseek-flash";
    readonly tool: "claude_code";
    readonly model: "deepseek-flash";
}, {
    readonly combinationId: "codex.kimi.kimi-k3";
    readonly tool: "codex";
    readonly model: "kimi-k3";
}, {
    readonly combinationId: "claude_code.kimi.kimi-k3";
    readonly tool: "claude_code";
    readonly model: "kimi-k3";
}, {
    readonly combinationId: "codex.deepseek.deepseek-v4-flash";
    readonly tool: "codex";
    readonly model: "deepseek-v4-flash";
}, {
    readonly combinationId: "claude_code.deepseek.deepseek-v4-flash";
    readonly tool: "claude_code";
    readonly model: "deepseek-v4-flash";
}, {
    readonly combinationId: "codex.deepseek.deepseek-v4-flash-vision-exp";
    readonly tool: "codex";
    readonly model: "deepseek-v4-flash-vision-exp";
}, {
    readonly combinationId: "claude_code.deepseek.deepseek-v4-flash-vision-exp";
    readonly tool: "claude_code";
    readonly model: "deepseek-v4-flash-vision-exp";
}, {
    readonly combinationId: "codex.kimi.kimi-k2.6";
    readonly tool: "codex";
    readonly model: "kimi-k2.6";
}, {
    readonly combinationId: "claude_code.kimi.kimi-k2.6";
    readonly tool: "claude_code";
    readonly model: "kimi-k2.6";
}, {
    readonly combinationId: "codex.kimi.kimi-k2.7-code";
    readonly tool: "codex";
    readonly model: "kimi-k2.7-code";
}, {
    readonly combinationId: "claude_code.kimi.kimi-k2.7-code";
    readonly tool: "claude_code";
    readonly model: "kimi-k2.7-code";
}, {
    readonly combinationId: "codex.kimi.kimi-k2.7-code-highspeed";
    readonly tool: "codex";
    readonly model: "kimi-k2.7-code-highspeed";
}, {
    readonly combinationId: "claude_code.kimi.kimi-k2.7-code-highspeed";
    readonly tool: "claude_code";
    readonly model: "kimi-k2.7-code-highspeed";
}];
export type PlatformAiUsageCombinationId = (typeof PLATFORM_AI_USAGE_IDENTITIES)[number]["combinationId"];
export type PlatformAiUsageToolId = (typeof PLATFORM_AI_USAGE_IDENTITIES)[number]["tool"];
export type PlatformAiUsageModelId = (typeof PLATFORM_AI_USAGE_IDENTITIES)[number]["model"];
export type PlatformAiUsageIdentity = (typeof PLATFORM_AI_USAGE_IDENTITIES)[number];
export declare const PLATFORM_AI_USAGE_COMBINATION_IDS: readonly PlatformAiUsageCombinationId[];
export declare const PLATFORM_AI_USAGE_MODEL_IDS: readonly PlatformAiUsageModelId[];
export declare const CLAUDE_KIMI_AI_COMBINATION_ID: "claude_code.kimi.kimi-k3";
export declare const CODEX_KIMI_AI_COMBINATION_ID: "codex.kimi.kimi-k3";
export declare const CLAUDE_DEEPSEEK_AI_COMBINATION_ID: "claude_code.deepseek.deepseek-flash";
export declare const AI_USAGE_MAX_PAGE: 1000;
export declare const AI_USAGE_MAX_PAGE_SIZE: 100;
export type CanonicalMoney = string;
export type AiUsagePrecision = "reported" | "estimated" | "unknown";
export type AiGatewayAccountSummary = {
    availableBalance: CanonicalMoney | null;
    frozenBalance: CanonicalMoney | null;
    currency: "CNY" | null;
    observedAt: string;
    syncStatus: "online" | "stale" | "unavailable";
    subscription: {
        planName: string;
        endsAt: string | null;
    } | null;
};
export type AiGatewayUsageDetail = {
    id: string;
    modelId: string;
    inputTokens: string | null;
    outputTokens: string | null;
    chargedAmount: CanonicalMoney | null;
    precision: AiUsagePrecision;
    occurredAt: string;
};
export type AiGatewayUsagePage = {
    items: AiGatewayUsageDetail[];
    total: number;
    page: number;
    pageSize: number;
};
export type AiPlatformAccess = {
    status: "active" | "rotated" | "revoked" | "expired";
    maskedId: string;
    revision: number;
    issuedAt: string;
    expiresAt: string;
    revokedAt: string | null;
};
export type AiAccountSummary = {
    balance: CanonicalMoney;
    frozenBalance: CanonicalMoney;
    availableBalance: CanonicalMoney;
    platformAccess: AiPlatformAccess | null;
};
export type AiCredentialTicket = {
    ticket: string;
    expiresAt: string;
    combinationId: typeof PLATFORM_AI_COMBINATION_ID;
};
export type AiCredentialRevokeResult = {
    status: "revoked";
};
export type AiUsageQuery = {
    page: number;
    pageSize: number;
};
export type AiUsageStatus = "received" | "reserved" | "streaming" | "settled" | "released" | "reconciliation_pending" | "rejected";
export type AiUsageStableCode = "UPSTREAM_NOT_ACCEPTED" | "STREAM_START_PERSIST_FAILED" | "USAGE_INVALID" | "USAGE_MISSING" | "USAGE_COST_OVER_HOLD" | "SETTLEMENT_PERSIST_FAILED";
export type AiUsageDetail = {
    id: string;
    requestIdSuffix: string;
    tool: PlatformAiUsageToolId;
    model: PlatformAiUsageModelId;
    status: AiUsageStatus;
    reservedAmount: CanonicalMoney;
    actualCost: CanonicalMoney | null;
    releasedAmount: CanonicalMoney | null;
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    stableCode: AiUsageStableCode | null;
    createdAt: string;
    settledAt: string | null;
};
export type AiUsagePage = {
    items: AiUsageDetail[];
    total: number;
    page: number;
    pageSize: number;
};
type CodexDeepSeekAuthorizationRequest = {
    studyBuddyUserId: string;
    deviceId: string;
    combinationId: typeof PLATFORM_AI_COMBINATION_ID;
    toolId: "codex";
    scope: "responses:create";
};
type ClaudeKimiAuthorizationRequest = {
    studyBuddyUserId: string;
    deviceId: string;
    combinationId: typeof CLAUDE_KIMI_AI_COMBINATION_ID;
    toolId: "claude_code";
    scope: "messages:create";
};
type CodexKimiAuthorizationRequest = {
    studyBuddyUserId: string;
    deviceId: string;
    combinationId: typeof CODEX_KIMI_AI_COMBINATION_ID;
    toolId: "codex";
    scope: "responses:create";
};
type ClaudeDeepSeekAuthorizationRequest = {
    studyBuddyUserId: string;
    deviceId: string;
    combinationId: typeof CLAUDE_DEEPSEEK_AI_COMBINATION_ID;
    toolId: "claude_code";
    scope: "messages:create";
};
type DynamicAiAuthorizationRequest = {
    studyBuddyUserId: string;
    deviceId: string;
    providerModelId: string;
    combinationId: string;
    toolId: "codex" | "claude_code";
    scope: "responses:create" | "messages:create";
};
export type InternalAiAuthorizationRequest = CodexDeepSeekAuthorizationRequest | CodexKimiAuthorizationRequest | ClaudeDeepSeekAuthorizationRequest | ClaudeKimiAuthorizationRequest | DynamicAiAuthorizationRequest;
export type InternalAiAuthorizationResponse = {
    allowed: boolean;
    authorizationRevision: number;
};
export declare function parseAiAccountMutationBody(value: unknown): Record<string, never>;
export declare function parseAiAccountEmptyQuery(value: unknown): Record<string, never>;
export declare function parseAiAccountSummary(value: unknown): AiAccountSummary;
export declare function parseAiGatewayAccountSummary(value: unknown): AiGatewayAccountSummary;
export declare function parseAiGatewayUsageDetail(value: unknown): AiGatewayUsageDetail;
export declare function parseAiGatewayUsagePage(value: unknown): AiGatewayUsagePage;
export declare function parseAiCredentialTicket(value: unknown): AiCredentialTicket;
export declare function parseAiCredentialRevokeResult(value: unknown): AiCredentialRevokeResult;
export declare function parseAiUsageQuery(value: unknown): AiUsageQuery;
export declare function parseAiUsageId(value: unknown): string;
export declare function parseAiUsagePage(value: unknown): AiUsagePage;
export declare function parseAiUsageDetail(value: unknown): AiUsageDetail;
export declare function parseInternalAiAuthorizationRequest(value: unknown): InternalAiAuthorizationRequest;
export declare function parseInternalAiAuthorizationResponse(value: unknown): InternalAiAuthorizationResponse;
export {};
