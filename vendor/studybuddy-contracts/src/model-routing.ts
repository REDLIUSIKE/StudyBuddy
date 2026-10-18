import {
  isCanonicalProviderId,
  isCanonicalProviderModelId,
  parseProviderModels,
  parseProviderToolCapabilities,
  type ProviderModel,
  type ProviderToolCapability,
} from "./provider-tool-capability.js";

export const TOOL_IDS = ["codex", "claude_code"] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type FundingSource = "platform" | "user_api";

export type ModelAvailability = "available" | "preparing" | "disabled";

export type ToolProtocol = "openai_responses" | "anthropic_messages";

export const AI_GATEWAY_BACKENDS = ["primary_backend", "serviceBackend_legacy"] as const;

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

export type ProviderConnectionAuthorityStatus =
  | "available"
  | "invalid"
  | "insufficient_balance";

export type ProviderConnectionAuthority = Readonly<{
  providerConnectionId: string;
  providerId: string;
  status: ProviderConnectionAuthorityStatus;
  reason:
    | "AVAILABLE"
    | "CONNECTION_INVALID"
    | "CONNECTION_BALANCE_INSUFFICIENT";
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

const LOGICAL_MODEL_ID_PATTERN =
  /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const CONNECTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GATEWAY_INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const REMOVED_V4_PRO_MODEL_ID = "deepseek-v4-pro";

export function parseGatewayReference(value: unknown): GatewayReference {
  const error = "AI_GATEWAY_REFERENCE_INVALID";
  const record = exactRecord(
    value,
    ["backend", "backendInstanceId", "sourceId"],
    error,
  );
  if (
    !AI_GATEWAY_BACKENDS.some((backend) => backend === record.backend) ||
    typeof record.backendInstanceId !== "string" ||
    !GATEWAY_INSTANCE_ID_PATTERN.test(record.backendInstanceId) ||
    typeof record.sourceId !== "string" ||
    !isOpaqueGatewaySourceId(record.sourceId)
  ) {
    throw new TypeError(error);
  }
  return {
    backend: record.backend as AiGatewayBackend,
    backendInstanceId: record.backendInstanceId,
    sourceId: record.sourceId,
  };
}

function isOpaqueGatewaySourceId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 160 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function parseModelSelectionsProjection(
  value: unknown,
): ModelSelectionsProjection {
  const record = exactRecordWithOptionalKeys(
    value,
    ["tools", "models", "selections", "connections"],
    [
      "providerModels",
      "providerToolCapabilities",
      "defaults",
      "connectionAuthorities",
    ],
    "MODEL_SELECTIONS_PROJECTION_INVALID",
  );
  const hasProviderToolCapabilities = Reflect.ownKeys(record).includes(
    "providerToolCapabilities",
  );
  const hasProviderModels = Reflect.ownKeys(record).includes("providerModels");
  const hasDefaults = Reflect.ownKeys(record).includes("defaults");
  const hasConnectionAuthorities = Reflect.ownKeys(record).includes(
    "connectionAuthorities",
  );
  if (
    !Array.isArray(record.tools) ||
    !Array.isArray(record.models) ||
    !Array.isArray(record.selections) ||
    !Array.isArray(record.connections) ||
    (hasProviderModels && !Array.isArray(record.providerModels)) ||
    (hasDefaults && !Array.isArray(record.defaults)) ||
    (hasConnectionAuthorities && !Array.isArray(record.connectionAuthorities)) ||
    (hasProviderToolCapabilities &&
      !Array.isArray(record.providerToolCapabilities))
  ) {
    throw invalidProjection();
  }

  const tools = record.tools.map(parseToolCatalogItem);
  const models = record.models.map(parseModelCatalogItem);
  const selections = record.selections.map(parseToolModelSelection);
  const connections = record.connections.map(parseProviderConnectionView);
  const providerModels = !hasProviderModels
    ? undefined
    : parseProviderModels(record.providerModels);
  const providerToolCapabilities =
    !hasProviderToolCapabilities
      ? undefined
      : parseProviderToolCapabilities(record.providerToolCapabilities);
  const defaults = !hasDefaults
    ? undefined
    : parseDefaultToolModelSelections(record.defaults);
  const connectionAuthorities = !hasConnectionAuthorities
    ? undefined
    : parseProviderConnectionAuthorities(record.connectionAuthorities);

  requireUnique(tools, (tool) => tool.toolId);
  requireUnique(tools, (tool) => String(tool.displayOrder));
  requireUnique(models, (model) => model.logicalModelId);
  requireUnique(selections, (selection) => selection.toolId);
  requireUnique(connections, (connection) => connection.providerConnectionId);

  const toolIds = new Set(tools.map((tool) => tool.toolId));
  const modelsById = new Map(
    models.map((model) => [model.logicalModelId, model]),
  );
  const connectionsById = new Map(
    connections.map((connection) => [connection.providerConnectionId, connection]),
  );
  const capabilitiesByModelId = new Map<string, ProviderToolCapability>(
    (providerToolCapabilities ?? []).map((capability) => [
      capability.logicalModelId,
      capability,
    ]),
  );
  const providerModelsById = new Map(
    (providerModels ?? []).map((model) => [model.providerModelId, model]),
  );

  if (providerModels !== undefined && providerToolCapabilities === undefined) {
    throw invalidProjection();
  }
  for (const capability of providerToolCapabilities ?? []) {
    const providerModel = providerModelsById.get(capability.providerModelId);
    if (
      providerModels !== undefined &&
      (
        (providerModel === undefined &&
          (capability.platform.state === "available" || capability.userApi.state === "available")) ||
        (providerModel !== undefined &&
          (providerModel.providerId !== capability.providerId ||
            providerModel.exactUpstreamModelId !== capability.exactUpstreamModelId ||
            providerModel.displayName !== capability.displayName))
      )
    ) {
      throw invalidProjection();
    }
  }

  for (const model of models) {
    const capability = capabilitiesByModelId.get(model.logicalModelId);
    if (
      !toolIds.has(model.toolId) ||
      (providerToolCapabilities !== undefined &&
        (capability === undefined ||
          capability.toolId !== model.toolId ||
          capability.providerId !== model.provider))
    ) {
      throw invalidProjection();
    }
  }
  const projectedModels =
    providerToolCapabilities === undefined
      ? models
      : models.map((model) => {
          const capability = capabilitiesByModelId.get(model.logicalModelId);
          if (capability === undefined) throw invalidProjection();
          const platformAvailable = capability.platform.state === "available";
          const userApiAvailable = capability.userApi.state === "available";
          const availability: ModelAvailability =
            platformAvailable || userApiAvailable
              ? "available"
              : capability.platform.state === "disabled" &&
                  capability.userApi.state === "disabled"
                ? "disabled"
                : "preparing";
          return {
            ...model,
            availability,
            platformAvailable,
            userApiAvailable,
          };
        });
  for (const selection of selections) {
    const model = modelsById.get(selection.logicalModelId);
    const capability = capabilitiesByModelId.get(selection.logicalModelId);
    if (
      model === undefined ||
      model.toolId !== selection.toolId ||
      (providerToolCapabilities === undefined &&
        model.availability === "preparing") ||
      (providerToolCapabilities !== undefined &&
        (capability === undefined || capability.toolId !== selection.toolId))
    ) {
      throw invalidProjection();
    }
    if (selection.fundingSource === "platform") {
      if (
        selection.providerConnectionId !== null ||
        capability?.platform.state === "preparing"
      ) {
        throw invalidProjection();
      }
      continue;
    }
    const connection =
      selection.providerConnectionId === null
        ? undefined
        : connectionsById.get(selection.providerConnectionId);
    if (
      connection === undefined ||
      capability?.userApi.state === "preparing" ||
      connection.provider !== model.provider ||
      !connection.compatibleModelIds.includes(model.logicalModelId)
    ) {
      throw invalidProjection();
    }
  }

  return {
    tools: [...tools].sort((left, right) => left.displayOrder - right.displayOrder),
    models: projectedModels,
    selections,
    connections,
    ...(providerModels === undefined ? {} : { providerModels }),
    ...(providerToolCapabilities === undefined
      ? {}
      : { providerToolCapabilities }),
    ...(defaults === undefined ? {} : { defaults }),
    ...(connectionAuthorities === undefined ? {} : { connectionAuthorities }),
  };
}

export function parseUpdateToolModelSelectionBody(
  value: unknown,
): UpdateToolModelSelectionBody {
  const record = exactRecordWithOptionalKeys(
    value,
    ["expectedRevision", "logicalModelId", "fundingSource"],
    ["providerConnectionId"],
    "UPDATE_TOOL_MODEL_SELECTION_INVALID",
  );
  if (!isPositiveSafeInteger(record.expectedRevision)) {
    throw invalidUpdate();
  }
  const logicalModelId = parseLogicalModelId(record.logicalModelId, invalidUpdate);
  if (logicalModelId.endsWith(`.${REMOVED_V4_PRO_MODEL_ID}`)) {
    throw invalidUpdate();
  }
  const fundingSource = parseFundingSource(record.fundingSource, invalidUpdate);
  const providerConnectionId =
    record.providerConnectionId === undefined
      ? null
      : parseNullableConnectionId(record.providerConnectionId, invalidUpdate);

  return {
    expectedRevision: record.expectedRevision,
    logicalModelId,
    fundingSource,
    providerConnectionId,
  };
}

export function parseConnectProviderBody(value: unknown): ConnectProviderBody {
  const record = exactRecord(value, ["apiKey"], "CONNECT_PROVIDER_BODY_INVALID");
  const apiKey = record.apiKey;
  if (
    typeof apiKey !== "string" ||
    utf8ByteLength(apiKey) < 8 ||
    utf8ByteLength(apiKey) > 512 ||
    apiKey.trim() !== apiKey ||
    /[\r\n\0]/.test(apiKey)
  ) {
    throw new TypeError("CONNECT_PROVIDER_BODY_INVALID");
  }
  return { apiKey };
}

export function parseDefaultToolModelSelections(
  value: unknown,
): readonly DefaultToolModelSelection[] {
  if (!Array.isArray(value)) throw invalidDefaultAuthority();
  const defaults = value.map((entry) => {
    const record = exactRecord(
      entry,
      [
        "toolId",
        "defaultProviderModelId",
        "fundingSource",
        "defaultProviderConnectionId",
        "defaultRevision",
        "fundingAuthorityRevision",
      ],
      "MODEL_DEFAULT_AUTHORITY_INVALID",
    );
    const fundingSource = parseFundingSource(record.fundingSource, invalidDefaultAuthority);
    const connectionId = parseNullableConnectionId(
      record.defaultProviderConnectionId,
      invalidDefaultAuthority,
    );
    if (
      !isToolId(record.toolId) ||
      !isCanonicalProviderModelId(record.defaultProviderModelId) ||
      !isPositiveSafeInteger(record.defaultRevision) ||
      !isPositiveSafeInteger(record.fundingAuthorityRevision) ||
      (fundingSource === "platform" ? connectionId !== null : connectionId === null)
    ) {
      throw invalidDefaultAuthority();
    }
    return {
      toolId: record.toolId,
      defaultProviderModelId: record.defaultProviderModelId,
      fundingSource,
      defaultProviderConnectionId: connectionId,
      defaultRevision: record.defaultRevision,
      fundingAuthorityRevision: record.fundingAuthorityRevision,
    };
  });
  requireUniqueWithError(defaults, (entry) => entry.toolId, invalidDefaultAuthority);
  return defaults;
}

export function parseProviderConnectionAuthorities(
  value: unknown,
): readonly ProviderConnectionAuthority[] {
  if (!Array.isArray(value)) throw invalidConnectionAuthorities();
  const authorities = value.map((entry) => {
    const record = exactRecord(
      entry,
      [
        "providerConnectionId",
        "providerId",
        "status",
        "reason",
        "nextAction",
        "connectionRevision",
        "capabilityRevision",
        "verifierRevision",
        "compatibleProviderModelIds",
      ],
      "MODEL_CONNECTION_AUTHORITIES_INVALID",
    );
    if (
      !isConnectionId(record.providerConnectionId) ||
      !isCanonicalProviderId(record.providerId) ||
      !isPositiveSafeInteger(record.connectionRevision) ||
      !isPositiveSafeInteger(record.capabilityRevision) ||
      typeof record.verifierRevision !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(record.verifierRevision) ||
      !Array.isArray(record.compatibleProviderModelIds)
    ) {
      throw invalidConnectionAuthorities();
    }
    const expected = providerConnectionPublicState(record.status);
    if (record.reason !== expected.reason || record.nextAction !== expected.nextAction) {
      throw invalidConnectionAuthorities();
    }
    const compatibleProviderModelIds = record.compatibleProviderModelIds.map((modelId) => {
      if (!isCanonicalProviderModelId(modelId)) throw invalidConnectionAuthorities();
      return modelId;
    });
    requireUniqueWithError(
      compatibleProviderModelIds,
      (modelId) => modelId,
      invalidConnectionAuthorities,
    );
    return {
      providerConnectionId: record.providerConnectionId,
      providerId: record.providerId,
      status: expected.status,
      reason: expected.reason,
      nextAction: expected.nextAction,
      connectionRevision: record.connectionRevision,
      capabilityRevision: record.capabilityRevision,
      verifierRevision: record.verifierRevision,
      compatibleProviderModelIds,
    };
  });
  requireUniqueWithError(
    authorities,
    (entry) => entry.providerConnectionId,
    invalidConnectionAuthorities,
  );
  return authorities;
}

export function parseUpdateDefaultToolModelSelectionBody(
  value: unknown,
): UpdateDefaultToolModelSelectionBody {
  const record = exactRecord(
    value,
    [
      "expectedDefaultRevision",
      "expectedFundingAuthorityRevision",
      "expectedProviderConnectionRevision",
      "defaultProviderModelId",
      "fundingSource",
      "defaultProviderConnectionId",
    ],
    "MODEL_DEFAULT_AUTHORITY_INVALID",
  );
  const fundingSource = parseFundingSource(record.fundingSource, invalidDefaultAuthority);
  const connectionId = parseNullableConnectionId(
    record.defaultProviderConnectionId,
    invalidDefaultAuthority,
  );
  const connectionRevision = record.expectedProviderConnectionRevision;
  if (
    !isPositiveSafeInteger(record.expectedDefaultRevision) ||
    !isNonNegativeSafeInteger(record.expectedFundingAuthorityRevision) ||
    !isCanonicalProviderModelId(record.defaultProviderModelId) ||
    (fundingSource === "platform"
      ? connectionId !== null || connectionRevision !== null
      : connectionId === null || !isPositiveSafeInteger(connectionRevision))
  ) {
    throw invalidDefaultAuthority();
  }
  return {
    expectedDefaultRevision: record.expectedDefaultRevision,
    expectedFundingAuthorityRevision: record.expectedFundingAuthorityRevision,
    expectedProviderConnectionRevision: connectionRevision as number | null,
    defaultProviderModelId: record.defaultProviderModelId,
    fundingSource,
    defaultProviderConnectionId: connectionId,
  };
}

function parseToolCatalogItem(value: unknown): ToolCatalogItem {
  const record = exactRecord(
    value,
    ["toolId", "displayName", "protocol", "displayOrder"],
    "MODEL_SELECTIONS_PROJECTION_INVALID",
  );
  if (
    !isToolId(record.toolId) ||
    !isNonEmptyString(record.displayName) ||
    !isToolProtocol(record.protocol) ||
    !isPositiveSafeInteger(record.displayOrder)
  ) {
    throw invalidProjection();
  }
  return {
    toolId: record.toolId,
    displayName: record.displayName,
    protocol: record.protocol,
    displayOrder: record.displayOrder,
  };
}

function parseModelCatalogItem(value: unknown): ModelCatalogItem {
  const record = exactRecord(
    value,
    [
      "logicalModelId",
      "displayName",
      "provider",
      "toolId",
      "availability",
      "platformAvailable",
      "userApiAvailable",
    ],
    "MODEL_SELECTIONS_PROJECTION_INVALID",
  );
  if (
    !isLogicalModelId(record.logicalModelId) ||
    !isNonEmptyString(record.displayName) ||
    !isCanonicalProviderId(record.provider) ||
    !isToolId(record.toolId) ||
    !isModelAvailability(record.availability) ||
    typeof record.platformAvailable !== "boolean" ||
    typeof record.userApiAvailable !== "boolean"
  ) {
    throw invalidProjection();
  }
  return {
    logicalModelId: record.logicalModelId,
    displayName: record.displayName,
    provider: record.provider,
    toolId: record.toolId,
    availability: record.availability,
    platformAvailable: record.platformAvailable,
    userApiAvailable: record.userApiAvailable,
  };
}

function parseToolModelSelection(value: unknown): ToolModelSelection {
  const record = exactRecord(
    value,
    [
      "toolId",
      "logicalModelId",
      "fundingSource",
      "providerConnectionId",
      "revision",
    ],
    "MODEL_SELECTIONS_PROJECTION_INVALID",
  );
  if (!isToolId(record.toolId) || !isPositiveSafeInteger(record.revision)) {
    throw invalidProjection();
  }
  return {
    toolId: record.toolId,
    logicalModelId: parseLogicalModelId(record.logicalModelId, invalidProjection),
    fundingSource: parseFundingSource(record.fundingSource, invalidProjection),
    providerConnectionId: parseNullableConnectionId(
      record.providerConnectionId,
      invalidProjection,
    ),
    revision: record.revision,
  };
}

function parseProviderConnectionView(value: unknown): ProviderConnectionView {
  const record = exactRecord(
    value,
    ["providerConnectionId", "provider", "status", "compatibleModelIds"],
    "MODEL_SELECTIONS_PROJECTION_INVALID",
  );
  if (
    !isConnectionId(record.providerConnectionId) ||
    !isCanonicalProviderId(record.provider) ||
    (record.status !== "healthy" && record.status !== "unhealthy") ||
    !Array.isArray(record.compatibleModelIds)
  ) {
    throw invalidProjection();
  }
  const compatibleModelIds = record.compatibleModelIds.map((modelId) =>
    parseLogicalModelId(modelId, invalidProjection),
  );
  requireUnique(compatibleModelIds, (modelId) => modelId);
  return {
    providerConnectionId: record.providerConnectionId,
    provider: record.provider,
    status: record.status,
    compatibleModelIds,
  };
}

function parseLogicalModelId(
  value: unknown,
  invalid: () => TypeError,
): string {
  if (!isLogicalModelId(value)) throw invalid();
  return value;
}

function parseNullableConnectionId(
  value: unknown,
  invalid: () => TypeError,
): string | null {
  if (value === null) return null;
  if (!isConnectionId(value)) throw invalid();
  return value;
}

function parseFundingSource(
  value: unknown,
  invalid: () => TypeError,
): FundingSource {
  if (value !== "platform" && value !== "user_api") throw invalid();
  return value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  error: string,
): Record<string, unknown> {
  const record = objectRecord(value, error);
  const actualKeys = Reflect.ownKeys(record);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => typeof key !== "string" || !keys.includes(key))
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
  const actualKeys = Reflect.ownKeys(record);
  if (
    required.some((key) => !actualKeys.includes(key)) ||
    actualKeys.some(
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

function requireUnique<T>(
  values: readonly T[],
  key: (value: T) => string,
): void {
  requireUniqueWithError(values, key, invalidProjection);
}

function requireUniqueWithError<T>(
  values: readonly T[],
  key: (value: T) => string,
  invalid: () => TypeError,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const valueKey = key(value);
    if (seen.has(valueKey)) throw invalid();
    seen.add(valueKey);
  }
}

function isToolId(value: unknown): value is ToolId {
  return value === "codex" || value === "claude_code";
}

function isToolProtocol(value: unknown): value is ToolProtocol {
  return value === "openai_responses" || value === "anthropic_messages";
}

function isModelAvailability(value: unknown): value is ModelAvailability {
  return value === "available" || value === "preparing" || value === "disabled";
}

function isLogicalModelId(value: unknown): value is string {
  return typeof value === "string" && LOGICAL_MODEL_ID_PATTERN.test(value);
}

function isConnectionId(value: unknown): value is string {
  return typeof value === "string" && CONNECTION_ID_PATTERN.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function providerConnectionPublicState(value: unknown): Pick<
  ProviderConnectionAuthority,
  "status" | "reason" | "nextAction"
> {
  if (value === "available") {
    return { status: value, reason: "AVAILABLE", nextAction: null };
  }
  if (value === "invalid") {
    return {
      status: value,
      reason: "CONNECTION_INVALID",
      nextAction: "replace_or_reverify_connection",
    };
  }
  if (value === "insufficient_balance") {
    return {
      status: value,
      reason: "CONNECTION_BALANCE_INSUFFICIENT",
      nextAction: "replace_or_reverify_connection",
    };
  }
  throw invalidConnectionAuthorities();
}

function invalidDefaultAuthority(): TypeError {
  return new TypeError("MODEL_DEFAULT_AUTHORITY_INVALID");
}

function invalidConnectionAuthorities(): TypeError {
  return new TypeError("MODEL_CONNECTION_AUTHORITIES_INVALID");
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) continue;
    if (codePoint > 0xffff) index += 1;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}

function invalidProjection(): TypeError {
  return new TypeError("MODEL_SELECTIONS_PROJECTION_INVALID");
}

function invalidUpdate(): TypeError {
  return new TypeError("UPDATE_TOOL_MODEL_SELECTION_INVALID");
}
