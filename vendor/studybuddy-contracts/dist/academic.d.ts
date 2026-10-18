export type AcademicEntityStatusView = "verified" | "pending" | "merged" | "disabled";
export type AcademicEntitySelection = Readonly<{
    id: string;
}> | Readonly<{
    candidateName: string;
}>;
export type AcademicProgramSelection = Readonly<{
    id: string;
}> | Readonly<{
    candidateName: string;
    majorCatalogId?: string;
}>;
export type AcademicProfileLockRequest = Readonly<{
    realName: string;
    school: AcademicEntitySelection;
    college: AcademicEntitySelection;
    program: AcademicProgramSelection;
    grade: string;
}>;
export type AcademicProfileCorrectionRequest = AcademicProfileLockRequest & Readonly<{
    reason: string;
    expectedRevision: number;
}>;
export type AcademicDirectoryUpdateRequest = Readonly<{
    college: AcademicEntitySelection;
    program: AcademicProgramSelection;
    expectedRevision: number;
}>;
export type AcademicProfileView = Readonly<{
    displayName: string;
    school: Readonly<{
        id: string;
        name: string;
    }>;
    college: Readonly<{
        id: string;
        name: string;
        status: AcademicEntityStatusView;
    }>;
    program: Readonly<{
        id: string;
        name: string;
        status: AcademicEntityStatusView;
        majorCatalogId: string | null;
    }>;
    grade: string;
    lockedAt: string;
    revision: number;
}>;
export type AcademicDirectoryEntityType = "school" | "college" | "program" | "major";
export type AcademicDirectoryItem = Readonly<{
    entityType: AcademicDirectoryEntityType;
    id: string;
    name: string;
    status: AcademicEntityStatusView;
    schoolId: string | null;
    collegeId: string | null;
    majorCatalogId: string | null;
}>;
export type AcademicDirectorySearchView = Readonly<{
    items: AcademicDirectoryItem[];
}>;
export declare function parseAcademicProfileLockRequest(value: unknown): AcademicProfileLockRequest;
export declare function parseAcademicDirectoryUpdateRequest(value: unknown): AcademicDirectoryUpdateRequest;
export declare function parseAcademicProfileCorrectionRequest(value: unknown): AcademicProfileCorrectionRequest;
