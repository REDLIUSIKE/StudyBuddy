export const CAMPUS_PLAYBOOK_VERSION = "2026-10-11.v1";
export const CAMPUS_PLAYBOOK_SUBMISSION_KINDS = ["FEEDBACK", "PLAN"];
export const CAMPUS_PLAYBOOK_SUBMISSION_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"];
export function parseCampusPlaybookSubmissionCreate(value) { const record = exact(value, ["kind", "entryId", "sectionId", "body"]); if (!one(record.kind, CAMPUS_PLAYBOOK_SUBMISSION_KINDS) || !identifier(record.entryId) || !identifier(record.sectionId))
    throw invalid(); return { kind: record.kind, entryId: record.entryId, sectionId: record.sectionId, body: bodyText(record.body, 4000) }; }
export function parseCampusPlaybookSubmissionUpdate(value) { const record = exact(value, ["status", "adminNote"]); if (!one(record.status, CAMPUS_PLAYBOOK_SUBMISSION_STATUSES))
    throw invalid(); return { status: record.status, adminNote: record.adminNote === null ? null : noteText(record.adminNote, 4000) }; }
function exact(value, keys) { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw invalid(); const record = value; const actual = Reflect.ownKeys(record); if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)))
    throw invalid(); return record; }
function one(value, values) { return typeof value === "string" && values.includes(value); }
function identifier(value) { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
function bodyText(value, max) { if (typeof value !== "string")
    throw invalid(); const result = value.normalize("NFKC").trim(); if (!result || result.length > max)
    throw invalid(); return result; }
function noteText(value, max) { if (typeof value !== "string")
    throw invalid(); const result = value.normalize("NFKC").trim(); if (result.length > max)
    throw invalid(); return result || null; }
function invalid() { return new TypeError("CAMPUS_PLAYBOOK_SUBMISSION_INVALID"); }
//# sourceMappingURL=campus-playbook.js.map