export const PLATFORM_AI_COMBINATION_ID =
  "codex.deepseek.deepseek-flash" as const;
export const RETIRED_PLATFORM_DEEPSEEK_V4_FLASH_COMBINATION_ID =
  "codex.deepseek.deepseek-v4-flash" as const;
// This is the read-only billing history catalog. Current selection catalogs
// remain separate, so retired identities can be rendered without becoming
// selectable or routable again.
export const PLATFORM_AI_USAGE_IDENTITIES = [
  { combinationId: "codex.deepseek.deepseek-flash", tool: "codex", model: "deepseek-flash" },
  { combinationId: "claude_code.deepseek.deepseek-flash", tool: "claude_code", model: "deepseek-flash" },
  { combinationId: "codex.kimi.kimi-k3", tool: "codex", model: "kimi-k3" },
  { combinationId: "claude_code.kimi.kimi-k3", tool: "claude_code", model: "kimi-k3" },
  { combinationId: "codex.deepseek.deepseek-v4-flash", tool: "codex", model: "deepseek-v4-flash" },
  { combinationId: "claude_code.deepseek.deepseek-v4-flash", tool: "claude_code", model: "deepseek-v4-flash" },
  { combinationId: "codex.deepseek.deepseek-v4-flash-vision-exp", tool: "codex", model: "deepseek-v4-flash-vision-exp" },
  { combinationId: "claude_code.deepseek.deepseek-v4-flash-vision-exp", tool: "claude_code", model: "deepseek-v4-flash-vision-exp" },
  { combinationId: "codex.kimi.kimi-k2.6", tool: "codex", model: "kimi-k2.6" },
  { combinationId: "claude_code.kimi.kimi-k2.6", tool: "claude_code", model: "kimi-k2.6" },
  { combinationId: "codex.kimi.kimi-k2.7-code", tool: "codex", model: "kimi-k2.7-code" },
  { combinationId: "claude_code.kimi.kimi-k2.7-code", tool: "claude_code", model: "kimi-k2.7-code" },
  { combinationId: "codex.kimi.kimi-k2.7-code-highspeed", tool: "codex", model: "kimi-k2.7-code-highspeed" },
  { combinationId: "claude_code.kimi.kimi-k2.7-code-highspeed", tool: "claude_code", model: "kimi-k2.7-code-highspeed" },
] as const;
export type PlatformAiUsageCombinationId =
  (typeof PLATFORM_AI_USAGE_IDENTITIES)[number]["combinationId"];
export type PlatformAiUsageToolId =
  (typeof PLATFORM_AI_USAGE_IDENTITIES)[number]["tool"];
export type PlatformAiUsageModelId =
  (typeof PLATFORM_AI_USAGE_IDENTITIES)[number]["model"];
export type PlatformAiUsageIdentity =
  (typeof PLATFORM_AI_USAGE_IDENTITIES)[number];
export const PLATFORM_AI_USAGE_COMBINATION_IDS: readonly PlatformAiUsageCombinationId[] =
  PLATFORM_AI_USAGE_IDENTITIES.map((identity) => identity.combinationId);
export const PLATFORM_AI_USAGE_MODEL_IDS: readonly PlatformAiUsageModelId[] =
  [...new Set(PLATFORM_AI_USAGE_IDENTITIES.map((identity) => identity.model))];
export const CLAUDE_KIMI_AI_COMBINATION_ID =
  "claude_code.kimi.kimi-k3" as const;
export const CODEX_KIMI_AI_COMBINATION_ID = "codex.kimi.kimi-k3" as const;
export const CLAUDE_DEEPSEEK_AI_COMBINATION_ID =
  "claude_code.deepseek.deepseek-flash" as const;

export const AI_USAGE_MAX_PAGE = 1000 as const;
export const AI_USAGE_MAX_PAGE_SIZE = 100 as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MONEY_PATTERN =
  /^(?:0|[1-9]\d{0,11})(?:\.\d{0,7}[1-9])?$/;
