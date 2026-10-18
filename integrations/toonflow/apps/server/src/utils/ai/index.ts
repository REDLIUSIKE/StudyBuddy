import { z } from "zod";
import { getStudyBuddyModels, refreshGateway } from "@/utils/studyBuddy/gateway";
import { readReference } from "@/utils/media/generation";

export function listAiModels() { return getStudyBuddyModels(); }
export async function refreshProviderModels() { await refreshGateway(); return listAiModels(); }
export function getConfiguredModel(providerId: string, modelId: string) {
  const model = listAiModels().find(item => item.providerId === providerId && item.modelId === modelId);
  if (!model) throw new Error("AIGC_MODEL_UNAVAILABLE");
  return { providerId, modelId };
}
export const aiReferenceSchema = z.discriminatedUnion("dataType", [
  z.object({ dataType: z.literal("STRING"), value: z.string().max(1000000) }),
  z.object({ dataType: z.literal("IMAGE"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().startsWith("image/") }) }),
  z.object({ dataType: z.literal("VIDEO"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().startsWith("video/") }) }),
]);
export async function readAiReferences(directory: string | undefined, references: z.infer<typeof aiReferenceSchema>[], signal?: AbortSignal) {
  return Promise.all(references.map(async item => {
    if (item.dataType === "STRING") return item;
    if (!directory) throw new Error("AIGC_WORKSPACE_REQUIRED");
    const media = await readReference(directory, { path: item.value.url, mimeType: item.value.mimeType }, item.dataType.toLowerCase(), signal);
    return { dataType: item.dataType, value: `data:${media.mimeType};base64,${media.data}` };
  }));
}
