export const LEADERBOARD_PERIODS = ["DAY", "WEEK", "MONTH", "ALL_TIME"] as const;
export const LEADERBOARD_BOARD_TYPES = ["SCHOOL", "COLLEGE", "PROGRAM", "STUDENT"] as const;
export const LEADERBOARD_SCOPE_TYPES = ["NATION", "SCHOOL", "COLLEGE", "PROGRAM"] as const;

export type LeaderboardPeriod = typeof LEADERBOARD_PERIODS[number];
export type LeaderboardBoard = typeof LEADERBOARD_BOARD_TYPES[number];
export type LeaderboardScope = typeof LEADERBOARD_SCOPE_TYPES[number];

export type LeaderboardQuery = Readonly<{
  period: LeaderboardPeriod;
  boardType: LeaderboardBoard;
  scopeType: LeaderboardScope;
  scopeId: string;
  pageSize: number;
  cursor: string | null;
}>;

export type LeaderboardAffiliation = Readonly<{
  school: Readonly<{ id: string; name: string }> | null;
  college: Readonly<{ id: string; name: string }> | null;
  program: Readonly<{ id: string; name: string }> | null;
  grade: string | null;
}>;

export type LeaderboardItem = Readonly<{
  rank: number;
  entity: Readonly<{ id: string; name: string }>;
  affiliation: LeaderboardAffiliation;
  totalTokens: string;
}>;

export type LeaderboardPage = Readonly<{
  period: LeaderboardPeriod;
  periodStart: string;
  boardType: LeaderboardBoard;
  scopeType: LeaderboardScope;
  scopeId: string;
  items: readonly LeaderboardItem[];
  currentUserRank: LeaderboardItem | null;
  nextCursor: string | null;
  computedAt: string;
  stale: boolean;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,1024}$/;

export function parseLeaderboardQuery(value: unknown): LeaderboardQuery {
  const error = "LEADERBOARD_QUERY_INVALID";
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(error);
  const record = value as Record<string, unknown>;
  const allowed = ["period", "boardType", "scopeType", "scopeId", "pageSize", "cursor"];
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !allowed.includes(key))) throw new TypeError(error);
  const period = member(record.period, LEADERBOARD_PERIODS, error);
  const boardType = member(record.boardType, LEADERBOARD_BOARD_TYPES, error);
  const scopeType = member(record.scopeType, LEADERBOARD_SCOPE_TYPES, error);
  if (!validCombination(scopeType, boardType)) throw new TypeError(error);
  const scopeId = scopeType === "NATION"
    ? record.scopeId === undefined || record.scopeId === "NATION" ? "NATION" : invalid(error)
    : canonicalUuid(record.scopeId, error);
  const pageSize = record.pageSize === undefined ? 50 : canonicalPageSize(record.pageSize, error);
  const cursor = record.cursor === undefined ? null : canonicalCursor(record.cursor, error);
  return { period, boardType, scopeType, scopeId, pageSize, cursor };
}

function validCombination(scope: LeaderboardScope, board: LeaderboardBoard): boolean {
  return (scope === "NATION" && (board === "SCHOOL" || board === "STUDENT")) ||
    (scope === "SCHOOL" && (board === "COLLEGE" || board === "STUDENT")) ||
    (scope === "COLLEGE" && (board === "PROGRAM" || board === "STUDENT")) ||
    (scope === "PROGRAM" && board === "STUDENT");
}

function member<T extends string>(value: unknown, values: readonly T[], error: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new TypeError(error);
  return value as T;
}

function canonicalUuid(value: unknown, error: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError(error);
  return value;
}

function canonicalPageSize(value: unknown, error: string): number {
  if (typeof value !== "string" || !/^[1-9]\d?$|^100$/.test(value)) throw new TypeError(error);
  return Number(value);
}

function canonicalCursor(value: unknown, error: string): string {
  if (typeof value !== "string" || !CURSOR_PATTERN.test(value)) throw new TypeError(error);
  return value;
}

function invalid(error: string): never {
  throw new TypeError(error);
}
