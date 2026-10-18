<template>
  <section class="nativeAigc">
    <agentMenu :name="name" :history="history" :sessionFile="selectedFile" :loading="busy" :readonlyFiles="legacy.map(row => row.file)"
      @new-chat="perform('new')" @history="loadHistory" @select="select" @rename="rename" @remove="remove" @close="visible = false">
      <template #actions><mentionMenu :directory="workspace.project?.directory" :active="visible" :disabled="busy || !chats" @select="addReferences" /><el-button class="toolRecords" text size="small" :aria-expanded="showRecords" aria-haspopup="dialog" @click="openRecords">工具详情</el-button><slot name="menuActions" /></template>
    </agentMenu>
    <div v-if="archive" class="archive">
      <div class="archiveHeader"><span>旧对话（只读）</span><el-button size="small" @click="continueArchive">在原生对话中继续</el-button><el-button size="small" @click="perform('open')">返回对话</el-button></div>
      <small>{{ archive.file }} · SHA-256 {{ archive.sha256 }}</small>
      <article v-for="(message, index) in archive.messages" :key="index"><pre>{{ archiveText(message) }}</pre></article>
      <details><summary>查看全部原始记录（包含其他分支）</summary><pre>{{ archiveText(archive.allRecords) }}</pre></details>
    </div>
    <el-dialog v-model="showRecords" title="工具详情" width="85%" appendToBody destroyOnClose @closed="stopRecords">
      <p v-if="!records.length">当前对话暂无工具记录。</p>
      <template v-for="tool in records" :key="tool.id">
        <toolMessage v-if="tool.name !== 'browser'" :tool="tool" :directory="workspace.project?.directory" />
      </template>
      <browserPanel v-if="records.some(tool => tool.name === 'browser')" :tools="records.filter(tool => tool.name === 'browser')" :directory="workspace.project?.directory" :active="showRecords" :live="true" />
    </el-dialog>
    <div v-if="!archive" ref="body" class="nativeBody" aria-label="StudyBuddy 原生创作对话">
      <p v-if="error" role="alert">{{ error }} <el-button size="small" @click="perform('open')">重试</el-button></p>
      <p v-else-if="busy" role="status">正在打开当前项目的原生对话…</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import agentMenu from "./menu.vue";
import type { AgentHistory } from "./types";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import toolMessage from "./toolMessage.vue";
import browserPanel from "@toonflow/tool-browser/panel";
import mentionMenu from "./mentionMenu.vue";
import type { AgentToolCall, AgentMention } from "@toonflow/server/agent/types";
const visible = defineModel<boolean>({ default: false });
interface Chat { sessionId: string; label: string; closed: boolean }
interface Chats { directory: string; selectedSessionId: string; chats: Chat[] }
interface Archive { file: string; sha256: string; messages: unknown[]; allRecords: unknown[] }
interface Host { request(input: unknown): Promise<unknown> }
const host = Reflect.get(window, "aigcHost") as Host | undefined, workspace = useWorkspaceStore();
const chats = ref<Chats>(), legacy = ref<{ file: string; label: string }[]>([]), archive = ref<Archive>(), busy = ref(false), error = ref("");
const body = ref<HTMLElement>(), selectedFile = computed(() => archive.value?.file ?? chats.value?.selectedSessionId);
const name = computed(() => archive.value ? "旧对话（只读）" : chats.value?.chats.find(row => row.sessionId === chats.value?.selectedSessionId)?.label ?? "StudyBuddy 创作助手");
const history = computed<AgentHistory[]>(() => [...(chats.value?.chats ?? []).map(row => ({ file: row.sessionId, name: row.label, modified: "", messageCount: 0 })),
  ...legacy.value.map(row => ({ file: row.file, name: `旧对话（只读） · ${row.label}`, modified: "", messageCount: 0 }))]);
