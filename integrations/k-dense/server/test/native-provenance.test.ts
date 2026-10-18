import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PROJECTS_ROOT } from "../src/config.ts";
import { resolvePaths } from "../src/projects.ts";
import { ProvenanceRecorder } from "../src/provenance/recorder.ts";
import { readSteps } from "../src/provenance/store.ts";
import { environmentId, readEnvironment, type EnvironmentSnapshot } from "../src/provenance/environment.ts";
import { NativeProvenance, NativeScientificResultSource } from "../src/runtime/native-provenance.ts";
import { setNativeNotebookResultLookup, snapshotNotebookResults, resolveNotebookResult } from "../src/agent/notebook-results.ts";
import { appendNotebookEntry } from "../src/agent/notebook-store.ts";
import { createHash } from "node:crypto";

const context = { projectId: "default", sessionRef: "native-root" };
const executionId = "11111111-1111-4111-8111-111111111111";
const card = { schemaVersion: 1, kind: "statistical-test", title: "Measured comparison", tests: [{ name: "Welch t-test", estimate: 2.3, sampleSize: 100 }] };
let current = true;
beforeEach(() => { fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true }); fs.mkdirSync(resolvePaths("default").sandbox, { recursive: true }); current = true; });
afterEach(() => setNativeNotebookResultLookup(undefined));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function args(toolName: string, arguments_: unknown, id = executionId, actorSessionId = context.sessionRef) {
  return { schemaVersion: 1, action: "begin", executionId: id, rootSessionId: context.sessionRef, actorSessionId, parentSessionId: actorSessionId === context.sessionRef ? null : context.sessionRef, rootCallId: "call-1", toolCallId: "call-1", toolName, arguments: arguments_, argumentsSha256: hash(JSON.stringify(arguments_)), argumentsTruncated: false, startedAt: 100 };
}
const finish = (id = executionId, isError = false) => ({ schemaVersion: 1, action: "finish", executionId: id, endedAt: 110, isError, outcome: isError ? "failed" : "completed" });
function setup(maxScanFiles?: number) {
  return new NativeProvenance({ current: () => current, captureEnvironment: false, ...(maxScanFiles === undefined ? {} : { maxScanFiles }) });
}
it("records read identity before a later write and captures output bytes from actual execution", async () => {
  const root = resolvePaths("default").sandbox; fs.writeFileSync(path.join(root, "data.csv"), "before");
  const recorder = new ProvenanceRecorder({ projectId: "default", sessionId: "source", sandboxRoot: root, getModel: () => undefined, captureEnvironment: false });
  await recorder.beginObserved({ id: "read-1", toolName: "read", args: { path: "data.csv" } });
  fs.writeFileSync(path.join(root, "data.csv"), "later replacement");
  await recorder.endObserved({ id: "read-1", isError: false });
  expect(readSteps("source", "default")[0]?.inputs[0]).toMatchObject({ sha256: hash("before"), confidence: "observed" });
});
it("reuses the recorder environment snapshot and preserves the native execution lineage", async () => {
  const body = { schemaVersion: 1 as const, os: { platform: "fixture", release: "one", arch: "x64" }, lockfiles: [] };
  const env: EnvironmentSnapshot = { ...body, id: environmentId(body), capturedAt: 1 };
  const recorder = new NativeProvenance({ current: () => current, captureEnvironment: async () => env });
  await recorder.command(context, args("write", { file_path: "figure.txt" }, executionId, "native-child"));
  fs.writeFileSync(path.join(resolvePaths("default").sandbox, "figure.txt"), "actual figure");
  await recorder.command(context, finish());
  const step = readSteps("native-child", "default")[0]!;
  expect(step).toMatchObject({ role: "subagent", environmentId: env.id, outputs: [{ path: "figure.txt", sha256: hash("actual figure"), confidence: "observed", change: "created" }] });
  expect(step.args).toMatchObject({ nativeExecution: { rootSessionId: "native-root", actorSessionId: "native-child", parentSessionId: "native-root", toolCallId: "call-1", argumentsSha256: expect.any(String) } });
  expect(readEnvironment(env.id, "default")).toEqual(env);
});
it("shares the original recorder environment across successive calls in one native session", async () => {
  const body = { schemaVersion: 1 as const, os: { platform: "fixture", release: "one", arch: "x64" }, lockfiles: [] };
  const env: EnvironmentSnapshot = { ...body, id: environmentId(body), capturedAt: 1 }; let captures = 0;
  const p = new NativeProvenance({ current: () => current, captureEnvironment: async () => { captures++; return env; } });
  await p.command(context, args("read", { path: "none" })); await p.command(context, finish());
  const second = "22222222-2222-4222-8222-222222222222";
  await p.command(context, args("read", { path: "none" }, second)); await p.command(context, finish(second));
  expect(captures).toBe(1);
});
it("marks overlapping shell effects inferred across native root and child recorders", async () => {
  const p = setup(), second = "22222222-2222-4222-8222-222222222222", root = resolvePaths("default").sandbox;
  fs.writeFileSync(path.join(root, "script.py"), "script"); fs.writeFileSync(path.join(root, "data.csv"), "data");
  await p.command(context, args("pwsh", { command: "python script.py data.csv" }));
  await p.command(context, args("bash", { command: "python other.py" }, second, "native-child"));
  fs.writeFileSync(path.join(root, "answer.csv"), "answer");
  await p.command(context, finish()); await p.command(context, finish(second));
  const step = readSteps("native-root", "default")[0]!;
  expect(step.outputs[0]?.confidence).toBe("inferred");
  expect(step.inputs).toEqual(expect.arrayContaining([expect.objectContaining({ path: "data.csv", confidence: "inferred" }), expect.objectContaining({ path: "script.py", confidence: "inferred" })]));
});
it("does not infer deletions from an incomplete bounded scan", async () => {
  const p = setup(1), root = resolvePaths("default").sandbox;
  fs.writeFileSync(path.join(root, "a"), "a"); fs.writeFileSync(path.join(root, "b"), "b");
  await p.command(context, args("pwsh", { command: "anything" }));
  fs.unlinkSync(path.join(root, "a")); await p.command(context, finish());
  expect(readSteps("native-root", "default")[0]).toMatchObject({ degraded: "sandbox-too-large", outputs: [] });
});
it("reports omitted parameter members and output edges as bounded observations", async () => {
  const p = setup(), root = resolvePaths("default").sandbox;
  await p.command(context, args("bash", { command: "produce", labels: Array.from({ length: 100 }, () => "x") }));
  for (let index = 0; index < 201; index++) fs.writeFileSync(path.join(root, `output-${index}.txt`), String(index));
  await p.command(context, finish());
  const step = readSteps("native-root", "default")[0]!;
  expect(step.outputs).toHaveLength(200); expect(step.truncatedEdges).toBe(1);
  expect(step.args).toMatchObject({ nativeExecution: { argumentsTruncated: true } });
});
it("keeps unfinished observations uncertain after close and refuses new scope work", async () => {
  const p = setup(); await p.command(context, args("bash", { command: "prepare" })); await p.close();
  await expect(p.command(context, finish())).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
  expect(readSteps("native-root", "default")).toEqual([]);
  const recovered = setup(); await recovered.command(context, finish());
  expect(readSteps("native-root", "default")[0]).toMatchObject({ degraded: "no-scan-baseline", outputs: [] });
});
it("does not attribute later cross-session changes as observed after an unresolved background execution", async () => {
  const p = setup(); await p.command(context, args("bash", { command: "background" }));
  await p.command(context, { ...finish(), outcome: "unknown", process: { kind: "background", jobId: "job-1" } });
  const recovered = setup(), next = "22222222-2222-4222-8222-222222222222";
  await recovered.command(context, args("write", { path: "later.txt" }, next, "native-child"));
  fs.writeFileSync(path.join(resolvePaths("default").sandbox, "later.txt"), "observed after unresolved work"); await recovered.command(context, finish(next));
  expect(readSteps("native-child", "default")[0]?.outputs[0]?.confidence).toBe("inferred");
});
it("retains promoted native process handles as unknown execution instead of rejecting their observation", async () => {
  const p = setup(); await p.command(context, args("pwsh", { command: "promoted" }));
  await expect(p.command(context, { ...finish(), outcome: "unknown", process: { kind: "promoted", jobId: "promoted-1" } })).resolves.toMatchObject({ state: "unknown" });
});
it("keeps failure effects, deduplicates result delivery and refuses a replay after process loss", async () => {
  const p = setup(), root = resolvePaths("default").sandbox;
  await p.command(context, args("write", { path: "partial.txt" })); fs.writeFileSync(path.join(root, "partial.txt"), "partial");
  await p.command(context, finish(executionId, true)); await p.command(context, finish(executionId, true));
  expect(readSteps("native-root", "default")).toHaveLength(1);
  expect(readSteps("native-root", "default")[0]).toMatchObject({ isError: true, outputs: [expect.objectContaining({ sha256: hash("partial") })] });
  const pending = "33333333-3333-4333-8333-333333333333";
  await p.command(context, args("bash", { command: "generate" }, pending));
  const recovered = setup();
  await expect(recovered.command(context, args("bash", { command: "generate" }, pending))).rejects.toThrow("NATIVE_PROVENANCE_EXECUTION_UNCERTAIN");
  await recovered.command(context, { ...finish(pending), outcome: "unknown" });
  expect(readSteps("native-root", "default").at(-1)).toMatchObject({ degraded: "no-scan-baseline", inputs: [], outputs: [] });
});
it("fences revoked and mismatched project/root observation requests", async () => {
  const p = setup();
  await expect(p.command(context, { ...args("read", { path: "data.csv" }), rootSessionId: "foreign" })).rejects.toThrow("NATIVE_PROVENANCE_INVALID");
  await p.command(context, args("write", { path: "after.txt" })); current = false;
  await expect(p.command(context, finish())).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
  expect(readSteps("native-root", "default")).toHaveLength(0);
});

