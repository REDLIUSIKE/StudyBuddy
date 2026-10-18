import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createAgentToolContext } from "@/agent/tools";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { listTools, loadTool, validateToolConfig } from "@/utils/plugins/tools";
import { browserRuntime } from "@/utils/browser";
import { admitWorkspace } from "@/utils/studyBuddy/policy";
import { runOwnedWork } from "@/utils/studyBuddy/jobs";
import { fileCoordinator } from "@/embedded/filePolicy";
import { invokeNative } from "@/embedded/native";
import { toolSchema } from "@/embedded/toolSchema";
import { aiReferenceSchema, readAiReferences } from "@/utils/ai";
import type { SingleAgentEvent, SingleAgentToolDescriptor, SingleAgentToolReference } from "@/utils/singleAgent/types";
interface Session { directory: string; workspace: boolean; nativeSessionId: string; definitions: Map<string, ToolDefinition>; client: Set<string>; active?: { runId: string; controller: AbortController }; callbacks: Map<string, { name: string; arguments: unknown }> }
const sessions = new Map<string, Session>();
const openResult = z.strictObject({ sessionId: z.uuid(), nativeSessionId: z.string(), directory: z.string() });
const eventSchema = z.looseObject({ type: z.string() });
const native = (input: unknown, signal?: AbortSignal) => invokeNative("temporary", input, signal);
const get = (id: string) => { const row = sessions.get(id); if (!row) throw new Error("AIGC_TEMPORARY_REVOKED"); return row; };

export async function create(options: { tools: (SingleAgentToolReference | SingleAgentToolDescriptor)[]; directory?: string; systemPrompt?: string }, signal?: AbortSignal) {
  signal?.throwIfAborted(); if (sessions.size >= 32) throw new Error("AIGC_TEMPORARY_LIMIT");
  const id = randomUUID(), directory = options.directory ? await admitWorkspace(options.directory) : undefined;
  // Build the tools only after Main supplies the exact private cwd. Tool execution waits for open to finish.
  const installed = new Map((await listTools()).map(item => [item.name, item]));
  const selected: { plugin?: string; definitions: ToolDefinition[]; client: boolean }[] = [];
  for (const reference of options.tools) {
    if (typeof reference !== "string" && "name" in reference) { toolSchema(reference.parameters); selected.push({ definitions: [{ ...reference, label: reference.label ?? reference.name, execute: async () => { throw new Error("AIGC_CLIENT_CALLBACK_REQUIRED"); } }], client: true }); continue; }
    const name = typeof reference === "string" ? reference : reference.plugin, item = installed.get(name);
    if (!item?.enabled || item.loadError) throw new Error("AIGC_TOOL_UNAVAILABLE: " + name);
    selected.push({ plugin: name, definitions: [], client: false });
  }
  let row: Session | undefined;
  const buildDefinitions = async (cwd: string) => {
    const context = createAgentToolContext(cwd, {}, undefined, { ask: (callId, question, callSignal) => invokeNative("question", {
      directory: cwd, sessionId: row?.nativeSessionId ?? "session-" + id, callId, question }, callSignal ?? new AbortController().signal).then(value =>
      z.object({ answer: z.string(), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(), skipped: z.boolean().optional() }).parse(value)) }, !!directory,
    directory ? fileCoordinator(directory) : undefined);
    const definitions = new Map<string, ToolDefinition>(), client = new Set<string>();
    for (let index = 0; index < selected.length; index++) {
      const item = selected[index]!, reference = options.tools[index]!;
      if (item.plugin) {
        const { plugin, metadata } = await loadTool(item.plugin);
        const names = typeof reference === "object" && "plugin" in reference ? reference.names : undefined;
        const all = await plugin.createTools({ ...context, config: validateToolConfig(plugin, installed.get(item.plugin)!.config) });
        if (names?.some(name => !all.some(tool => tool.name === name))) throw new Error("AIGC_TOOL_UNAVAILABLE");
        item.definitions = all.filter(tool => !names || names.includes(tool.name)).map(tool => ({ ...tool, promptGuidelines: [...(metadata.prompt ? [metadata.prompt] : []), ...tool.promptGuidelines ?? []] }));
      }
      for (const tool of item.definitions) {
        if (definitions.has(tool.name)) throw new Error("AIGC_TOOL_CONTRACT_INVALID"); toolSchema(tool.parameters);
        definitions.set(tool.name, tool); if (item.client) client.add(tool.name);
      }
    }
    return { definitions, client };
  };
  // The unpublished helper root matches Main's account-owned root; no client can choose it.
  const cwd = directory ?? (await import("node:path")).join((await import("node:path")).dirname((await import("@/utils/conf")).default.path), "native-helpers");
  const tools = await buildDefinitions(cwd);
  const result = openResult.parse(await native({ action: "open", id, ...(directory ? { directory } : {}), systemPrompt: options.systemPrompt ?? "请根据用户要求完成当前任务，按需使用提供的工具。",
    tools: [...tools.definitions.values()].map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters, executionMode: tool.executionMode ?? "sequential", promptGuidelines: tool.promptGuidelines ?? [] })) }, signal));
  if (result.sessionId !== id || result.directory !== cwd) throw new Error("AIGC_TEMPORARY_INVALID");
  row = { directory: cwd, workspace: !!directory, nativeSessionId: result.nativeSessionId, ...tools, callbacks: new Map() };
  sessions.set(id, row); return { sessionId: id };
}

