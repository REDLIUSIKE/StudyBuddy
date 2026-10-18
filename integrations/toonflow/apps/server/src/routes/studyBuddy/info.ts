import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { embedded } from "@/utils/studyBuddy/policy";
export default Router().get("/", (_req, res) => res.json(success({ embedded, brand: "StudyBuddy",
  video: { available: false, code: "AIGC_VIDEO_MODEL_NOT_CONFIGURED" }, image: { available: false, code: "AIGC_IMAGE_UNAVAILABLE" } })));
