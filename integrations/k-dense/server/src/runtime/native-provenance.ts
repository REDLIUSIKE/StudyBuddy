/** Private native tool observations reuse the original file/environment recorder and result validator. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { resolvePaths } from "../projects.ts";
import { isValidSessionId } from "../agent/notebook-store.ts";
import { scientificResultFromDetails } from "../agent/scientific-result.ts";
import { planDigest } from "../agent/notebook-plans.ts";
import type { Lookup } from "../agent/notebook-results.ts";
import { ProvenanceRecorder } from "../provenance/recorder.ts";
import { appendNewSteps, stepsPath, type ProvenanceStep } from "../provenance/store.ts";
import type { EnvironmentCapture } from "../provenance/environment.ts";
import { assertResearchPath } from "./project-storage.ts";
import type { RuntimeContext } from "./contracts.ts";

interface Begin {
  schemaVersion: 1; action: "begin"; executionId: string; rootSessionId: string; actorSessionId: string;
  parentSessionId: string | null; rootCallId: string; toolCallId: string; toolName: string;
  parentToolCallId?: string | null; arguments: unknown; argumentsSha256: string; argumentsTruncated: boolean; startedAt: number;
}
interface Finish { schemaVersion: 1; action: "finish"; executionId: string; endedAt: number; isError: boolean; outcome: "completed" | "failed" | "cancelled" | "unknown"; process?: Record<string, unknown> }
interface Receipt { schemaVersion: 1; projectId: string; begin: Begin; state: "prepared" | "finished" | "unknown"; finish?: Finish }
interface Owner { current(context: RuntimeContext): boolean; captureEnvironment?: EnvironmentCapture | false; maxScanFiles?: number }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const callId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const digest = /^[a-f0-9]{64}$/;
const invalid = (): never => { throw Error("NATIVE_PROVENANCE_INVALID"); };
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function parse(value: unknown): Begin | Finish {
  const row = record(value);
  if (row.schemaVersion !== 1 || typeof row.executionId !== "string" || !uuid.test(row.executionId)) return invalid();
  if (row.action === "finish") {
    if (Object.keys(row).length !== (row.process === undefined ? 6 : 7) || !Number.isFinite(row.endedAt) || Number(row.endedAt) < 0 || typeof row.isError !== "boolean" || !["completed", "failed", "cancelled", "unknown"].includes(String(row.outcome))) return invalid();
    if (row.outcome === "completed" && row.isError || row.outcome === "failed" && !row.isError) return invalid();
    if (row.process !== undefined) {
      const process = record(row.process);
      if (Object.keys(process).some(key => !["kind", "exitCode", "signal", "timedOut", "aborted", "stopped", "jobId"].includes(key)) || Buffer.byteLength(JSON.stringify(process)) > 1024 ||
        process.kind !== undefined && !["foreground", "background", "promoted"].includes(String(process.kind)) || process.exitCode !== undefined && process.exitCode !== null && !Number.isSafeInteger(process.exitCode) ||
        ["timedOut", "aborted"].some(key => process[key] !== undefined && typeof process[key] !== "boolean") || ["signal", "stopped", "jobId"].some(key => process[key] !== undefined && process[key] !== null && typeof process[key] !== "string")) return invalid();
    }
    return row as unknown as Finish;
  }
  const keys = ["schemaVersion", "action", "executionId", "rootSessionId", "actorSessionId", "parentSessionId", "rootCallId", "toolCallId", "toolName", "arguments", "argumentsSha256", "argumentsTruncated", "startedAt", "parentToolCallId"];
  if (row.action !== "begin" || Object.keys(row).some(key => !keys.includes(key)) || Object.keys(row).length < 13 ||
    typeof row.rootSessionId !== "string" || !isValidSessionId(row.rootSessionId) || typeof row.actorSessionId !== "string" || !isValidSessionId(row.actorSessionId) ||
    row.parentSessionId !== null && (typeof row.parentSessionId !== "string" || !isValidSessionId(row.parentSessionId)) ||
    typeof row.toolCallId !== "string" || !callId.test(row.toolCallId) || typeof row.rootCallId !== "string" || !callId.test(row.rootCallId) ||
    row.parentToolCallId !== undefined && row.parentToolCallId !== null && (typeof row.parentToolCallId !== "string" || !callId.test(row.parentToolCallId)) ||
    typeof row.toolName !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.toolName) || typeof row.argumentsSha256 !== "string" || !digest.test(row.argumentsSha256) ||
    typeof row.argumentsTruncated !== "boolean" || !Number.isFinite(row.startedAt) || Number(row.startedAt) < 0 || Buffer.byteLength(JSON.stringify(row.arguments)) > 8192) return invalid();
  return row as unknown as Begin;
}

/** Retain bounded parameters, excluding credential fields and embedded content/media bytes. */
export function provenanceArguments(value: unknown): { arguments: unknown; truncated: boolean } {
  let redacted = false;
  const visit = (input: unknown, depth: number): unknown => {
    if (depth > 10) { redacted = true; return "[depth limited]"; }
    if (typeof input === "string") return input.replace(/\b(Bearer\s+)[A-Za-z0-9._-]+|((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, (_match, bearer: string | undefined, label: string | undefined) => { redacted = true; return `${bearer ?? label}[redacted]`; });
    if (Array.isArray(input)) { if (input.length > 64) redacted = true; return input.slice(0, 64).map(item => visit(item, depth + 1)); }
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([key, item]) => {
      if (/(?:key|token|secret|password|authorization|cookie|credential|headers|environment|^env$|^content$|^body$|^data$|base64|^bytes$|^images?$|^audio$)/i.test(key)) { redacted = true; return [key, "[redacted]"]; }
      return [key, visit(item, depth + 1)];
    }));
    return input;
  };
  const safe = visit(value, 0), text = JSON.stringify(safe);
  if (Buffer.byteLength(text) <= 2048) return { arguments: safe, truncated: redacted };
  const safeRecord = safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, unknown> : {};
  return { arguments: { ...Object.fromEntries(["path", "file_path", "filePath", "file", "command", "text", "cwd"].filter(key => typeof safeRecord[key] === "string" && String(safeRecord[key]).length <= 1000).map(key => [key, safeRecord[key]])), truncated: true }, truncated: true };
}

