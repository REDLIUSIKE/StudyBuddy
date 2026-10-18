export const CAPABILITY_STATES = ["available", "preparing", "disabled"] as const;
export const CAPABILITY_STABLE_REASONS = [
  "AVAILABLE",
  "ADAPTER_MISSING",
  "RELEASE_MISSING",
  "RELEASE_BLOCKED",
  "OFFICIAL_RELEASE_PENDING",
  "UPSTREAM_MODEL_REDIRECT_IN_EFFECT",
  "SECRET_UNAVAILABLE",
  "PRICE_UNAVAILABLE",
  "FAKE_EVIDENCE_MISSING",
  "REAL_EVIDENCE_MISSING",
  "NATIVE_EVIDENCE_MISSING",
  "CONNECTION_INCOMPATIBLE",
  "MODEL_RETIRED",
] as const;

export type ProviderId = string;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];
export type CapabilityStableReason = (typeof CAPABILITY_STABLE_REASONS)[number];
export type SecretAuthority = "legacy_env" | "managed_keyring";
export type IngressProtocol = "openai_responses" | "anthropic_messages";
export type UpstreamProtocol =
  | "openai_responses"
  | "anthropic_messages"
  | "openai_compatible_chat";

export type ProviderModel = Readonly<{
  providerModelId: string;
  providerId: ProviderId;
  exactUpstreamModelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilityFlags: readonly string[];
  reviewedSourceDigest: string;
  revision: number;
}>;

export type ToolCapability = Readonly<{
  toolCapabilityId: string;
  providerModelId: string;
  logicalModelId: string;
  toolId: "codex" | "claude_code";
  providerId: ProviderId;
  displayName: string;
  exactUpstreamModelId: string;
  scope: "responses:create" | "messages:create";
  ingressProtocol: IngressProtocol;
  upstreamProtocol: UpstreamProtocol;
  originId: string;
  adapterKey: string;
  adapterRevision: string | null;
  manifestSha256: string;
  platform: Readonly<{
    state: CapabilityState;
    reason: CapabilityStableReason;
    secretAuthority: SecretAuthority;
    releaseId: string | null;
    releaseRevision: number | null;
    priceVersionId: string | null;
    secretRevision: number | null;
  }>;
  userApi: Readonly<{
    state: CapabilityState;
    reason: CapabilityStableReason;
    capabilityRevision: number;
    verifierRevision: string | null;
  }>;
  revision: number;
}>;

export type ProviderToolCapability = ToolCapability;

const REVISION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;
const PROVIDER_MODEL_ID_PATTERN = /^[a-z][a-z0-9_]{1,31}\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const LOGICAL_MODEL_ID_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const CAPABILITY_FLAG_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ERROR = "PROVIDER_TOOL_CAPABILITIES_INVALID";
const MODEL_ERROR = "PROVIDER_MODELS_INVALID";

export function parseProviderModels(value: unknown): readonly ProviderModel[] {
  if (!Array.isArray(value) || value.length === 0 || !hasExactArrayKeys(value, value.length)) {
    throw invalidModels();
  }
  const models = value.map(parseProviderModel);
  requireUniqueWith(models, (model) => model.providerModelId, invalidModels);
  requireUniqueWith(
    models,
    (model) => `${model.providerId}:${model.exactUpstreamModelId}`,
    invalidModels,
  );
  return models;
}

export function parseProviderToolCapabilities(
  value: unknown,
): readonly ProviderToolCapability[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !hasExactArrayKeys(value, value.length)
  ) {
    throw invalidCapabilities();
  }

  const rows = value.map(parseCapability);
  requireUnique(rows, (row) => row.toolCapabilityId);
  requireUnique(rows, (row) => `${row.toolId}:${row.providerModelId}:${row.logicalModelId}`);
  requireUnique(rows, (row) => row.logicalModelId);
  return rows;
}

