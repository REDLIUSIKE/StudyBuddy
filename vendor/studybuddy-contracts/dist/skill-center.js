import { isSkillListingStatus, SKILL_PACKAGE_MAX_BYTES } from "./skill-marketplace.js";
export const SKILL_TOOL_IDS = ["chatgpt_desktop", "claude_code", "codex_cli", "deepseek_harness", "hermes_desktop", "kimi_cli", "openclaw", "workbuddy"];
export function skillInvalid() { throw new Error("SKILL_CENTER_INVALID"); }
export function skillRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
        return skillInvalid();
    return value;
}
export function skillExact(value, keys) { if (Object.keys(value).some(key => !keys.includes(key)))
    skillInvalid(); }
export function skillText(value, max, allowEmpty = false) {
    if (typeof value !== "string" || value.length > max || (!allowEmpty && value.trim().length === 0) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
        return skillInvalid();
    return value.trim();
}
export function skillNullableText(value, max) { return value === null ? null : skillText(value, max); }
export function skillChoice(value, choices) { if (typeof value !== "string" || !choices.includes(value))
    return skillInvalid(); return value; }
export function skillInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    return skillInvalid(); return value; }
export function skillBoolean(value) { if (typeof value !== "boolean")
    return skillInvalid(); return value; }
export function skillArray(value, max, parser) { if (!Array.isArray(value) || value.length > max)
    return skillInvalid(); return value.map(parser); }
export function skillUuid(value) { const text = skillText(value, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(text))
    return skillInvalid(); return text; }
export function skillOpaqueId(value) { const text = skillText(value, 200); if (!/^[a-zA-Z0-9_-]+$/u.test(text))
    return skillInvalid(); return text; }
export function skillSha256(value) { const text = skillText(value, 64); if (!/^[a-f0-9]{64}$/u.test(text))
    return skillInvalid(); return text; }
export function skillTimestamp(value) { const text = skillText(value, 40); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(text) || !Number.isFinite(Date.parse(text)))
    return skillInvalid(); return text; }