function normalized(begin: Begin): { toolName: string; args: unknown } {
  const safe = provenanceArguments(begin.arguments).arguments, fields = record(safe);
  if (begin.toolName === "str_replace_editor") return { toolName: fields.command === "view" ? "read" : "edit", args: fields };
  if (begin.toolName === "read_image") return { toolName: "read", args: fields };
  if (["pwsh", "terminal_send"].includes(begin.toolName)) return { toolName: "bash", args: { ...fields, command: fields.command ?? fields.text } };
  return { toolName: begin.toolName, args: fields };
}

/** Awaited execution observer. Persisted pending calls never gain retroactive file-effect evidence. */
export class NativeProvenance {
  private readonly live = new Map<string, { context: RuntimeContext; begin: Begin; recorder: ProvenanceRecorder; finish?: Finish }>();
  private readonly recorders = new Map<string, { projectId: string; recorder: ProvenanceRecorder }>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly closedProjects = new Set<string>();
  private closed = false;
  constructor(private readonly owner: Owner) {}
  private assert(context: RuntimeContext): void {
    if (this.closed || this.closedProjects.has(context.projectId) || !this.owner.current(context)) throw Error("RESEARCH_CONTEXT_REVOKED");
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(context.projectId) || !isValidSessionId(context.sessionRef)) return invalid();
    const paths = resolvePaths(context.projectId); assertResearchPath(paths.sandbox); assertResearchPath(paths.provenanceDir); assertResearchPath(paths.environmentsDir);
  }
  private file(context: RuntimeContext, id: string): string { const file = path.join(resolvePaths(context.projectId).kadyDir, "native-provenance", id + ".json"); assertResearchPath(file); return file; }
  private read(context: RuntimeContext, id: string): Receipt | undefined {
    const file = this.file(context, id);
    try {
      if (fs.statSync(file).size > 16384) return invalid();
      const row = record(JSON.parse(fs.readFileSync(file, "utf8")));
      if (row.schemaVersion !== 1 || row.projectId !== context.projectId || !["prepared", "finished", "unknown"].includes(String(row.state))) return invalid();
      const begin = parse(row.begin); if (begin.action !== "begin" || begin.executionId !== id || begin.rootSessionId !== context.sessionRef) return invalid();
      if (row.finish !== undefined && parse(row.finish).action !== "finish") return invalid();
      return row as unknown as Receipt;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  private write(context: RuntimeContext, receipt: Receipt): void {
    this.assert(context); const file = this.file(context, receipt.begin.executionId), temporary = file + "." + randomUUID() + ".tmp";
    fs.mkdirSync(path.dirname(file), { recursive: true }); assertResearchPath(temporary);
    fs.writeFileSync(temporary, JSON.stringify(receipt) + "\n", { flag: "wx", mode: 0o600 }); this.assert(context); fs.renameSync(temporary, file);
  }
  private scopeState(context: RuntimeContext, change?: number, uncertain = false): { pending: number; uncertain: boolean } {
    const file = path.join(resolvePaths(context.projectId).kadyDir, "native-provenance", "scope-state.json"); assertResearchPath(file);
    let state = { pending: 0, uncertain: false };
    try {
      if (fs.statSync(file).size > 4096) return invalid();
      const saved = record(JSON.parse(fs.readFileSync(file, "utf8")));
      if (saved.schemaVersion !== 1 || saved.projectId !== context.projectId || !Number.isSafeInteger(saved.pending) || Number(saved.pending) < 0 || Number(saved.pending) > 20000 || typeof saved.uncertain !== "boolean") return invalid();
      state = { pending: Number(saved.pending), uncertain: saved.uncertain };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (change !== undefined) {
      this.assert(context); state = { pending: Math.max(0, state.pending + change), uncertain: state.uncertain || uncertain };
      if (state.pending > 20000) return invalid();
      fs.mkdirSync(path.dirname(file), { recursive: true }); const temporary = file + "." + randomUUID() + ".tmp"; assertResearchPath(temporary);
      fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, projectId: context.projectId, ...state }) + "\n", { flag: "wx", mode: 0o600 }); this.assert(context); fs.renameSync(temporary, file);
    }
    return state;
  }
  /** @param context - Privately admitted root/project. @param input - Host observer action, never a model tool. */
  async command(context: RuntimeContext, input: unknown): Promise<{ observed: true; state: Receipt["state"] }> {
    this.assert(context); const action = parse(input), key = JSON.stringify([context.projectId, action.executionId]);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(() => this.apply(context, action));
    this.queues.set(key, pending); void pending.finally(() => { if (this.queues.get(key) === pending) this.queues.delete(key); }).catch(() => undefined);
    return pending;
  }
  private metadata(begin: Begin, outcome?: string, process?: Record<string, unknown>): Record<string, unknown> {
    return { executionId: begin.executionId, rootSessionId: begin.rootSessionId, actorSessionId: begin.actorSessionId, parentSessionId: begin.parentSessionId,
      rootCallId: begin.rootCallId, toolCallId: begin.toolCallId, parentToolCallId: begin.parentToolCallId ?? null, toolName: begin.toolName,
      argumentsSha256: begin.argumentsSha256, argumentsTruncated: begin.argumentsTruncated, ...(outcome ? { outcome } : {}), ...(process ? { process } : {}), outcomeScope: "native-tool-dispatch",
      limitations: "File identity is observed locally. Opaque shell input edges are inferred; bounded stat scans cannot detect same-size/mtime rewrites or prove which process read a file. Environment describes the project probe, not every executable a command may select. Native Session tool/result owns final policy/cancellation outcome. Background job acceptance does not prove process completion. Model identity is not inferred from tool arguments." };
  }
  private async apply(context: RuntimeContext, action: Begin | Finish): Promise<{ observed: true; state: Receipt["state"] }> {
    this.assert(context); const key = JSON.stringify([context.projectId, action.executionId]), receipt = this.read(context, action.executionId), existing = this.live.get(key);
    if (action.action === "begin") {
      if (action.rootSessionId !== context.sessionRef || action.actorSessionId === action.rootSessionId && action.parentSessionId !== null || action.actorSessionId !== action.rootSessionId && action.parentSessionId === null) return invalid();
      if (receipt) {
        if (JSON.stringify(receipt.begin) !== JSON.stringify({ ...action, arguments: provenanceArguments(action.arguments).arguments })) return invalid();
        if (!existing || receipt.state !== "prepared") throw Error("NATIVE_PROVENANCE_EXECUTION_UNCERTAIN");
        return { observed: true, state: "prepared" };
      }
      const safe = provenanceArguments(action.arguments), begin: Begin = { ...action, arguments: safe.arguments, argumentsTruncated: action.argumentsTruncated || safe.truncated };
      const scope = this.scopeState(context);
      this.write(context, { schemaVersion: 1, projectId: context.projectId, begin, state: "prepared" });
      this.scopeState(context, 1);
      const recorderKey = JSON.stringify([context.projectId, context.sessionRef, begin.actorSessionId]);
      let recorder = this.recorders.get(recorderKey)?.recorder;
      recorder ??= new ProvenanceRecorder({ projectId: context.projectId, sessionId: begin.actorSessionId, sandboxRoot: resolvePaths(context.projectId).sandbox, getModel: () => undefined,
        captureEnvironment: this.owner.captureEnvironment, maxScanFiles: this.owner.maxScanFiles, append: step => {
          const observed = this.live.get(JSON.stringify([context.projectId, step.id.slice("native-execution:".length)]));
          if (!observed) throw Error("NATIVE_PROVENANCE_EXECUTION_UNCERTAIN");
          this.assert(observed.context); const identity = observed.begin; assertResearchPath(stepsPath(identity.actorSessionId, observed.context.projectId));
          appendNewSteps(identity.actorSessionId, [{ ...step, toolName: identity.toolName, role: identity.actorSessionId === identity.rootSessionId ? "agent" : "subagent",
            args: { nativeExecution: this.metadata(identity, observed.finish?.outcome, observed.finish?.process), parameters: identity.arguments } }], observed.context.projectId);
        } });
      this.recorders.set(recorderKey, { projectId: context.projectId, recorder });
      const peers = [...this.live.values()].filter(row => row.context.projectId === context.projectId);
      for (const peer of peers) peer.recorder.overlapObserved();
      this.live.set(key, { context, begin, recorder });
      try {
        const call = normalized(begin); await recorder.beginObserved({ id: "native-execution:" + begin.executionId, ...call, startedAt: begin.startedAt });
        if (peers.length || scope.pending > 0 || scope.uncertain) recorder.overlapObserved(); this.assert(context);
        return { observed: true, state: "prepared" };
      } catch (error) { this.live.delete(key); throw error; }
    }
    if (!receipt) return invalid();
    if (receipt.state !== "prepared") {
      if (JSON.stringify(receipt.finish) !== JSON.stringify(action)) return invalid();
      return { observed: true, state: receipt.state };
    }
    if (action.endedAt < receipt.begin.startedAt) return invalid();
    if (existing && action.outcome !== "unknown") {
      existing.finish = action;
      await existing.recorder.endObserved({ id: "native-execution:" + action.executionId, timestamp: action.endedAt, isError: action.isError }); this.assert(context);
    } else {
      const begin = receipt.begin, step: ProvenanceStep = { schemaVersion: 1, id: "native-execution:" + action.executionId, sessionId: begin.actorSessionId,
        startedAt: begin.startedAt, timestamp: action.endedAt, toolName: begin.toolName, role: begin.actorSessionId === begin.rootSessionId ? "agent" : "subagent",
        isError: true, inputs: [], outputs: [], degraded: "no-scan-baseline", args: { nativeExecution: this.metadata(begin, "unknown", action.process), parameters: begin.arguments } };
      this.assert(context); assertResearchPath(stepsPath(step.sessionId, context.projectId)); appendNewSteps(step.sessionId, [step], context.projectId);
    }
    this.live.delete(key);
    const state = existing && action.outcome !== "unknown" ? "finished" : "unknown";
    this.scopeState(context, -1, state === "unknown");
    this.write(context, { ...receipt, state, finish: action }); return { observed: true, state };
  }
  /** Revoke observations and wait for existing local work; pending receipts remain explicitly uncertain. */
  async close(projectId?: string): Promise<void> {
    if (projectId === undefined) this.closed = true; else this.closedProjects.add(projectId);
    await Promise.allSettled([...this.queues].filter(([key]) => projectId === undefined || JSON.parse(key)[0] === projectId).map(([, promise]) => promise));
    for (const [key, row] of this.live) if (projectId === undefined || row.context.projectId === projectId) this.live.delete(key);
    for (const [key, row] of this.recorders) if (projectId === undefined || row.projectId === projectId) { await row.recorder.flush(); this.recorders.delete(key); }
  }
}

