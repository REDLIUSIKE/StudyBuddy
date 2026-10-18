/** Scientific validation and writes stay in K-Dense; execution/accounting stay in native Harness. */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildAssistContext, validateAssistRequest, type AssistRequest } from "../latex/assist.ts";
import { buildMethodsDraftContext, methodsDraftMarkdown, prepareMethodsDraftSource } from "../agent/methods-draft.ts";
import { resolvePaths, touchProject } from "../projects.ts";
import { safePath } from "../sandbox-fs.ts";
import { assertResearchPath } from "./project-storage.ts";
import { prepareNativeHelperAction } from "./helper-action.ts";
import { parseLatexAssistDecision } from "../../../web/src/lib/latex/assist-result.ts";
import type { ResearchAction, ResearchRuntime, RuntimeContext } from "./contracts.ts";
import { generateNextExperiments } from "../agent/next-experiments.ts";

interface Owner {
  project(projectId: string): Promise<{ context: RuntimeContext; runtime: ResearchRuntime }>;
  current(context: RuntimeContext): boolean;
}
interface NativeHelperResult { text: string; nativeRunId: string; nativeSessionId: string; accounting: "native-ledger" }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type ScientificContext = Parameters<typeof prepareNativeHelperAction>[2];
/** One explicit helper operation has one durable intent; an uncertain intent is never repeated. */
export class NativeScientificHelpers {
  private readonly pending = new Map<string, { signature: string; result: Promise<NativeHelperResult> }>();
  constructor(private readonly owner: Owner) {}
  private assert(context: RuntimeContext): void { if (!this.owner.current(context)) throw Error("RESEARCH_CONTEXT_REVOKED"); }
  private operation(input: unknown, allowed: readonly string[]): string {
    if (!input || typeof input !== "object" || !("operationId" in input) || typeof input.operationId !== "string" || !uuid.test(input.operationId)) throw Error("NATIVE_HELPER_OPERATION_REQUIRED");
    if ("model" in input && input.model !== undefined) throw Error("NATIVE_MODEL_CONTROL_REQUIRED");
    if (Object.keys(input).some(key => !allowed.includes(key))) throw Error("NATIVE_HELPER_INPUT_INVALID");
    return input.operationId;
  }
  private execute(context: RuntimeContext, runtime: ResearchRuntime, action: ResearchAction): Promise<NativeHelperResult> {
    this.assert(context);
    const key = JSON.stringify([context.projectId, action.operationId]);
    const signature = JSON.stringify(action), existing = this.pending.get(key);
    if (existing) return existing.signature === signature ? existing.result : Promise.reject(Error("NATIVE_HELPER_OPERATION_CONFLICT"));
    const result = this.run(context, runtime, action).finally(() => { this.pending.delete(key); });
    this.pending.set(key, { signature, result }); return result;
  }
  private async run(context: RuntimeContext, runtime: ResearchRuntime, action: ResearchAction): Promise<NativeHelperResult> {
    const directory = path.join(resolvePaths(context.projectId).kadyDir, "native-helpers"), file = path.join(directory, action.operationId + ".json");
    assertResearchPath(directory); fs.mkdirSync(directory, { recursive: true }); assertResearchPath(file); this.assert(context);
    const signature = JSON.stringify(action);
    let previous: unknown;
    try { if (fs.statSync(file).size > 512 * 1024) throw Error("NATIVE_HELPER_RECEIPT_INVALID"); previous = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (previous !== undefined) {
      if (!previous || typeof previous !== "object" || !("signature" in previous) || previous.signature !== signature) throw Error("NATIVE_HELPER_OPERATION_CONFLICT");
      if ("state" in previous && previous.state === "completed" && "result" in previous) return this.result(previous.result, action.operationId);
      throw Error("NATIVE_HELPER_OUTCOME_UNCONFIRMED");
    }
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, signature, state: "admitting" }) + "\n", { flag: "wx", mode: 0o600 });
    this.assert(context);
    let run = await runtime.submit(context, action, new AbortController().signal); this.assert(context);
    // Observing the same operation is free of resubmission, including transport uncertainty.
    const deadline = Date.now() + 120000;
    while (["queued", "running"].includes(run.state) && Date.now() < deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, 150)); this.assert(context);
      run = await runtime.inspect(context, action.operationId); this.assert(context);
    }
    if (run.state !== "completed" || run.result?.kind !== "message") throw Error(run.state === "failed" ? "NATIVE_HELPER_FAILED" : "NATIVE_HELPER_OUTCOME_UNCONFIRMED");
    const value = this.result(run.result.value, action.operationId); this.assert(context); assertResearchPath(file);
    const temporary = file + "." + randomUUID() + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: 1, signature, state: "completed", result: value }) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file); return value;
  }
  private result(value: unknown, operationId: string): NativeHelperResult {
    if (!value || typeof value !== "object" || !("text" in value) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 131072 ||
      !("nativeSessionId" in value) || typeof value.nativeSessionId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value.nativeSessionId)) throw Error("NATIVE_HELPER_RESULT_INVALID");
    return { text: value.text, nativeSessionId: value.nativeSessionId, nativeRunId: operationId, accounting: "native-ledger" };
  }
  async latexAssist(value: unknown, projectId: string) {
    const operationId = this.operation(value, ["operationId", "mode", "fileName", "preamble", "error", "context", "instruction", "selection"]), request = value as AssistRequest;
    validateAssistRequest(request);
    const { context, runtime } = await this.owner.project(projectId); this.assert(context);
    if (context.projectId !== projectId) throw Error("RESEARCH_CONTEXT_REVOKED");
    const completed = await this.execute(context, runtime, prepareNativeHelperAction(operationId, "latex-assist", buildAssistContext(request)));
    const decision = parseLatexAssistDecision(completed.text);
    if (!decision || (request.mode === "fix" && decision.status === "replacement" && !decision.replacement.trim())) throw Error("NATIVE_HELPER_RESULT_INVALID");
    const { text: _text, ...receipt } = completed;
    return { ...decision, ...receipt };
  }
  async methodsDraft(sessionId: string, projectId: string, input: unknown) {
    const operationId = this.operation(input, ["operationId"]), { context, runtime } = await this.owner.project(projectId); this.assert(context);
    if (context.projectId !== projectId) throw Error("RESEARCH_CONTEXT_REVOKED");
    if (sessionId !== context.sessionRef) throw Error("RESEARCH_SESSION_NOT_OWNED");
    const source = await prepareMethodsDraftSource(sessionId, projectId); this.assert(context);
    const completed = await this.execute(context, runtime, prepareNativeHelperAction(operationId, "methods-draft", buildMethodsDraftContext(source.entries, { sessionId, projectName: source.projectName })));
    this.assert(context);
    const markdown = methodsDraftMarkdown(completed.text);
    if (!markdown.trim()) throw Error("NATIVE_HELPER_RESULT_INVALID");
    const name = `methods_draft_${sessionId}.md`, target = safePath(name, resolvePaths(projectId).sandbox);
    assertResearchPath(target); this.assert(context); fs.writeFileSync(target, markdown + "\n", "utf8"); touchProject(projectId);
    const { text: _text, ...receipt } = completed; return { path: name, markdown, ...receipt };
  }
  async nextExperiments(projectId: string, source: { sessionId: string; entryId: string }, input: unknown) {
    const { context, runtime } = await this.owner.project(projectId); this.assert(context);
    if (context.projectId !== projectId || context.sessionRef !== source.sessionId) throw Error("RESEARCH_SESSION_NOT_OWNED");
    return generateNextExperiments(projectId, source, input, undefined, {
      current: () => this.owner.current(context),
      complete: async (scientificContext, requestId) => this.execute(context, runtime, prepareNativeHelperAction(requestId, "next-experiments", scientificContext)),
    });
  }
}
