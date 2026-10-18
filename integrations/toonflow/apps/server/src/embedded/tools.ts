import { z } from "zod";
import { createAgentTools } from "@/agent/tools";
import { getConnection, listConnections, queuedControl as callControl } from "@/utils/mcp/control";
import { admitWorkspace } from "@/utils/studyBuddy/policy";
import { runOwnedWork } from "@/utils/studyBuddy/jobs";
import { invokeNative,withNativeCaller } from "./native";
import type { CanvasContext } from "@toonflow/tools-scaffold/runtime";
import { fileCoordinator } from "./filePolicy";
import { toolSchema } from "./toolSchema";
import { createMemoryTool } from "@/agent/tools/memory";
import { isMemoryEnabled } from "@/utils/personalization";
import { createHash } from "node:crypto";
import { nativeResources } from "./resources";
import { documentTools } from "./documentTools";
import { nativePluginError } from "@/utils/plugins/nativeError";

const requestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("state") }),
  z.strictObject({ operation: z.literal("resources"), directory: z.string(), sessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/) }),
  z.strictObject({ operation: z.literal("catalog"), directory: z.string(), sessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/) }),
  z.strictObject({ operation: z.literal("execute"), directory: z.string(), sessionId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
    nativeCaller:z.strictObject({sessionId:z.string(),callId:z.string(),directory:z.string(),grantRef:z.string().uuid()}).optional(),
    name: z.string().min(1).max(128), callId: z.string().min(1).max(256), arguments: z.record(z.string(), z.json()),
    schemaSha256: z.string().regex(/^[a-f0-9]{64}$/),
    canvasId: z.string().nullable(), expectedRevision: z.number().int().nonnegative() }),
]);
const resultSchema = z.looseObject({ content: z.array(z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() }),
])), details: z.json().optional() });
const reads = new Set(["read", "ls", "getCanvas", "findCanvasNodes", "getCanvasNodes", "getCanvasEdges", "getNodeTools", "getDocument"]);
const queues = new Map<string, Promise<unknown>>();

export async function invokeTools(input: unknown, signal: AbortSignal): Promise<unknown> {
  const request = requestSchema.parse(input); signal.throwIfAborted();
  if (request.operation !== "execute" || reads.has(request.name)) return invokeOperation(request, signal);
  const task = (queues.get(request.directory) ?? Promise.resolve()).catch(() => {}).then(() => { signal.throwIfAborted(); return invokeOperation(request, signal); });
  queues.set(request.directory, task);
  try { return await task; } finally { if (queues.get(request.directory) === task) queues.delete(request.directory); }
}

async function invokeOperation(request: z.infer<typeof requestSchema>, signal: AbortSignal): Promise<unknown> {
  if (request.operation === "state") return { connections: listConnections() };
  const directory = await admitWorkspace(request.directory); signal.throwIfAborted();
  const connection = getConnection(undefined, directory);
  const canvas: CanvasContext = {
    id: connection?.state.canvasId ?? "unavailable", tools: connection?.state.tools ?? [],
    async call(call, callSignal) {
      if (!connection || connection.state.directory !== directory) throw new Error("AIGC_CANVAS_UNAVAILABLE");
      if (request.operation !== "execute") throw new Error("AIGC_EXECUTION_REQUIRED");
      if (connection.state.canvasId !== request.canvasId || connection.state.canvasRevision !== request.expectedRevision) throw new Error("AIGC_CANVAS_REVISION_CONFLICT");
      return callControl(connection.id, call.name, call.args, callSignal ?? signal, directory,
        { canvasId: request.canvasId, revision: request.expectedRevision, operationId: request.callId,...(request.nativeCaller?{origin:{grantRef:request.nativeCaller.grantRef}}:{}) });
    },
  };
  const definitions = await createAgentTools(directory, canvas, { ask: (callId, question, callSignal) =>
    invokeNative("question", { directory, sessionId: request.sessionId, callId, question }, callSignal ?? signal).then(value =>
      z.strictObject({ answer: z.string(), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(), skipped: z.boolean().optional() }).parse(value)) }, fileCoordinator(directory));
  definitions.push(...documentTools((name, args, callSignal) => canvas.call({ name, args }, callSignal)));
  if (isMemoryEnabled()) {
    const memory = createMemoryTool();
    definitions.push({ ...memory, sourcePlugin: "nativeMemory", sourceRevision: createHash("sha256").update(memory.execute.toString() + JSON.stringify(memory.parameters)).digest("hex") });
  }
  if (request.operation === "resources") return nativeResources(directory, definitions);
  const names = new Set<string>();
  for (const definition of definitions) {
    try {
    if (!/^[a-zA-Z][a-zA-Z0-9_:-]{0,127}$/.test(definition.name) || names.has(definition.name)
      || typeof definition.description !== "string" || !definition.parameters || Reflect.get(definition.parameters, "type") !== "object"
      || typeof definition.execute !== "function") throw new Error("AIGC_PLUGIN_CONTRACT_INVALID: " + definition.name);
    names.add(definition.name);
    toolSchema(definition.parameters);
    } catch { throw nativePluginError(definition.sourcePlugin); }
  }
  if (request.operation === "catalog") return { tools: definitions.map(tool => ({ name: tool.name, description: tool.description,
    parameters: tool.parameters, promptGuidelines: tool.promptGuidelines ?? [], executionMode: tool.executionMode ?? "sequential",
    schemaSha256: toolSchema(tool.parameters).sha256, plugin: { name: tool.sourcePlugin, revision: tool.sourceRevision } })) };
  const tool = definitions.find(item => item.name === request.name);
  if (!tool) throw new Error("AIGC_TOOL_UNAVAILABLE");
  const schema = toolSchema(tool.parameters);
  if (schema.sha256 !== request.schemaSha256) throw new Error("AIGC_TOOL_CONTRACT_CHANGED");
  schema.validate(request.arguments);
  const context = new Proxy({ cwd: directory, mode: "rpc", hasUI: false, signal, model: undefined,
    sessionManager: Object.freeze({ getSessionId: () => request.sessionId }) }, {
    get(value, key) { if (Reflect.has(value, key)) return Reflect.get(value, key); throw new Error("AIGC_PLUGIN_NATIVE_CAPABILITY_UNSUPPORTED: " + String(key)); },
  });
  if (!reads.has(tool.name) && connection) {
    if (connection.state.canvasId !== request.canvasId || connection.state.canvasRevision !== request.expectedRevision) throw new Error("AIGC_CANVAS_REVISION_CONFLICT");
    await callControl(connection.id, "flushSave", {}, signal, directory,
      { canvasId: request.canvasId, revision: request.expectedRevision, operationId: request.callId });
    signal.throwIfAborted();
  }
  if(request.nativeCaller&&(request.nativeCaller.sessionId!==request.sessionId||request.nativeCaller.callId!==request.callId||request.nativeCaller.directory!==directory))throw Error('AIGC_CALLER_INVALID');
  const result = await withNativeCaller(request.nativeCaller??{sessionId:request.sessionId,callId:request.callId,directory},()=>runOwnedWork(signal, async owned => Reflect.apply(tool.execute, tool, [request.callId, request.arguments, owned, undefined, context])));
  signal.throwIfAborted();
  if (Buffer.byteLength(JSON.stringify(result)) > 32 * 1024 * 1024) throw new Error("AIGC_TOOL_RESULT_TOO_LARGE");
  return resultSchema.parse(result);
}
