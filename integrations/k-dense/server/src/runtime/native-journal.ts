/** Persist observed native event references without inventing scientific execution or billing. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePaths } from "../projects.ts";
import { appendNewNotebookEntries, isValidSessionId, type NotebookEntry } from "../agent/notebook-store.ts";
import { assertResearchPath } from "./project-storage.ts";
import type { RuntimeContext } from "./contracts.ts";
import {appendNewSteps,stepsPath,type ProvenanceStep} from '../provenance/store.ts';
interface Owner { current(context: RuntimeContext): boolean; read(context: RuntimeContext, afterSeq: number): Promise<unknown> }
interface Record { eventId: string; nativeSessionId: string; seq: number; time: string | number; kind: string; payloadSample: string; payloadSha256: string; truncated: boolean }

/** Notebook append precedes cursor commit; replay deduplicates on native event identity. */
export class NativeJournalImporter {
  private readonly pending = new Map<string, Promise<void>>();
  constructor(private readonly owner: Owner) {}
  refresh(context: RuntimeContext): Promise<void> {
    const key = JSON.stringify([context.projectId, context.sessionRef]), existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.adopt(context).finally(() => { this.pending.delete(key); }); this.pending.set(key, request); return request;
  }
  private assert(context: RuntimeContext): void { if (!this.owner.current(context)) throw Error("RESEARCH_CONTEXT_REVOKED"); }
  private async adopt(context: RuntimeContext): Promise<void> {
    this.assert(context);
    if (!isValidSessionId(context.sessionRef)) throw Error("NATIVE_JOURNAL_INVALID");
    const directory = path.join(resolvePaths(context.projectId).kadyDir, "native-events"), file = path.join(directory, context.sessionRef + ".json");
    assertResearchPath(file); let after = -1;
    try {
      if (fs.statSync(file).size > 4096) throw Error("NATIVE_JOURNAL_INVALID");
      const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { schemaVersion?: unknown; afterSeq?: unknown; nativeSessionId?: unknown };
      if (saved.schemaVersion !== 1 || saved.nativeSessionId !== context.sessionRef || !Number.isSafeInteger(saved.afterSeq) || Number(saved.afterSeq) < -1) throw Error("NATIVE_JOURNAL_INVALID");
      after = Number(saved.afterSeq);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const data = await this.owner.read(context, after); this.assert(context);
    if (!data || typeof data !== "object" || !("projectId" in data) || data.projectId !== context.projectId || !("nativeSessionId" in data) || data.nativeSessionId !== context.sessionRef ||
      !("records" in data) || !Array.isArray(data.records) || data.records.length > 32) throw Error("NATIVE_JOURNAL_INVALID");
    const records: Record[] = [];
    for (const value of data.records) {
      if (!value || typeof value !== "object" || value.nativeSessionId !== context.sessionRef || !Number.isSafeInteger(value.seq) || value.seq <= after || value.eventId !== `${context.sessionRef}:${value.seq}` ||
        typeof value.kind !== "string" || value.kind.length > 128 || typeof value.payloadSample !== "string" || value.payloadSample.length > 8192 || !/^[a-f0-9]{64}$/.test(value.payloadSha256) ||
        typeof value.truncated !== "boolean" || !Number.isFinite(new Date(value.time).getTime())) throw Error("NATIVE_JOURNAL_INVALID");
      after = value.seq; records.push(value as Record);
    }
    const entries: NotebookEntry[] = records.map(record => ({ id: `native:${record.eventId}`, type: record.kind === "tool/result" ? "observation" : "note",
      role: record.kind === "user/message" ? "user" : "agent", title: `Native ${record.kind}`, timestamp: new Date(record.time).getTime(),
      body: `Native event ${record.eventId}; Session ${record.nativeSessionId}.\nPayload SHA-256: ${record.payloadSha256}\n${record.truncated ? "Bounded excerpt; full payload remains in the native Session journal." : "Native event payload:"}\n\n${record.payloadSample}`,
      limitations: ["This is an observed native event, not independent scientific verification. Model prose is an authored claim. A reported tool result alone does not establish successful research execution."] }));
    if (!entries.length) return;
    const paths = resolvePaths(context.projectId);
    assertResearchPath(paths.notebookDir); assertResearchPath(directory); this.assert(context);
    appendNewNotebookEntries(context.sessionRef, entries, context.projectId);
    const steps:ProvenanceStep[]=records.filter(record=>record.kind==='tool/call'||record.kind==='tool/result').map(record=>({schemaVersion:1,id:'native:'+record.eventId,sessionId:context.sessionRef,timestamp:new Date(record.time).getTime(),toolName:'native:'+record.kind,role:'agent',inputs:[],outputs:[],degraded:'no-scan-baseline',native:{sessionId:record.nativeSessionId,seq:record.seq,kind:record.kind,payloadSha256:record.payloadSha256,truncated:record.truncated},args:{journalEvent:record.eventId,historyOnly:true,limitations:'Observed historical journal record. Current files and environment are never scanned to invent past execution effects. Live artifact/environment observations are separate native-execution records; scientific correctness and exact model remain separately verified facts.'}}));
    assertResearchPath(stepsPath(context.sessionRef,context.projectId));this.assert(context);appendNewSteps(context.sessionRef,steps,context.projectId);
    fs.mkdirSync(directory, { recursive: true }); assertResearchPath(file); this.assert(context);
    const temporary = file + "." + randomUUID() + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, nativeSessionId: context.sessionRef, afterSeq: after }) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  }
}
