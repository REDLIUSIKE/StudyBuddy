export type StartCampusOrganizerAssignment = Readonly<{
    schoolId: string;
    organizerStudyBuddyUserId: string;
    effectiveFrom: string;
    reason: string;
}>;
export type EndCampusOrganizerAssignment = Readonly<{
    effectiveTo: string;
    reason: string;
}>;
export type CampusOrganizerAssignmentView = Readonly<{
    id: string;
    programCode: "founding-v1";
    amountFen: 1000;
    currency: "CNY";
    school: Readonly<{
        id: string;
        name: string;
    }>;
    organizer: Readonly<{
        studyBuddyUserId: string;
    }>;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: "ACTIVE" | "ENDED";
}>;
export declare function parseStartCampusOrganizerAssignment(value: unknown): StartCampusOrganizerAssignment;
export declare function parseEndCampusOrganizerAssignment(value: unknown): EndCampusOrganizerAssignment;
