import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { maxSystemPromptLength } from "@/agent/runtime/prompt";
import { t } from "@/lib/i18n";
import { embedded } from "@/utils/studyBuddy/policy";
import { getStudyBuddyMediaModels } from "@/utils/studyBuddy/media";
import { getStudyBuddyModels, refreshGateway } from "@/utils/studyBuddy/gateway";

const router = Router();

export default router.put("/", validateFields({ settings: z.record(z.string(), z.json()).and(z.object({
  agentSystemPrompt: z.string().max(maxSystemPromptLength, { error: () => t`系统提示词不能超过 ${maxSystemPromptLength} 个字符` }).optional(),
  desktopUpdateSource: z.enum(["official", "github", "custom"]).optional(),
  desktopUpdateCustomUrl: z.string().max(2048).refine(value => !value || u.desktop.isValidUpdateUrl(value),
    "自定义更新源必须是不含账号、查询参数或锚点的 HTTP(S) 地址").optional(),
  mcp: z.object({ enabled: z.boolean().optional(), token: z.string().optional(), port: z.number().int().min(1).max(65535).optional() }).optional(),
})).refine(value => value.desktopUpdateSource !== "custom" || !!value.desktopUpdateCustomUrl, {
  path: ["desktopUpdateCustomUrl"], message: "选择自定义更新源前，请先填写有效地址",
}) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { settings } = req.body;
  u.removeLegacySettings(settings);
  const previousSettings = u.conf.get("settings", {});
  if (embedded && JSON.stringify(settings.studyBuddyModelDefaults) !== JSON.stringify(previousSettings.studyBuddyModelDefaults)) {
    const defaults = z.object({ text: z.string().optional(), video: z.string().optional() }).strict().parse(settings.studyBuddyModelDefaults);
    const previous = previousSettings.studyBuddyModelDefaults as Record<string, unknown> | undefined;
    if (defaults.text && defaults.text !== previous?.text) {
      await refreshGateway();
      if (!getStudyBuddyModels().some(row => JSON.stringify([row.providerId, row.modelId]) === defaults.text)) throw new Error("所选文本模型当前不可用，请刷新模型。");
    }
    if (defaults.video && defaults.video !== previous?.video && !(await getStudyBuddyMediaModels()).some(row => JSON.stringify([row.providerId, row.modelId]) === defaults.video)) throw new Error("所选视频模型当前不可用，请刷新模型。");
  }
  u.conf.set("settings", settings);
  const [models] = await Promise.all([u.ai.refreshProviderModels(), u.mcpRuntime.reloadMcpRuntime()]);
  res.json(success(models, "设置已保存"));
});
