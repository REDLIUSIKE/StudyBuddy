export const TOOL_DEVICE_TOKEN_BINDINGS = {
  codex: "responses:create",
  claude_code: "messages:create",
} as const;

const UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HANDLE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type ToolDeviceTokenToolId = keyof typeof TOOL_DEVICE_TOKEN_BINDINGS;
export type ToolDeviceTokenScope =
  (typeof TOOL_DEVICE_TOKEN_BINDINGS)[ToolDeviceTokenToolId];
export type ToolDeviceTokenStatus =
  | "pending"
  | "active"
  | "cancelled"
  | "revoked";
export type ToolDeviceTokenRevocationReason =
  | "logout"
  | "account_changed"
  | "device_changed"
  | "entitlement_lost"
  | "explicit_deactivate"
  | "activation_compensation"
  | "pending_timeout"
  | "connection_reset"
  | "admin_revoked"
  | "risk_disabled"
  | "receipt_binding_migration";

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

export type ToolDeviceTokenStableCode =
  | "TOOL_DEVICE_TOKEN_TOOL_INVALID"
  | "TOOL_DEVICE_TOKEN_ISSUE_INVALID"
  | "TOOL_DEVICE_TOKEN_QUERY_INVALID"
  | "TOOL_DEVICE_TOKEN_PENDING_INVALID"
  | "TOOL_DEVICE_TOKEN_HANDLE_REVISION_INVALID"
  | "TOOL_DEVICE_TOKEN_ACTIVATION_BODY_INVALID"
  | "TOOL_DEVICE_TOKEN_ACTIVATION_INVALID"
  | "TOOL_DEVICE_TOKEN_CANCEL_RESULT_INVALID"
  | "TOOL_DEVICE_TOKEN_REVOKE_INVALID"
  | "TOOL_DEVICE_TOKEN_REVOKE_RESULT_INVALID"
  | "TOOL_DEVICE_TOKEN_SUMMARY_INVALID"
  | "TOOL_DEVICE_TOKEN_NOT_ALLOWED"
  | "TOOL_DEVICE_TOKEN_REVOKED"
  | "TOOL_DEVICE_TOKEN_SCOPE_INVALID"
  | "TOOL_DEVICE_TOKEN_RECEIPT_REQUIRED"
  | "TOOL_DEVICE_TOKEN_REVISION_CONFLICT"
  | "TOOL_DEVICE_TOKEN_UNAVAILABLE"
  | "TOOL_CREDENTIAL_EXCHANGE_REQUEST_INVALID"
  | "TOOL_CREDENTIAL_EXCHANGE_RESULT_INVALID";

export function parseToolDeviceTokenToolId(
  value: unknown,
): ToolDeviceTokenToolId {
  if (value !== "codex" && value !== "claude_code") {
    throw new TypeError("TOOL_DEVICE_TOKEN_TOOL_INVALID");
  }
  return value;
}

export function toolDeviceTokenScopeFor(
  toolId: ToolDeviceTokenToolId,
): ToolDeviceTokenScope {
  return TOOL_DEVICE_TOKEN_BINDINGS[toolId];
}

export function parseToolDeviceTokenIssueBody(
  value: unknown,
): Record<string, never> {
  return parseEmptyRecord(value, "TOOL_DEVICE_TOKEN_ISSUE_INVALID");
}

export function parseToolDeviceTokenEmptyQuery(
  value: unknown,
): Record<string, never> {
  return parseEmptyRecord(value, "TOOL_DEVICE_TOKEN_QUERY_INVALID");
}

export function parsePendingToolDeviceToken(
  value: unknown,
): PendingToolDeviceToken {
  const error = "TOOL_DEVICE_TOKEN_PENDING_INVALID";
  const record = exactRecord(
    value,
    ["token", "handle", "toolId", "scope", "revision", "pendingExpiresAt"],
    error,
  );
  const toolId = parseBoundTool(record.toolId, record.scope, error);
  return {
    token: canonicalDeviceToken(record.token, error),
    handle: canonicalHandle(record.handle, error),
    toolId,
    scope: toolDeviceTokenScopeFor(toolId),
    revision: positiveRevision(record.revision, error),
    pendingExpiresAt: canonicalInstant(record.pendingExpiresAt, error),
  };
}

