import { isSkillListingStatus } from "./skill-marketplace.js";
import { parseSkillEntry, parseSkillIntroduction, parseSkillCoverChange, parseSkillPublication, skillArray, skillBoolean, skillChoice, skillExact, skillInteger, skillInvalid, skillNullableText, skillRecord, skillText, skillTimestamp, skillUuid } from "./skill-center.js";
function status(value) { if (typeof value !== "string" || !isSkillListingStatus(value))
    return skillInvalid(); return value; }
export function parseAdminSkillQuery(value) { const v = skillRecord(value); skillExact(v, ["view", "sourceKind", "status", "query", "category", "cursor", "limit"]); return { view: skillChoice(v.view ?? "all", ["all", "curated", "community"]), sourceKind: v.sourceKind == null ? null : skillChoice(v.sourceKind, ["github_project", "hosted_package"]), status: v.status == null ? null : status(v.status), query: v.query == null || v.query === "" ? null : skillText(v.query, 120), category: v.category == null || v.category === "" ? null : skillText(v.category, 80), cursor: v.cursor == null ? null : skillText(v.cursor, 500), limit: skillInteger(v.limit ?? 50, 1, 100) }; }
export function parseAdminSkillCreate(value) { const result = parseSkillPublication(value); if (result.sourceKind !== "github_project")
    return skillInvalid(); return result; }
export function parseAdminSkillIntroductionUpdate(value) { const v = skillRecord(value); skillExact(v, ["introduction", "cover", "expectedRevision", "reason"]); return { introduction: parseSkillIntroduction(v.introduction), cover: parseSkillCoverChange(v.cover), expectedRevision: skillInteger(v.expectedRevision, 1), reason: skillNullableText(v.reason, 500) }; }
export function parseAdminSkillCuration(value) { const v = skillRecord(value); skillExact(v, ["isCurated", "expectedRevision"]); return { isCurated: skillBoolean(v.isCurated), expectedRevision: skillInteger(v.expectedRevision, 1) }; }
export function parseAdminSkillStatus(value) { const v = skillRecord(value); skillExact(v, ["expectedRevision", "reason"]); return { expectedRevision: skillInteger(v.expectedRevision, 1), reason: skillText(v.reason, 500) }; }
export function parseAdminSkillMutationResult(value) { const v = skillRecord(value); skillExact(v, ["id", "revision", "status", "isCurated"]); return { id: skillUuid(v.id), revision: skillInteger(v.revision, 1), status: status(v.status), isCurated: skillBoolean(v.isCurated) }; }
export function parseAdminSkillEntry(value) {
    const v = skillRecord(value);
    skillExact(v, ["entry", "favoriteCount", "rejectionReason", "allowedActions", "actions"]);
    const entry = parseSkillEntry(v.entry);
    if (entry.isFavorite)
        skillInvalid();
    return { entry, favoriteCount: skillInteger(v.favoriteCount), rejectionReason: skillNullableText(v.rejectionReason, 500), allowedActions: skillArray(v.allowedActions, 4, value => skillChoice(value, ["edit_introduction", "curate", "delist", "restore"])), actions: skillArray(v.actions, 100, item => { const a = skillRecord(item); skillExact(a, ["action", "reason", "previousRevision", "nextRevision", "changedFields", "occurredAt", "operatorLabel"]); return { action: skillText(a.action, 100), reason: skillNullableText(a.reason, 500), previousRevision: skillInteger(a.previousRevision), nextRevision: skillInteger(a.nextRevision, 1), changedFields: skillArray(a.changedFields, 30, item => skillText(item, 80)), occurredAt: skillTimestamp(a.occurredAt), operatorLabel: skillNullableText(a.operatorLabel, 100) }; }) };
}
export function parseAdminSkillPage(value) { const v = skillRecord(value); skillExact(v, ["items", "nextCursor"]); return { items: skillArray(v.items, 100, parseAdminSkillEntry), nextCursor: skillNullableText(v.nextCursor, 500) }; }
//# sourceMappingURL=admin-skill-center.js.map