function nativeEvents(value: unknown = card) {
  return [
    { type: "native-session/header", schemaVersion: 1, nativeSessionId: "native-source", header: { id: "native-source" } },
    { type: "tool/call", seq: 0, data: { callId: "result-1", name: "scientific_result", arguments: JSON.stringify(card) } },
    { type: "tool/result", seq: 1, data: { message: { role: "tool", toolCallId: "result-1", isError: false, content: [] }, meta: { scientificResult: value } } },
  ];
}
function source(events: object[]) {
  return new NativeScientificResultSource({ current: () => current, nativeSession: async (_project, sid) => sid.startsWith("native-"),
    page: async (_project, sid) => { const bytes = Buffer.from(events.map(row => JSON.stringify(row) + "\n").join("")); return { nativeSessionId: sid, endSeq: events.length - 2, dataBase64: bytes.toString("base64"), sha256: hash(bytes.toString()) }; } });
}
it("pins only native canonical successful result metadata and rejects changed replacement evidence", async () => {
  let events = nativeEvents(); const lookup = new NativeScientificResultSource({ current: () => current, nativeSession: async () => true,
    page: async (_p, sid) => { const text = events.map(row => JSON.stringify(row) + "\n").join(""); return { nativeSessionId: sid, endSeq: 1, dataBase64: Buffer.from(text).toString("base64"), sha256: hash(text) }; } });
  setNativeNotebookResultLookup(lookup.lookup.bind(lookup));
  const refs = await snapshotNotebookResults("default", "native-source", [{ toolCallId: "result-1" }]);
  expect(refs[0]?.status).toBe("available");
  appendNotebookEntry("native-source", { id: "note", type: "observation", title: "Measured", timestamp: 1, role: "agent", results: [{ toolCallId: "result-1" }], resultSnapshots: refs }, "default");
  events = nativeEvents({ ...card, title: "Changed" });
  expect(await resolveNotebookResult("default", "native-source", "note", 0)).toMatchObject({ status: "changed" });
});
it("does not fall back to a colliding Pi log when a native result is missing", async () => {
  const dir = resolvePaths("default").sessionsDir; fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "native-source.jsonl"), JSON.stringify({ type: "session", id: "native-source" }) + "\n" + JSON.stringify({ type: "message", message: { role: "toolResult", toolName: "scientific_result", toolCallId: "result-1", details: { scientificResult: card } } }) + "\n");
  const lookup = source(nativeEvents().slice(0, 2)); setNativeNotebookResultLookup(lookup.lookup.bind(lookup));
  expect((await snapshotNotebookResults("default", "native-source", [{ toolCallId: "result-1" }]))[0]?.status).toBe("missing");
});
it("rejects model prose, failed results, malformed cards and bounded source exhaustion", async () => {
  for (const events of [nativeEvents().map((row, i) => i === 2 ? { ...row, data: { message: { role: "tool", toolCallId: "result-1", content: [{ type: "text", text: JSON.stringify({ scientificResult: card }) }] } } } : row), nativeEvents({ schemaVersion: 999 })]) {
    const lookup = source(events); const result = (await lookup.lookup("default", "native-source", ["result-1"], { bytes: 100000 }))?.get("result-1");
    expect(result?.status).not.toBe("available");
  }
  const lookup = source(nativeEvents());
  expect((await lookup.lookup("default", "native-source", ["result-1"], { bytes: 8 }))?.get("result-1")?.status).toBe("unverified");
});
it("resolves scientific results from canonical nested PTC dispatch metadata", async () => {
  const events = [nativeEvents()[0],
    { type: "tool/ptc-dispatch-start", seq: 0, data: { parentCallId: "run", rootCallId: "run", subCallId: "run:ptc:1", name: "scientific_result", arguments: card } },
    { type: "tool/ptc-dispatch", seq: 1, data: { parentCallId: "run", rootCallId: "run", subCallId: "run:ptc:1", name: "scientific_result", arguments: card, isError: false, meta: { scientificResult: card }, content: [] } }];
  expect((await source(events).lookup("default", "native-source", ["run:ptc:1"], { bytes: 100000 }))?.get("run:ptc:1")).toMatchObject({ status: "available", card });
});
it("rejects conflicting canonical result duplicates and failed tool results", async () => {
  const events = nativeEvents(), repeated = { ...events[2], seq: 2, data: { message: { role: "tool", toolCallId: "result-1", isError: false, content: [] }, meta: { scientificResult: { ...card, title: "Other" } } } };
  expect((await source([...events, repeated]).lookup("default", "native-source", ["result-1"], { bytes: 100000 }))?.get("result-1")?.status).toBe("ambiguous");
  const failed = { ...events[2], data: { message: { role: "tool", toolCallId: "result-1", isError: true, content: [] }, meta: { scientificResult: card } } };
  expect((await source([events[0], events[1], failed]).lookup("default", "native-source", ["result-1"], { bytes: 100000 }))?.get("result-1")?.status).toBe("missing");
});
it("decodes a canonical result across UTF-8 pages under one frozen watermark", async () => {
  const localized = { ...card, title: "临床测量" }, bytes = Buffer.from(nativeEvents(localized).map(row => JSON.stringify(row) + "\n").join("")), at = bytes.indexOf(Buffer.from("临床")) + 1;
  let reads = 0;
  const lookup = new NativeScientificResultSource({ current: () => current, nativeSession: async () => true, page: async (_project, sid, cursor, end) => {
    expect(end).toBe(reads === 0 ? null : 1); expect(cursor.offset).toBe(reads === 0 ? 0 : at);
    const chunk = reads++ === 0 ? bytes.subarray(0, at) : bytes.subarray(at);
    return { nativeSessionId: sid, endSeq: 1, dataBase64: chunk.toString("base64"), sha256: createHash("sha256").update(chunk).digest("hex"), ...(reads === 1 ? { next: { seq: -1, offset: at } } : {}) };
  } });
  expect((await lookup.lookup("default", "native-source", ["result-1"], { bytes: 100000 }))?.get("result-1")).toMatchObject({ status: "available", card: localized });
});
it("does not reveal a card after scope revocation or a corrupted page digest", async () => {
  for (const revoke of [false, true]) {
    current = true;
    const lookup = new NativeScientificResultSource({ current: () => current, nativeSession: async () => true, page: async (_project, sid) => {
      const text = nativeEvents().map(row => JSON.stringify(row) + "\n").join(""); if (revoke) current = false;
      return { nativeSessionId: sid, endSeq: 1, dataBase64: Buffer.from(text).toString("base64"), sha256: revoke ? hash(text) : "a".repeat(64) };
    } });
    expect((await lookup.lookup("default", "native-source", ["result-1"], { bytes: 100000 }))?.get("result-1")).toMatchObject({ status: "unverified" });
  }
});