export function parseToolDeviceTokenActivationBody(
  value: unknown,
): ToolDeviceTokenActivationBody {
  const error = "TOOL_DEVICE_TOKEN_ACTIVATION_BODY_INVALID";
  const record = exactRecord(value, ["handle", "revision", "receiptRevision"], error);
  return {
    handle: canonicalHandle(record.handle, error),
    revision: positiveRevision(record.revision, error),
    receiptRevision: positiveRevision(record.receiptRevision, error),
  };
}

export function parseToolDeviceTokenHandleRevision(
  value: unknown,
): ToolDeviceTokenHandleRevision {
  return parseHandleRevision(value, "TOOL_DEVICE_TOKEN_HANDLE_REVISION_INVALID");
}

export function parseToolDeviceTokenRevokeBody(
  value: unknown,
): ToolDeviceTokenRevokeBody {
  const error = "TOOL_DEVICE_TOKEN_REVOKE_INVALID";
  const record = exactRecord(
    value,
    ["handle", "revision", "receiptRevision", "reason"],
    error,
  );
  if (record.reason !== "explicit_deactivate") throw new TypeError(error);
  return {
    handle: canonicalHandle(record.handle, error),
    revision: positiveRevision(record.revision, error),
    receiptRevision: positiveRevision(record.receiptRevision, error),
    reason: "explicit_deactivate",
  };
}

export function parseToolDeviceTokenActivation(
  value: unknown,
): ToolDeviceTokenActivation {
  const error = "TOOL_DEVICE_TOKEN_ACTIVATION_INVALID";
  const record = exactRecord(
    value,
    [
      "handle",
      "toolId",
      "scope",
      "revision",
      "receiptRevision",
      "status",
      "activatedAt",
    ],
    error,
  );
  const toolId = parseBoundTool(record.toolId, record.scope, error);
  if (record.status !== "active") throw new TypeError(error);
  return {
    handle: canonicalHandle(record.handle, error),
    toolId,
    scope: toolDeviceTokenScopeFor(toolId),
    revision: positiveRevision(record.revision, error),
    receiptRevision: positiveRevision(record.receiptRevision, error),
    status: "active",
    activatedAt: canonicalInstant(record.activatedAt, error),
  };
}

export function parseToolDeviceTokenCancelResult(
  value: unknown,
): ToolDeviceTokenCancelResult {
  return parseTerminalResult(
    value,
    "cancelled",
    "TOOL_DEVICE_TOKEN_CANCEL_RESULT_INVALID",
  );
}

export function parseToolDeviceTokenRevokeResult(
  value: unknown,
): ToolDeviceTokenRevokeResult {
  const error = "TOOL_DEVICE_TOKEN_REVOKE_RESULT_INVALID";
  const record = exactRecord(
    value,
    ["handle", "revision", "receiptRevision", "status"],
    error,
  );
  if (record.status !== "revoked") throw new TypeError(error);
  return {
    handle: canonicalHandle(record.handle, error),
    revision: positiveRevision(record.revision, error),
    receiptRevision: positiveRevision(record.receiptRevision, error),
    status: "revoked",
  };
}

