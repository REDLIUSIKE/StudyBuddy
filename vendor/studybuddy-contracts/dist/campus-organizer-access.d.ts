export declare const CAMPUS_ORGANIZER_GRANT_STATES: readonly ["NOT_GRANTED", "SCHEDULED", "ACTIVE", "REVOKED"];
export type CampusOrganizerGrantState = (typeof CAMPUS_ORGANIZER_GRANT_STATES)[number];
export type CampusOrganizerGrantInput = Readonly<{
    schoolId: string;
    effectiveFrom: string;
    reason: string;
}>;
export type CampusOrganizerRevokeInput = Readonly<{
    grantId: string;
    revision: number;
    reason: string;
}>;
export type CampusOrganizerGrantProjection = Readonly<{
    grantId: string;
    school: Readonly<{
        id: string;
        name: string;
    }>;
    revision: number;
    effectiveFrom: string;
    effectiveTo: string | null;
}>;
export type CampusOrganizerAdminGrant = CampusOrganizerGrantProjection & Readonly<{
    grantReason: string;
    revokeReason: string | null;
    grantedByAdminUserId: string;
    revokedByAdminUserId: string | null;
    createdAt: string;
    updatedAt: string;
}>;
export type CampusOrganizerCommissionAssignmentSummary = Readonly<{
    id: string;
    schoolId: string;
    status: "ACTIVE" | "ENDED";
    effectiveFrom: string;
    effectiveTo: string | null;
}>;
export type CampusOrganizerAdminView = Readonly<{
    studyBuddyUserId: string;
    accountMasked: string;
    userStatus: "ACTIVE" | "SUSPENDED";
    state: CampusOrganizerGrantState;
    grant: CampusOrganizerAdminGrant | null;
    commissionAssignment: CampusOrganizerCommissionAssignmentSummary | null;
}>;
export type CampusOrganizerListQuery = Readonly<{
    state?: CampusOrganizerGrantState;
    schoolId?: string;
    cursor?: string;
    limit: number;
}>;
export type CampusOrganizerListPage = Readonly<{
    items: readonly CampusOrganizerAdminView[];
    nextCursor: string | null;
}>;
export type CampusPlaybookDocumentGroup = Readonly<{
    id: string;
    title: string;
}>;
export type CampusPlaybookDocumentMedia = Readonly<{
    id: string;
    title: string;
    assetId: string;
    alt: string;
    scene: string;
    size: string;
    version: string;
    updatedAt: string;
    source: string;
}>;
export type CampusPlaybookDocumentSection = Readonly<{
    id: string;
    title: string;
    prompt?: string;
    body?: string;
    items?: readonly string[];
    ordered?: boolean;
    tone?: "support" | "note";
    links?: readonly Readonly<{
        label: string;
        href: string;
    }>[];
    media?: readonly CampusPlaybookDocumentMedia[];
    faqs?: readonly Readonly<{
        category: string;
        question: string;
        answer: string;
    }>[];
}>;
export type CampusPlaybookDocumentEntry = Readonly<{
    id: string;
    groupId: string;
    navTitle: string;
    eyebrow: string;
    summary: string;
    status?: string;
    sections: readonly CampusPlaybookDocumentSection[];
}>;
export type CampusPlaybookDocument = Readonly<{
    version: string;
    access: CampusOrganizerGrantProjection;
    groups: readonly CampusPlaybookDocumentGroup[];
    entries: readonly CampusPlaybookDocumentEntry[];
}>;
export type CampusPlaybookAssetMetadata = Readonly<{
    assetId: string;
    url: string;
    mediaType: "image/png";
    contentLength: number;
    sha256: string;
}>;
export declare function parseCampusOrganizerGrantInput(value: unknown): CampusOrganizerGrantInput;
export declare function parseCampusOrganizerRevokeInput(value: unknown): CampusOrganizerRevokeInput;
export declare function parseCampusOrganizerGrantProjection(value: unknown): CampusOrganizerGrantProjection;
export declare function parseCampusOrganizerAdminView(value: unknown): CampusOrganizerAdminView;
export declare function parseCampusOrganizerListQuery(value: unknown): CampusOrganizerListQuery;
export declare function parseCampusOrganizerListPage(value: unknown): CampusOrganizerListPage;
export declare function parseCampusPlaybookDocument(value: unknown): CampusPlaybookDocument;
export declare function parseCampusPlaybookAssetMetadata(value: unknown): CampusPlaybookAssetMetadata;
