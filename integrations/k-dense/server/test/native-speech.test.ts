import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { NativeProjectBudget } from "../src/runtime/native-project-budget.ts";

vi.mock("../src/api/speech.ts", () => { throw Error("Standalone speech is forbidden in native mode"); });
vi.mock("../src/agent/session-registry.ts", () => { throw Error("Pi runtime is forbidden in native mode"); });
const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-speech-")), guest = "a".repeat(64);
const headers = { host: "127.0.0.1:42143", origin: "http://127.0.0.1:42143", "x-studybuddy-research-guest": guest, "x-project-id": "study" };
let app: FastifyInstance, live = true;
let budget: NativeProjectBudget;
const settlements = vi.fn(async (requests: readonly { requestId: string; modelId: string; fundingSource: string }[]) => ({ schemaVersion: 1,
  records: requests.map(row => ({ ...row, status: "settled", amountCny: "0.1", sourceId: row.requestId, sourceVersion: "original-cny-task-settlement" })) }));
const request = vi.fn(async (_project: string, _operation: string, input: any) => ({ requestId: input.requestId, modelId: "asr-1.0", text: "科研转写内容", duration: 0.1 }));
const audio = Buffer.alloc(44 + 3200); audio.write("RIFF"); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVEfmt ", 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24);
audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write("data", 36); audio.writeUInt32LE(3200, 40);
beforeAll(async () => {
  vi.stubEnv("KADY_PROJECTS_ROOT", root);
  const { buildEmbeddedApp } = await import("../src/bootstrap-embedded.ts"), { registerNativeSpeechRoutes } = await import("../src/api/native-speech.ts");
  const { NativeProjectBudget } = await import("../src/runtime/native-project-budget.ts");
  budget = new NativeProjectBudget({ directory: id => path.join(root, id, "sandbox"), current: () => live, read: settlements });
  app = await buildEmbeddedApp({ projectsRoot: root, guestAuthorization: guest, origin: () => headers.origin, isCurrent: () => live,
    registerFeatures: service => registerNativeSpeechRoutes(service, { projectsRoot: root, channel: { current: () => live, request }, budget,
      context: async projectId => ({ projectId, sessionRef: "session-native", hostBinding: { nonce: "private" } }) }) });
  await app.inject({ method: "POST", url: "/projects", headers, payload: { name: "科研", id: "study" } });
});
afterAll(async () => { await app.close(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
const upload = (id: string, mime = "audio/wav") => app.inject({ method: "POST", url: "/speech/transcribe", headers: { ...headers,
  "x-studybuddy-speech-request-id": id, "content-type": "multipart/form-data; boundary=dictation-boundary" }, payload: Buffer.concat([
  Buffer.from(`--dictation-boundary\r\nContent-Disposition: form-data; name="audio"; filename="dictation.wav"\r\nContent-Type: ${mime}\r\n\r\n`), audio,
  Buffer.from("\r\n--dictation-boundary--\r\n")]) });
it("relays only path/hash metadata and deletes the transient recording after terminal ASR", async () => {
  const id = randomUUID();
  request.mockImplementationOnce(async (project, operation, input) => {
    expect(project).toBe("study"); expect(operation).toBe("speech-transcribe");
    expect(input).toEqual({ requestId: id, audioPath: `.kady/speech-dictation/${id}.wav`, mimeType: "audio/wav", bytes: audio.length, sha256: createHash("sha256").update(audio).digest("hex") });
    expect(fs.readFileSync(path.join(root, "study/sandbox", input.audioPath))).toEqual(audio);
    expect(JSON.parse(fs.readFileSync(path.join(root, "study/sandbox/.kady/native-budget.json"), "utf8")).requests).toContainEqual({ requestId: id, modelId: "asr-1.0", fundingSource: "platform" });
    return { requestId: id, modelId: "asr-1.0", text: "科研转写内容", duration: 0.1 };
  });
  const result = await upload(id);
  expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ requestId: id, modelId: "asr-1.0", text: "科研转写内容", duration: 0.1 });
  expect(fs.readdirSync(path.join(root, "study/sandbox/.kady/speech-dictation"))).toEqual([]);
});
it("does not accept WebM or forged request identities and never retries uncertain inference", async () => {
  request.mockClear();
  expect((await upload(randomUUID(), "audio/webm")).statusCode).toBe(415);
  expect((await upload("../outside")).statusCode).toBe(400); expect(request).not.toHaveBeenCalled();
  request.mockRejectedValueOnce(Error("RESEARCH_TRANSPORT_DISCONNECTED"));
  expect((await upload(randomUUID())).statusCode).toBe(503); expect(request).toHaveBeenCalledOnce();
  expect(fs.readdirSync(path.join(root, "study/sandbox/.kady/speech-dictation"))).toEqual([]);
});
it("suppresses late text after owner revocation and clears the local audio", async () => {
  request.mockImplementationOnce(async (_project, _operation, input) => { live = false; return { requestId: input.requestId, modelId: "asr-1.0", text: "旧账号", duration: 0.1 }; });
  const result = await upload(randomUUID()); expect(result.statusCode).toBe(503); expect(result.payload).not.toContain("旧账号");
  expect(fs.readdirSync(path.join(root, "study/sandbox/.kady/speech-dictation"))).toEqual([]); live = true;
});
it("reads the original settled ASR amount and blocks a later recording at the existing project cap", async () => {
  await budget.save("study", "0.1"); request.mockClear();
  const response = await upload(randomUUID()); expect(response.statusCode).toBe(402); expect(request).not.toHaveBeenCalled();
  expect(await budget.state("study")).toMatchObject({ paused: true, currency: "CNY", settledCny: "0.3" });
  expect(settlements.mock.calls[0][0].every(row => row.modelId === "asr-1.0")).toBe(true);
  expect(fs.readdirSync(path.join(root, "study/sandbox/.kady/speech-dictation"))).toEqual([]);
  await budget.save("study", null);
});
