import type { ResearchAction } from "./contracts.ts";
import { parseHostAction } from "./actions.ts";

/** Preserve original scientific context; the host supplies the captured model and accounting. */
export function prepareNativeHelperAction(operationId: string, kind: string, value: unknown): ResearchAction {
  if (!["methods-draft", "next-experiments", "latex-assist"].includes(kind)) throw Error("RESEARCH_ACTION_INVALID");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("RESEARCH_HELPER_CONTEXT_INVALID");
  const context = value as { systemPrompt?: unknown; messages?: unknown };
  if (typeof context.systemPrompt !== "string" || !context.systemPrompt.trim() || !Array.isArray(context.messages) || !context.messages.length) throw Error("RESEARCH_HELPER_CONTEXT_INVALID");
  const messages = context.messages.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("RESEARCH_HELPER_CONTEXT_INVALID");
    const message = value as { role?: unknown; content?: unknown };
    if (message.role !== "user" || typeof message.content !== "string") throw Error("RESEARCH_HELPER_CONTEXT_INVALID");
    return message.content;
  });
  return parseHostAction({ operationId, kind, input: { references: [], prompt: JSON.stringify({ systemPrompt: context.systemPrompt, userPrompt: messages.join("\n\n") }) } });
}
