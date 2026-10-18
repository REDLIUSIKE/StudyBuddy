import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { SkillsNativeClient, verifySkillRuntime } from '../src/studybuddy/skill-native-client.ts'
const scope = { accountId: 'synthetic-skills', generation: 7 }
const fixture = () => new SkillsNativeClient({ start: async () => spawn(process.execPath, [fileURLToPath(new URL('./fixtures/studybuddy-skill-pipe.mjs', import.meta.url))], { stdio: 'pipe', windowsHide: true }) }, { scope, accessToken: 'synthetic-only' }, join(tmpdir(), 'synthetic-harness'), '0.2.1-alpha.2')
it('private safety readers use their fixed Main origin and real closed reply', async () => {
  const client = fixture(), signal = new AbortController().signal
  try {
    expect(await client.safetyInventory(signal)).toEqual({ revision: 'scan_fixture', complete: true, instances: [] })
    const input = { instanceId: 'instance_fixture', revision: 'scan_fixture', maxBytes: 1024, maxFiles: 10 }
    const snapshot = await client.safetySnapshot(input, signal)
    expect(snapshot).toMatchObject({ instanceId: 'instance_fixture', revision: 'scan_fixture', files: [{ relativePath: 'SKILL.md', sha256: 'a'.repeat(64), byteLength: 10 }] })
    await expect(client.safetyVerify({ ...input, files: snapshot.files }, signal)).resolves.toBeUndefined()
  } finally { await client.dispose() }
})
it('private safety results reject extra credential or mismatched instance fields', async () => {
  const client = fixture(), signal = new AbortController().signal
  try {
    for (const instanceId of ['instance_extra', 'instance_wrong']) {
      await expect(client.safetySnapshot({ instanceId, revision: 'scan_fixture', maxBytes: 1024, maxFiles: 10 }, signal)).rejects.toThrow('SKILL_SAFETY_SOURCE_INVALID')
    }
  } finally { await client.dispose() }
})
it('an already cancelled safety read never launches a companion', async () => {
  let started = false
  const client = new SkillsNativeClient({ start: async () => { started = true; throw new Error('must not start') } }, { scope, accessToken: 'synthetic-only' }, join(tmpdir(), 'synthetic-harness'), '')
  const controller = new AbortController(); controller.abort()
  await expect(client.safetyInventory(controller.signal)).rejects.toThrow('SKILL_SAFETY_CANCELLED')
  expect(started).toBe(false)
  await client.dispose()
})
it('keeps the Skill pipe available when the current host has no version label', async () => {
  const client = new SkillsNativeClient({ start: async () => spawn(process.execPath, [fileURLToPath(new URL('./fixtures/studybuddy-skill-pipe.mjs', import.meta.url))], { stdio: 'pipe', windowsHide: true }) }, { scope, accessToken: 'synthetic-only' }, join(tmpdir(), 'synthetic-harness'), '')
  try { expect(await client.invoke('scan', {}, 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness')).toEqual({ original: 'scan' }) }
  finally { await client.dispose() }
})
it('preserves an exact bootstrap authentication rejection instead of hiding it as a protocol error', async () => {
  const client = new SkillsNativeClient({ start: async () => spawn(process.execPath, [fileURLToPath(new URL('./fixtures/studybuddy-skill-pipe.mjs', import.meta.url))], { stdio: 'pipe', windowsHide: true }) }, { scope, accessToken: 'synthetic-ready-rejected' }, join(tmpdir(), 'synthetic-harness'), '0.2.1-alpha.2')
  try { await expect(client.invoke('prepare', {}, 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness')).rejects.toThrow('AUTH_REQUIRED') }
  finally { await client.dispose() }
})
it('dedicated Skill pipe preserves request, account, progress and concurrent cancellation lifetime', async () => {
  const client = fixture(), event = vi.fn(), channel = randomUUID()
  try {
    expect(await client.invoke('scan', {}, 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness')).toEqual({ original: 'scan' })
    expect(await client.invoke('copy', { onProgress: channel }, 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness', event)).toEqual({ original: 'copy' })
    expect(event).toHaveBeenCalledWith(channel, { original: 'progress' })
    const hanging = client.invoke('hang', {}, 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness')
    const rejected = expect(hanging).rejects.toThrow('SKILL_NATIVE_CLOSED')
    await client.dispose()
    await rejected
  } finally { await client.dispose() }
})
it('a reply from another account generation terminates the pipe instead of resolving a request', async () => {
  const client = fixture()
  try { await expect(client.invoke('stale', {}, 'https://guijitongzhuo.com/skills?embed=desktop&host_ui=harness')).rejects.toThrow('SKILL_NATIVE_PROTOCOL_INVALID') }
  finally { await client.dispose() }
})
it('verifies all companion bytes and rejects altered or unlisted files before launch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skill-runtime-')), companion = process.platform === 'win32' ? 'studybuddy-harness-skills.exe' : 'studybuddy-harness-skills'
  const bytes = Buffer.from('synthetic byte verifier fixture')
  try {
    await writeFile(join(directory, companion), bytes)
    await writeFile(join(directory, 'skills-manifest.json'), JSON.stringify({ schemaVersion: 1, sourceHead: 'a'.repeat(40), companion, files: { [companion]: createHash('sha256').update(bytes).digest('hex') } }))
    expect((await verifySkillRuntime(directory)).companion).toBe(companion)
    await writeFile(join(directory, 'unlisted.dll'), bytes)
    await expect(verifySkillRuntime(directory)).rejects.toThrow('SKILL_NATIVE_RUNTIME_INVALID')
    await rm(join(directory, 'unlisted.dll'))
    await writeFile(join(directory, companion), 'altered')
    await expect(verifySkillRuntime(directory)).rejects.toThrow('SKILL_NATIVE_RUNTIME_INVALID')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