export async function run(options: { sessionId: string; runId: string; prompt: string; providerId: string; modelId: string; thinkingLevel?: string; references?: unknown[] }, send: (event: SingleAgentEvent) => void, signal?: AbortSignal, onStart?: () => void) {
  return runOwnedWork(signal, async owned => {
    const row = get(options.sessionId); if (row.active) throw new Error("AIGC_RUN_IN_PROGRESS");
    const controller = new AbortController(), combined = AbortSignal.any([owned, controller.signal]); row.active = { runId: options.runId, controller };
    const calls = new Set<Promise<void>>(); let cursor = 0;
    try {
      await native({ action: "start", id: options.sessionId, runId: options.runId, prompt: options.prompt, providerId: options.providerId, modelId: options.modelId,
        ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}), references: await readAiReferences(row.workspace ? row.directory : undefined, z.array(aiReferenceSchema).max(32).parse(options.references ?? []), combined) }, combined);
      onStart?.();
      for (;;) {
        const batch = z.strictObject({ cursor: z.number().int().nonnegative(), events: z.array(eventSchema), finished: z.boolean() }).parse(await native({ action: "poll", id: options.sessionId, runId: options.runId, cursor }, combined));
        if (batch.cursor < cursor) throw new Error("AIGC_EVENT_CURSOR_INVALID"); cursor = batch.cursor;
        for (const event of batch.events) {
          if (event.type !== "clientTool") { send(event as SingleAgentEvent); continue; }
          const call = z.looseObject({ type: z.literal("clientTool"), callId: z.uuid(), toolCallId: z.string(), name: z.string(), args: z.record(z.string(), z.json()) }).parse(event);
          const tool = row.definitions.get(call.name); if (!tool) throw new Error("AIGC_TOOL_UNAVAILABLE");
          try { toolSchema(tool.parameters).validate(call.args); }
          catch (error) { await native({ action: "result", id: options.sessionId, callId: call.callId, result: { error: String(error).slice(0, 20000) } }, combined); continue; }
          row.callbacks.set(call.callId, { name: call.name, arguments: call.args });
          if (row.client.has(call.name)) { send(call); continue; }
          const task = (async () => {
            let updates = Promise.resolve();
            try {
              const context = { cwd: row.directory, mode: "rpc", hasUI: false, signal: combined, model: undefined, sessionManager: Object.freeze({ getSessionId: () => row.nativeSessionId }) };
              const result = await Reflect.apply(tool.execute, tool, [call.toolCallId, call.args, combined, (result: unknown) => {
                updates = updates.then(() => toolResult(options.sessionId, call.callId, { partial: true, result })).then(() => {});
                void updates.catch(() => { controller.abort(); });
              }, context]);
              await updates;
              await toolResult(options.sessionId, call.callId, { result });
            } catch (error) { if (!combined.aborted) await toolResult(options.sessionId, call.callId, { error: error instanceof Error ? error.message : "AIGC_TOOL_FAILED" }); }
          })(); calls.add(task); void task.catch(() => { controller.abort(); }).finally(() => { calls.delete(task); });
        }
        if (batch.finished) break;
      }
      await Promise.all(calls);
    } finally {
      controller.abort(); row.callbacks.clear();
      await native({ action: "control", id: options.sessionId, control: "stop", runId: options.runId }).catch(() => {});
      await Promise.allSettled(calls); delete row.active;
    }
  });
}
export async function toolResult(id: string, callId: string, value: unknown) {
  const row = get(id); if (!row.callbacks.has(callId)) throw new Error("AIGC_TOOL_CALLBACK_EXPIRED");
  if (!(value && typeof value === "object" && "partial" in value && value.partial)) row.callbacks.delete(callId);
  return native({ action: "result", id, callId, result: value }, row.active?.controller.signal);
}
export async function control(id: string, action: "pause" | "resume" | "stop" | "close", runId?: string) {
  if (action === "close") { await close(id); return { status: "idle" as const }; }
  const row = get(id), result = await native({ action: "control", id, control: action, ...(runId ? { runId } : {}) });
  if (action === "stop") row.active?.controller.abort(); return result;
}
export function answer() { throw new Error("AIGC_ANSWER_USE_NATIVE_CONVERSATION"); }
export async function close(id: string) {
  const row = sessions.get(id); if (!row) return;
  row.active?.controller.abort();
  try { await native({ action: "control", id, control: "close" }); }
  finally { await browserRuntime.closeOwner(row.directory, row.nativeSessionId); sessions.delete(id); }
}
export function getBrowserScope(id: string, browserSessionId: string) {
  const row = get(id); if (!browserRuntime.hasOwner(row.directory, row.nativeSessionId, browserSessionId)) throw new Error("AIGC_BROWSER_NOT_OWNED"); return row.directory;
}
export function assertWorkspaceBrowserAccess(browserSessionId: string) {
  for (const row of sessions.values()) if (browserRuntime.hasOwner(row.directory, row.nativeSessionId, browserSessionId)) throw new Error("AIGC_BROWSER_TEMPORARY_ONLY");
}
export async function closeAll() { await Promise.allSettled([...sessions.keys()].map(close)); }
