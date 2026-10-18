import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { PROJECTS_ROOT } from "../src/config.ts";
import { createProject, resolvePaths } from "../src/projects.ts";
import { appendNotebookEntry } from "../src/agent/notebook-store.ts";
import { NativeScientificHelpers } from "../src/runtime/native-scientific-helpers.ts";
import type { ResearchAction, ResearchRuntime, RuntimeContext } from "../src/runtime/contracts.ts";

vi.mock("../src/agent/session-registry.ts", () => { throw Error("Native helpers must not initialize Pi"); });
const op = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeEach(() => { fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true }); createProject({ name: "Native research", projectId: "study" }); vi.stubEnv("KADY_RUNTIME_PROFILE", "studybuddy"); });
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true }); });
function fixture(text: string, afterSubmit: () => void = () => {}) {
  let live = true, submitted = 0;
  const context: RuntimeContext = { projectId: "study", sessionRef: "native-session", hostBinding: {} };
  const runtime = { submit: async (_context: RuntimeContext, action: ResearchAction) => {
    submitted++; afterSubmit();
    return { runId: action.operationId, state: "completed", result: { kind: "message", value: { text, nativeSessionId: "helper-session" } } };
  } } as ResearchRuntime;
  const helpers = new NativeScientificHelpers({ project: async () => ({ context, runtime }), current: () => live });
  return { helpers, context, revoke: () => { live = false; }, count: () => submitted };
}
it("uses the original LaTeX decision parser and returns native receipt references without invented prices", async () => {
  const f = fixture('{"status":"replacement","replacement":"Correct scientific text"}');
  const result = await f.helpers.latexAssist({ mode: "edit", fileName: "paper.tex", instruction: "Fix grammar", selection: "Original", operationId: op }, "study");
  expect(result).toMatchObject({ status: "replacement", replacement: "Correct scientific text", nativeRunId: op, nativeSessionId: "helper-session" });
  expect(result).not.toHaveProperty("costUsd"); expect(result).not.toHaveProperty("inputTokens");
  await f.helpers.latexAssist({ mode: "edit", fileName: "paper.tex", instruction: "Fix grammar", selection: "Original", operationId: op }, "study");
  expect(f.count()).toBe(1);
});
it("refuses page model overrides and invalid scientific inputs before native dispatch", async () => {
  const f = fixture("unused");
  await expect(f.helpers.latexAssist({ mode: "edit", fileName: "paper.tex", instruction: "Edit", selection: "Original", model: "foreign", operationId: op }, "study")).rejects.toThrow("NATIVE_MODEL_CONTROL_REQUIRED");
  await expect(f.helpers.latexAssist({ mode: "fix", fileName: "paper.tex", operationId: op }, "study")).rejects.toThrow("fix mode requires");
  expect(f.count()).toBe(0);
});
it("writes a Methods draft only from the original reviewed notebook context and completed native result", async () => {
  appendNotebookEntry("native-session", { id: "m1", type: "method", role: "agent", title: "Executed check", timestamp: 1, body: "Command: python verify.py. Observed exit 0; output recorded." }, "study");
  const f = fixture("## Methods\nWe performed the recorded check [m1].");
  const result = await f.helpers.methodsDraft("native-session", "study", { operationId: op });
  expect(result.path).toBe("methods_draft_native-session.md");
  expect(fs.readFileSync(path.join(resolvePaths("study").sandbox, result.path), "utf8")).toContain("recorded check");
});
it("never applies a late helper result after account revocation", async () => {
  appendNotebookEntry("native-session", { id: "m1", type: "method", role: "agent", title: "Recorded attempt", timestamp: 1 }, "study");
  let f: ReturnType<typeof fixture>;
  f = fixture("## Methods\nLate text", () => f.revoke());
  await expect(f.helpers.methodsDraft("native-session", "study", { operationId: op })).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
  expect(fs.existsSync(path.join(resolvePaths("study").sandbox, "methods_draft_native-session.md"))).toBe(false);
});
