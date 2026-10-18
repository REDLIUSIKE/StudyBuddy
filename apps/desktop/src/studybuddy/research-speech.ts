/** Private ASR input: only a bounded transient WAV inside the actual admitted sandbox. */
import { createHash } from 'node:crypto'
import { open, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import type { OwnedScope, HarnessResearchContextV1 } from '@studybuddy/contracts'
import { HARNESS_ASR_MODELS } from '@studybuddy/contracts'
import { assertResearchPath } from './research-resources.ts'

export interface ResearchSpeechInput {
  requestId: string; audioPath: string; mimeType: 'audio/wav'; bytes: number; sha256: string
}
type ResearchASRModel = (typeof HARNESS_ASR_MODELS)[number]
export interface ResearchSpeechRequest { requestId: string; modelId: ResearchASRModel; audio: Uint8Array; mimeType: 'audio/wav' }
export interface ResearchSpeechResult { requestId: string; modelId: ResearchASRModel; text: string; duration: number }
export type ResearchSpeechConsumer = (scope: OwnedScope, input: ResearchSpeechRequest, signal: AbortSignal, context: HarnessResearchContextV1) => Promise<ResearchSpeechResult>
const fail = (): never => { throw Error('RESEARCH_SPEECH_INPUT_INVALID') }
const maxAudioBytes = 50_000_000

/** No account, model, URL or funding override can accompany a recording. */
export function parseResearchSpeechInput(value: unknown): ResearchSpeechInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const row = value as ResearchSpeechInput
  if (Object.keys(row).sort().join(',') !== 'audioPath,bytes,mimeType,requestId,sha256' ||
    typeof row.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.requestId) ||
    row.audioPath !== `.kady/speech-dictation/${row.requestId}.wav` || row.mimeType !== 'audio/wav' ||
    !Number.isSafeInteger(row.bytes) || row.bytes <= 44 || row.bytes > maxAudioBytes || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) return fail()
  return row
}
/** Browser normalization produces canonical mono 16 kHz PCM16 WAV; this check never supplies billing usage. */
function validateWav(audio: Buffer): void {
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.readUInt32LE(4) !== audio.length - 8 ||
    audio.toString('ascii', 8, 16) !== 'WAVEfmt ' || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 ||
    audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000 ||
    audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data' ||
    audio.readUInt32LE(40) !== audio.length - 44 || (audio.length - 44) % 2 !== 0 || (audio.length - 44) / 32000 > 500) fail()
}
/** Read through a bounded file handle; a growing file or linked parent fails before paid dispatch. */
export async function readResearchSpeech(sandbox: string, value: unknown, signal: AbortSignal): Promise<ResearchSpeechRequest> {
  const input = parseResearchSpeechInput(value), file = join(sandbox, input.audioPath)
  signal.throwIfAborted(); await assertResearchPath(file)
  const root = await realpath(sandbox), target = await realpath(file), offset = relative(root, target)
  if (offset.startsWith('..') || isAbsolute(offset)) return fail()
  const handle = await open(target, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size !== input.bytes) return fail()
    const audio = Buffer.alloc(input.bytes)
    let position = 0
    while (position < audio.length) {
      signal.throwIfAborted()
      const part = await handle.read(audio, position, audio.length - position, position)
      if (!part.bytesRead) return fail()
      position += part.bytesRead
    }
    const after = await handle.stat()
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || createHash('sha256').update(audio).digest('hex') !== input.sha256) return fail()
    validateWav(audio); await assertResearchPath(file); signal.throwIfAborted()
    const modelId=HARNESS_ASR_MODELS[0]
    if(!modelId)return fail()
    return { requestId: input.requestId, modelId, audio, mimeType: 'audio/wav' }
  } finally { await handle.close() }
}
/** Only terminal provider text/duration are projected; no estimated Tokens or local currency are invented. */
export function parseResearchSpeechResult(value: unknown, requestId: string): ResearchSpeechResult {
  const row = value as Partial<ResearchSpeechResult> | null
  if (!row || typeof row !== 'object' || row.requestId !== requestId || row.modelId !== 'asr-1.0' ||
    typeof row.text !== 'string' || !row.text.trim() || row.text.length > 131072 || row.text.includes('\u0000') ||
    typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration <= 0 || row.duration > 500) throw Error('RESEARCH_SPEECH_RESPONSE_INVALID')
  return { requestId, modelId: 'asr-1.0', text: row.text.trim(), duration: row.duration }
}
