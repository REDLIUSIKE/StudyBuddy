/** Embedded dictation only: local transient audio and private metadata IPC, with no standalone provider runtime. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { currentProjectId } from "../scope.ts";
import { assertResearchPath } from "../runtime/project-storage.ts";
import type { NativeChannel } from "../runtime/native-channel.ts";
import type { RuntimeContext } from "../runtime/contracts.ts";
import type { NativeProjectBudget } from "../runtime/native-project-budget.ts";

interface Options {
  projectsRoot: string;
  channel: Pick<NativeChannel, "current" | "request">;
  context(projectId: string): Promise<RuntimeContext>;
  budget: Pick<NativeProjectBudget, "admit">;
}
const maxAudioBytes = 50_000_000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Reuse the original multipart route; the owner alone chooses the exact ASR model and Key. */
export async function registerNativeSpeechRoutes(app: FastifyInstance, options: Options): Promise<void> {
  app.post("/speech/transcribe", async (req, reply) => {
    const assert = () => { if (!options.channel.current()) throw Error("RESEARCH_CONTEXT_REVOKED"); };
    const supplied = req.headers["x-studybuddy-speech-request-id"], requestId = supplied ?? randomUUID();
    if (typeof requestId !== "string" || !uuid.test(requestId)) return reply.code(400).send({ detail: "RESEARCH_SPEECH_INPUT_INVALID" });
    if (!req.isMultipart()) return reply.code(415).send({ detail: "RESEARCH_SPEECH_WAV_REQUIRED" });
    let temporary: string | undefined;
    const controller = new AbortController();
    const abort = () => { if (!reply.raw.writableEnded) controller.abort(); };
    req.raw.once("aborted", abort); reply.raw.once("close", abort);
    try {
      assert();
      const projectId = currentProjectId(), context = await options.context(projectId);
      assert();
      if (context.projectId !== projectId) throw Error("RESEARCH_CONTEXT_REVOKED");
      const part = await req.file({ limits: { fileSize: maxAudioBytes, files: 1, fields: 0 } });
      if (!part || part.fieldname !== "audio" || part.mimetype !== "audio/wav") return reply.code(415).send({ detail: "RESEARCH_SPEECH_WAV_REQUIRED" });
      const audio = await part.toBuffer();
      if (part.file.truncated || audio.length > maxAudioBytes) return reply.code(413).send({ detail: "RESEARCH_SPEECH_TOO_LARGE" });
      if (audio.length <= 44) return reply.code(400).send({ detail: "RESEARCH_SPEECH_INPUT_INVALID" });
      if (audio.toString("ascii", 0, 4) !== "RIFF" || audio.readUInt32LE(4) !== audio.length - 8 || audio.toString("ascii", 8, 16) !== "WAVEfmt " ||
        audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 ||
        audio.readUInt32LE(28) !== 32000 || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 || audio.toString("ascii", 36, 40) !== "data" ||
        audio.readUInt32LE(40) !== audio.length - 44 || (audio.length - 44) % 2 !== 0 || (audio.length - 44) / 32000 > 500)
        return reply.code(400).send({ detail: "RESEARCH_SPEECH_INPUT_INVALID" });
      assert(); controller.signal.throwIfAborted();
      const sandbox = path.join(options.projectsRoot, projectId, "sandbox"), directory = path.join(sandbox, ".kady", "speech-dictation");
      assertResearchPath(directory); await mkdir(directory, { recursive: true }); assertResearchPath(directory);
      const audioPath = `.kady/speech-dictation/${requestId}.wav`, target = path.join(sandbox, audioPath);
      assertResearchPath(target); await writeFile(target, audio, { flag: "wx", mode: 0o600 }); temporary = target;
      // Existing metadata references consume the original CNY settlement; no second price or Token ledger is created.
      await options.budget.admit(projectId, { requestId, modelId: "asr-1.0", fundingSource: "platform" });
      assert(); controller.signal.throwIfAborted();
      const result = await options.channel.request(projectId, "speech-transcribe", { requestId, audioPath, mimeType: "audio/wav",
        bytes: audio.length, sha256: createHash("sha256").update(audio).digest("hex") },
        AbortSignal.any([controller.signal, AbortSignal.timeout(190_000)]), context.sessionRef);
      assert(); controller.signal.throwIfAborted();
      const row = result as { requestId?: unknown; modelId?: unknown; text?: unknown; duration?: unknown } | null;
      if (!row || row.requestId !== requestId || row.modelId !== "asr-1.0" || typeof row.text !== "string" || !row.text.trim() || row.text.length > 131072 ||
        typeof row.duration !== "number" || !Number.isFinite(row.duration) || row.duration <= 0 || row.duration > 500) throw Error("RESEARCH_SPEECH_RESPONSE_INVALID");
      return { requestId, modelId: "asr-1.0", text: row.text.trim(), duration: row.duration };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if ((error as { statusCode?: number })?.statusCode === 413) {
        reply.code(413);
        return { detail: "RESEARCH_SPEECH_TOO_LARGE" };
      }
      const safe = /^RESEARCH_[A-Z0-9_]{1,100}$/.test(code) ? code : "RESEARCH_SPEECH_UNAVAILABLE";
      reply.code(safe === "RESEARCH_BUDGET_REACHED" ? 402 : safe.includes("INPUT_INVALID") ? 400 : 503);
      return { detail: safe };
    } finally {
      req.raw.off("aborted", abort); reply.raw.off("close", abort);
      if (temporary) { assertResearchPath(temporary); await unlink(temporary); }
    }
  });
}
