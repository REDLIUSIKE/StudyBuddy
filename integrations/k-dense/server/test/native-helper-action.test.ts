import { describe, expect, it } from "vitest";
import * as entry from "../src/index.ts";
import { buildAssistContext } from "../src/latex/assist.ts";

const id = "44444444-4444-4444-8444-444444444444";
function prepare(kind: string, context: unknown) {
  const build = (entry as unknown as Record<string, unknown>).prepareNativeHelperAction;
  if (typeof build !== "function") throw Error("NATIVE_HELPER_ACTION_NOT_IMPLEMENTED");
  return build(id, kind, context) as { operationId: string; kind: string; input: { prompt: string; references: string[] } };
}

describe("source-preserving native helper requests", () => {
  it("retains the reviewed scientific system prompt and exact user data as separate fields", () => {
    const source = buildAssistContext({ mode: "edit", fileName: "results.tex", instruction: "Correct punctuation", selection: "Measured value: 2.5" });
    const action = prepare("latex-assist", source);
    expect(action.operationId).toBe(id);
    expect(action.kind).toBe("latex-assist");
    expect(action.input.references).toEqual([]);
    const payload = JSON.parse(action.input.prompt);
    expect(payload.systemPrompt).toBe(source.systemPrompt);
    expect(JSON.parse(payload.userPrompt)).toEqual({ mode: "edit", editInstruction: "Correct punctuation", referenceData: { fileName: "results.tex", selection: "Measured value: 2.5" } });
    expect(Object.keys(payload).sort()).toEqual(["systemPrompt", "userPrompt"]);
  });
  it("rejects a provider/model override and nontext context before native admission", () => {
    expect(() => prepare("provider-fetch", { systemPrompt: "Instructions", messages: [{ role: "user", content: "Input" }] })).toThrow("RESEARCH_ACTION_INVALID");
    expect(() => prepare("latex-assist", { systemPrompt: "Instructions", messages: [{ role: "assistant", content: "An unreviewed reply" }] })).toThrow("RESEARCH_HELPER_CONTEXT_INVALID");
    expect(() => prepare("latex-assist", { systemPrompt: "Instructions", messages: [{ role: "user", content: [{ type: "image", data: "unsupported" }] }] })).toThrow("RESEARCH_HELPER_CONTEXT_INVALID");
  });
});