export function parseToolDeviceTokenSummary(
  value: unknown,
): ToolDeviceTokenSummary {
  const error = "TOOL_DEVICE_TOKEN_SUMMARY_INVALID";
  const record = exactRecord(
    value,
    [
      "handle",
      "toolId",
      "scope",
      "revision",
      "receiptRevision",
      "status",
      "activatedAt",
      "revokedAt",
      "revocationReason",
    ],
    error,
  );
  const toolId = parseBoundTool(record.toolId, record.scope, error);
  const status = tokenStatus(record.status, error);
  const receiptRevision = nullablePositiveRevision(record.receiptRevision, error);
  const activatedAt = nullableInstant(record.activatedAt, error);
  const revokedAt = nullableInstant(record.revokedAt, error);
  const revocationReason = nullableRevocationReason(
    record.revocationReason,
    error,
  );
  if (!validSummaryState(
    status,
    receiptRevision,
    activatedAt,
    revokedAt,
    revocationReason,
  )) {
    throw new TypeError(error);
  }
  return {
    handle: canonicalHandle(record.handle, error),
    toolId,
    scope: toolDeviceTokenScopeFor(toolId),
    revision: positiveRevision(record.revision, error),
    receiptRevision,
    status,
    activatedAt,
    revokedAt,
    revocationReason,
  };
}

export function parseToolCredentialExchangeRequest(
  value: unknown,
): ToolCredentialExchangeRequest {
  const error = "TOOL_CREDENTIAL_EXCHANGE_REQUEST_INVALID";
  const record = exactRecord(
    value,
    [
      "credentialRevision",
      "receiptRevision",
      "adapterIdentity",
      "managedConfigSha256",
      "requestId",
    ],
    error,
  );
  return {
    credentialRevision: positiveRevision(record.credentialRevision, error),
    receiptRevision: positiveRevision(record.receiptRevision, error),
    adapterIdentity: canonicalAdapterIdentity(record.adapterIdentity, error),
    managedConfigSha256: canonicalSha256(record.managedConfigSha256, error),
    requestId: canonicalHandle(record.requestId, error),
  };
}

export function parseToolCredentialExchangeResult(
  value: unknown,
  expected?: Readonly<{
    credentialRevision: number;
    receiptRevision: number;
  }>,
): ToolCredentialExchangeResult {
  const error = "TOOL_CREDENTIAL_EXCHANGE_RESULT_INVALID";
  const record = exactRecord(
    value,
    ["bearer", "credentialRevision", "receiptRevision", "expiresAt"],
    error,
  );
  const credentialRevision = positiveRevision(record.credentialRevision, error);
  const receiptRevision = positiveRevision(record.receiptRevision, error);
  if (
    expected !== undefined &&
    (credentialRevision !== positiveRevision(expected.credentialRevision, error) ||
      receiptRevision !== positiveRevision(expected.receiptRevision, error))
  ) {
    throw new TypeError(error);
  }
  return {
    bearer: canonicalBearer(record.bearer, error),
    credentialRevision,
    receiptRevision,
    expiresAt: canonicalInstant(record.expiresAt, error),
  };
}

function parseEmptyRecord(
  value: unknown,
  error: string,
): Record<string, never> {
  if (value === undefined) return {};
  const record = objectRecord(value, error);
  if (Object.keys(record).length !== 0) throw new TypeError(error);
  return {};
}

function parseHandleRevision(
  value: unknown,
  error: string,
): ToolDeviceTokenHandleRevision {
  const record = objectRecord(value, error);
  const keys = Object.keys(record);
  if (
    (keys.length !== 2 && keys.length !== 3)
    || keys.some((key) => !["handle", "revision", "receiptRevision"].includes(key))
    || (keys.length === 3 && !("receiptRevision" in record))
  ) throw new TypeError(error);
  return {
    handle: canonicalHandle(record.handle, error),
    revision: positiveRevision(record.revision, error),
    ...("receiptRevision" in record
      ? { receiptRevision: positiveRevision(record.receiptRevision, error) }
      : {}),
  };
}

function parseTerminalResult<TStatus extends "cancelled" | "revoked">(
  value: unknown,
  status: TStatus,
  error: string,
): ToolDeviceTokenHandleRevision & { status: TStatus } {
  const record = exactRecord(value, ["handle", "revision", "status"], error);
  if (record.status !== status) throw new TypeError(error);
  return {
    handle: canonicalHandle(record.handle, error),
    revision: positiveRevision(record.revision, error),
    status,
  };
}

