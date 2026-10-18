import { it, expect, onTestFinished } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SkillSafetyRecords } from '../src/studybuddy/skill-safety-records.ts'
it('two real store owners cannot publish a second charged claim; settle survives restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'safety-records-')); onTestFinished(() => rm(root, { recursive: true, force: true }))
  const actor = { accountId: 'original', generation: 1, sessionId: SessionId('safety') }, a = new SkillSafetyRecords(root, () => true), b = new SkillSafetyRecords(root, () => true)
  const first = { requestId: 'af6ba470-ef1c-4fd1-a29f-1a13edb4cd0d', fingerprint: 'a'.repeat(64), modelIdentity: 'b'.repeat(64) }
  const values = await Promise.all([a.claim(actor, 'analysis', first), b.claim(actor, 'analysis', { ...first, requestId: 'cf6ba470-ef1c-4fd1-a29f-1a13edb4cd0d' })])
  expect(values[0]?.requestId).toBe(values[1]?.requestId)
  const response = { content: 'Recorded inert verdict', usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
  await a.settle(actor, 'analysis', response)
  expect((await new SkillSafetyRecords(root, () => true).read(actor, 'analysis'))?.result).toEqual(response)
  expect(await a.read({ ...actor, generation: 2 }, 'analysis')).toBeUndefined()
  await expect(a.claim(actor, 'analysis', { ...first, fingerprint: 'c'.repeat(64) })).rejects.toThrow('SKILL_SAFETY_REQUEST_CONFLICT')
})
