<template>
  <div class="gatewayModels">
    <el-card shadow="never">
      <div class="panelHeading"><h3>StudyBuddy API 网关</h3><el-button :loading="loading" @click="refresh">刷新模型</el-button></div>
      <p>{{ kind === "text" ? "选择新对话和文本创作的默认模型。平台额度与自有 API 按来源分别显示。" : "选择新视频节点的默认模型。视频使用已部署的网关模型与平台额度。" }}</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" showIcon />
      <el-form labelPosition="top">
        <el-form-item :label="kind === 'text' ? '默认文本模型' : '默认视频模型'">
          <el-select v-model="selected" filterable :loading="loading" placeholder="选择模型" :disabled="loading || saving" aria-label="默认创作模型">
            <el-option v-for="model in models" :key="model.value" :value="model.value" :label="`${model.label} · ${model.source}`" />
          </el-select>
        </el-form-item>
        <p v-if="selection" class="exactModel">{{ selection.source }}<br />{{ selection.modelId }}</p>
        <p v-else-if="selected && !loading" role="status">已保存的模型当前不可用，请重新选择已授权模型。</p>
        <el-button type="primary" :loading="saving" :disabled="!selection || loading" @click="saveDefault">保存默认模型</el-button>
      </el-form>
    </el-card>
    <div class="modelCards">
      <el-card v-for="model in models" :key="model.value" shadow="never">
        <div class="modelHeading"><strong>{{ model.label }}</strong><el-tag v-if="model.value === saved" type="success" size="small">默认</el-tag></div>
        <p>{{ model.source }}</p><p class="exactModel">{{ model.modelId }}</p>
        <p v-if="model.videoDetails">{{ model.videoDetails }}</p>
        <el-button text type="primary" @click="selected = model.value">选择此模型</el-button>
      </el-card>
    </div>
    <el-empty v-if="!loading && !error && !models.length" description="当前账号暂无已授权的模型" :imageSize="64" />
    <el-card v-if="kind === 'video' && tasks.length" shadow="never">
      <h3>视频任务</h3><p>停止等待不会取消已提交的网关任务。领取结果只查询原任务，不会重新生成。</p>
      <div v-for="task in tasks" :key="task.requestId" class="taskRow">
        <div><strong>{{ task.prompt }}</strong><p>{{ task.files?.length ? '已保存到项目' : task.state === 'unknown' ? '提交结果待查询' : task.state === 'completed' ? '等待领取结果' : task.state === 'failed' ? '生成失败' : '正在处理' }}</p>
          <p v-for="file in task.files" :key="file.path" class="exactModel">{{ file.path }}</p></div>
        <el-button :loading="receiving === task.requestId" :disabled="!!receiving || !!task.files?.length" @click="receive(task.requestId)">查询并领取</el-button>
      </div>
    </el-card>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import axios from "axios";
import { ElMessage } from "element-plus";
import { settings, saveSettings, refreshStudyBuddyModels, modelProviders } from "@/stores/settings";
const props = withDefaults(defineProps<{ kind: "text" | "video"; visible?: boolean }>(), { visible: true });
type Choice = { value: string; label: string; modelId: string; source: string; videoDetails?: string };
const models = ref<Choice[]>([]), selected = ref(""), loading = ref(false), saving = ref(false), error = ref("");
const tasks = ref<{ requestId: string; prompt: string; state: string; files?: { path: string }[] }[]>([]), receiving = ref("");
const saved = computed(() => {
  const defaults = settings.value.studyBuddyModelDefaults as Record<string, unknown> | undefined;
  return typeof defaults?.[props.kind] === "string" ? defaults[props.kind] as string : "";
});
const selection = computed(() => models.value.find(row => row.value === selected.value));
async function loadTasks() {
  const { data } = await axios.get("/api/ai/media/tasks");
  if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message ?? "任务读取失败");
  tasks.value = data.data;
}
async function refresh() {
  if (loading.value) return;
  loading.value = true; error.value = "";
  try {
    if (props.kind === "text") {
      await refreshStudyBuddyModels();
      models.value = modelProviders.value.flatMap(provider => provider.models.map(model => ({
        value: JSON.stringify([provider.id, model.id]), label: model.label, modelId: model.id, source: provider.label })));
    } else {
      const { data } = await axios.get("/api/ai/media/models");
      if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message ?? "视频模型读取失败");
      models.value = data.data.filter((row: { type: string }) => row.type === "video").map((row: { providerId: string; modelId: string; label: string; providerLabel: string; durationResolutionMap?: { duration: number[]; resolution: string[] }[] }) => ({
        value: JSON.stringify([row.providerId, row.modelId]), label: row.label, modelId: row.modelId, source: row.providerLabel,
        videoDetails: row.durationResolutionMap?.map(item => `${item.resolution.join(" / ")} · ${Math.min(...item.duration)}–${Math.max(...item.duration)} 秒`).join("；") }));
      await loadTasks();
    }
    if (!selected.value) selected.value = saved.value;
  } catch (e) { models.value = []; error.value = e instanceof Error ? e.message : "网关模型暂不可用"; }
  finally { loading.value = false; }
}
async function saveDefault() {
  if (!selection.value || saving.value) return;
  saving.value = true;
  try {
    const value = selection.value.value;
    await saveSettings(previous => ({ studyBuddyModelDefaults: { ...(previous.studyBuddyModelDefaults as Record<string, unknown> | undefined), [props.kind]: value } }));
    ElMessage.success("默认模型已保存，新建对话或节点时生效");
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); }
  finally { saving.value = false; }
}
async function receive(requestId: string) {
  receiving.value = requestId;
  try {
    const { data } = await axios.post("/api/ai/media/resume", { requestId });
    if (data.code !== 200) throw new Error(data.message ?? "查询失败");
    ElMessage[data.data.state === "completed" ? "success" : "info"](data.data.state === "completed" ? "视频已保存到原项目的素材目录" : data.data.error ?? "任务尚在处理中，请稍后查询");
    await loadTasks();
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : "查询失败"); }
  finally { receiving.value = ""; }
}
watch(() => props.visible, visible => { if (visible) void refresh(); }, { immediate: true });
</script>
<style scoped lang="scss">
.gatewayModels { display: grid; gap: 16px;
  .panelHeading, .modelHeading, .taskRow { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  h3 { margin: 0; }
  p { color: var(--el-text-color-regular); line-height: 1.7; }
  .el-form { margin-top: 20px; .el-select { width: 100%; } }
  .exactModel { color: var(--el-text-color-secondary); font-size: 12px; overflow-wrap: anywhere; }
  .modelCards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .taskRow { padding: 12px 0; border-top: 1px solid var(--el-border-color-lighter); p { margin: 6px 0; } }
}
</style>
