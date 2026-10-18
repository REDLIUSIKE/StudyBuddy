import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { embedded } from "@/utils/studyBuddy/policy";
import { refreshGateway } from "@/utils/studyBuddy/gateway";

export default Router().get("/", async (_req, res) => {
  if (embedded) await refreshGateway();
  res.json(success(u.ai.listAiModels()));
});