function parseProviderModel(value: unknown): ProviderModel {
  const record = exactRecordWith(
    value,
    [
      "providerModelId",
      "providerId",
      "exactUpstreamModelId",
      "displayName",
      "contextWindow",
      "maxOutputTokens",
      "capabilityFlags",
      "reviewedSourceDigest",
      "revision",
    ],
    invalidModels,
  );
  if (
    !isCanonicalProviderId(record.providerId) ||
    typeof record.providerModelId !== "string" ||
    !PROVIDER_MODEL_ID_PATTERN.test(record.providerModelId) ||
    typeof record.exactUpstreamModelId !== "string" ||
    !REVISION_ID_PATTERN.test(record.exactUpstreamModelId) ||
    record.providerModelId !== `${record.providerId}.${record.exactUpstreamModelId}` ||
    !isNonEmptyString(record.displayName) ||
    !isPositiveSafeInteger(record.contextWindow) ||
    !isPositiveSafeInteger(record.maxOutputTokens) ||
    Number(record.maxOutputTokens) > Number(record.contextWindow) ||
    !Array.isArray(record.capabilityFlags) ||
    record.capabilityFlags.length === 0 ||
    !hasExactArrayKeys(record.capabilityFlags, record.capabilityFlags.length) ||
    typeof record.reviewedSourceDigest !== "string" ||
    !SHA256_PATTERN.test(record.reviewedSourceDigest) ||
    !isPositiveSafeInteger(record.revision)
  ) {
    throw invalidModels();
  }
  const capabilityFlags = record.capabilityFlags.map((flag) => {
    if (typeof flag !== "string" || !CAPABILITY_FLAG_PATTERN.test(flag)) throw invalidModels();
    return flag;
  });
  requireUniqueWith(capabilityFlags, (flag) => flag, invalidModels);
  if ([...capabilityFlags].sort().some((flag, index) => flag !== capabilityFlags[index])) {
    throw invalidModels();
  }
  return {
    providerModelId: record.providerModelId,
    providerId: record.providerId,
    exactUpstreamModelId: record.exactUpstreamModelId,
    displayName: record.displayName,
    contextWindow: record.contextWindow,
    maxOutputTokens: record.maxOutputTokens,
    capabilityFlags,
    reviewedSourceDigest: record.reviewedSourceDigest,
    revision: record.revision,
  };
}

function parseCapability(value: unknown): ProviderToolCapability {
  const record = exactRecord(value, [
    "toolCapabilityId",
    "providerModelId",
    "logicalModelId",
    "toolId",
    "providerId",
    "displayName",
    "exactUpstreamModelId",
    "scope",
    "ingressProtocol",
    "upstreamProtocol",
    "originId",
    "adapterKey",
    "adapterRevision",
    "manifestSha256",
    "platform",
    "userApi",
    "revision",
  ]);
  if (
    typeof record.toolCapabilityId !== "string" ||
    !REVISION_ID_PATTERN.test(record.toolCapabilityId) ||
    typeof record.providerModelId !== "string" ||
    !PROVIDER_MODEL_ID_PATTERN.test(record.providerModelId) ||
    typeof record.logicalModelId !== "string" ||
    !LOGICAL_MODEL_ID_PATTERN.test(record.logicalModelId) ||
    !isCanonicalProviderId(record.providerId) ||
    !isNonEmptyString(record.displayName) ||
    typeof record.exactUpstreamModelId !== "string" ||
    !REVISION_ID_PATTERN.test(record.exactUpstreamModelId) ||
    record.providerModelId !== `${record.providerId}.${record.exactUpstreamModelId}` ||
    (record.toolId !== "codex" && record.toolId !== "claude_code") ||
    (record.scope !== "responses:create" && record.scope !== "messages:create") ||
    !isIngressProtocol(record.ingressProtocol) ||
    (record.toolId === "codex" &&
      (record.scope !== "responses:create" || record.ingressProtocol !== "openai_responses")) ||
    (record.toolId === "claude_code" &&
      (record.scope !== "messages:create" || record.ingressProtocol !== "anthropic_messages")) ||
    record.logicalModelId !== `${record.toolId}.${record.providerId}.${record.exactUpstreamModelId}` ||
    !isUpstreamProtocol(record.upstreamProtocol) ||
    typeof record.originId !== "string" ||
    !REVISION_ID_PATTERN.test(record.originId) ||
    typeof record.adapterKey !== "string" ||
    !REVISION_ID_PATTERN.test(record.adapterKey) ||
    !isNullableRevisionId(record.adapterRevision) ||
    typeof record.manifestSha256 !== "string" ||
    !SHA256_PATTERN.test(record.manifestSha256) ||
    !isPositiveSafeInteger(record.revision) ||
    (record.adapterRevision === null
      ? record.adapterKey !== "adapter_missing"
      : record.adapterKey !== record.adapterRevision)
  ) {
    throw invalidCapabilities();
  }
  const platform = parsePlatformCapability(
    record.platform,
    record.providerId,
    record.adapterRevision,
  );
  const userApi = parseUserApiCapability(record.userApi, record.adapterRevision);
  if (
    record.adapterRevision === null &&
    (platform.state !== "preparing" ||
      platform.reason !== "ADAPTER_MISSING" ||
      platform.releaseId !== null ||
      platform.releaseRevision !== null ||
      platform.priceVersionId !== null ||
      userApi.state !== "preparing" ||
      userApi.reason !== "ADAPTER_MISSING" ||
      userApi.capabilityRevision !== 0 ||
      userApi.verifierRevision !== null)
  ) {
    throw invalidCapabilities();
  }
  return {
    toolCapabilityId: record.toolCapabilityId,
    providerModelId: record.providerModelId,
    logicalModelId: record.logicalModelId,
    toolId: record.toolId,
    providerId: record.providerId,
    displayName: record.displayName,
    exactUpstreamModelId: record.exactUpstreamModelId,
    scope: record.scope,
    ingressProtocol: record.ingressProtocol,
    upstreamProtocol: record.upstreamProtocol,
    originId: record.originId,
    adapterKey: record.adapterKey,
    adapterRevision: record.adapterRevision,
    manifestSha256: record.manifestSha256,
    platform,
    userApi,
    revision: record.revision,
  };
}

