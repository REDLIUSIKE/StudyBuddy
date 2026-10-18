import type { ResearchAction, ResearchEvent, ResearchRun, ResearchRuntime, RuntimeCapabilities, RuntimeContext } from "./contracts.ts";
import { operationId, parseHostAction, parseHostCapabilities, parseHostEvent, parseHostRun } from "./actions.ts";

export interface ResearchHostTransport {
  current(context: RuntimeContext): boolean;
  invoke(context: RuntimeContext, operation: "capabilities" | "submit" | "inspect" | "cancel" | "answer", input: unknown, signal: AbortSignal): Promise<unknown>;
  events(context: RuntimeContext, runId: string): AsyncIterable<unknown>;
}
interface Submission { signature: string; promise: Promise<ResearchRun> }
function disconnected(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "RESEARCH_TRANSPORT_DISCONNECTED";
}

/** Host-only transport. It never imports Pi or provider credentials. */
class HostRuntime implements ResearchRuntime {
  private readonly submissions = new Map<string, Submission>();
  private readonly context: RuntimeContext;
  constructor(context: RuntimeContext, private readonly transport: ResearchHostTransport) {
    if (!context.projectId || !context.sessionRef || context.hostBinding === undefined || context.hostBinding === null) throw Error("RESEARCH_HOST_REQUIRED");
    this.context = Object.freeze({ ...context });
    this.assertCurrent(context);
  }
  private assertCurrent(context: RuntimeContext): void {
    if (context.projectId !== this.context.projectId || context.sessionRef !== this.context.sessionRef || context.hostBinding !== this.context.hostBinding || !this.transport.current(this.context)) {
      throw Error("RESEARCH_CONTEXT_REVOKED");
    }
  }
  private async call(context: RuntimeContext, operation: Parameters<ResearchHostTransport["invoke"]>[1], input: unknown, signal: AbortSignal): Promise<unknown> {
    this.assertCurrent(context);
    signal.throwIfAborted();
    const result = await this.transport.invoke(this.context, operation, input, signal);
    this.assertCurrent(context);
    return result;
  }
  async capabilities(context: RuntimeContext): Promise<RuntimeCapabilities> {
    return parseHostCapabilities(await this.call(context, "capabilities", null, new AbortController().signal));
  }
  async submit(context: RuntimeContext, value: ResearchAction, signal: AbortSignal): Promise<ResearchRun> {
    this.assertCurrent(context);
    signal.throwIfAborted();
    const action = parseHostAction(value);
    const signature = JSON.stringify(action);
    const existing = this.submissions.get(action.operationId);
    if (existing) {
      if (existing.signature !== signature) throw Error("RESEARCH_OPERATION_CONFLICT");
      const run = await existing.promise;
      this.assertCurrent(context);
      return run;
    }
    const promise = Promise.resolve().then(async (): Promise<ResearchRun> => {
      try { return parseHostRun(await this.call(context, "submit", action, signal), action.operationId); }
      catch (error) {
        this.assertCurrent(context);
        // An uncertain transport is a queryable operation, never permission
        // to start the same paid helper a second time.
        if (disconnected(error)) return { runId: action.operationId, state: "unknown" };
        throw error;
      }
    });
    this.submissions.set(action.operationId, { signature, promise });
    return promise;
  }
  async inspect(context: RuntimeContext, runId: string): Promise<ResearchRun> {
    operationId(runId);
    return parseHostRun(await this.call(context, "inspect", { runId }, new AbortController().signal), runId);
  }
  async cancel(context: RuntimeContext, runId: string): Promise<ResearchRun> {
    operationId(runId);
    return parseHostRun(await this.call(context, "cancel", { runId }, new AbortController().signal), runId);
  }
  async answer(context: RuntimeContext, interactionId: string, answer: unknown): Promise<void> {
    if (!interactionId) throw Error("RESEARCH_ACTION_INVALID");
    await this.call(context, "answer", { interactionId, answer }, new AbortController().signal);
  }
  async *events(context: RuntimeContext, runId: string): AsyncIterable<ResearchEvent> {
    this.assertCurrent(context);
    operationId(runId);
    const seen = new Set<string>();
    for await (const value of this.transport.events(this.context, runId)) {
      this.assertCurrent(context);
      const event = parseHostEvent(value, this.context.projectId, this.context.sessionRef, runId);
      if (seen.has(event.eventId)) continue;
      seen.add(event.eventId);
      yield event;
    }
  }
}

export function createHostRuntime(context: RuntimeContext, transport: ResearchHostTransport): ResearchRuntime {
  return new HostRuntime(context, transport);
}
