export const LEADERBOARD_PERIODS = ["DAY", "WEEK", "MONTH", "ALL_TIME"];
export const LEADERBOARD_BOARD_TYPES = ["SCHOOL", "COLLEGE", "PROGRAM", "STUDENT"];
export const LEADERBOARD_SCOPE_TYPES = ["NATION", "SCHOOL", "COLLEGE", "PROGRAM"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,1024}$/;
export function parseLeaderboardQuery(value) {
    const error = "LEADERBOARD_QUERY_INVALID";
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new TypeError(error);
    const record = value;
    const allowed = ["period", "boardType", "scopeType", "scopeId", "pageSize", "cursor"];
    if (Reflect.ownKeys(record).some((key) => typeof key !== "string" || !allowed.includes(key)))
        throw new TypeError(error);
    const period = member(record.period, LEADERBOARD_PERIODS, error);
    const boardType = member(record.boardType, LEADERBOARD_BOARD_TYPES, error);
    const scopeType = member(record.scopeType, LEADERBOARD_SCOPE_TYPES, error);
    if (!validCombination(scopeType, boardType))
        throw new TypeError(error);
    const scopeId = scopeType === "NATION"
        ? record.scopeId === undefined || record.scopeId === "NATION" ? "NATION" : invalid(error)
        : canonicalUuid(record.scopeId, error);
    const pageSize = record.pageSize === undefined ? 50 : canonicalPageSize(record.pageSize, error);
    const cursor = record.cursor === undefined ? null : canonicalCursor(record.cursor, error);
    return { period, boardType, scopeType, scopeId, pageSize, cursor };
}
function validCombination(scope, board) {
    return (scope === "NATION" && (board === "SCHOOL" || board === "STUDENT")) ||
        (scope === "SCHOOL" && (board === "COLLEGE" || board === "STUDENT")) ||
        (scope === "COLLEGE" && (board === "PROGRAM" || board === "STUDENT")) ||
        (scope === "PROGRAM" && board === "STUDENT");
}
function member(value, values, error) {
    if (typeof value !== "string" || !values.includes(value))
        throw new TypeError(error);
    return value;
}
function canonicalUuid(value, error) {
    if (typeof value !== "string" || !UUID_PATTERN.test(value))
        throw new TypeError(error);
    return value;
}
function canonicalPageSize(value, error) {
    if (typeof value !== "string" || !/^[1-9]\d?$|^100$/.test(value))
        throw new TypeError(error);
    return Number(value);
}
function canonicalCursor(value, error) {
    if (typeof value !== "string" || !CURSOR_PATTERN.test(value))
        throw new TypeError(error);
    return value;
}
function invalid(error) {
    throw new TypeError(error);
}
//# sourceMappingURL=leaderboards.js.map