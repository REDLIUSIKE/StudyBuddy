"use client";
import { nativeResearchRequest } from "@/lib/research-host";
import { toast } from "sonner";
/** Model choice and persistent defaults use the shell's existing exact model directory. */
export function NativeModelsPanel() {
  return <section className="space-y-3 rounded-lg border p-4">
    <h3 className="font-semibold">StudyBuddy API 网关</h3>
    <p className="text-sm text-muted-foreground">在右侧原生对话中选择供应商、模型与资金来源。持久默认和当前会话选择沿用客户端现有设置。</p>
    <p className="text-sm text-muted-foreground">模型授权与自备 API 在「我的 AI」管理；研究工作台使用同一目录与真实记账。</p>
    <button className="rounded border px-3 py-2 text-sm" onClick={() => { void nativeResearchRequest({ kind: "show-models" }).catch(error => toast.error(String(error))); }}>打开原生模型选择</button>
  </section>;
}