function parsePlatformCapability(
  value: unknown,
  providerId: ProviderId,
  adapterRevision: string | null,
): ProviderToolCapability["platform"] {
  const record = exactRecord(value, [
    "state",
    "reason",
    "secretAuthority",
    "releaseId",
    "releaseRevision",
    "priceVersionId",
    "secretRevision",
  ]);
  if (
    !isCapabilityState(record.state) ||
    !isCapabilityReason(record.reason) ||
    !isSecretAuthority(record.secretAuthority) ||
    !isNullableRevisionId(record.releaseId) ||
    !isNullablePositiveRevision(record.releaseRevision) ||
    !isNullableRevisionId(record.priceVersionId) ||
    !isNullablePositiveRevision(record.secretRevision) ||
    (record.releaseId === null) !== (record.releaseRevision === null) ||
    (record.state === "available") !== (record.reason === "AVAILABLE")
  ) {
    throw invalidCapabilities();
  }
  if (
    record.state === "available" &&
    (record.releaseId === null ||
      record.releaseRevision === null ||
      record.priceVersionId === null)
  ) {
    throw invalidCapabilities();
  }
  if (record.secretAuthority === "legacy_env") {
    if (record.secretRevision !== null) throw invalidCapabilities();
  }
  if (providerId === "kimi" && record.secretAuthority !== "managed_keyring") {
    throw invalidCapabilities();
  }
  if (adapterRevision !== null) {
    const releaseBlockingReason =
      record.reason === "OFFICIAL_RELEASE_PENDING" ||
      record.reason === "UPSTREAM_MODEL_REDIRECT_IN_EFFECT";
    if (releaseBlockingReason) {
      if (record.state !== "preparing") throw invalidCapabilities();
    } else if (record.releaseId === null) {
      if (
        record.state !== "preparing" ||
        record.reason !== "RELEASE_MISSING" ||
        record.priceVersionId !== null
      ) {
        throw invalidCapabilities();
      }
    } else if (record.reason === "RELEASE_BLOCKED") {
      if (record.state !== "preparing" && record.state !== "disabled") {
        throw invalidCapabilities();
      }
    } else if (record.priceVersionId === null) {
      if (
        record.state !== "preparing" ||
        record.reason !== "PRICE_UNAVAILABLE"
      ) {
        throw invalidCapabilities();
      }
    } else if (
      record.secretAuthority === "managed_keyring" &&
      record.secretRevision === null
    ) {
      if (
        record.state !== "preparing" ||
        record.reason !== "SECRET_UNAVAILABLE"
      ) {
        throw invalidCapabilities();
      }
    } else {
      const reasonIsEvidenceMissing =
        record.reason === "FAKE_EVIDENCE_MISSING" ||
        record.reason === "REAL_EVIDENCE_MISSING" ||
        record.reason === "NATIVE_EVIDENCE_MISSING";
      if (
        (record.reason !== "AVAILABLE" && !reasonIsEvidenceMissing) ||
        (reasonIsEvidenceMissing && record.state !== "preparing")
      ) {
        throw invalidCapabilities();
      }
    }
  }
  return {
    state: record.state,
    reason: record.reason,
    secretAuthority: record.secretAuthority,
    releaseId: record.releaseId,
    releaseRevision: record.releaseRevision,
    priceVersionId: record.priceVersionId,
    secretRevision: record.secretRevision,
  };
}

