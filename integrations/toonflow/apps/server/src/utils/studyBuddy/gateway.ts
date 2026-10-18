import { z } from "zod";
import { createHash } from "node:crypto";
const grantSchema = z.object({ handle: z.string().regex(/^[a-f0-9]{64}$/),
  sourceLabel: z.string(),
  selection: z.object({ exactModelId: z.string(), providerId: z.string(), sourceId: z.string().optional(), localRef: z.string().optional(), fundingSource: z.enum(["platform", "user_api"]), protocol: z.enum(["openai_responses", "openai_chat_completions", "anthropic_messages"]) }),
  authority: z.object({ displayName: z.string(), contextWindow: z.number().int().positive(), maxOutputTokens: z.number().int().positive().nullable(), capabilityFlags: z.array(z.string()) }),
});
type Grant = z.infer<typeof grantSchema>;
let bridge: { origin: string; authorization: string } | undefined;
let grants: Grant[] = [];
const protocols = { openai_responses: "openai-responses", openai_chat_completions: "openai-completions", anthropic_messages: "anthropic-messages" } as const;
export async function configureGateway(value: typeof bridge) {
  if (value && (!/^http:\/\/127\.0\.0\.1:\d+$/.test(value.origin) || !/^[a-f0-9]{64}$/.test(value.authorization))) throw new Error("AIGC_GATEWAY_INVALID");
  bridge = value;
  // ACT: 服务就绪只依赖本机配置；模型目录由请求时读取，不阻塞本机页面启动。
  grants = [];
}
export async function refreshGateway() {
  if (!bridge) { grants = []; return; }
  const response = await fetch(bridge.origin + "/catalog", { headers: { Authorization: "Bearer " + bridge.authorization }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) { grants = []; return; }
  grants = z.array(grantSchema).max(256).parse(await response.json()).filter(row => row.authority.maxOutputTokens !== null);
}
export function getStudyBuddyModels() {
  return grants.map(row => ({ providerId: modelProviderId(row), providerLabel: `${row.sourceLabel} · ${row.selection.providerId} · ${row.selection.fundingSource === "platform" ? "平台额度" : "自有 API"}`,
    protocol: protocols[row.selection.protocol], modelId: row.selection.exactModelId, label: row.authority.displayName,
    contextWindow: row.authority.contextWindow, maxOutputTokens: row.authority.maxOutputTokens!, capabilityFlags: row.authority.capabilityFlags }));
}
function modelProviderId(row: Grant) {
  const s = row.selection;
  return "studyBuddyText" + createHash("sha256").update(JSON.stringify([s.sourceId ?? "platform", s.localRef ?? "platform", s.providerId, s.exactModelId, s.protocol, s.fundingSource])).digest("hex");
}
export function resolveStudyBuddyModel(providerId: string, modelId: string) {
  const row = grants.find(item => (modelProviderId(item) === providerId || item.handle === providerId) && item.selection.exactModelId === modelId);
  if (!row || !bridge || row.authority.maxOutputTokens === null) throw Object.assign(new Error("AIGC_MODEL_UNAVAILABLE"), { status: 409 });
  return { provider: { apiUrl: bridge.origin + "/" + row.handle + "/v1", apiKey: bridge.authorization,
    protocol: protocols[row.selection.protocol], models: [] },
    model: { id: modelId, label: row.authority.displayName, contextWindow: row.authority.contextWindow, maxOutputTokens: row.authority.maxOutputTokens },
    baseUrl: bridge.origin + "/" + row.handle + "/v1", capabilityFlags: row.authority.capabilityFlags };
}
export async function mediaGatewayRequest(path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  if (!bridge || !(/^\/(?:(?:images|speech)\/)?catalog$/.test(path) && body === undefined ||
    /^\/(?:(?:images|speech)\/)?requests$/.test(path) && body !== undefined || /^\/(?:(?:images|speech)\/)?requests\/[0-9a-f-]{36}$/.test(path) && body === undefined)) throw new Error("AIGC_MEDIA_UNAVAILABLE");
  const response = await fetch(bridge.origin + "/media" + path, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: "Bearer " + bridge.authorization, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal });
  const value = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(value);
    const code = parsed.success ? parsed.data.error.code : "AIGC_MEDIA_UNAVAILABLE";
    const kind = path.startsWith("/images/") ? "图片" : path.startsWith("/speech/") ? "音频" : "视频";
    const messages: Record<string, string> = { AIGC_VIDEO_UNAVAILABLE: "当前账号的视频模型授权或网关配置暂不可用，请刷新模型。",
      AIGC_MODEL_UNAVAILABLE: `当前账号的${kind}模型授权暂不可用，请刷新模型。`,
      AIGC_TASK_OUTCOME_UNKNOWN: `${kind}提交结果暂无法确认，请查询原请求，避免重复提交。`,
      AIGC_ACCESS_REQUIRED: "当前账号尚未获得创作权限。", AIGC_REQUEST_INVALID: `${kind}参数不在已授权模型支持的范围内。`,
      AIGC_MEDIA_UNAVAILABLE: `${kind}网关暂不可用，请稍后查询原请求。`, AIGC_TASK_QUERY_FAILED: `原${kind}任务查询失败，请稍后重试查询。` };
    throw Object.assign(new Error(messages[code] ?? `${kind}网关调用未完成，请稍后查询原请求。`), { status: 409 });
  }
  return value;
}
async function readMediaGatewayContent(requestId: string, kind: "image" | "video" | "audio", signal?: AbortSignal): Promise<{ data: Uint8Array; mimeType: string }> {
  if (!bridge || !/^[0-9a-f-]{36}$/.test(requestId)) throw new Error("AIGC_MEDIA_UNAVAILABLE");
  const response = await fetch(bridge.origin + "/media" + (kind === "image" ? "/images" : kind === "audio" ? "/speech" : "") + "/requests/" + requestId + "/content", {
    headers: { Authorization: "Bearer " + bridge.authorization }, redirect: "error", signal });
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "";
  const allowed = kind === "image" ? ["image/png", "image/jpeg", "image/webp"] : kind === "audio" ? ["audio/mpeg", "audio/wav", "audio/flac", "audio/pcm"] : ["video/mp4"];
  if (!response.ok || !response.body || !allowed.includes(mimeType)) {
    await response.body?.cancel(); throw new Error(`${{ image: "图片", video: "视频", audio: "音频" }[kind]}结果暂不可领取，请稍后查询原请求。`);
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { signal?.throwIfAborted(); const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength; if (size > 100 * 1024 * 1024) throw new Error("生成文件不能超过 100 MB"); chunks.push(part.value);
  } } finally { await reader.cancel(); reader.releaseLock(); }
  if (!size) throw new Error("生成结果为空"); return { data: Buffer.concat(chunks, size), mimeType };
}
export async function mediaGatewayContent(requestId: string, signal?: AbortSignal): Promise<Uint8Array> {
  return (await readMediaGatewayContent(requestId, "video", signal)).data;
}
export async function mediaGatewayImageContent(requestId: string, signal?: AbortSignal): Promise<{ data: Uint8Array; mimeType: string }> {
  return readMediaGatewayContent(requestId, "image", signal);
}
export async function mediaGatewayAudioContent(requestId: string, signal?: AbortSignal): Promise<{ data: Uint8Array; mimeType: string }> {
  return readMediaGatewayContent(requestId, "audio", signal);
}
