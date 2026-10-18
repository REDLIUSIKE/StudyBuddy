import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { embedded } from "@/utils/studyBuddy/policy";
import { videoTasks } from "@/utils/studyBuddy/media";
export default Router().get("/", (_req, res) => {
  res.json(success(embedded ? videoTasks().slice().sort((a, b) => b.createdAt - a.createdAt) : []));
});
