import { parseCanonicalProfileViewNickname } from "./profile-nickname.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_PATTERN = /^(?:0|[1-9]\d*)$/;
const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;

export const DOMESTIC_MODEL_BRANDS=['deepseek','kimi','hunyuan','zhipu','minimax','mimo'] as const;
/** Historical display identity; model invocation membership is validated separately. */
export type ModelBrand = string;

export type ModelFootprint = Readonly<{
  id: string;
  displayName: string;
  brand: ModelBrand;
  totalTokens: string;
}>;

export type CapabilityFootprint = Readonly<{
  id: string;
  displayName: string;
  kind: "skill" | "zhilian" | "campus_knowledge";
}>;

export type AiActivityMetrics = Readonly<{
  totalTokens: string;
  peakDayTokens: string;
  currentStreakDays: number;
  longestStreakDays: number;
  activeDays: number;
}>;

export type AiActivityDay = Readonly<{
  date: string;
  totalTokens: string;
  intensity: 0 | 1 | 2 | 3 | 4;
}>;

export type AiActivityFootprints = Readonly<{
  models: ModelFootprint[];
  capabilities: CapabilityFootprint[];
}>;

export type AiActivitySnapshot = Readonly<{
  snapshotVersion: string;
  freshness: "fresh" | "stale";
  metrics: AiActivityMetrics;
  days: ReadonlyArray<AiActivityDay>;
  footprints: AiActivityFootprints;
}>;

export type AiActivityShareRequest = Readonly<{
  snapshotVersion: string;
}>;

export type TokenShareSnapshot = Readonly<{
  avatarUrl: string;
  nickname: string;
  publicId: string;
  snapshotVersion: string;
  metrics: AiActivityMetrics;
  days: ReadonlyArray<AiActivityDay>;
  footprints: AiActivityFootprints;
}>;

export function parseAiActivitySnapshot(value: unknown): AiActivitySnapshot {
  const error = "AI_ACTIVITY_INVALID";
  const record = exactRecord(
    value,
    ["snapshotVersion", "freshness", "metrics", "days", "footprints"],
    error,
  );
  if (record.freshness !== "fresh" && record.freshness !== "stale") {
    throw new TypeError(error);
  }
  return {
    snapshotVersion: canonicalUuid(record.snapshotVersion, error),
    freshness: record.freshness,
    metrics: parseMetrics(record.metrics, error),
    days: parseDays(record.days, error),
    footprints: parseFootprints(record.footprints, error),
  };
}

export function parseAiActivityShareRequest(
  value: unknown,
): AiActivityShareRequest {
  const error = "AI_ACTIVITY_SHARE_REQUEST_INVALID";
  const record = exactRecord(value, ["snapshotVersion"], error);
  return { snapshotVersion: canonicalUuid(record.snapshotVersion, error) };
}

export function parseTokenShareSnapshot(value: unknown): TokenShareSnapshot {
  const error = "TOKEN_SHARE_INVALID";
  const record = exactRecord(value, [
    "avatarUrl",
    "nickname",
    "publicId",
    "snapshotVersion",
    "metrics",
    "days",
    "footprints",
  ], error);
  return {
    avatarUrl: safeAvatarUrl(record.avatarUrl, error),
    nickname: parseCanonicalProfileViewNickname(record.nickname, error),
    publicId: canonicalUuid(record.publicId, error),
    snapshotVersion: canonicalUuid(record.snapshotVersion, error),
    metrics: parseMetrics(record.metrics, error),
    days: parseDays(record.days, error),
    footprints: parseFootprints(record.footprints, error),
  };
}

function parseMetrics(value: unknown, error: string): AiActivityMetrics {
  const record = exactRecord(value, [
    "totalTokens",
    "peakDayTokens",
    "currentStreakDays",
    "longestStreakDays",
    "activeDays",
  ], error);
  const currentStreakDays = nonnegativeSafeInteger(record.currentStreakDays, error);
  const longestStreakDays = nonnegativeSafeInteger(record.longestStreakDays, error);
  const activeDays = nonnegativeSafeInteger(record.activeDays, error);
  if (currentStreakDays > longestStreakDays) throw new TypeError(error);
  return {
    totalTokens: tokenString(record.totalTokens, error),
    peakDayTokens: tokenString(record.peakDayTokens, error),
    currentStreakDays,
    longestStreakDays,
    activeDays,
  };
}

