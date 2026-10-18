import { z } from "zod";
import type { MediaGenerationRequest, MediaModel, MediaReference } from "@toonflow/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { mediaGatewayRequest, mediaGatewayContent, mediaGatewayImageContent, mediaGatewayAudioContent } from "./gateway";
const imageModelIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
// ACT: 官方 API 的分辨率档位方式通过 prompt 表达画幅，模型决定最终宽高。
const imageRatios = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"];
const imageModelSchema = z.object({ providerId: z.string().regex(/^mediaKey[a-f0-9]{64}$/), modelId: imageModelIdSchema,
  providerLabel: z.string(), label: z.string(), type: z.literal("image"), fundingSource: z.literal("platform"),
  sizes: z.array(z.enum(["1K", "1.5K", "2K"])).min(1).max(3), priceGuard: z.object({ version: z.string().min(1),
    expressionSha256: z.string().regex(/^[a-f0-9]{64}$/), pluginSha256: z.string().regex(/^[a-f0-9]{64}$/) }) });
const imageTaskSchema = z.object({ schemaVersion: z.literal(1), requestId: z.string().uuid(), modelId: imageModelIdSchema,
  kind: z.literal("image"), state: z.enum(["queued", "in_progress", "completed", "failed", "unknown"]),
  contentAvailable: z.boolean().optional(), error: z.string().optional() });
const mediaModelSchema = z.object({ providerId: z.string().regex(/^mediaKey[a-f0-9]{64}$/), modelId: z.string(),
  providerLabel: z.string(), label: z.string(), type: z.literal("video"), fundingSource: z.literal("platform"),
  modes: z.array(z.union([z.string(), z.array(z.string())])), durations: z.array(z.number().int().positive()), resolutions: z.array(z.string()),
  ratios: z.array(z.string()), audio: z.boolean(), priceGuard: z.object({ version: z.string().min(1),
    expressionSha256: z.string().regex(/^[a-f0-9]{64}$/), pluginSha256: z.string().regex(/^[a-f0-9]{64}$/) }) });
const taskSchema = z.object({ schemaVersion: z.literal(1), requestId: z.string().uuid(), modelId: z.string(), taskId: z.string().nullable().optional(),
  kind: z.literal("video").optional(), state: z.enum(["queued", "in_progress", "completed", "failed", "unknown"]),
  contentAvailable: z.boolean().optional(), error: z.string().optional() });
const audioModelSchema = z.object({ providerId: z.string().regex(/^mediaKey[a-f0-9]{64}$/), modelId: z.string().min(1).max(128),
  providerLabel: z.string(), label: z.string(), type: z.literal("audio"), fundingSource: z.literal("platform"),
  voices: z.array(z.object({ title: z.string().min(1), voice: z.string().min(1).max(256) })).min(1).max(512),
  formats: z.array(z.enum(["wav", "mp3", "pcm", "flac"])).min(1).max(4), sampleRates: z.array(z.number().int().positive()).min(1).max(16),
  languages: z.array(z.enum(["zh-CN", "en"])).min(1).max(2), priceGuard: z.object({ version: z.string().min(1),
    expressionSha256: z.string().regex(/^[a-f0-9]{64}$/), pluginSha256: z.string().regex(/^[a-f0-9]{64}$/) }) });
const audioTaskSchema = z.object({ schemaVersion: z.literal(1), requestId: z.string().uuid(), modelId: z.string(), kind: z.literal("audio"),
  state: z.enum(["queued", "in_progress", "completed", "failed", "unknown"]), contentAvailable: z.boolean().optional() });
export type StudyBuddyVideoTask = { requestId: string; directory: string; outputDirectory: string; prompt: string; modelId: string;
  state: string; createdAt: number; files?: { path: string; mimeType: string; mediaType: "video" }[] };
