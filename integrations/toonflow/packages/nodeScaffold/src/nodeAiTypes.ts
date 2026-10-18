import type { MediaGenerationRequest, MediaModel } from "@toonflow/tools-scaffold/runtime";
import type { NodeOutput } from "./values";

export type NodeAiModel = {
  providerId: string;
  providerLabel: string;
  modelId: string;
  label: string;
  protocol: "openai-completions" | "openai-responses" | "anthropic-messages";
  contextWindow?: number;
  maxOutputTokens?: number;
};
export type NodeMediaModel = Omit<MediaModel, "mode"> & {
  mode?: (string | string[])[];
};
export type NodeImageRequest = {
  nativeCaller?:import('@toonflow/tools-scaffold/runtime').NativeCapabilityOrigin;
  directory: string;
  providerId: string;
  modelId: string;
  prompt: string;
  outputDirectory: string;
  images?: { path: string; mimeType: string }[];
  ratio?: string;
  size?: string;
};
export type NodeImageResult = { path: string; mimeType: string; mediaType: "image" };
export type NodeVideoRequest = Omit<MediaGenerationRequest, "size"> & { directory: string; outputDirectory: string;nativeCaller?:import('@toonflow/tools-scaffold/runtime').NativeCapabilityOrigin };
export type NodeVideoResult = { path: string; mimeType: string; mediaType: "video" };
export type NodeAudioRequest = Pick<MediaGenerationRequest, "providerId" | "modelId" | "prompt" | "images" | "audios" | "voice" | "speed" | "volume" | "pitch" | "language" | "format" | "sampleRate"> & { directory: string; outputDirectory: string;nativeCaller?:import('@toonflow/tools-scaffold/runtime').NativeCapabilityOrigin };
export type NodeAudioResult = { path: string; mimeType: string; mediaType: "audio" };
export type NodeAiRequest = {
  providerId: string;
  modelId: string;
  prompt: string;
  systemPrompt?: string;
  directory?: string;
  references?: Extract<NodeOutput, { dataType: "STRING" | "IMAGE" | "VIDEO" }>[];
  tools?: NodeAiTool[];
  onEvent?: (event: NodeAiEvent) => void;
  signal?: AbortSignal;
};
export type NodeAiResult = {
  text: string;
  reasoning?: string;
};
export type NodeAiEvent = { type: "text" | "reasoning"; delta: string }
  | { type: "toolStart"; id: string; name: string; args: unknown }
  | { type: "toolEnd"; id: string; name: string; result: unknown; isError: boolean };
export type NodeAiTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, signal?: AbortSignal): unknown | Promise<unknown>;
};