const UTC_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const OPAQUE_ID_PATTERN = /^[1-9]\d{0,18}$/;
const REQUEST_SUFFIX_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;
const MASKED_ID_PATTERN = /^[A-Za-z0-9_-]{8}\*{8}$/;
const PROVIDER_MODEL_ID_PATTERN = /^[a-z][a-z0-9_]{1,31}\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const LOGICAL_MODEL_ID_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;

export type CanonicalMoney = string;

export type AiUsagePrecision = "reported" | "estimated" | "unknown";

export type AiGatewayAccountSummary = {
  availableBalance: CanonicalMoney | null;
  frozenBalance: CanonicalMoney | null;
  currency: "CNY" | null;
  observedAt: string;
  syncStatus: "online" | "stale" | "unavailable";
  subscription: { planName: string; endsAt: string | null } | null;
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

export type AiUsageStatus =
  | "received"
  | "reserved"
  | "streaming"
  | "settled"
  | "released"
  | "reconciliation_pending"
  | "rejected";

export type AiUsageStableCode =
  | "UPSTREAM_NOT_ACCEPTED"
  | "STREAM_START_PERSIST_FAILED"
  | "USAGE_INVALID"
  | "USAGE_MISSING"
  | "USAGE_COST_OVER_HOLD"
  | "SETTLEMENT_PERSIST_FAILED";

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

export type InternalAiAuthorizationRequest =
  | CodexDeepSeekAuthorizationRequest
  | CodexKimiAuthorizationRequest
  | ClaudeDeepSeekAuthorizationRequest
  | ClaudeKimiAuthorizationRequest
  | DynamicAiAuthorizationRequest;

export type InternalAiAuthorizationResponse = {
  allowed: boolean;
  authorizationRevision: number;
};

export function parseAiAccountMutationBody(value: unknown): Record<string, never> {
  if (value === undefined) return {};
  const record = objectRecord(value, "AI_ACCOUNT_MUTATION_INVALID");
  if (Object.keys(record).length !== 0) {
    throw new TypeError("AI_ACCOUNT_MUTATION_INVALID");
  }
  return {};
}

export function parseAiAccountEmptyQuery(value: unknown): Record<string, never> {
  if (value === undefined) return {};
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new TypeError("AI_ACCOUNT_QUERY_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 0) {
    throw new TypeError("AI_ACCOUNT_QUERY_INVALID");
  }
  return {};
}

export function parseAiAccountSummary(value: unknown): AiAccountSummary {
  const error = "AI_ACCOUNT_SUMMARY_INVALID";
  const record = exactRecord(
    value,
    ["balance", "frozenBalance", "availableBalance", "platformAccess"],
    error,
  );
  const balance = parseMoney(record.balance, error);
  const frozenBalance = parseMoney(record.frozenBalance, error);
  const availableBalance = parseMoney(record.availableBalance, error);
  if (
    moneyUnits(balance) - moneyUnits(frozenBalance) !==
      moneyUnits(availableBalance)
  ) {
    throw new TypeError(error);
  }
  return {
    balance,
    frozenBalance,
    availableBalance,
    platformAccess:
      record.platformAccess === null
        ? null
        : parsePlatformAccess(record.platformAccess, error),
  };
}

export function parseAiGatewayAccountSummary(
  value: unknown,
): AiGatewayAccountSummary {
  const error = "AI_GATEWAY_ACCOUNT_SUMMARY_INVALID";
  const record = exactRecord(
    value,
    [
      "availableBalance",
      "frozenBalance",
      "currency",
      "observedAt",
      "syncStatus",
      "subscription",
    ],
    error,
  );
  if (
    record.syncStatus !== "online" &&
    record.syncStatus !== "stale" &&
    record.syncStatus !== "unavailable"
  ) {
    throw new TypeError(error);
  }
  const unavailable = record.syncStatus === "unavailable";
  if (
    unavailable !== (record.availableBalance === null) ||
    unavailable !== (record.frozenBalance === null) ||
    unavailable !== (record.currency === null)
  ) {
    throw new TypeError(error);
  }
  const subscription = record.subscription === null
    ? null
    : parseAiGatewaySubscription(record.subscription, error);
  return {
    availableBalance: record.availableBalance === null
      ? null
      : parseMoney(record.availableBalance, error),
    frozenBalance: record.frozenBalance === null
      ? null
      : parseMoney(record.frozenBalance, error),
    currency: record.currency === null ? null : parseCny(record.currency, error),
    observedAt: parseUtcInstant(record.observedAt, error),
    syncStatus: record.syncStatus,
    subscription,
  };
}

export function parseAiGatewayUsageDetail(
  value: unknown,
): AiGatewayUsageDetail {
  const error = "AI_GATEWAY_USAGE_DETAIL_INVALID";
  const record = exactRecord(
    value,
    [
      "id",
      "modelId",
      "inputTokens",
      "outputTokens",
      "chargedAmount",
      "precision",
      "occurredAt",
    ],
    error,
  );
  if (
    typeof record.id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(record.id) ||
    typeof record.modelId !== "string" ||
    record.modelId.length < 1 || record.modelId.length > 256 ||
    record.modelId !== record.modelId.trim() || /[\p{Cc}\p{Cf}]/u.test(record.modelId) ||
    (record.precision !== "reported" &&
      record.precision !== "estimated" &&
      record.precision !== "unknown") ||
    !isNullableTokenString(record.inputTokens) ||
    !isNullableTokenString(record.outputTokens) ||
    (record.precision === "reported" &&
      (record.inputTokens === null || record.outputTokens === null))
  ) {
    throw new TypeError(error);
  }
  return {
    id: record.id,
    modelId: record.modelId,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    chargedAmount: record.chargedAmount === null
      ? null
      : parseMoney(record.chargedAmount, error),
    precision: record.precision,
    occurredAt: parseUtcInstant(record.occurredAt, error),
  };
}

export function parseAiGatewayUsagePage(value: unknown): AiGatewayUsagePage {
  const error = "AI_GATEWAY_USAGE_PAGE_INVALID";
  const record = exactRecord(
    value,
    ["items", "total", "page", "pageSize"],
    error,
  );
  if (
    !Array.isArray(record.items) ||
    !isSafeNonNegativeInteger(record.total) ||
    !isBoundedInteger(record.page, 1, AI_USAGE_MAX_PAGE) ||
    !isBoundedInteger(record.pageSize, 1, AI_USAGE_MAX_PAGE_SIZE) ||
    record.items.length > Number(record.pageSize)
  ) {
    throw new TypeError(error);
  }
  try {
    return {
      items: record.items.map((item) => parseAiGatewayUsageDetail(item)),
      total: record.total as number,
      page: record.page as number,
      pageSize: record.pageSize as number,
    };
  } catch {
    throw new TypeError(error);
  }
}

export function parseAiCredentialTicket(value: unknown): AiCredentialTicket {
  const error = "AI_CREDENTIAL_TICKET_INVALID";
  const record = exactRecord(
    value,
    ["ticket", "expiresAt", "combinationId"],
    error,
  );
  if (
    typeof record.ticket !== "string" ||
    !TICKET_PATTERN.test(record.ticket) ||
    record.combinationId !== PLATFORM_AI_COMBINATION_ID
  ) {
    throw new TypeError(error);
  }
  return {
    ticket: record.ticket,
    expiresAt: parseUtcInstant(record.expiresAt, error),
    combinationId: PLATFORM_AI_COMBINATION_ID,
  };
}

export function parseAiCredentialRevokeResult(
  value: unknown,
): AiCredentialRevokeResult {
  const error = "AI_CREDENTIAL_REVOKE_INVALID";
  const record = exactRecord(value, ["status"], error);
  if (record.status !== "revoked") throw new TypeError(error);
  return { status: "revoked" };
}

export function parseAiUsageQuery(value: unknown): AiUsageQuery {
  const error = "AI_USAGE_QUERY_INVALID";
  // Express's simple query parser returns a null-prototype record. Normalize
  // only this HTTP query boundary; bodies and response contracts stay strict.
  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === null) {
    value = { ...value };
  }
  const record = exactRecordWithOptionalKeys(
    value,
    [],
    ["page", "pageSize"],
    error,
  );
  return {
    page: parseQueryInteger(record.page, 1, AI_USAGE_MAX_PAGE, 1, error),
    pageSize: parseQueryInteger(
      record.pageSize,
      1,
      AI_USAGE_MAX_PAGE_SIZE,
      20,
      error,
    ),
  };
}