export function videoTasks(): StudyBuddyVideoTask[] { return conf.get("studyBuddyVideoTasks", []); }
export function saveVideoTask(row: StudyBuddyVideoTask) {
  const previous = videoTasks();
  conf.set("studyBuddyVideoTasks", [...previous.filter(item => item.requestId !== row.requestId), row]);
}
async function getStudyBuddyVideoModels(): Promise<MediaModel[]> {
  const result = z.object({ schemaVersion: z.literal(1), models: z.array(mediaModelSchema).max(64) }).parse(await mediaGatewayRequest("/catalog"));
  const settings = conf.get("settings", {}), defaults = settings.studyBuddyModelDefaults as Record<string, unknown> | undefined;
  let selected = defaults?.video;
  if (typeof selected === "string") {
    let previous: unknown;
    try { previous = JSON.parse(selected); } catch { previous = null; }
    if (Array.isArray(previous) && previous.length === 2 && typeof previous[0] === "string" &&
      /^studybuddyMedia[a-f0-9]{64}$/.test(previous[0]) && typeof previous[1] === "string") {
      const exact = result.models.filter(row => row.modelId === previous[1]);
      if (exact.length === 1) {
        selected = JSON.stringify([exact[0]!.providerId, exact[0]!.modelId]);
        conf.set("settings", { ...settings, studyBuddyModelDefaults: { ...defaults, video: selected } });
      }
    }
  }
  return result.models.map(row => ({ providerId: row.providerId, modelId: row.modelId, providerLabel: row.providerLabel,
    label: row.label, type: row.type, fundingSource: row.fundingSource, mode: row.modes,
    durationResolutionMap: [{ duration: row.durations, resolution: row.resolutions }], ratios: row.ratios,
    audio: row.audio ? "optional" as const : false, isDefault: selected === JSON.stringify([row.providerId, row.modelId]) }));
}
async function getStudyBuddyImageModels(signal?: AbortSignal): Promise<MediaModel[]> {
  const result = z.object({ schemaVersion: z.literal(1), models: z.array(imageModelSchema).max(64) })
    .parse(await mediaGatewayRequest("/images/catalog", undefined, signal));
  const defaults = conf.get("settings", {}).studyBuddyModelDefaults as Record<string, unknown> | undefined;
  return result.models.map(row => ({ providerId: row.providerId, modelId: row.modelId, providerLabel: row.providerLabel,
    label: row.label, type: row.type, imageSizes: row.sizes, imageRatios: [...imageRatios],
    isDefault: defaults?.image === JSON.stringify([row.providerId, row.modelId]) }));
}
async function getStudyBuddyAudioModels(signal?: AbortSignal): Promise<MediaModel[]> {
  const result = z.object({ schemaVersion: z.literal(1), models: z.array(audioModelSchema).max(64) })
    .parse(await mediaGatewayRequest("/speech/catalog", undefined, signal));
  const defaults = conf.get("settings", {}).studyBuddyModelDefaults as Record<string, unknown> | undefined;
  return result.models.map(row => ({ providerId: row.providerId, modelId: row.modelId, providerLabel: row.providerLabel,
    label: row.label, type: row.type, voices: row.voices, formats: row.formats, sampleRates: row.sampleRates, languages: row.languages,
    mode: ["text"], isDefault: defaults?.audio === JSON.stringify([row.providerId, row.modelId]) }));
}
export async function getStudyBuddyMediaModels(): Promise<MediaModel[]> {
  const [video, image, audio] = await Promise.all([getStudyBuddyVideoModels(), getStudyBuddyImageModels(), getStudyBuddyAudioModels()]);
  return [...video, ...image, ...audio];
}
export async function generateStudyBuddyAudio(request: MediaGenerationRequest, signal?: AbortSignal, id?: string): Promise<MediaAsset[]> {
  const models = await getStudyBuddyAudioModels(signal);
  const exact = models.filter(row => row.modelId === request.modelId && row.providerId === request.providerId), model = exact.length === 1 ? exact[0] : undefined;
  if (!model || request.images?.length || request.videos?.length || request.audios?.length || request.firstFrame || request.lastFrame)
    throw new Error("所选音频模型暂不可用，或引用了当前模型不支持的媒体。语音合成只接收文本和已授权的系统音色。");
  if (!request.voice || !model.voices?.some(row => row.voice === request.voice)) throw new Error("请选择当前模型已授权的系统音色。");
  const speed = request.speed ?? 1;
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2 || request.volume !== undefined && (!Number.isFinite(request.volume) || request.volume <= 0 || request.volume > 10) ||
    request.pitch !== undefined && (!Number.isInteger(request.pitch) || request.pitch < -12 || request.pitch > 12)) throw new Error("音频语速、音量或语调超出模型支持范围。");
  if (!request.format || !model.formats?.includes(request.format) || request.sampleRate === undefined || !model.sampleRates?.includes(request.sampleRate) ||
    !request.language || !model.languages?.includes(request.language)) throw new Error("请选择当前模型支持的语种、采样率和输出格式。");
  if (!request.prompt.trim() || Array.from(request.prompt).length >= 10000 || request.prompt.includes("\u0000")) throw new Error("待朗读文本不能为空，且需少于 10000 字符。");
  const requestId = id ?? crypto.randomUUID();
  const task = audioTaskSchema.parse(await mediaGatewayRequest("/speech/requests", { requestId, handle: model.providerId,
    modelId: model.modelId, prompt: request.prompt, voiceId: request.voice, speed, format: request.format, sampleRate: request.sampleRate, language: request.language,
    ...(request.volume === undefined ? {} : { volume: request.volume }), ...(request.pitch === undefined ? {} : { pitch: request.pitch }) }, signal));
  if (task.requestId !== requestId || task.modelId !== model.modelId) throw new Error("AIGC_RESPONSE_MODEL_INVALID");
  if (task.state !== "completed" || task.contentAvailable !== true) throw new Error(`音频结果暂无法确认，原请求为 ${requestId}，请勿自动重复提交。`);
  const { data, mimeType } = await mediaGatewayAudioContent(requestId, signal);
  const expected = { wav: "audio/wav", mp3: "audio/mpeg", pcm: "audio/pcm", flac: "audio/flac" }[request.format];
  if (mimeType !== expected) throw new Error("网关返回的音频格式与本次请求不一致。");
  return [{ type: "binary", data, mediaType: "audio", mimeType }];
}
export async function generateStudyBuddyImage(request: MediaGenerationRequest,
  read: (reference: MediaReference) => Promise<{ data: string; mimeType: string }>, signal?: AbortSignal, id?: string): Promise<MediaAsset[]> {
  const models = await getStudyBuddyImageModels(signal);
  const exact = models.filter(row => row.modelId === request.modelId && row.providerId === request.providerId);
  const model = exact.length === 1 ? exact[0] : undefined;
  if (!model || request.videos?.length || request.audios?.length || request.firstFrame || request.lastFrame)
    throw new Error("所选图片模型或参考媒体不在已授权范围内。");
  if ((request.images?.length ?? 0) > 10) throw new Error("当前图片模型最多支持 10 张参考图片。");
  if (!request.size || !model.imageSizes?.includes(request.size) || request.ratio !== undefined && !imageRatios.includes(request.ratio))
    throw new Error("请选择已授权的图片尺寸和画幅。");
  const prompt = request.prompt + (request.ratio === undefined ? "" : `\n图片宽高比：${request.ratio}。`);
  if (!prompt.trim() || prompt.length > 10000 || prompt.includes("\u0000")) throw new Error("图片提示词为空、超过 10000 字或含无效字符。");
  const images: { dataUrl: string }[] = [];
  let referenceBytes = 0;
  for (const reference of request.images ?? []) {
    signal?.throwIfAborted();
    const value = await read(reference);
    if (!/^image\/(?:png|jpeg|webp|bmp|tiff|gif|heic|heif)$/.test(value.mimeType)
      || value.data.length > 40_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data))
      throw new Error("参考图片格式或编码无效，单张图片不能超过 30 MB。");
    const bytes = Buffer.from(value.data, "base64");
    if (!bytes.length || bytes.length > 30_000_000 || bytes.toString("base64") !== value.data)
      throw new Error("参考图片格式或编码无效，单张图片不能超过 30 MB。");
    referenceBytes += bytes.length;
    // ACT: 95 MiB 原始图片编码后仍留在当前 128 MiB 网关传输额度内，不改变图片内容。
    if (referenceBytes > 95 * 1024 * 1024) throw new Error("参考图片总大小超过当前网关的 95 MiB 传输额度。");
    images.push({ dataUrl: `data:${value.mimeType};base64,${value.data}` });
  }
  signal?.throwIfAborted();
  const requestId = id ?? crypto.randomUUID();
  try {
    const task = imageTaskSchema.parse(await mediaGatewayRequest("/images/requests", { requestId, modelId: model.modelId,
      handle: model.providerId, prompt, size: request.size, ...(images.length ? { images } : {}) }, signal));
    if (task.requestId !== requestId || task.modelId !== model.modelId) throw new Error("AIGC_RESPONSE_MODEL_INVALID");
    if (task.state !== "completed" || task.contentAvailable !== true) throw new Error(`图片结果暂无法确认，请查询原请求 ${requestId}，避免重复提交。`);
    const { data, mimeType } = await mediaGatewayImageContent(requestId, signal);
    return [{ type: "binary", data, mediaType: "image", mimeType }];
  } catch (error) {
    if (signal?.aborted) throw new Error(`已停止等待图片结果。原请求 ${requestId} 可能已由网关处理，请勿自动重复提交。`);
    throw error;
  }
}
export async function queryVideoTask(row: StudyBuddyVideoTask, signal?: AbortSignal) {
  const task = taskSchema.parse(await mediaGatewayRequest("/requests/" + row.requestId, undefined, signal));
  if (task.requestId !== row.requestId || task.modelId !== row.modelId) throw new Error("AIGC_RESPONSE_MODEL_INVALID");
  row.state = task.state; saveVideoTask(row); return task;
}
export async function generateStudyBuddyVideo(directory: string, request: MediaGenerationRequest,
  read: (reference: MediaReference) => Promise<{ data: string; mimeType: string }>, signal?: AbortSignal, requestId?: string): Promise<{ assets: MediaAsset[]; requestId: string }> {
  const models = await getStudyBuddyVideoModels();
  const exact = models.filter(row => row.modelId === request.modelId && (row.providerId === request.providerId ||
    /^studybuddyMedia[a-f0-9]{64}$/.test(request.providerId)));
  const model = exact.length === 1 ? exact[0] : undefined;
  if (!model || request.videos?.length || request.audios?.length || request.firstFrame || request.lastFrame) throw new Error("AIGC_VIDEO_PARAMETERS_UNAVAILABLE");
  if (request.duration === undefined || request.resolution === undefined || request.ratio === undefined || request.generateAudio === undefined) throw new Error("请先选择视频时长、分辨率、画幅和声音选项。");
  const images = await Promise.all((request.images ?? []).map(async reference => { const value = await read(reference); return { dataUrl: `data:${value.mimeType};base64,${value.data}` }; }));
  signal?.throwIfAborted();
  const row: StudyBuddyVideoTask = { requestId: requestId ?? crypto.randomUUID(), directory, outputDirectory: request.outputDirectory ?? "assets/generated",
    prompt: request.prompt.slice(0, 120), modelId: model.modelId, state: "submitting", createdAt: Date.now() };
  saveVideoTask(row);
  try {
    const task = taskSchema.parse(await mediaGatewayRequest("/requests", { requestId: row.requestId, handle: model.providerId,
      prompt: request.prompt, duration: request.duration, resolution: request.resolution, ratio: request.ratio,
      generateAudio: request.generateAudio, mode: request.mode ?? (images.length ? ["imageReference:8"] : "text"), images }, signal));
    if (task.requestId !== row.requestId || task.modelId !== model.modelId) throw new Error("AIGC_RESPONSE_MODEL_INVALID");
    row.state = task.state; saveVideoTask(row);
    for (;;) {
      signal?.throwIfAborted();
      const current = await queryVideoTask(row, signal);
      if (current.state === "failed") throw new Error(current.error ?? "视频任务失败");
      if (current.state === "completed") {
        if (!current.contentAvailable) throw new Error("AIGC_RESPONSE_INVALID");
        const data = await mediaGatewayContent(row.requestId, signal);
        return { assets: [{ type: "binary", data, mediaType: "video", mimeType: "video/mp4" }], requestId: row.requestId };
      }
      await new Promise<void>((accept, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error("等待已停止")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); accept(); }, 3000);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
  } catch (error) {
    if (row.state === "submitting") { row.state = "unknown"; saveVideoTask(row); }
    if (signal?.aborted) throw new Error("已停止等待。已提交的视频任务仍由网关处理，可在媒体模型设置中查询并领取结果。");
    throw error;
  }
}