function parseDays(value: unknown, error: string): AiActivityDay[] {
  if (!Array.isArray(value) || value.length !== 365) throw new TypeError(error);
  let previousEpochDay: number | undefined;
  return value.map((entry) => {
    const record = exactRecord(entry, ["date", "totalTokens", "intensity"], error);
    const { date, epochDay } = canonicalDate(record.date, error);
    if (previousEpochDay !== undefined && epochDay !== previousEpochDay + 1) {
      throw new TypeError(error);
    }
    previousEpochDay = epochDay;
    const totalTokens = tokenString(record.totalTokens, error);
    if (
      typeof record.intensity !== "number" ||
      !Number.isInteger(record.intensity) ||
      record.intensity < 0 ||
      record.intensity > 4
    ) {
      throw new TypeError(error);
    }
    if ((totalTokens === "0") !== (record.intensity === 0)) {
      throw new TypeError(error);
    }
    return {
      date,
      totalTokens,
      intensity: record.intensity as AiActivityDay["intensity"],
    };
  });
}

function parseFootprints(value: unknown, error: string): AiActivityFootprints {
  const record = exactRecord(value, ["models", "capabilities"], error);
  if (
    !Array.isArray(record.models) ||
    !Array.isArray(record.capabilities)
  ) {
    throw new TypeError(error);
  }
  const models = record.models.map((entry) => parseModelFootprint(entry, error));
  const capabilities = record.capabilities.map(
    (entry) => parseCapabilityFootprint(entry, error),
  );
  rejectDuplicateIds(models, error);
  rejectDuplicateIds(capabilities, error);
  return { models, capabilities };
}

function parseModelFootprint(value: unknown, error: string): ModelFootprint {
  const record = exactRecord(value, ["id", "displayName", "brand", "totalTokens"], error);
  if (typeof record.brand!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(record.brand)) {
    throw new TypeError(error);
  }
  return {
    id: canonicalUuid(record.id, error),
    displayName: boundedText(record.displayName, 256, error),
    brand: record.brand as ModelBrand,
    totalTokens: positiveTokenString(record.totalTokens, error),
  };
}

function parseCapabilityFootprint(
  value: unknown,
  error: string,
): CapabilityFootprint {
  const record = exactRecord(value, ["id", "displayName", "kind"], error);
  if (
    record.kind !== "skill" &&
    record.kind !== "zhilian" &&
    record.kind !== "campus_knowledge"
  ) {
    throw new TypeError(error);
  }
  return {
    id: canonicalUuid(record.id, error),
    displayName: boundedText(record.displayName, 160, error),
    kind: record.kind,
  };
}

function rejectDuplicateIds(
  values: ReadonlyArray<{ id: string }>,
  error: string,
): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    throw new TypeError(error);
  }
}

function canonicalDate(
  value: unknown,
  error: string,
): { date: string; epochDay: number } {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new TypeError(error);
  }
  const epoch = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== value) {
    throw new TypeError(error);
  }
  return { date: value, epochDay: epoch / 86_400_000 };
}

function tokenString(value: unknown, error: string): string {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function positiveTokenString(value: unknown, error: string): string {
  const canonical = tokenString(value, error);
  if (canonical === "0") throw new TypeError(error);
  return canonical;
}

function nonnegativeSafeInteger(value: unknown, error: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new TypeError(error);
  }
  return value;
}

function safeAvatarUrl(value: unknown, error: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 2048 ||
    CONTROL_CHARACTER_PATTERN.test(value) ||
    value.includes("\\")
  ) {
    throw new TypeError(error);
  }
  let parsed: {
    protocol: string;
    hostname: string;
    username: string;
    password: string;
    hash: string;
  };
  try {
    const URLConstructor = (globalThis as typeof globalThis & {
      URL: new (url: string, base: string) => typeof parsed;
    }).URL;
    parsed = new URLConstructor(value, "https://studybuddy.invalid");
  } catch {
    throw new TypeError(error);
  }
  const isSameOriginPath = value.startsWith("/") && !value.startsWith("//");
  if (
    !isSameOriginPath ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== "studybuddy.invalid" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    throw new TypeError(error);
  }
  return value;
}

function boundedText(value: unknown, maximumBytes: number, error: string): string {
  if (typeof value !== "string") throw new TypeError(error);
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length < 1 ||
    utf8ByteLength(normalized, maximumBytes + 1) > maximumBytes ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new TypeError(error);
  }
  return normalized;
}

function utf8ByteLength(value: string, stopAfter: number): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
    if (bytes >= stopAfter) return bytes;
  }
  return bytes;
}

function canonicalUuid(value: unknown, error: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(error);
  }
  return value;
}

function plainRecord(value: unknown, error: string): Record<string, unknown> {
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

function exactRecord(
  value: unknown,
  keys: readonly string[],
  error: string,
): Record<string, unknown> {
  const record = plainRecord(value, error);
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(error);
  }
  return record;
}