let epoch = 0, disposed = false, animation = 0, previous = "", queued: unknown, publishing = false;
let consuming = false;
const pendingIds = new WeakMap<object, string>();
const showRecords = ref(false), records = ref<(AgentToolCall & { nativeSessionId: string })[]>([]);
let recordsTimer: ReturnType<typeof setTimeout> | undefined;
function stopRecords() { clearTimeout(recordsTimer); recordsTimer = undefined; records.value = []; }
async function openRecords() { showRecords.value = true; stopRecords(); await refreshRecords(); schedule(); }
async function refreshRecords() {
  const directory = workspace.project?.directory, sessionId = chats.value?.selectedSessionId, owner = epoch;
  if (!directory || !sessionId || !showRecords.value || disposed) return;
  try {
    const value = await request({ kind: "records", directory, sessionId });
    if (owner !== epoch || !showRecords.value || disposed) return;
    if (!Array.isArray(value)) throw new Error("AIGC_PRESENTATION_INVALID");
    records.value = value as (AgentToolCall & { nativeSessionId: string })[];
  } catch (cause) { if (owner === epoch && !disposed) { showRecords.value = false; fail(cause); } }
  finally { if (showRecords.value && !disposed && owner === epoch) recordsTimer = setTimeout(() => { void refreshRecords(); }, 1000); }
}
const request = async (input: unknown) => { if (!host) throw new Error("AIGC_NATIVE_BRIDGE_UNAVAILABLE"); return host.request(input); };
async function addReferences(references: AgentMention[]) {
  const directory = workspace.project?.directory, sessionId = chats.value?.selectedSessionId; if (!directory || !sessionId) return;
  try { await request({ kind: "reference", directory, sessionId, references }); }
  catch (cause) { fail(cause); }
}
function archiveText(message: unknown) { return typeof message === "string" ? message : JSON.stringify(message, null, 2); }
function fail(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "原生对话暂不可用", plugin = /^AIGC_PLUGIN_INCOMPATIBLE_([A-F0-9]+)$/.exec(message);
  error.value = plugin ? `插件「${new TextDecoder().decode(Uint8Array.from(plugin[1]!.match(/../g)!, value => parseInt(value, 16)))}」与原生运行时不兼容，请检查该插件。` : message;
  ElMessage.error(error.value);
}
async function perform(kind: "open" | "new" | "select" | "close", sessionId?: string) {
  const directory = workspace.project?.directory, owner = ++epoch; archive.value = undefined; error.value = ""; showRecords.value = false; stopRecords();
  if (!directory) { chats.value = undefined; await request({ kind: "hide" }).catch(() => {}); schedule(); return; }
  busy.value = true;
  try {
    const result = await request({ kind, directory, ...(sessionId ? { sessionId } : {}) }) as Chats;
    if (disposed || owner !== epoch || workspace.project?.directory !== directory) return;
    if (result.directory !== directory || !Array.isArray(result.chats)) throw new Error("AIGC_PROJECT_BINDING_INVALID");
    chats.value = result;
    if (workspace.project?.name) await request({ kind: "project-title", directory, name: workspace.project.name });
  } catch (cause) { if (owner === epoch && !disposed) fail(cause); }
  finally { if (owner === epoch && !disposed) { busy.value = false; await nextTick(); previous = ""; schedule(); void consumePending(); } }
}
async function consumePending() {
  const message = workspace.pendingAgentMessage, directory = workspace.project?.directory, sessionId = chats.value?.selectedSessionId, owner = epoch;
  if (consuming || disposed || busy.value || !visible.value || !message || !directory || message.directory !== directory || !sessionId) return;
  consuming = true;
  try {
    const choice = JSON.parse(message.model) as unknown;
    if (!Array.isArray(choice) || choice.length !== 2 || choice.some(value => typeof value !== "string" || !value)) throw new Error("请先选择模型");
    const files = useWorkspaceFiles(directory), attachments = message.attachments ?? [];
    for (const attachment of attachments) {
      if (!attachment.file) continue;
      for (const path of ["assets", "assets/chat"]) await files.mkdir(path).catch(cause => { if (cause?.response?.data?.data?.code !== "EEXIST") throw cause; });
      const extension = attachment.name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";
      const path = `assets/chat/${crypto.randomUUID()}${extension}`;
      await files.write(path, attachment.file, true); attachment.path = path; attachment.file = undefined;
    }
    if (disposed || epoch !== owner || workspace.project?.directory !== directory || workspace.pendingAgentMessage !== message) return;
    const requestId = pendingIds.get(message) ?? crypto.randomUUID(); pendingIds.set(message, requestId);
    await request({ kind: "submit", directory, sessionId, requestId, prompt: message.prompt, providerId: choice[0], modelId: choice[1], reasoningEffort: message.reasoningEffort,
      attachments: attachments.map(({ name, path, mimeType }) => ({ name, path, mimeType })) });
    if (workspace.pendingAgentMessage === message) workspace.pendingAgentMessage = null;
  } catch (cause) { if (owner === epoch && !disposed) fail(cause); }
  finally { consuming = false; schedule(); }
}
async function loadHistory() {
  const directory = workspace.project?.directory, owner = epoch; if (!directory) return;
  try {
    const [native, old] = await Promise.all([request({ kind: "list", directory }), request({ kind: "archive", directory })]);
    if (disposed || owner !== epoch || workspace.project?.directory !== directory) return;
    chats.value = native as Chats; legacy.value = old as { file: string; label: string }[];
  } catch (cause) { if (!disposed && owner === epoch) fail(cause); }
}
async function select(file: string) {
  if (file.startsWith("session-")) { await perform("select", file); return; }
  const directory = workspace.project?.directory, owner = ++epoch; if (!directory) return;
  busy.value = true;
  try {
    await request({ kind: "hide" }); const result = await request({ kind: "archive", directory, file });
    if (disposed || owner !== epoch || workspace.project?.directory !== directory) return;
    archive.value = result as Archive;
  } catch (cause) { if (!disposed && owner === epoch) fail(cause); }
  finally { if (owner === epoch && !disposed) { busy.value = false; schedule(); } }
}
async function continueArchive() {
  const directory = workspace.project?.directory, file = archive.value?.file, owner = ++epoch; if (!directory || !file) return;
  busy.value = true;
  try {
    const result = await request({ kind: "continue", directory, file });
    if (disposed || owner !== epoch || workspace.project?.directory !== directory) return;
    chats.value = result as Chats; archive.value = undefined;
  } catch (cause) { if (!disposed && owner === epoch) fail(cause); }
  finally { if (owner === epoch && !disposed) { busy.value = false; await nextTick(); previous = ""; schedule(); } }
}
async function rename(file: string, name: string) {
  const directory = workspace.project?.directory, owner = epoch; if (!directory || !file.startsWith("session-")) return;
  try { const value = await request({ kind: "rename", directory, sessionId: file, name }); if (!disposed && owner === epoch) chats.value = value as Chats; }
  catch (cause) { if (!disposed && owner === epoch) fail(cause); }
}
async function remove(file: string) { if (file.startsWith("session-")) await perform("close", file); }
function schedule() { if (!disposed && !animation) animation = requestAnimationFrame(report); }
function report() {
  animation = 0; const element = body.value, directory = workspace.project?.directory;
  if (disposed || !directory || !element) return;
  const bounds = element.getBoundingClientRect();
  const obscured = [...document.querySelectorAll<HTMLElement>(".el-overlay, .el-popper")].some(overlay => {
    const style = getComputedStyle(overlay), rect = overlay.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && rect.left < bounds.right && rect.right > bounds.left && rect.top < bounds.bottom && rect.bottom > bounds.top;
  });
  const rect = { x: Math.max(0, bounds.x), y: Math.max(0, bounds.y), width: Math.max(0, bounds.width), height: Math.max(0, bounds.height) };
  const input = { kind: "surface", directory, visible: visible.value && !busy.value && !archive.value && !error.value && !obscured && bounds.width > 0 && bounds.height > 0, rect };
  const key = JSON.stringify(input); if (key === previous) return; previous = key; queued = input;
  void publishSurface();
}
async function publishSurface() {
  if (publishing) return; publishing = true;
  try { while (queued && !disposed) { const value = queued; queued = undefined; await request(value); } }
  catch { previous = ""; }
  finally { publishing = false; }
}
const resize = new ResizeObserver(schedule), changes = new MutationObserver(schedule);
watch(body, (next, old) => { if (old) resize.unobserve(old); if (next) resize.observe(next); schedule(); });
watch(() => workspace.project?.directory, () => { legacy.value = []; void perform("open"); }, { immediate: true });
watch(visible, () => { schedule(); void consumePending(); });
watch(() => workspace.pendingAgentMessage, () => { void consumePending(); });
watch(() => workspace.project?.name, (name, previousName) => {
  if (!name || name === previousName || !workspace.project?.directory || chats.value?.directory !== workspace.project.directory) return;
  void request({ kind: "project-title", directory: workspace.project.directory, name }).catch(fail);
});
onMounted(() => { changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "open"] }); window.addEventListener("resize", schedule); document.addEventListener("scroll", schedule, true); schedule(); });
onBeforeUnmount(() => { disposed = true; ++epoch; stopRecords(); resize.disconnect(); changes.disconnect(); cancelAnimationFrame(animation); window.removeEventListener("resize", schedule); document.removeEventListener("scroll", schedule, true); void request({ kind: "hide" }).catch(() => {}); });
</script>

<style scoped>
.nativeAigc { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
.nativeAigc :deep(.agentMenu .menuActions) { align-items: center; gap: 6px; }
.nativeAigc :deep(.agentMenu .menuActions .el-button) { flex-shrink: 0; width: 26px; height: 28px; }
.nativeAigc :deep(.agentMenu .menuActions .toolRecords) { width: max-content; min-width: max-content; padding: 0; border-radius: var(--el-border-radius-base); }
.nativeBody { flex: 1; min-height: 0; position: relative; }
.nativeBody p { padding: 12px; }
.archive { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.archiveHeader { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.archive small { overflow-wrap: anywhere; color: var(--el-text-color-secondary); }
.archive article { border-bottom: 1px solid var(--el-border-color-lighter); padding: 10px 0; }
.archive pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; }
</style>
