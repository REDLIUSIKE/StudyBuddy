import type { AcademicEntitySelection, AcademicProgramSelection } from './academic.js';
export type IdentityStage = 'high_school' | 'higher_education';
export type IdentityEntity = Readonly<{
    id: string;
    name: string;
    status: 'verified' | 'pending';
}>;
export type IdentityProfile = Readonly<{
    kind: 'student';
    stage: 'high_school';
    realName: string;
    grade: string;
    school: IdentityEntity;
}> | Readonly<{
    kind: 'student';
    stage: 'higher_education';
    realName: string;
    grade: string;
    school: IdentityEntity;
    college: IdentityEntity;
    program: IdentityEntity;
}> | Readonly<{
    kind: 'community';
    province: Readonly<{
        code: string;
        name: string;
    }>;
    city: Readonly<{
        code: string;
        name: string;
    }>;
}>;
export type IdentityProfileView = Readonly<{
    profile: IdentityProfile | null;
    revision: number;
    updatedAt: string | null;
}>;
export type IdentitySaveProfile = Readonly<{
    kind: 'student';
    stage: 'high_school';
    realName: string;
    grade: string;
    school: AcademicEntitySelection;
}> | Readonly<{
    kind: 'student';
    stage: 'higher_education';
    realName: string;
    grade: string;
    school: AcademicEntitySelection;
    college: AcademicEntitySelection;
    program: AcademicProgramSelection;
}> | Readonly<{
    kind: 'community';
    provinceCode: string;
    cityCode: string;
}>;
export type IdentitySaveRequest = Readonly<{
    expectedRevision: number;
    profile: IdentitySaveProfile;
}>;
export type IdentityDirectoryItem = IdentityEntity & Readonly<{
    stage?: IdentityStage;
}>;
export type IdentityRegion = Readonly<{
    code: string;
    name: string;
    parentCode: string | null;
}>;
export type IdentityBoard = 'SCHOOL' | 'STUDENT' | 'COLLEGE' | 'PROGRAM' | 'PROVINCE' | 'CITY' | 'COMMUNITY';
export type IdentityBoardScope = 'NATION' | 'SCHOOL' | 'COLLEGE' | 'PROGRAM' | 'PROVINCE' | 'CITY';
export type IdentityRankingQuery = Readonly<{
    period: 'DAY' | 'WEEK' | 'MONTH' | 'ALL_TIME';
    board: IdentityBoard;
    scope: IdentityBoardScope;
    scopeId: string;
    offset: number;
    limit: number;
}>;
export type IdentityRankingItem = Readonly<{
    rank: number;
    id: string;
    name: string;
    totalTokens: string;
    affiliation: string | null;
    educationStage: IdentityStage | null;
}>;
export type IdentityRankingPage = Readonly<{
    items: readonly IdentityRankingItem[];
    currentUser: IdentityRankingItem | null;
    hasMore: boolean;
    computedAt: string;
}>;
/** Parse one complete identity replacement; revision zero creates the first generic identity. */
export declare function parseIdentitySaveRequest(value: unknown): IdentitySaveRequest;
/** Validate the server-owned identity summary before rendering it. */
export declare function parseIdentityProfileView(value: unknown): IdentityProfileView;
export declare function parseIdentityRankingQuery(value: unknown): IdentityRankingQuery;
export declare function parseIdentitySchools(value: unknown): {
    items: IdentityDirectoryItem[];
};
export declare function parseIdentityRegions(value: unknown): {
    items: IdentityRegion[];
};
export declare function parseIdentityRankingPage(value: unknown): IdentityRankingPage;
/** Express query dictionaries may have a null prototype. Values remain strictly validated. */
export declare function queryObject(value: unknown): Record<string, unknown>;
