import { readFile } from "@toonflow/file";
import { resolveWorkspacePath } from "@/utils/workspace/files";
import { readDocument, isMemoryEnabled } from "@/utils/personalization";
import { loadAgentSkills } from "@/agent/skills";
import { buildSystemPrompt, defaultSystemPrompt } from "@/agent/runtime/prompt";
import conf from "@/utils/conf";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

/** Load the original enabled resources without constructing the former agent loop. */
export async function nativeResources(directory: string, tools: ToolDefinition[]) {
  const { path } = await resolveWorkspacePath(directory, "AGENTS.md");
  const project = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return ""; throw error; });
  const [agents, memory] = await Promise.all([readDocument("agents"), isMemoryEnabled() ? readDocument("memory") : { content: "" }]);
  const saved = conf.get("settings", {}).agentSystemPrompt;
  const defaultPrompt = defaultSystemPrompt.replace("你是 Toonflow 的 AI 创作搭档", "你是 StudyBuddy 创作助手");
  const systemPrompt = typeof saved === "string" && saved.trim() && saved.trim() !== defaultSystemPrompt.trim() ? saved : defaultPrompt;
  const text = [buildSystemPrompt({ systemPrompt, tools,
    skills: loadAgentSkills(directory).skills, platform: process.platform }),
    agents.content ? `## 全局协作规范\n${agents.content}` : "", project ? `## 工作区 AGENTS.md\n${project}` : "",
    memory.content ? `## 全局长期记忆\n以下保存内容以本轮要求与权限为准。\n<global_memory>\n${memory.content}\n</global_memory>` : "",
    "当前对话由 Harness 原生 Session 执行。使用原生 subagent 派生子任务；使用原生 send_message 汇报，不构造旧 Pi 会话或旧模型路由。"].filter(Boolean).join("\n\n");
  if (Buffer.byteLength(text) > 512 * 1024) throw new Error("AIGC_RESOURCES_TOO_LARGE");
  return { text };
}
