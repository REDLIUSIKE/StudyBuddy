import { describe, expect, it } from "vitest";

import { parseLeaderboardQuery } from "./leaderboards.js";

const SCHOOL_ID = "00000000-0000-4000-8000-000000000001";

describe("parseLeaderboardQuery", () => {
  it("accepts every intended scope and board combination", () => {
    expect(parseLeaderboardQuery({
      period: "DAY", boardType: "SCHOOL", scopeType: "NATION",
    })).toEqual({
      period: "DAY", boardType: "SCHOOL", scopeType: "NATION",
      scopeId: "NATION", pageSize: 50, cursor: null,
    });
    expect(parseLeaderboardQuery({
      period: "ALL_TIME", boardType: "STUDENT", scopeType: "SCHOOL", scopeId: SCHOOL_ID,
      pageSize: "20", cursor: "cursor-token",
    })).toMatchObject({ scopeId: SCHOOL_ID, pageSize: 20, cursor: "cursor-token" });
  });

  it.each([
    { period: "YEAR", boardType: "SCHOOL", scopeType: "NATION" },
    { period: "DAY", boardType: "PROGRAM", scopeType: "NATION" },
    { period: "DAY", boardType: "SCHOOL", scopeType: "SCHOOL", scopeId: SCHOOL_ID },
    { period: "DAY", boardType: "STUDENT", scopeType: "NATION", hidden: "true" },
    { period: "DAY", boardType: "STUDENT", scopeType: "SCHOOL" },
  ])("rejects an invalid or privacy-expanding query", (value) => {
    expect(() => parseLeaderboardQuery(value)).toThrow("LEADERBOARD_QUERY_INVALID");
  });
});