interface SourceOwner {
  current(): boolean;
  /** False means an explicitly legacy Pi source; failed native membership checks must throw. */
  nativeSession(projectId: string, sessionId: string): Promise<boolean>;
  page(projectId: string, sessionId: string, cursor: { seq: number; offset: number }, endSeq: number | null): Promise<unknown>;
}
/** Native result values are read from durable tool-private metadata, never from rendered/model text. */
export class NativeScientificResultSource {
  constructor(private readonly owner: SourceOwner) {}
  /** @returns Undefined only for an explicitly Pi source; missing native cards never fall back to Pi. */
  async lookup(projectId: string, sessionId: string, ids: string[], budget: { bytes: number }): Promise<Map<string, Lookup> | undefined> {
    const all = (status: Lookup["status"], reason: string) => new Map(ids.map(id => [id, { status, reason }] as [string, Lookup]));
    const assert = () => { if (!this.owner.current()) throw Error("RESEARCH_CONTEXT_REVOKED"); };
    try {
      assert(); if (!await this.owner.nativeSession(projectId, sessionId)) return undefined; assert();
      if (!isValidSessionId(sessionId) || ids.length > 12 || ids.some(id => !callId.test(id))) return all("unverified", "Invalid native result reference");
      let cursor = { seq: -1, offset: 0 }, endSeq: number | null = null, pending = "", skipping = false, incomplete = false, header = false, expectedSeq = 0;
      const decoder = new StringDecoder("utf8"), names = new Map<string, string>(), matches = new Map<string, Lookup>(), wanted = new Set(ids);
      const consume = (text: string) => {
        if (!text.trim()) return;
        let row: Record<string, unknown>; try { row = record(JSON.parse(text)); } catch { incomplete = true; return; }
        if (row.type === "native-session/header") {
          const identity = record(row.header); if (header || row.schemaVersion !== 1 || row.nativeSessionId !== sessionId || identity.id !== sessionId) return invalid(); header = true; return;
        }
        if (!header || row.seq !== expectedSeq++) return invalid();
        const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
        const namedCall = row.type === "tool/call" ? data.callId : row.type === "tool/ptc-dispatch-start" ? data.subCallId : undefined;
        if (typeof namedCall === "string" && typeof data.name === "string" && wanted.has(namedCall)) {
          const old = names.get(namedCall); if (old && old !== data.name) incomplete = true; names.set(namedCall, data.name); return;
        }
        if (row.type !== "tool/result" && row.type !== "tool/ptc-dispatch") return;
        const message = row.type === "tool/ptc-dispatch" && data.name === "scientific_result" ? { role: "tool", toolCallId: data.subCallId, isError: data.isError } : data.message && typeof data.message === "object" ? data.message as Record<string, unknown> : {};
        if (message.role !== "tool" || typeof message.toolCallId !== "string" || !wanted.has(message.toolCallId) || names.get(message.toolCallId) !== "scientific_result" || message.isError !== false) return;
        const card = scientificResultFromDetails(data.meta);
        if (!card) { incomplete = true; return; }
        const sha256 = planDigest(card), old = matches.get(message.toolCallId);
        if (old && old.sha256 !== sha256) matches.set(message.toolCallId, { status: "ambiguous", reason: "Multiple different native saved results use this tool-call id" });
        else if (!old) matches.set(message.toolCallId, { status: "available", card, sha256 });
      };
      for (let pageCount = 0; pageCount < 4096; pageCount++) {
        assert(); const page = record(await this.owner.page(projectId, sessionId, cursor, endSeq)); assert();
        if (page.nativeSessionId !== sessionId || !Number.isSafeInteger(page.endSeq) || Number(page.endSeq) < -1 || endSeq !== null && page.endSeq !== endSeq ||
          typeof page.dataBase64 !== "string" || page.dataBase64.length > 262144 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(page.dataBase64) || typeof page.sha256 !== "string" || !digest.test(page.sha256)) return invalid();
        const bytes = Buffer.from(page.dataBase64, "base64"); if (createHash("sha256").update(bytes).digest("hex") !== page.sha256) return invalid();
        if (bytes.length > budget.bytes) return all("unverified", "Native session scan budget exceeded; result uniqueness was not verified"); budget.bytes -= bytes.length; endSeq = Number(page.endSeq);
        const pieces = decoder.write(bytes).split("\n");
        for (let index = 0; index < pieces.length; index++) {
          if (!skipping) { pending += pieces[index]; if (pending.length > 256 * 1024) { pending = ""; skipping = true; incomplete = true; } }
          if (index < pieces.length - 1) { if (!skipping) consume(pending); else expectedSeq++; pending = ""; skipping = false; }
        }
        if (page.next === undefined) {
          pending += decoder.end(); if (pending.trim() || !header || expectedSeq !== endSeq + 1) incomplete = true;
          return new Map(ids.map(id => {
            const match = matches.get(id);
            if (match?.status === "ambiguous") return [id, match];
            if (incomplete) return [id, { ...match, status: "unverified", reason: "Native journal contains oversized, missing or incomplete rows; result uniqueness was not fully verified" }];
            return [id, match ?? { status: "missing", reason: "No successful persisted native scientific_result metadata with this id" }];
          }));
        }
        const next = record(page.next);
        if (Object.keys(next).length !== 2 || !Number.isSafeInteger(next.seq) || !Number.isSafeInteger(next.offset) || Number(next.offset) < 0 || Number(next.seq) < cursor.seq || Number(next.seq) > endSeq || Number(next.seq) === cursor.seq && Number(next.offset) <= cursor.offset || bytes.length === 0) return invalid();
        cursor = { seq: Number(next.seq), offset: Number(next.offset) };
      }
      return all("unverified", "Native journal page limit exceeded");
    } catch { return all("unverified", "Native canonical result source could not be verified safely"); }
  }
}