function hasExactArrayKeys(value: readonly unknown[], length: number): boolean {
  const expected = [
    ...Array.from({ length }, (_unused, index) => String(index)),
    "length",
  ];
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === expected.length &&
    actual.every((key) => typeof key === "string" && expected.includes(key))
  );
}

function parseUserApiCapability(
  value: unknown,
  adapterRevision: string | null,
): ProviderToolCapability["userApi"] {
  const record = exactRecord(value, [
    "state",
    "reason",
    "capabilityRevision",
    "verifierRevision",
  ]);
  if (
    !isCapabilityState(record.state) ||
    !isCapabilityReason(record.reason) ||
    !isNonNegativeSafeInteger(record.capabilityRevision) ||
    !isNullableRevisionId(record.verifierRevision) ||
    (record.state === "available") !== (record.reason === "AVAILABLE") ||
    (record.capabilityRevision === 0) !== (record.verifierRevision === null)
  ) {
    throw invalidCapabilities();
  }
  if (
    record.state === "available" &&
    (record.capabilityRevision === 0 || record.verifierRevision === null)
  ) {
    throw invalidCapabilities();
  }
  if (record.reason === "MODEL_RETIRED" && record.state !== "disabled") {
    throw invalidCapabilities();
  }
  const releaseBlockingReason =
    record.reason === "OFFICIAL_RELEASE_PENDING" ||
    record.reason === "UPSTREAM_MODEL_REDIRECT_IN_EFFECT";
  if (releaseBlockingReason) {
    if (
      record.state !== "preparing" ||
      record.capabilityRevision === 0 ||
      record.verifierRevision === null
    ) {
      throw invalidCapabilities();
    }
  }
  const reasonIsUserApiSpecific =
    releaseBlockingReason ||
    record.reason === "CONNECTION_INCOMPATIBLE" ||
    record.reason === "MODEL_RETIRED" ||
    record.reason === "FAKE_EVIDENCE_MISSING" ||
    record.reason === "REAL_EVIDENCE_MISSING" ||
    record.reason === "NATIVE_EVIDENCE_MISSING";
  if (
    adapterRevision === null
      ? record.reason !== "ADAPTER_MISSING"
      : record.reason !== "AVAILABLE" && !reasonIsUserApiSpecific
  ) {
    throw invalidCapabilities();
  }
  return {
    state: record.state,
    reason: record.reason,
    capabilityRevision: record.capabilityRevision,
    verifierRevision: record.verifierRevision,
  };
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  return exactRecordWith(value, keys, invalidCapabilities);
}

function exactRecordWith(
  value: unknown,
  keys: readonly string[],
  invalid: () => TypeError,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalid();
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Reflect.ownKeys(record);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw invalid();
  }
  return record;
}

function requireUnique<T>(values: readonly T[], key: (value: T) => string): void {
  requireUniqueWith(values, key, invalidCapabilities);
}

function requireUniqueWith<T>(
  values: readonly T[],
  key: (value: T) => string,
  invalid: () => TypeError,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) throw invalid();
    seen.add(identity);
  }
}

export function isCanonicalProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_ID_PATTERN.test(value);
}

export function isCanonicalProviderModelId(value: unknown): value is string {
  return typeof value === "string" && PROVIDER_MODEL_ID_PATTERN.test(value);
}

function isUpstreamProtocol(value: unknown): value is UpstreamProtocol {
  return value === "openai_responses" || value === "anthropic_messages" || value === "openai_compatible_chat";
}

function isIngressProtocol(value: unknown): value is IngressProtocol {
  return value === "openai_responses" || value === "anthropic_messages";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isCapabilityState(value: unknown): value is CapabilityState {
  return CAPABILITY_STATES.some((state) => state === value);
}

function isCapabilityReason(value: unknown): value is CapabilityStableReason {
  return CAPABILITY_STABLE_REASONS.some((reason) => reason === value);
}

function isSecretAuthority(value: unknown): value is SecretAuthority {
  return value === "legacy_env" || value === "managed_keyring";
}

function isNullableRevisionId(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && REVISION_ID_PATTERN.test(value));
}

function isNullablePositiveRevision(value: unknown): value is number | null {
  return value === null || isPositiveSafeInteger(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function invalidCapabilities(): TypeError {
  return new TypeError(ERROR);
}

function invalidModels(): TypeError {
  return new TypeError(MODEL_ERROR);
}