export function parseAiUsageId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !OPAQUE_ID_PATTERN.test(value) ||
    BigInt(value) > 9_223_372_036_854_775_807n
  ) {
    throw new TypeError("AI_USAGE_DETAIL_INVALID");
  }
  return value;
}

export function parseAiUsagePage(value: unknown): AiUsagePage {
  const error = "AI_USAGE_PAGE_INVALID";
  const record = exactRecord(
    value,
    ["items", "total", "page", "pageSize"],
    error,
  );
  if (
    !Array.isArray(record.items) ||
    record.items.length > AI_USAGE_MAX_PAGE_SIZE ||
    !isSafeNonNegativeInteger(record.total) ||
    !isBoundedInteger(record.page, 1, AI_USAGE_MAX_PAGE) ||
    !isBoundedInteger(record.pageSize, 1, AI_USAGE_MAX_PAGE_SIZE) ||
    record.items.length > Number(record.pageSize)
  ) {
    throw new TypeError(error);
  }
  return {
    items: record.items.map((item) => parseAiUsageItem(item, error)),
    total: record.total as number,
    page: record.page as number,
    pageSize: record.pageSize as number,
  };
}

export function parseAiUsageDetail(value: unknown): AiUsageDetail {
  return parseAiUsageItem(value, "AI_USAGE_DETAIL_INVALID");
}

