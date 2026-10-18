import { afterEach, describe, expect, it, vi } from "vitest";
const initialization = vi.hoisted(() => vi.fn(() => { throw Error("PI_INITIALIZATION_FORBIDDEN"); }));
vi.mock("../src/agent/session-registry.ts", () => { initialization(); return {}; });
afterEach(() => vi.unstubAllEnvs());

describe("helper context without a standalone provider runtime", () => {
  it("prepares Methods context from recorded work without reading provider credentials", async () => {
    const { buildMethodsDraftContext } = await import("../src/agent/methods-draft.ts");
    const context = buildMethodsDraftContext([{ id: "method-a", type: "method", title: "Processed the provided dataset", role: "agent", timestamp: 1000,
      body: "Used the recorded normalization command" }], { sessionId: "session-a", projectName: "Study A" });
    expect(String(context.messages[0].content)).toContain("METHOD: Processed the provided dataset");
    expect(String(context.messages[0].content)).toContain("Session: session-a");
    expect(initialization).not.toHaveBeenCalled();
  });
  it("preserves the exact edit selection and separates it from instructions", async () => {
    const { buildAssistContext } = await import("../src/latex/assist.ts");
    const context = buildAssistContext({ mode: "edit", fileName: "results.tex", instruction: "Correct punctuation only", selection: "A measured result." });
    expect(JSON.parse(String(context.messages[0].content))).toEqual({ mode: "edit", editInstruction: "Correct punctuation only",
      referenceData: { fileName: "results.tex", selection: "A measured result." } });
    expect(initialization).not.toHaveBeenCalled();
  });
  it("prepares reviewed planning context without initializing a model runtime", async () => {
    const { createProject } = await import("../src/projects.ts");
    const { appendNotebookEntry } = await import("../src/agent/notebook-store.ts");
    const { buildNextExperimentContext } = await import("../src/agent/next-experiment-context.ts");
    const { proposalGenerationContext } = await import("../src/agent/next-experiments.ts");
    createProject({ name: "Context isolation", projectId: "helper-context" });
    appendNotebookEntry("session-a", { id: "hypothesis-a", type: "hypothesis", title: "A tentative explanation", role: "agent", timestamp: 1000 }, "helper-context");
    const { context } = await buildNextExperimentContext("helper-context", { sessionId: "session-a", entryId: "hypothesis-a" });
    const prepared = proposalGenerationContext(context, "Prefer existing data");
    const data = JSON.parse(String(prepared.messages[0].content));
    expect(data.target).toEqual({ sessionId: "session-a", entryId: "hypothesis-a" });
    expect(data.constraints).toBe("Prefer existing data");
    expect(initialization).not.toHaveBeenCalled();
  });
  it.each(["methods-draft", "next-experiments", "latex-assist"])("refuses the standalone %s runner in embedded mode before initialization", async kind => {
    vi.stubEnv("KADY_RUNTIME_PROFILE", "studybuddy");
    const run = async () => {
      if (kind === "methods-draft") return (await import("../src/agent/methods-draft.ts")).runMethodsDraft("session-a", "project-a");
      if (kind === "next-experiments") return (await import("../src/agent/next-experiments.ts")).generateNextExperiments("project-a", { sessionId: "session-a", entryId: "hypothesis-a" }, {});
      return (await import("../src/latex/assist.ts")).runLatexAssist({ mode: "edit", fileName: "results.tex", instruction: "Correct punctuation", selection: "A result." }, "project-a");
    };
    await expect(run()).rejects.toThrow("An admitted research host is required");
    expect(initialization).not.toHaveBeenCalled();
  });
});
