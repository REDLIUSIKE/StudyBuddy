import { SKILL_DIAGNOSTIC_CODES as codes } from "./skill-diagnostic-codes.js";
import { skillExact, skillRecord, skillUuid } from "./skill-center.js";
export const SKILL_DIAGNOSTIC_ACTIONS = ["startup", "webview_open", "webview_resize", "webview_close", "bridge", "scan", "copy", "install", "import", "enable", "disable", "remove", "manage", "cancel", "open_instance", "open_project", "open_tool_center", "pick_project", "catalog", "favorite", "publisher", "github_metadata", "package_upload", "cover_upload", "publish", "update", "delete", "prompt", "native_response", "page", "copy_preflight", "library_metadata", "import_local", "export", "forget_project", "watch_start", "watch_stop", "ai_enable", "ai_status", "ai_revoke", "ai_approve", "ai_inventory", "ai_inspect", "ai_preflight", "ai_execute"];
export const SKILL_STARTUP_PHASES = ["session_exchange", "session_restore", "native_client", "bridge_connect"];
export const SKILL_DIAGNOSTIC_PHASES = [...SKILL_STARTUP_PHASES, "preflight", "authorization", "bridge", "detection", "scan", "source", "package_ticket", "package_download", "package_verify", "destination", "stage", "publish", "readback", "dependency", "open", "project_selection", "web_request", "package_upload", "cover_upload", "clipboard", "native_response", "page_runtime"];
export const SKILL_WEB_ACTIONS = ["startup", "catalog", "favorite", "publisher", "github_metadata", "package_upload", "cover_upload", "publish", "update", "delete", "prompt", "native_response", "page"];
export const SKILL_WEB_PHASES = [...SKILL_STARTUP_PHASES, "web_request", "package_upload", "cover_upload", "clipboard", "native_response", "page_runtime"];
const codeSet = new Set([...codes, "COMMAND_FAILED", "AUTH_REQUIRED", "ENTITLEMENT_REQUIRED", "CSRF_INVALID", "API_INVALID_RESPONSE", "WEB_API_RESPONSE_INVALID", "WEB_API_NETWORK_ERROR", "NETWORK_UNAVAILABLE", "UNKNOWN_ERROR"]);
export function safeSkillDiagnosticCode(value) { return typeof value === "string" && codeSet.has(value) ? value : "COMMAND_FAILED"; }
export function parseSkillWebDiagnostic(value) {
    const v = skillRecord(value);
    skillExact(v, ["operationId", "action", "phase", "outcome", "errorCode", "requestId", "durationMs", "httpStatus"]);
    const hasStatus = Object.hasOwn(v, "httpStatus");
    if (hasStatus && v.httpStatus !== null && !(typeof v.httpStatus === "number" && Number.isSafeInteger(v.httpStatus) && v.httpStatus >= 100 && v.httpStatus <= 599))
        throw new TypeError("SKILL_DIAGNOSTIC_INVALID");
    if (!SKILL_WEB_ACTIONS.includes(v.action) || !SKILL_WEB_PHASES.includes(v.phase) || !["started", "succeeded", "failed", "cancelled"].includes(v.outcome) || !(v.errorCode === null || typeof v.errorCode === "string" && v.errorCode.length <= 120) || !(v.durationMs === null || typeof v.durationMs === "number" && Number.isSafeInteger(v.durationMs) && v.durationMs >= 0 && v.durationMs <= 600000))
        throw new TypeError("SKILL_DIAGNOSTIC_INVALID");
    return { operationId: skillUuid(v.operationId), action: v.action, phase: v.phase, outcome: v.outcome, errorCode: v.outcome === "failed" ? safeSkillDiagnosticCode(v.errorCode) : null, requestId: v.requestId === null ? null : skillUuid(v.requestId), durationMs: v.durationMs, ...(hasStatus ? { httpStatus: v.httpStatus } : {}) };
}
export function projectSkillDiagnosticFields(component, fields) {
    if (component !== "skill_center" || typeof fields !== "object" || fields === null || Array.isArray(fields))
        return undefined;
    const r = fields, view = {};
    if (SKILL_DIAGNOSTIC_ACTIONS.includes(r.action))
        view.action = r.action;
    if (SKILL_DIAGNOSTIC_PHASES.includes(r.phase))
        view.phase = r.phase;
    if (typeof r.status_code === "number" && Number.isSafeInteger(r.status_code) && r.status_code >= 100 && r.status_code <= 599)
        view.httpStatus = r.status_code;
    if (["chatgpt_desktop", "claude_code", "codex_cli", "deepseek_harness", "hermes_desktop", "kimi_cli", "openclaw", "workbuddy"].includes(r.tool_id))
        view.toolId = r.tool_id;
    if (["copied", "linked", "already_present", "conflict", "failed", "blocked", "cancelled", "imported", "removed", "disabled"].includes(r.target_status))
        view.targetStatus = r.target_status;
    if (typeof r.destination_id === "string" && /^[a-f0-9]{64}$/.test(r.destination_id))
        view.destinationId = r.destination_id;
    if (typeof r.source_id === "string" && /^[a-f0-9]{64}$/.test(r.source_id))
        view.sourceId = r.source_id;
    if (typeof r.content_sha256 === "string" && /^[a-f0-9]{64}$/.test(r.content_sha256))
        view.contentSha256 = r.content_sha256;
    return Object.keys(view).length ? view : undefined;
}
//# sourceMappingURL=skill-diagnostics.js.map