/** The managed child only relays closed actions over its owner's private stdio. */
import { randomUUID } from "node:crypto";
import { createHostRuntime, type ResearchHostTransport } from "./host-runtime.ts";
import type { ResearchRuntime, RuntimeContext } from "./contracts.ts";

export interface NativeChannel {
  current(): boolean;
  request(projectId: string, operation: string, input: unknown, signal: AbortSignal, sessionId?: string): Promise<unknown>;
  events(projectId: string, runId: string): AsyncIterable<unknown>;
}

/** Private project bindings never come from browser-supplied Session/model IDs. */
export class ManagedResearchRuntime {
  private readonly rows = new Map<string, { context: RuntimeContext; runtime: ResearchRuntime }>();
  private readonly pending = new Map<string, Promise<RuntimeContext>>();
  constructor(private readonly channel: NativeChannel) {}
  bind(projectId: string): Promise<RuntimeContext> {
    if (!this.channel.current()) return Promise.reject(Error("RESEARCH_CONTEXT_REVOKED"));
    const waiting = this.pending.get(projectId);
    if (waiting) return waiting;
    const promise = this.admit(projectId).finally(() => { this.pending.delete(projectId); });
    this.pending.set(projectId, promise);
    return promise;
  }
  private async admit(projectId: string): Promise<RuntimeContext> {
    const binding: unknown = await this.channel.request(projectId, "bind", null, new AbortController().signal);
    if (!binding || typeof binding !== "object" || !("projectId" in binding) || binding.projectId !== projectId || !("sessionId" in binding) || typeof binding.sessionId !== "string" || !binding.sessionId || !this.channel.current()) throw Error("RESEARCH_HOST_BINDING_INVALID");
    const key = JSON.stringify([projectId, binding.sessionId]), previous = this.rows.get(key);
    if (previous) return previous.context;
    const context = Object.freeze({ projectId, sessionRef: binding.sessionId, hostBinding: Object.freeze({ nonce: randomUUID() }) });
    const transport: ResearchHostTransport = {
      current: candidate => {
        const row = this.rows.get(key);
        return this.channel.current() && row?.context.projectId === candidate.projectId && row.context.sessionRef === candidate.sessionRef && row.context.hostBinding === candidate.hostBinding;
      },
      invoke: (_context, operation, input, signal) => this.channel.request(projectId, operation, input, signal, context.sessionRef),
      events: (_context, runId) => this.channel.events(projectId, runId),
    };
    // Install ownership before the host-runtime constructor checks it.
    const row = { context, runtime: undefined as unknown as ResearchRuntime };
    this.rows.set(key, row);
    row.runtime = createHostRuntime(context, transport);
    return context;
  }
  forContext(context: RuntimeContext): ResearchRuntime {
    const row = this.rows.get(JSON.stringify([context.projectId, context.sessionRef]));
    if (!row || row.context !== context || !this.channel.current()) throw Error("RESEARCH_CONTEXT_REVOKED");
    return row.runtime;
  }
  current(context: RuntimeContext): boolean { return this.channel.current() && this.rows.get(JSON.stringify([context.projectId, context.sessionRef]))?.context === context; }
  revoke(): void { this.rows.clear(); }
}