export function skillTool(value) { return skillChoice(value, SKILL_TOOL_IDS); }
export function skillUrl(value) {
    const text = skillText(value, 8192);
    if (text.startsWith("/") && !text.startsWith("//") && !text.includes("\\"))
        return text;
    try {
        const url = new URL(text);
        if (url.protocol === "https:" && !url.username && !url.password)
            return text;
    }
    catch { /* invalid URL */ }
    return skillInvalid();
}
export function parseSkillIntroduction(value, allowIncomplete = false) {
    const v = skillRecord(value);
    skillExact(v, ["title", "summary", "inputDescription", "outputDescription", "example", "features", "category", "usageInstructions", "dependencies", "declaredTools"]);
    const dependencies = skillArray(v.dependencies, 20, item => skillText(item, 300));
    const declaredTools = skillArray(v.declaredTools, 8, skillTool);
    if (new Set(declaredTools).size !== declaredTools.length)
        skillInvalid();
    return { title: skillText(v.title, 80), summary: skillText(v.summary, 300), inputDescription: skillText(v.inputDescription ?? "", 300, true), outputDescription: skillText(v.outputDescription, 300, allowIncomplete), example: skillText(v.example ?? "", 1000, true), ...(v.features === undefined ? {} : { features: skillArray(v.features, 8, item => skillText(item, 200)) }), category: skillText(v.category, 80), usageInstructions: skillText(v.usageInstructions, 4000, allowIncomplete), dependencies, declaredTools };
}
export function parseGithubReference(value) {
    const v = skillRecord(value);
    skillExact(v, ["repositoryUrl", "subdirectory", "ref"]);
    const repositoryUrl = skillText(v.repositoryUrl, 2048);
    try {
        const url = new URL(repositoryUrl);
        if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/u.test(url.pathname))
            skillInvalid();
        if (url.pathname.split("/").some(part => part === "." || part === ".."))
            skillInvalid();
    }
    catch {
        return skillInvalid();
    }
    const subdirectory = skillNullableText(v.subdirectory, 1024), ref = skillNullableText(v.ref, 256);
    if (subdirectory !== null && (subdirectory.startsWith("/") || subdirectory.includes("\\") || subdirectory.includes("%") || subdirectory.split("/").some(part => !part || part === "." || part === "..")))
        skillInvalid();
    if (ref !== null && (ref.includes("\\") || ref.includes("%") || ref.split("/").some(part => !part || part === "." || part === "..")))
        skillInvalid();
    return { repositoryUrl, subdirectory, ref };
}
export function parseGithubSkillMetadata(value) {
    const v = skillRecord(value);
    skillExact(v, ["repositoryUrl", "subdirectory", "ref", "projectType", "originalAuthor", "stars", "language", "license", "readmeSections", "readmeTruncated", "retrievedAt"]);
    const reference = parseGithubReference({ repositoryUrl: v.repositoryUrl, subdirectory: v.subdirectory, ref: v.ref });
    return { ...reference, projectType: skillChoice(v.projectType, ["skill", "project"]), originalAuthor: skillNullableText(v.originalAuthor, 100), stars: v.stars === null ? null : skillInteger(v.stars), language: skillNullableText(v.language, 100), license: skillNullableText(v.license, 100), readmeSections: skillArray(v.readmeSections, 200, item => skillText(item, 300)), readmeTruncated: skillBoolean(v.readmeTruncated), retrievedAt: v.retrievedAt === null ? null : skillTimestamp(v.retrievedAt) };
}
export function parseSkillPackageIdentity(value) {
    const v = skillRecord(value);
    skillExact(v, ["publicationId", "sha256", "canonicalName", "declaredVersion", "updateNotes"]);
    const canonicalName = skillNullableText(v.canonicalName, 64);
    if (canonicalName !== null && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(canonicalName) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(canonicalName)))
        skillInvalid();
    return { publicationId: skillUuid(v.publicationId), sha256: skillSha256(v.sha256), canonicalName, declaredVersion: skillNullableText(v.declaredVersion, 100), updateNotes: skillNullableText(v.updateNotes, 2000) };
}
export function parseSkillCoverChange(value) {
    if (value === undefined)
        return { action: "keep" };
    const v = skillRecord(value), action = skillChoice(v.action, ["keep", "clear", "replace"]);
    skillExact(v, action === "replace" ? ["action", "uploadId"] : ["action"]);
    return action === "replace" ? { action, uploadId: skillUuid(v.uploadId) } : { action };
}
function parsePublication(value, update) {
    const v = skillRecord(value), sourceKind = skillChoice(v.sourceKind, ["hosted_package", "github_project"]);
    skillExact(v, ["sourceKind", "introduction", "cover", ...(update ? ["expectedRevision"] : []), ...(sourceKind === "hosted_package" ? ["uploadId", "updateNotes"] : ["github", "projectType"])]);
    const base = { introduction: parseSkillIntroduction(v.introduction), cover: parseSkillCoverChange(v.cover), ...(update ? { expectedRevision: skillInteger(v.expectedRevision, 1) } : {}) };
    return sourceKind === "hosted_package" ? { ...base, sourceKind, uploadId: skillUuid(v.uploadId), updateNotes: skillNullableText(v.updateNotes, 2000) } : { ...base, sourceKind, github: parseGithubReference(v.github), projectType: skillChoice(v.projectType, ["skill", "project"]) };
}
export function parseSkillPublication(value) { return parsePublication(value, false); }
export function parseSkillPublicationUpdate(value) { return parsePublication(value, true); }
export function parseSkillEntry(value) {
    const v = skillRecord(value);
    skillExact(v, ["id", "revision", "publisherKind", "sourceKind", "introduction", "attribution", "isCurated", "status", "coverUrl", "updatedAt", "isFavorite", "metadataState", "verifiedTools", "package", "github"]);
    const sourceKind = skillChoice(v.sourceKind, ["hosted_package", "github_project"]), publisherKind = skillChoice(v.publisherKind, ["user", "platform_admin"]);
    const attribution = skillRecord(v.attribution);
    skillExact(attribution, ["role", "displayName"]);
    const role = skillChoice(attribution.role, ["creator", "sharer", "platform"]);
    if (publisherKind === "platform_admin" ? sourceKind !== "github_project" || role !== "platform" : role !== (sourceKind === "github_project" ? "sharer" : "creator"))
        skillInvalid();
    if (publisherKind === "platform_admin" && attribution.displayName !== "StudyBuddy 精选")
        skillInvalid();
    const metadataState = skillChoice(v.metadataState, ["complete", "legacy_incomplete"]);
    if (!isSkillListingStatus(String(v.status)))
        skillInvalid();
    const base = { id: skillUuid(v.id), revision: skillInteger(v.revision, 1), publisherKind, introduction: parseSkillIntroduction(v.introduction, metadataState === "legacy_incomplete"), attribution: { role, displayName: skillText(attribution.displayName, 150) }, isCurated: skillBoolean(v.isCurated), status: v.status, coverUrl: v.coverUrl === null ? null : skillUrl(v.coverUrl), updatedAt: skillTimestamp(v.updatedAt), isFavorite: skillBoolean(v.isFavorite), metadataState, verifiedTools: skillArray(v.verifiedTools, 8, item => { const e = skillRecord(item); skillExact(e, ["toolId", "evidenceId", "checkedAt"]); return { toolId: skillTool(e.toolId), evidenceId: skillUuid(e.evidenceId), checkedAt: skillTimestamp(e.checkedAt) }; }) };
    if (sourceKind === "github_project") {
        if (v.package !== null)
            skillInvalid();
        return { ...base, sourceKind, package: null, github: parseGithubSkillMetadata(v.github) };
    }
    if (v.github !== null || base.isCurated)
        skillInvalid();
    return { ...base, sourceKind, github: null, package: parseSkillPackageIdentity(v.package) };
}
export function parseSkillPackageUploadV2(value) {
    const v = skillRecord(value);
    skillExact(v, ["packageSha256", "packageBytes"]);
    const packageBytes = skillText(v.packageBytes, 12);
    if (!/^[1-9][0-9]*$/u.test(packageBytes) || BigInt(packageBytes) > BigInt(SKILL_PACKAGE_MAX_BYTES))
        skillInvalid();
    return { packageSha256: skillSha256(v.packageSha256), packageBytes };
}
export function parseSkillEntryQuery(value) {
    const v = skillRecord(value);
    skillExact(v, ["view", "query", "category"]);
    return { view: skillChoice(v.view ?? "community", ["curated", "community", "favorites", "published"]), query: v.query == null || v.query === "" ? null : skillText(v.query, 120), category: v.category == null || v.category === "" ? null : skillText(v.category, 80) };
}
export function parseSkillUploadTarget(value) {
    const v = skillRecord(value);
    skillExact(v, ["url", "requiredHeaders"]);
    const headers = skillRecord(v.requiredHeaders), requiredHeaders = {};
    if (Object.keys(headers).length > 20)
        skillInvalid();
    for (const [key, val] of Object.entries(headers)) {
        if (!/^[a-zA-Z0-9-]+$/u.test(key))
            skillInvalid();
        requiredHeaders[key] = skillText(val, 4096);
    }
    return { url: skillUrl(v.url), requiredHeaders };
}
export function parseSkillPackageUploadCapabilityV2(value) {
    const v = skillRecord(value);
    skillExact(v, ["uploadId", "expiresAt", "package"]);
    return { uploadId: skillUuid(v.uploadId), expiresAt: skillTimestamp(v.expiresAt), package: parseSkillUploadTarget(v.package) };
}
export function parseSkillCoverUploadCapability(value) {
    const v = skillRecord(value);
    skillExact(v, ["uploadId", "expiresAt", "cover"]);
    return { uploadId: skillUuid(v.uploadId), expiresAt: skillTimestamp(v.expiresAt), cover: parseSkillUploadTarget(v.cover) };
}
//# sourceMappingURL=skill-center.js.map