function parseBoundTool(
  toolId: unknown,
  scope: unknown,
  error: string,
): ToolDeviceTokenToolId {
  let parsedToolId: ToolDeviceTokenToolId;
  try {
    parsedToolId = parseToolDeviceTokenToolId(toolId);
  } catch {
    throw new TypeError(error);
  }
  if (scope !== toolDeviceTokenScopeFor(parsedToolId)) throw new TypeError(error);
  return parsedToolId;
}

function canonicalDeviceToken(value: unknown, error: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9]{48}$/.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function canonicalHandle(value: unknown, error: string): string {
  if (typeof value !== "string" || !HANDLE_PATTERN.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function positiveRevision(value: unknown, error: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new TypeError(error);
  }
  return value as number;
}

function nullablePositiveRevision(value: unknown, error: string): number | null {
  return value === null ? null : positiveRevision(value, error);
}

function canonicalAdapterIdentity(value: unknown, error: string): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(value)
  ) {
    throw new TypeError(error);
  }
  return value;
}

function canonicalSha256(value: unknown, error: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function canonicalBearer(value: unknown, error: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 8_192 ||
    value.trim() !== value ||
    /[\r\n\u2028\u2029]/.test(value)
  ) {
    throw new TypeError(error);
  }
  return value;
}

function canonicalInstant(value: unknown, error: string): string {
  if (
    typeof value !== "string" ||
    !UTC_INSTANT_PATTERN.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(error);
  }
  return value;
}

function nullableInstant(value: unknown, error: string): string | null {
  return value === null ? null : canonicalInstant(value, error);
}

function tokenStatus(value: unknown, error: string): ToolDeviceTokenStatus {
  if (
    value !== "pending" &&
    value !== "active" &&
    value !== "cancelled" &&
    value !== "revoked"
  ) {
    throw new TypeError(error);
  }
  return value;
}

function nullableRevocationReason(
  value: unknown,
  error: string,
): ToolDeviceTokenRevocationReason | null {
  if (value === null) return null;
  switch (value) {
    case "logout":
    case "account_changed":
    case "device_changed":
    case "entitlement_lost":
    case "explicit_deactivate":
    case "activation_compensation":
    case "pending_timeout":
    case "connection_reset":
    case "admin_revoked":
    case "risk_disabled":
    case "receipt_binding_migration":
      return value as ToolDeviceTokenRevocationReason;
    default:
      throw new TypeError(error);
  }
}

function validSummaryState(
  status: ToolDeviceTokenStatus,
  receiptRevision: number | null,
  activatedAt: string | null,
  revokedAt: string | null,
  reason: ToolDeviceTokenRevocationReason | null,
): boolean {
  switch (status) {
    case "pending":
      return receiptRevision === null && activatedAt === null && revokedAt === null && reason === null;
    case "active":
      return receiptRevision !== null && activatedAt !== null && revokedAt === null && reason === null;
    case "cancelled":
      return (
        receiptRevision === null &&
        activatedAt === null &&
        revokedAt !== null &&
        (reason === "pending_timeout" || reason === "activation_compensation")
      );
    case "revoked":
      return (
        (receiptRevision !== null || reason === "receipt_binding_migration") &&
        (receiptRevision === null || reason !== "receipt_binding_migration") &&
        activatedAt !== null &&
        revokedAt !== null &&
        reason !== null &&
        reason !== "pending_timeout" &&
        reason !== "activation_compensation"
      );
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  error: string,
): Record<string, unknown> {
  const record = objectRecord(value, error);
  const actual = Object.keys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  ) {
    throw new TypeError(error);
  }
  return record;
}

function objectRecord(value: unknown, error: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(error);
  }
  return value as Record<string, unknown>;
}