export function parseInternalAiAuthorizationRequest(
  value: unknown,
): InternalAiAuthorizationRequest {
  const error = "INTERNAL_AI_AUTHORIZATION_INVALID";
  const record = exactRecordWithOptionalKeys(
    value,
    ["studyBuddyUserId", "deviceId", "combinationId", "toolId", "scope"],
    ["providerModelId"],
    error,
  );
  if (
    typeof record.studyBuddyUserId !== "string" ||
    !UUID_PATTERN.test(record.studyBuddyUserId) ||
    typeof record.deviceId !== "string" ||
    !UUID_PATTERN.test(record.deviceId) ||
    !validInternalAiAuthorizationIdentity(record)
  ) {
    throw new TypeError(error);
  }
  return {
    studyBuddyUserId: record.studyBuddyUserId,
    deviceId: record.deviceId,
    combinationId: record.combinationId,
    toolId: record.toolId,
    scope: record.scope,
    ...(record.providerModelId === undefined
      ? {}
      : { providerModelId: record.providerModelId }),
  } as InternalAiAuthorizationRequest;
}

function validInternalAiAuthorizationIdentity(
  record: Record<string, unknown>,
): boolean {
  if (record.providerModelId !== undefined) {
    if (
      typeof record.providerModelId !== "string" ||
      !PROVIDER_MODEL_ID_PATTERN.test(record.providerModelId) ||
      typeof record.combinationId !== "string" ||
      !LOGICAL_MODEL_ID_PATTERN.test(record.combinationId) ||
      (record.toolId !== "codex" && record.toolId !== "claude_code") ||
      (record.toolId === "codex" && record.scope !== "responses:create") ||
      (record.toolId === "claude_code" && record.scope !== "messages:create")
    ) {
      return false;
    }
    const separator = record.providerModelId.indexOf(".");
    const provider = record.providerModelId.slice(0, separator);
    const upstreamModel = record.providerModelId.slice(separator + 1);
    if (provider !== "deepseek" && provider !== "kimi") return false;
    if (provider === "deepseek" && upstreamModel === "deepseek-v4-pro") {
      return false;
    }
    return record.combinationId === `${record.toolId}.${provider}.${upstreamModel}`;
  }
  // Registry v5 callers do not yet send providerModelId. This branch is only a
  // closed transport compatibility parser; it does not publish or authorize a
  // model. Dynamic callers must include providerModelId and are resolved by the
  // server-owned compiled registry before any provider or funding I/O.
  return (
    (record.combinationId === PLATFORM_AI_COMBINATION_ID &&
      record.toolId === "codex" &&
      record.scope === "responses:create") ||
    (record.combinationId === CLAUDE_KIMI_AI_COMBINATION_ID &&
      record.toolId === "claude_code" &&
      record.scope === "messages:create") ||
    (record.combinationId === CODEX_KIMI_AI_COMBINATION_ID &&
      record.toolId === "codex" &&
      record.scope === "responses:create") ||
    (record.combinationId === CLAUDE_DEEPSEEK_AI_COMBINATION_ID &&
      record.toolId === "claude_code" &&
      record.scope === "messages:create")
  );
}

