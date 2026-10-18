export declare const CAMPUS_PLAYBOOK_VERSION: "2026-10-11.v1";
export declare const CAMPUS_PLAYBOOK_SUBMISSION_KINDS: readonly ["FEEDBACK", "PLAN"];
export declare const CAMPUS_PLAYBOOK_SUBMISSION_STATUSES: readonly ["OPEN", "IN_PROGRESS", "RESOLVED"];
export type CampusPlaybookSubmissionKind = typeof CAMPUS_PLAYBOOK_SUBMISSION_KINDS[number];
export type CampusPlaybookSubmissionStatus = typeof CAMPUS_PLAYBOOK_SUBMISSION_STATUSES[number];
export type CampusPlaybookSubmissionCreate = Readonly<{
    kind: CampusPlaybookSubmissionKind;
    entryId: string;
    sectionId: string;
    body: string;
}>;
export type CampusPlaybookSubmissionReceipt = Readonly<{
    id: string;
    publicCode: string;
    status: CampusPlaybookSubmissionStatus;
    createdAt: string;
}>;
export type CampusPlaybookSubmissionUpdate = Readonly<{
    status: CampusPlaybookSubmissionStatus;
    adminNote: string | null;
}>;
export type CampusPlaybookSubmissionView = Readonly<{
    id: string;
    publicCode: string;
    kind: CampusPlaybookSubmissionKind;
    status: CampusPlaybookSubmissionStatus;
    studyBuddyUserId: string;
    accountMasked: string;
    playbookVersion: string;
    groupId: string;
    groupTitle: string;
    entryId: string;
    entryTitle: string;
    sectionId: string;
    sectionTitle: string;
    body: string;
    adminNote: string | null;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
}>;
export type CampusPlaybookSubmissionPage = Readonly<{
    items: readonly CampusPlaybookSubmissionView[];
    nextCursor: string | null;
}>;
export declare function parseCampusPlaybookSubmissionCreate(value: unknown): CampusPlaybookSubmissionCreate;
export declare function parseCampusPlaybookSubmissionUpdate(value: unknown): CampusPlaybookSubmissionUpdate;
