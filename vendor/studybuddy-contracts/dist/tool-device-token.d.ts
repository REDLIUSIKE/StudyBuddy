export declare const TOOL_DEVICE_TOKEN_BINDINGS: {
    readonly codex: "responses:create";
    readonly claude_code: "messages:create";
};
export type ToolDeviceTokenToolId = keyof typeof TOOL_DEVICE_TOKEN_BINDINGS;
export type ToolDeviceTokenScope = (typeof TOOL_DEVICE_TOKEN_BINDINGS)[ToolDeviceTokenToolId];
export type ToolDeviceTokenStatus = "pending" | "active" | "cancelled" | "revoked";
export type ToolDeviceTokenRevocationReason = "logout" | "account_changed" | "device_changed" | "entitlement_lost" | "explicit_deactivate" | "activation_compensation" | "pending_timeout" | "connection_reset" | "admin_revoked" | "risk_disabled" | "receipt_binding_migration";
export type PendingToolDeviceToken = {
    token: string;
    handle: string;
    toolId: ToolDeviceTokenToolId;
    scope: ToolDeviceTokenScope;
    revision: number;
    pendingExpiresAt: string;
};
export type ToolDeviceTokenHandleRevision = Readonly<{
    handle: string;
    revision: number;
    receiptRevision?: number;
}>;
export type ToolReceiptBinding = Readonly<{
    credentialRevision: number;
    receiptRevision: number;
    adapterIdentity: string;
    managedConfigSha256: string;
}>;
export type ToolCredentialExchangeRequest = ToolReceiptBinding & Readonly<{
    requestId: string;
}>;
export type ToolCredentialExchangeResult = Readonly<{
    bearer: string;
    credentialRevision: number;
    receiptRevision: number;
    expiresAt: string;
}>;
export type ToolDeviceTokenActivationBody = ToolDeviceTokenHandleRevision & Readonly<{
    receiptRevision: number;
}>;
export type ToolDeviceTokenRevokeBody = ToolDeviceTokenActivationBody & {
    reason: "explicit_deactivate";
};
export type ToolDeviceTokenActivation = ToolDeviceTokenActivationBody & {
    toolId: ToolDeviceTokenToolId;
    scope: ToolDeviceTokenScope;
    status: "active";
    activatedAt: string;
};
export type ToolDeviceTokenCancelResult = ToolDeviceTokenHandleRevision & {
    status: "cancelled";
};
export type ToolDeviceTokenRevokeResult = ToolDeviceTokenActivationBody & {
    status: "revoked";
};
export type ToolDeviceTokenSummary = Omit<ToolDeviceTokenHandleRevision, "receiptRevision"> & {
    receiptRevision: number | null;
    toolId: ToolDeviceTokenToolId;
    scope: ToolDeviceTokenScope;
    status: ToolDeviceTokenStatus;
    activatedAt: string | null;
    revokedAt: string | null;
    revocationReason: ToolDeviceTokenRevocationReason | null;
};
export type ToolDeviceTokenStableCode = "TOOL_DEVICE_TOKEN_TOOL_INVALID" | "TOOL_DEVICE_TOKEN_ISSUE_INVALID" | "TOOL_DEVICE_TOKEN_QUERY_INVALID" | "TOOL_DEVICE_TOKEN_PENDING_INVALID" | "TOOL_DEVICE_TOKEN_HANDLE_REVISION_INVALID" | "TOOL_DEVICE_TOKEN_ACTIVATION_BODY_INVALID" | "TOOL_DEVICE_TOKEN_ACTIVATION_INVALID" | "TOOL_DEVICE_TOKEN_CANCEL_RESULT_INVALID" | "TOOL_DEVICE_TOKEN_REVOKE_INVALID" | "TOOL_DEVICE_TOKEN_REVOKE_RESULT_INVALID" | "TOOL_DEVICE_TOKEN_SUMMARY_INVALID" | "TOOL_DEVICE_TOKEN_NOT_ALLOWED" | "TOOL_DEVICE_TOKEN_REVOKED" | "TOOL_DEVICE_TOKEN_SCOPE_INVALID" | "TOOL_DEVICE_TOKEN_RECEIPT_REQUIRED" | "TOOL_DEVICE_TOKEN_REVISION_CONFLICT" | "TOOL_DEVICE_TOKEN_UNAVAILABLE" | "TOOL_CREDENTIAL_EXCHANGE_REQUEST_INVALID" | "TOOL_CREDENTIAL_EXCHANGE_RESULT_INVALID";
export declare function parseToolDeviceTokenToolId(value: unknown): ToolDeviceTokenToolId;
export declare function toolDeviceTokenScopeFor(toolId: ToolDeviceTokenToolId): ToolDeviceTokenScope;
export declare function parseToolDeviceTokenIssueBody(value: unknown): Record<string, never>;
export declare function parseToolDeviceTokenEmptyQuery(value: unknown): Record<string, never>;
export declare function parsePendingToolDeviceToken(value: unknown): PendingToolDeviceToken;
export declare function parseToolDeviceTokenActivationBody(value: unknown): ToolDeviceTokenActivationBody;
export declare function parseToolDeviceTokenHandleRevision(value: unknown): ToolDeviceTokenHandleRevision;
export declare function parseToolDeviceTokenRevokeBody(value: unknown): ToolDeviceTokenRevokeBody;
export declare function parseToolDeviceTokenActivation(value: unknown): ToolDeviceTokenActivation;
export declare function parseToolDeviceTokenCancelResult(value: unknown): ToolDeviceTokenCancelResult;
export declare function parseToolDeviceTokenRevokeResult(value: unknown): ToolDeviceTokenRevokeResult;
export declare function parseToolDeviceTokenSummary(value: unknown): ToolDeviceTokenSummary;
export declare function parseToolCredentialExchangeRequest(value: unknown): ToolCredentialExchangeRequest;
export declare function parseToolCredentialExchangeResult(value: unknown, expected?: Readonly<{
    credentialRevision: number;
    receiptRevision: number;
}>): ToolCredentialExchangeResult;