export function parseInternalAiAuthorizationResponse(
  value: unknown,
): InternalAiAuthorizationResponse {
  const error = "INTERNAL_AI_AUTHORIZATION_RESPONSE_INVALID";
  const record = exactRecord(
    value,
    ["allowed", "authorizationRevision"],
    error,
  );
  if (
    typeof record.allowed !== "boolean" ||
    !Number.isSafeInteger(record.authorizationRevision) ||
    Number(record.authorizationRevision) <= 0
  ) {
    throw new TypeError(error);
  }
  return {
    allowed: record.allowed,
    authorizationRevision: record.authorizationRevision as number,
  };
}

function parsePlatformAccess(value: unknown, error: string): AiPlatformAccess {
  const record = exactRecord(
    value,
    ["status", "maskedId", "revision", "issuedAt", "expiresAt", "revokedAt"],
    error,
  );
  if (
    (record.status !== "active" &&
      record.status !== "rotated" &&
      record.status !== "revoked" &&
      record.status !== "expired") ||
    typeof record.maskedId !== "string" ||
    !MASKED_ID_PATTERN.test(record.maskedId) ||
    !Number.isSafeInteger(record.revision) ||
    Number(record.revision) <= 0
  ) {
    throw new TypeError(error);
  }
  const revokedAt =
    record.revokedAt === null
      ? null
      : parseUtcInstant(record.revokedAt, error);
  if (
    (record.status === "active" && revokedAt !== null) ||
    ((record.status === "rotated" || record.status === "revoked") &&
      revokedAt === null)
  ) {
    throw new TypeError(error);
  }
  return {
    status: record.status,
    maskedId: record.maskedId,
    revision: record.revision as number,
    issuedAt: parseUtcInstant(record.issuedAt, error),
    expiresAt: parseUtcInstant(record.expiresAt, error),
    revokedAt,
  };
}

function parseAiUsageItem(value: unknown, error: string): AiUsageDetail {
  const record = exactRecord(
    value,
    [
      "id",
      "requestIdSuffix",
      "tool",
      "model",
      "status",
      "reservedAmount",
      "actualCost",
      "releasedAmount",
      "inputTokens",
      "outputTokens",
      "cachedTokens",
      "stableCode",
      "createdAt",
      "settledAt",
    ],
    error,
  );
  const usageIdentity = platformAiUsageIdentity(record.tool, record.model);
  if (
    typeof record.id !== "string" ||
    !OPAQUE_ID_PATTERN.test(record.id) ||
    BigInt(record.id) > 9_223_372_036_854_775_807n ||
    typeof record.requestIdSuffix !== "string" ||
    !REQUEST_SUFFIX_PATTERN.test(record.requestIdSuffix) ||
    usageIdentity === null ||
    !isUsageStatus(record.status) ||
    !isNullableTokenCount(record.inputTokens) ||
    !isNullableTokenCount(record.outputTokens) ||
    !isNullableTokenCount(record.cachedTokens) ||
    !isNullableStableCode(record.stableCode)
  ) {
    throw new TypeError(error);
  }
  return {
    id: record.id,
    requestIdSuffix: record.requestIdSuffix,
    tool: usageIdentity.tool,
    model: usageIdentity.model,
    status: record.status,
    reservedAmount: parseMoney(record.reservedAmount, error),
    actualCost: parseNullableMoney(record.actualCost, error),
    releasedAmount: parseNullableMoney(record.releasedAmount, error),
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cachedTokens: record.cachedTokens,
    stableCode: record.stableCode,
    createdAt: parseUtcInstant(record.createdAt, error),
    settledAt:
      record.settledAt === null
        ? null
        : parseUtcInstant(record.settledAt, error),
  };
}

