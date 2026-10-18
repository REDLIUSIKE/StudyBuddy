import { Router } from "express";
import { z } from "zod";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@toonflow/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { success, error, errorFromCause } from "@/lib/responseFormat";
import u from "@/utils";
import { translateMessage, validationOptions } from "@/lib/i18n";
import { createHash } from "node:crypto";
import { embedded } from "@/utils/studyBuddy/policy";
import {currentNativeCaller} from '@/embedded/native';

const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const pendingRequests = new Map<string, { identity: string; controller?: AbortController }>();

export default Router().post("/", validateFields({
  directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video", "audio"]),
}), async (req, res) => {
  const { directory, mediaType, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : mediaType === "video" ? videoGenerationSchema : audioGenerationSchema).safeParse(request, validationOptions());
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues.map(issue => ({ ...issue, message: translateMessage(issue.message) })), 400));
    return;
  }
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  if(currentNativeCaller()?.grantRef&&currentNativeCaller()!.directory!==cwd){res.status(403).json(error('AIGC_CALLER_DIRECTORY_MISMATCH',null,403));return;}
  const requestId = embedded ? req.get("x-studybuddy-media-request-id") : undefined;
  const cancel = req.get("x-studybuddy-media-cancel");
  if (requestId !== undefined && !requestIdPattern.test(requestId) || cancel !== undefined && (cancel !== "1" || !embedded || !requestId)) {
    res.status(400).json(error("媒体请求编号或取消操作无效", null, 400)); return;
  }
  const identity = createHash("sha256").update(JSON.stringify([cwd, mediaType, parsed.data])).digest("hex");
  const previous = requestId ? pendingRequests.get(requestId) : undefined;
  if (previous && previous.identity !== identity) { res.status(409).json(error("原请求所属工作区或参数不一致", null, 409)); return; }
  if (cancel === "1" && requestId) {
    if (previous) previous.controller?.abort();
    else {
      if (pendingRequests.size >= 128) { res.status(409).json(error("当前媒体请求过多", null, 409)); return; }
      const row = { identity };
      pendingRequests.set(requestId, row);
      // ACT: 处理取消通知先于原请求到达的竞态；仅暂存本机身份，不进入账本。
      setTimeout(() => { if (pendingRequests.get(requestId) === row) pendingRequests.delete(requestId); }, 60000).unref();
    }
    res.json(success({ cancelled: true })); return;
  }
  if (previous) { res.status(409).json(error("原请求正在处理或已停止", null, 409)); return; }
  if (requestId && pendingRequests.size >= 128) { res.status(409).json(error("当前媒体请求过多", null, 409)); return; }
  const controller = new AbortController();
  if (requestId) pendingRequests.set(requestId, { identity, controller });
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const close = () => { clearInterval(heartbeat); controller.abort(); };
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  try {
    res.set({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    // ACT: JSON 允许前导空白，保活时保留现有 response.json() 契约。
    heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded && !res.writableNeedDrain) res.write("\n"); }, 20000);
    const files = await u.mediaGeneration.generateMedia(cwd, mediaType, parsed.data, controller.signal, requestId);
    if (!res.destroyed) res.write(JSON.stringify(success(files)));
  } catch (err) {
    if (!res.destroyed) res.write(JSON.stringify(errorFromCause(err)));
  } finally {
    clearInterval(heartbeat);
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
    if (requestId && pendingRequests.get(requestId)?.controller === controller) pendingRequests.delete(requestId);
    res.end();
  }
});
