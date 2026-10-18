import { type SkillListingStatus } from "./skill-marketplace.js";
import { type SkillCoverChange, type SkillEntryView, type SkillIntroduction, type SkillPublicationInputV2 } from "./skill-center.js";
export type AdminSkillQuery = {
    view: "all" | "curated" | "community";
    sourceKind: "github_project" | "hosted_package" | null;
    status: SkillListingStatus | null;
    query: string | null;
    category: string | null;
    cursor: string | null;
    limit: number;
};
export type AdminSkillAction = "edit_introduction" | "curate" | "delist" | "restore";
export type AdminSkillActionView = {
    action: string;
    reason: string | null;
    previousRevision: number;
    nextRevision: number;
    changedFields: string[];
    occurredAt: string;
    operatorLabel: string | null;
};
export type AdminSkillEntry = {
    entry: SkillEntryView;
    favoriteCount: number;
    rejectionReason: string | null;
    allowedActions: AdminSkillAction[];
    actions: AdminSkillActionView[];
};
export type AdminSkillPage = {
    items: AdminSkillEntry[];
    nextCursor: string | null;
};
export type AdminSkillMutationResult = {
    id: string;
    revision: number;
    status: SkillListingStatus;
    isCurated: boolean;
};
export type AdminSkillCreateInput = Extract<SkillPublicationInputV2, {
    sourceKind: "github_project";
}>;
export type AdminSkillIntroductionUpdate = {
    introduction: SkillIntroduction;
    cover: SkillCoverChange;
    expectedRevision: number;
    reason: string | null;
};
export type AdminSkillCurationInput = {
    isCurated: boolean;
    expectedRevision: number;
};
export type AdminSkillStatusInput = {
    expectedRevision: number;
    reason: string;
};
export declare function parseAdminSkillQuery(value: unknown): AdminSkillQuery;
export declare function parseAdminSkillCreate(value: unknown): AdminSkillCreateInput;
export declare function parseAdminSkillIntroductionUpdate(value: unknown): AdminSkillIntroductionUpdate;
export declare function parseAdminSkillCuration(value: unknown): AdminSkillCurationInput;
export declare function parseAdminSkillStatus(value: unknown): AdminSkillStatusInput;
export declare function parseAdminSkillMutationResult(value: unknown): AdminSkillMutationResult;
export declare function parseAdminSkillEntry(value: unknown): AdminSkillEntry;
export declare function parseAdminSkillPage(value: unknown): AdminSkillPage;