function isPlatformAiUsageModelId(value: unknown): value is PlatformAiUsageModelId {
  return PLATFORM_AI_USAGE_MODEL_IDS.some((candidate) => candidate === value);
}

function platformAiUsageIdentity(
  tool: unknown,
  model: unknown,
): PlatformAiUsageIdentity | null {
  if (!isPlatformAiUsageModelId(model)) return null;
  return PLATFORM_AI_USAGE_IDENTITIES.find(
    (identity) => identity.tool === tool && identity.model === model,
  ) ?? null;
}

function parseMoney(value: unknown, error: string): CanonicalMoney {
  if (typeof value !== "string" || !MONEY_PATTERN.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function parseCny(value: unknown, error: string): "CNY" {
  if (value !== "CNY") throw new TypeError(error);
  return value;
}

function parseAiGatewaySubscription(
  value: unknown,
  error: string,
): AiGatewayAccountSummary["subscription"] {
  const record = exactRecord(value, ["planName", "endsAt"], error);
  if (
    typeof record.planName !== "string" ||
    record.planName.trim() !== record.planName ||
    record.planName.length === 0 ||
    record.planName.length > 96
  ) {
    throw new TypeError(error);
  }
  return {
    planName: record.planName,
    endsAt: record.endsAt === null ? null : parseUtcInstant(record.endsAt, error),
  };
}

function isNullableTokenString(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string" &&
    /^(?:0|[1-9]\d{0,18})$/.test(value)
  );
}

function parseNullableMoney(
  value: unknown,
  error: string,
): CanonicalMoney | null {
  return value === null ? null : parseMoney(value, error);
}

function moneyUnits(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
}

function parseUtcInstant(value: unknown, error: string): string {
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

function parseQueryInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
  error: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new TypeError(error);
  }
  const parsed = Number(value);
  if (!isBoundedInteger(parsed, minimum, maximum)) throw new TypeError(error);
  return parsed;
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isNullableTokenCount(value: unknown): value is number | null {
  return value === null || isSafeNonNegativeInteger(value);
}

function isUsageStatus(value: unknown): value is AiUsageStatus {
  return (
    value === "received" ||
    value === "reserved" ||
    value === "streaming" ||
    value === "settled" ||
    value === "released" ||
    value === "reconciliation_pending" ||
    value === "rejected"
  );
}

function isNullableStableCode(
  value: unknown,
): value is AiUsageStableCode | null {
  return (
    value === null ||
    value === "UPSTREAM_NOT_ACCEPTED" ||
    value === "STREAM_START_PERSIST_FAILED" ||
    value === "USAGE_INVALID" ||
    value === "USAGE_MISSING" ||
    value === "USAGE_COST_OVER_HOLD" ||
    value === "SETTLEMENT_PERSIST_FAILED"
  );
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  error: string,
): Record<string, unknown> {
  const record = objectRecord(value, error);
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(error);
  }
  return record;
}

function exactRecordWithOptionalKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  error: string,
): Record<string, unknown> {
  const record = objectRecord(value, error);
  const actual = Reflect.ownKeys(record);
  if (
    required.some((key) => !actual.includes(key)) ||
    actual.some(
      (key) =>
        typeof key !== "string" ||
        (!required.includes(key) && !optional.includes(key)),
    )
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
