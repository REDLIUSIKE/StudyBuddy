export declare const LEADERBOARD_PERIODS: readonly ["DAY", "WEEK", "MONTH", "ALL_TIME"];
export declare const LEADERBOARD_BOARD_TYPES: readonly ["SCHOOL", "COLLEGE", "PROGRAM", "STUDENT"];
export declare const LEADERBOARD_SCOPE_TYPES: readonly ["NATION", "SCHOOL", "COLLEGE", "PROGRAM"];
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
    school: Readonly<{
        id: string;
        name: string;
    }> | null;
    college: Readonly<{
        id: string;
        name: string;
    }> | null;
    program: Readonly<{
        id: string;
        name: string;
    }> | null;
    grade: string | null;
}>;
export type LeaderboardItem = Readonly<{
    rank: number;
    entity: Readonly<{
        id: string;
        name: string;
    }>;
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
export declare function parseLeaderboardQuery(value: unknown): LeaderboardQuery;
