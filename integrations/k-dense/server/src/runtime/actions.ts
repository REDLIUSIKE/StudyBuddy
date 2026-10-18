import type { ResearchAction, ResearchEvent, ResearchRun, RuntimeCapabilities } from "./contracts.ts";

// Operation names, not provider/model aliases. More adapters register their
// schemas as those existing workflows are connected to a native owner.
export const HOST_ACTION_KINDS = ["conversation", "methods-draft", "next-experiments", "latex-assist", "compaction"] as const;
function invalid(code = "RESEARCH_ACTION_INVALID"): never { throw Object.assign(new Error(code), { code }); }
function object(value: unknown, required: readonly string[], optional: readonly string[] = [], code?: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(code);
  const record = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(record, key)) || Object.keys(record).some(key => !required.includes(key) && !optional.includes(key))) return invalid(code);
  return record;
}
export function operationId(value: unknown, code = "RESEARCH_ACTION_INVALID"): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) return invalid(code);
  return value;
}
function text(value: unknown, max: number, code?: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\u0000")) return invalid(code);
  return value;
}
export function parseHostAction(value: unknown): ResearchAction {
  const record = object(value, ["operationId", "kind", "input"]);
  if (!HOST_ACTION_KINDS.includes(record.kind as typeof HOST_ACTION_KINDS[number])) return invalid();
  const input = object(record.input, ["prompt", "references"]);
  if (!Array.isArray(input.references) || input.references.length > 24) return invalid();
  const references = input.references.map(value => {
    const path = text(value, 4096);
    if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) return invalid();
    return path;
  });
  return { operationId: operationId(record.operationId), kind: String(record.kind), input: { prompt: text(input.prompt, 131072), references } };
}
export function parseHostCapabilities(value: unknown): RuntimeCapabilities {
  const code = "RESEARCH_RESPONSE_INVALID";
  if (!Array.isArray(value) || value.length > HOST_ACTION_KINDS.length) return invalid(code);
  const seen = new Set<string>();
  return value.map(item => {
    const record = object(item, ["id", "state"], ["reason"], code);
    const id = text(record.id, 192, code);
    if (!HOST_ACTION_KINDS.includes(id as typeof HOST_ACTION_KINDS[number]) || seen.has(id) || !["ready", "unavailable"].includes(String(record.state))) return invalid(code);
    seen.add(id);
    return { id, state: record.state as "ready" | "unavailable", ...(record.reason === undefined ? {} : { reason: text(record.reason, 4096, code) }) };
  });
}
export function parseHostRun(value: unknown, expectedRunId: string): ResearchRun {
  const code = "RESEARCH_RESPONSE_INVALID";
  const record = object(value, ["runId", "state"], ["result"], code);
  if (record.runId !== expectedRunId || !["queued", "running", "waiting", "completed", "failed", "unknown"].includes(String(record.state))) return invalid(code);
  const run: ResearchRun = { runId: expectedRunId, state: record.state as ResearchRun["state"] };
  if (record.result !== undefined) {
    const result = object(record.result, ["kind", "value"], [], code);
    if (!["message", "artifact", "model", "job"].includes(String(result.kind))) return invalid(code);
    run.result = { kind: result.kind as "message" | "artifact" | "model" | "job", value: result.value };
  }
  return run;
}
export function parseHostEvent(value: unknown, projectId: string, sessionRef: string, runId: string): ResearchEvent {
  const code = "RESEARCH_RESPONSE_INVALID";
  const record = object(value, ["eventId", "projectId", "sessionRef", "runId", "actor", "kind", "payload"], ["nativeTurnId", "nativeStepId", "toolCallId"], code);
  if (record.projectId !== projectId || record.sessionRef !== sessionRef || record.runId !== runId) return invalid(code);
  const event: ResearchEvent = { eventId: text(record.eventId, 512, code), projectId, sessionRef, runId,
    actor: text(record.actor, 192, code), kind: text(record.kind, 192, code), payload: record.payload };
  for (const key of ["nativeTurnId", "nativeStepId", "toolCallId"] as const) if (record[key] !== undefined) event[key] = text(record[key], 512, code);
  return event;
}
