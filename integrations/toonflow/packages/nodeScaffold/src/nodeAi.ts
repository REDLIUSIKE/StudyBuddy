/** Embedded nodes delegate execution to native child Sessions; no browser model loop is constructed. */
import { onScopeDispose } from "vue";
import type { NodeAiModel, NodeMediaModel, NodeAiRequest, NodeAiResult, NodeImageRequest, NodeVideoRequest, NodeAudioRequest } from "./nodeAiTypes";
export type * from "./nodeAiTypes";
const api = "/api/native/temporary";
const headers = { "Content-Type": "application/json", "x-toonflow-workspace": "1" };
const modelCacheKey = Symbol.for("toonflow.nodeModels");
const modelCacheHost = globalThis as typeof globalThis & { [modelCacheKey]?: Map<string, Promise<unknown[]>> };
const modelCache = modelCacheHost[modelCacheKey] ??= new Map<string, Promise<unknown[]>>();
export function invalidateNodeModels(type: "language" | "media") { modelCache.delete(type === "language" ? "/api/ai/models" : "/api/ai/media/models"); }
async function readResult<T>(response: Response): Promise<T> {
  const result = await response.json(); if (!response.ok || result.code !== 200) throw new Error(result.message || `AI 请求失败（HTTP ${response.status}）`); return result.data;
}
async function readModels<T>(url: string, signal: AbortSignal): Promise<T[]> {
  signal.throwIfAborted(); let pending = modelCache.get(url);
  if (!pending) { const request = fetch(url, { cache: "no-store" }).then(readResult<unknown[]>).catch(error => { if (modelCache.get(url) === request) modelCache.delete(url); throw error; }); pending = request; modelCache.set(url, request); }
  let detach = () => {};
  try {
    const value = await Promise.race([pending, new Promise<never>((_resolve, reject) => { const abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); detach = () => { signal.removeEventListener("abort", abort); }; })]);
    signal.throwIfAborted(); return modelCache.get(url) === pending ? value as T[] : readModels<T>(url, signal);
  } finally { detach(); }
}
async function post<T>(path: string, body: object, signal?: AbortSignal): Promise<T> { return readResult<T>(await fetch(api + path, { method: "POST", headers, body: JSON.stringify(body), signal })); }
async function* events(response: Response) {
  if (!response.ok || !response.body) { await readResult(response); throw new Error("AIGC_NATIVE_STREAM_UNAVAILABLE"); }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 32 * 1024 * 1024) throw new Error("AIGC_EVENT_TOO_LARGE");
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (line.trim()) yield JSON.parse(line) as Record<string, unknown>; }
      if (done) { if (buffer.trim()) yield JSON.parse(buffer) as Record<string, unknown>; break; }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function useNodeAi() {
  const lifetime = new AbortController(); onScopeDispose(() => lifetime.abort());
  const requestSignal = (signal?: AbortSignal) => signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
  const getModels = (signal?: AbortSignal) => readModels<NodeAiModel>("/api/ai/models", requestSignal(signal));
  const getMediaModels = (signal?: AbortSignal) => readModels<NodeMediaModel>("/api/ai/media/models", requestSignal(signal));
  async function generateMedia<T extends "image" | "video" | "audio">(mediaType: T, input: NodeImageRequest | NodeVideoRequest | NodeAudioRequest, signal?: AbortSignal) {
    const {nativeCaller,...parameters}=input;
    const owned = requestSignal(signal), requestId = crypto.randomUUID(), body = JSON.stringify({ ...parameters, mediaType }); owned.throwIfAborted();
    const mediaHeaders = { ...headers, "x-studybuddy-media-request-id": requestId,...(nativeCaller?{'x-studybuddy-capability-grant':nativeCaller.grantRef}:{}) };
    const cancel = () => { void fetch("/api/ai/media/generate", { method: "POST", body, headers: { ...mediaHeaders, "x-studybuddy-media-cancel": "1" }, redirect: "error", signal: AbortSignal.timeout(5000) }).catch(() => {}); };
    owned.addEventListener("abort", cancel, { once: true });
    try { return await readResult<{ path: string; mimeType: string; mediaType: T }[]>(await fetch("/api/ai/media/generate", { method: "POST", headers: mediaHeaders, body, signal: owned })); }
    finally { owned.removeEventListener("abort", cancel); }
  }
  async function generate(input: NodeAiRequest): Promise<NodeAiResult> {
    const signal = requestSignal(input.signal); signal.throwIfAborted(); if (!input.prompt.trim()) throw new Error("请输入提示词");
    const definitions = input.tools ?? []; if (new Set(definitions.map(tool => tool.name)).size !== definitions.length) throw new Error("工具名称不能重复");
    if (!(await getModels(signal)).some(model => model.providerId === input.providerId && model.modelId === input.modelId)) throw new Error("所选模型不存在，请重新选择");
    const { sessionId } = await post<{ sessionId: string }>("/create", { ...(input.directory ? { directory: input.directory } : {}), systemPrompt: input.systemPrompt ?? "",
      tools: definitions.map(({ name, description, parameters }) => ({ name, description, parameters, executionMode: "sequential" })) }, signal);
    const runId = crypto.randomUUID(), controller = new AbortController(), owned = AbortSignal.any([signal, controller.signal]), running = new Set<Promise<void>>();
    let completed: NodeAiResult | undefined, reasoning = "";
    const stop = () => { void post("/control", { sessionId, runId, action: "stop" }, AbortSignal.timeout(5000)).catch(() => {}); };
    owned.addEventListener("abort", stop, { once: true });
    try {
      const response = await fetch(api + "/run", { method: "POST", headers, signal: owned, body: JSON.stringify({ sessionId, runId, prompt: input.prompt,
        providerId: input.providerId, modelId: input.modelId, references: input.references ?? [] }) });
      for await (const event of events(response)) {
        owned.throwIfAborted();
        if ((event.type === "text" || event.type === "thinking") && typeof event.delta === "string") {
          if (event.type === "thinking") reasoning += event.delta;
          input.onEvent?.({ type: event.type === "text" ? "text" : "reasoning", delta: event.delta });
        }
        if (event.type === "clientTool") {
          if (typeof event.name !== "string" || typeof event.callId !== "string" || typeof event.toolCallId !== "string" || !event.args || typeof event.args !== "object" || Array.isArray(event.args)) throw new Error("AIGC_TOOL_CALLBACK_INVALID");
          const tool = definitions.find(tool => tool.name === event.name); if (!tool) throw new Error("AIGC_TOOL_UNAVAILABLE");
          const name = event.name, id = event.toolCallId, args = event.args as Record<string, unknown>, callId = event.callId;
          input.onEvent?.({ type: "toolStart", id, name, args });
          const work = (async () => {
            try {
              const result = await tool.execute(args, owned) ?? null; owned.throwIfAborted();
              await post("/toolResult", { sessionId, callId, result: { content: [{ type: "text", text: JSON.stringify(result) }], details: {} } }, owned);
              input.onEvent?.({ type: "toolEnd", id, name, result, isError: false });
            } catch (error) {
              if (owned.aborted) return; const text = error instanceof Error ? error.message : "节点工具执行失败";
              await post("/toolResult", { sessionId, callId, error: text }, owned); input.onEvent?.({ type: "toolEnd", id, name, result: text, isError: true });
            }
          })(); running.add(work); void work.catch(() => controller.abort()).finally(() => { running.delete(work); });
        }
        if (event.type === "error") throw new Error(typeof event.message === "string" ? event.message : "AIGC_NATIVE_RUN_FAILED");
        if (event.type === "complete") { if (typeof event.text !== "string") throw new Error("AIGC_NATIVE_RESULT_INVALID"); completed = { text: event.text, ...(reasoning ? { reasoning } : {}) }; }
      }
      await Promise.all(running); owned.throwIfAborted(); if (!completed) throw new Error("AIGC_NATIVE_RUN_INCOMPLETE"); return completed;
    } finally {
      owned.removeEventListener("abort", stop); controller.abort();
      await post("/control", { sessionId, action: "close" }, AbortSignal.timeout(8000)).catch(() => {}); await Promise.allSettled(running);
    }
  }
  return { getModels, getMediaModels, generate,
    generateImage: (input: NodeImageRequest, signal?: AbortSignal) => generateMedia("image", input, signal),
    generateVideo: (input: NodeVideoRequest, signal?: AbortSignal) => generateMedia("video", input, signal),
    generateAudio: (input: NodeAudioRequest, signal?: AbortSignal) => generateMedia("audio", input, signal) };
}
