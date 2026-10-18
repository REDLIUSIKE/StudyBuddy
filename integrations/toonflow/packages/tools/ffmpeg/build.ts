import { createToolConfig } from "@toonflow/tools-scaffold";

await createToolConfig({
  name: "ffmpeg",
  displayName: "FFmpeg 媒体处理",
  description: "使用本机 FFmpeg 处理工作区音视频、图片，并通过 FFprobe 查询媒体信息。",
  author: "Toonflow",
  github: "https://github.com/HBAI-Ltd/Toonflow-app",
  prompt: `处理前按需使用 ffprobe 查询实际媒体信息，再通过 ffmpeg 的 steps 顺序调用 fluent 方法，operation 选择执行或能力查询。
FFmpeg 选项、滤镜和文件序列沿用原生语法；工具不重写输出位置，不强制设置超时。根据用户要求选择输出位置，除非用户要求覆盖，否则使用新文件名。
显式路径和滤镜、参数、媒体清单中的文件均使用当前工作区内的路径。等待执行成功后再交付，不把声明的输出路径当成已生成文件。FFmpeg 未就绪时提示用户在插件市场配置。`,
  configRules: [],
}, import.meta.url);
