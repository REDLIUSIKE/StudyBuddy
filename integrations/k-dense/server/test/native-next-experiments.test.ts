import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { PROJECTS_ROOT } from "../src/config.ts";
import { createProject, resolvePaths } from "../src/projects.ts";
import { appendNotebookEntry } from "../src/agent/notebook-store.ts";
import { buildNextExperimentContext } from "../src/agent/next-experiment-context.ts";
import { generateNextExperiments } from "../src/agent/next-experiments.ts";
import { experimentPlan, experimentSource as source } from "../../web/src/test/next-experiments-fixture.ts";
vi.mock("../src/agent/session-registry.ts", () => { throw Error("Native planner must not initialize Pi"); });
beforeEach(() => {
  vi.stubEnv("KADY_RUNTIME_PROFILE", "studybuddy"); fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true });
  createProject({ name: "Native plans", projectId: "study" });
  appendNotebookEntry(source.sessionId, { id: source.entryId, type: "hypothesis", title: "Treatment lowers marker X", body: "Potential batch confounding remains unresolved.", artifacts: ["data.csv"], role: "agent", timestamp: 1 }, "study");
  fs.writeFileSync(path.join(resolvePaths("study").sandbox, "data.csv"), "sample,batch,treatment\na,1,yes\nb,1,no\n");
});
afterAll(() => { vi.unstubAllEnvs(); fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true }); });
it("retains reviewed sources and idempotent receipts while using native execution/accounting", async () => {
  const complete = vi.fn(async () => ({ text: JSON.stringify(experimentPlan), nativeSessionId: "native-helper", nativeRunId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
  const request = { requestId: randomUUID(), approveModelCall: true, expectedContextDigest: (await buildNextExperimentContext("study", source)).context.digest };
  const native = { complete, current: () => true };
  const result = await (generateNextExperiments as Function)("study", source, request, undefined, native);
  expect(result.binding.generation).toMatchObject({ billingMode: "native-ledger", nativeSessionId: "native-helper" });
  expect(result.binding.generation).not.toHaveProperty("costUsd"); expect(result.binding.generation).not.toHaveProperty("model");
  expect((await (generateNextExperiments as Function)("study", source, request, undefined, native)).reused).toBe(true);
  expect(complete).toHaveBeenCalledTimes(1);
});
