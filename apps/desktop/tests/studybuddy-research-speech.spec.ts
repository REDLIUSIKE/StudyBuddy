import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ResearchBridge } from '../src/studybuddy/research-bridge.ts'
import { accountResearchDirectory } from '../src/studybuddy/research-runtime.ts'

function wav() {
  const audio = Buffer.alloc(44 + 3200)
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8)
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34)
  audio.write('data', 36); audio.writeUInt32LE(3200, 40); return audio
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'research-speech-')), scope = { accountId: 'synthetic-speech', generation: 1 }, hostGeneration = randomUUID()
  const sandbox = join(accountResearchDirectory(root, scope.accountId), 'projects/study/sandbox'), requestId = randomUUID(), audio = wav()
  await mkdir(join(sandbox, '.kady/speech-dictation'), { recursive: true })
  await writeFile(join(sandbox, '..', 'project.json'), '{"id":"study"}')
  const audioPath = `.kady/speech-dictation/${requestId}.wav`
  await writeFile(join(sandbox, audioPath), audio)
  const input = { requestId, audioPath, mimeType: 'audio/wav', bytes: audio.length, sha256: createHash('sha256').update(audio).digest('hex') }
  let live = true
  const speech = vi.fn(async () => ({ requestId, modelId: 'asr-1.0' as const, text: '核对后的科研草稿', duration: 0.1 }))
  const create = (enabled = true) => new ResearchBridge({ userDataRoot: root, isCurrent: () => live, hostContext: () => ({ scope, hostGeneration }),
    command: async (action, data) => action === 'bind' ? { ...data as object, workspaceId: 'workspace-study' } : null,
    ...(enabled ? { speech } : {}) })
  return { root, sandbox, scope, input, audio, speech, create, revoke: () => { live = false }, cleanup: () => rm(root, { recursive: true, force: true }) }
}
it('reads only the bound transient recording and relays exact ASR with no page authority', async () => {
  const f = await fixture()
  try {
    const bridge = f.create(), binding = await bridge.bind(f.scope, 'study')
    const result = await bridge.invoke(f.scope, { rpcId: randomUUID(), projectId: 'study', sessionId: binding.sessionId,
      operation: 'speech-transcribe', input: f.input } as never, new AbortController().signal)
    expect(result).toEqual({ requestId: f.input.requestId, modelId: 'asr-1.0', text: '核对后的科研草稿', duration: 0.1 })
    expect(f.speech).toHaveBeenCalledOnce()
    expect(f.speech.mock.calls[0]).toEqual([f.scope, { requestId: f.input.requestId, modelId: 'asr-1.0', audio: f.audio, mimeType: 'audio/wav' }, expect.any(AbortSignal), binding])
  } finally { await f.cleanup() }
})
it('fails closed without a speech transport and rejects path, bytes, hash and authority changes', async () => {
  const f = await fixture()
  try {
    await expect(f.create(false).invoke(f.scope, { rpcId: randomUUID(), projectId: 'study', operation: 'speech-transcribe', input: f.input } as never, new AbortController().signal)).rejects.toThrow('RESEARCH_SPEECH_UNAVAILABLE')
    const bridge = f.create()
    for (const input of [{ ...f.input, audioPath: '../private.wav' }, { ...f.input, bytes: 1 }, { ...f.input, sha256: 'a'.repeat(64) }, { ...f.input, modelId: 'chat-model' }, { ...f.input, apiKey: 'forged-key' }]) {
      await expect(bridge.invoke(f.scope, { rpcId: randomUUID(), projectId: 'study', operation: 'speech-transcribe', input } as never, new AbortController().signal)).rejects.toThrow()
    }
    expect(f.speech).not.toHaveBeenCalled()
  } finally { await f.cleanup() }
})
it('refuses linked input directories and suppresses a result after account revocation', async () => {
  const f = await fixture(), other = await mkdtemp(join(tmpdir(), 'research-speech-other-'))
  const linked = join(f.sandbox, '.kady/speech-linked')
  try {
    await symlink(other, linked, process.platform === 'win32' ? 'junction' : 'dir')
    const bridge = f.create()
    await expect(bridge.invoke(f.scope, { rpcId: randomUUID(), projectId: 'study', operation: 'speech-transcribe', input: { ...f.input, audioPath: `.kady/speech-linked/${f.input.requestId}.wav` } } as never, new AbortController().signal)).rejects.toThrow()
    f.speech.mockImplementationOnce(async () => { f.revoke(); return { requestId: f.input.requestId, modelId: 'asr-1.0', text: 'stale', duration: 0.1 } })
    await expect(bridge.invoke(f.scope, { rpcId: randomUUID(), projectId: 'study', operation: 'speech-transcribe', input: f.input } as never, new AbortController().signal)).rejects.toThrow('RESEARCH_SCOPE_REVOKED')
  } finally { await unlink(linked).catch(() => {}); await f.cleanup(); await rm(other, { recursive: true, force: true }) }
})
