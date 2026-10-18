import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { PROJECTS_ROOT } from "../src/config.ts";
import { resolvePaths } from "../src/projects.ts";
import { ProvenanceRecorder } from "../src/provenance/recorder.ts";
import { readSteps } from "../src/provenance/store.ts";
import { createHash } from "node:crypto";
it("identifies a read at the awaited live execution start instead of after replacement", async () => {
  fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true });
  const root = resolvePaths("default").sandbox; fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "data.csv"), "before");
  const recorder = new ProvenanceRecorder({ projectId: "default", sessionId: "source", sandboxRoot: root, getModel: () => undefined, captureEnvironment: false });
  expect(recorder.beginObserved, "The live recorder must await a before-state before tool dispatch").toBeTypeOf("function");
  await recorder.beginObserved({ id: "read-1", toolName: "read", args: { path: "data.csv" } });
  fs.writeFileSync(path.join(root, "data.csv"), "later replacement");
  await recorder.endObserved({ id: "read-1", isError: false });
  expect(readSteps("source", "default")[0]?.inputs[0]).toMatchObject({ size: 6, confidence: "observed" });
});
it("does not identify a declared path through a junction outside the project", async () => {
  const root = resolvePaths("default").sandbox, foreign = resolvePaths("foreign").sandbox;
  fs.mkdirSync(foreign, { recursive: true }); fs.writeFileSync(path.join(foreign, "foreign.csv"), "other project");
  fs.symlinkSync(foreign, path.join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
  const recorder = new ProvenanceRecorder({ projectId: "default", sessionId: "source-link", sandboxRoot: root, getModel: () => undefined, captureEnvironment: false });
  await recorder.beginObserved({ id: "outside", toolName: "read", args: { path: "alias/foreign.csv" } });
  await recorder.endObserved({ id: "outside", isError: false });
  expect(readSteps("source-link", "default")[0]?.inputs).toEqual([]);
});
it("retains pre-command bytes for inferred shell inputs even when a rewrite preserves scan stats", async () => {
  const root = resolvePaths("default").sandbox, file = path.join(root, "opaque.csv"); fs.writeFileSync(file, "before"); fs.utimesSync(file, 1000, 1000);
  const recorder = new ProvenanceRecorder({ projectId: "default", sessionId: "source-shell", sandboxRoot: root, getModel: () => undefined, captureEnvironment: false });
  await recorder.beginObserved({ id: "opaque", toolName: "bash", args: { command: "python analysis.py opaque.csv" } });
  fs.writeFileSync(file, "change"); fs.utimesSync(file, 1000, 1000);
  await recorder.endObserved({ id: "opaque", isError: false });
  expect(readSteps("source-shell", "default")[0]?.inputs[0]).toMatchObject({ confidence: "inferred", sha256: createHash("sha256").update("before").digest("hex") });
});
