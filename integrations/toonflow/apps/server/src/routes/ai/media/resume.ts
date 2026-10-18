import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { embedded, admitWorkspace } from "@/utils/studyBuddy/policy";
import { videoTasks, queryVideoTask, saveVideoTask } from "@/utils/studyBuddy/media";
import { saveGeneratedMedia } from "@/utils/media/generation";
import { mediaGatewayContent } from "@/utils/studyBuddy/gateway";
const receiving = new Map<string, Promise<unknown>>();
export default Router().post("/", validateFields({ requestId: z.string().uuid() }), async (req, res) => {
  if (!embedded) throw Object.assign(new Error("AIGC_OPERATION_UNAVAILABLE"), { status: 409 });
  const id = req.body.requestId;
  let operation = receiving.get(id);
  if (!operation) {
    operation = (async () => {
      const row = videoTasks().find(item => item.requestId === id);
      if (!row) throw Object.assign(new Error("AIGC_TASK_NOT_FOUND"), { status: 404 });
      await admitWorkspace(row.directory);
      if (row.files?.length) return { state: "completed", files: row.files };
      const task = await queryVideoTask(row);
      if (task.state !== "completed") return { state: task.state, error: task.error };
      if (!task.contentAvailable) throw new Error("AIGC_RESPONSE_INVALID");
      const bytes = await mediaGatewayContent(row.requestId);
      const files = await saveGeneratedMedia(row.directory, row.outputDirectory, "video", [{ type: "binary", data: bytes, mediaType: "video", mimeType: "video/mp4" }]);
      saveVideoTask({ ...row, files: files as NonNullable<typeof row.files> });
      return { state: "completed", files };
    })();
    receiving.set(id, operation);
    void operation.finally(() => receiving.delete(id)).catch(() => {});
  }
  res.json(success(await operation));
});
