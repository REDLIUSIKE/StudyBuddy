import { createHash } from "node:crypto";
import { z } from "zod";
import type { InstalledAgentTool } from "@/agent/tools";

const selection = z.union([
  z.object({ filePath: z.string().min(1).max(4096) }),
  z.object({ canvasPath: z.string().min(1).max(4096), nodeId: z.string().min(1).max(256) }),
]);
const schemas = {
  getDocument: z.strictObject({}),
  openDocument: z.strictObject({ path: z.string().max(4096).optional(), canvasPath: z.string().max(4096).optional(), nodeId: z.string().max(256).optional(), handleId: z.string().max(256).optional() }),
  writeDocument: z.strictObject({ text: z.string().max(10_000_000), expectedText: z.string().max(10_000_000), expectedSelection: selection }),
};
const descriptions = {
  getDocument: "读取文档编辑器当前文本、selection 和全部打开资源。修改前须重新读取。",
  openDocument: "在当前项目的文档编辑器中打开文件(path)或画布文本节点(canvasPath、nodeId)。",
  writeDocument: "通过当前文档编辑器保存文本。必须携带 getDocument 返回的 expectedText 和 expectedSelection，内容或标签切换时拒绝写入。",
};
/** Reuse the existing restricted Vue control path; never write behind an open editor. */
export function documentTools(call: (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>): InstalledAgentTool[] {
  return Object.entries(schemas).map(([name, schema]) => {
    const parameters = z.toJSONSchema(schema), sourceRevision = createHash("sha256").update(JSON.stringify(parameters) + descriptions[name as keyof typeof schemas]).digest("hex");
    return { name, label: name, description: descriptions[name as keyof typeof schemas], parameters, sourcePlugin: "nativeDocument", sourceRevision,
      async execute(_id, args, signal) { const result = await call(name, schema.parse(args), signal); return { content: [{ type: "text", text: JSON.stringify(result) }], details: null }; } };
  });
}
