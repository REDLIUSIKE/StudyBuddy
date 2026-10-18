import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SkillSafetyJournal } from '../src/studybuddy/skill-safety-journal.ts'
import type { SkillSafetyActor, SkillSafetyRequestId, SkillSafetyResult, SkillSafetyJobId } from '@deepseek-ai/dsh-skill-safety-assistant/types'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-skill-journal-'))
  onTestFinished(async () => {
    const target = resolve(root)
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.includes('studybuddy-skill-journal-')) throw new Error('unsafe test cleanup')
    await rm(target, { recursive: true, force: true })
  })
  const actor: SkillSafetyActor = { accountId: 'account-one', generation: 1, sessionId: SessionId('session-one') }
  const options = { root, isCurrentScope: (scope: SkillSafetyActor) => scope.accountId === actor.accountId && scope.generation === 1 }
  const journal = new SkillSafetyJournal(options), requestId = 'request-one' as SkillSafetyRequestId
  const result: SkillSafetyResult = { kind: 'candidates', value: { jobId: 'job-one' as SkillSafetyJobId, status: 'no-match', candidates: [] } }
  return { root, actor, options, journal, requestId, result, digest: 'a'.repeat(64) }
}
describe('SkillSafetyJournal operation receipts', () => {
  it('fixed scanner preparation stores only a path-free ready projection', async () => {
    const h = await fixture()
    const ready = { kind: 'scanner-ready' as const, value: { status: 'ready' as const, target: 'win32-x64' as const, scannerVersion: '2.2.2' as const, manifestSha256: 'b'.repeat(64) } }
    await h.journal.reserve(h.actor, h.requestId, 'prepare-scanner', h.digest)
    await h.journal.settle(h.actor, h.requestId, ready)
    expect((await new SkillSafetyJournal(h.options).read(h.actor, h.requestId))?.result).toEqual(ready)
  })
  it('retry_reuses_actual_outcome', async () => {
    const h = await fixture()
    expect(await h.journal.reserve(h.actor, h.requestId, 'find', h.digest)).toMatchObject({ status: 'pending' })
    await h.journal.settle(h.actor, h.requestId, h.result)
    const retry = await new SkillSafetyJournal(h.options).reserve(h.actor, h.requestId, 'find', h.digest)
    expect(retry).toMatchObject({ status: 'done', result: h.result })
  })
  it('pending_or_unknown_is_not_permission_to_repeat_effects', async () => {
    const h = await fixture()
    await h.journal.reserve(h.actor, h.requestId, 'scan', h.digest)
    await expect(h.journal.reserve(h.actor, h.requestId, 'scan', h.digest)).rejects.toMatchObject({ code: 'SKILL_SAFETY_OUTCOME_UNKNOWN' })
    await h.journal.markUnknown(h.actor, h.requestId)
    await expect(new SkillSafetyJournal(h.options).reserve(h.actor, h.requestId, 'scan', h.digest)).rejects.toMatchObject({ code: 'SKILL_SAFETY_OUTCOME_UNKNOWN' })
  })
  it('changed_arguments_or_operation_cannot_reuse_a_request', async () => {
    const h = await fixture()
    await h.journal.reserve(h.actor, h.requestId, 'find', h.digest)
    await h.journal.settle(h.actor, h.requestId, h.result)
    for (const [kind, digest] of [['find', 'b'.repeat(64)], ['scan', h.digest]] as const) {
      await expect(h.journal.reserve(h.actor, h.requestId, kind, digest)).rejects.toMatchObject({ code: 'SKILL_SAFETY_REQUEST_CONFLICT' })
    }
    expect((await h.journal.read(h.actor, h.requestId))?.result).toEqual(h.result)
  })
  it('generation_or_account_change_rejects_read_and_write', async () => {
    const h = await fixture()
    await h.journal.reserve(h.actor, h.requestId, 'find', h.digest)
    for (const actor of [{ ...h.actor, generation: 2 }, { ...h.actor, accountId: 'other' }]) {
      await expect(h.journal.read(actor, h.requestId)).rejects.toMatchObject({ code: 'SKILL_SAFETY_STALE_SCOPE' })
      await expect(h.journal.settle(actor, h.requestId, h.result)).rejects.toMatchObject({ code: 'SKILL_SAFETY_STALE_SCOPE' })
    }
    expect(await h.journal.read({ ...h.actor, sessionId: SessionId('other-session') }, h.requestId)).toBeUndefined()
  })
  it('concurrent_reservations_preserve_all_accepted_identities', async () => {
    const h = await fixture()
    const ids = Array.from({ length: 12 }, (_, n) => `request-${n}` as SkillSafetyRequestId)
    await Promise.all(ids.map(id => h.journal.reserve(h.actor, id, 'find', h.digest)))
    for (const id of ids) expect(await h.journal.read(h.actor, id)).toMatchObject({ requestId: id, status: 'pending' })
  })
  it('malformed_or_private_extra_fields_are_not_empty_success', async () => {
    const h = await fixture()
    await h.journal.reserve(h.actor, h.requestId, 'find', h.digest)
    const file = (await readdir(h.root)).find(name => name.endsWith('.json'))!
    const path = join(h.root, file), original = JSON.parse(await readFile(path, 'utf8'))
    for (const content of ['{broken', JSON.stringify({ ...original, credential: 'private' })]) {
      await writeFile(path, content)
      await expect(h.journal.read(h.actor, h.requestId)).rejects.toMatchObject({ code: 'SKILL_SAFETY_JOURNAL_INVALID' })
      expect(await readFile(path, 'utf8')).toBe(content)
    }
  })
  it('result_is_immutable_after_settlement', async () => {
    const h = await fixture()
    await h.journal.reserve(h.actor, h.requestId, 'find', h.digest)
    await h.journal.settle(h.actor, h.requestId, h.result)
    await expect(h.journal.settle(h.actor, h.requestId, { ...h.result, value: { ...h.result.value, status: 'failed' } })).rejects.toMatchObject({ code: 'SKILL_SAFETY_REQUEST_CONFLICT' })
  })
  it('configured_limits_preserve_retries_and_leave_no_temporary_files', async () => {
    const h = await fixture(), journal = new SkillSafetyJournal({ ...h.options, maxRequests: 1 })
    await journal.reserve(h.actor, h.requestId, 'find', h.digest)
    await journal.settle(h.actor, h.requestId, h.result)
    await expect(journal.reserve(h.actor, 'new' as SkillSafetyRequestId, 'find', h.digest)).rejects.toMatchObject({ code: 'SKILL_SAFETY_JOURNAL_LIMIT' })
    expect((await journal.reserve(h.actor, h.requestId, 'find', h.digest)).status).toBe('done')
    const small = new SkillSafetyJournal({ ...h.options, root: join(h.root, 'small'), maxBytes: 100 })
    await expect(small.reserve(h.actor, h.requestId, 'find', h.digest)).rejects.toMatchObject({ code: 'SKILL_SAFETY_JOURNAL_LIMIT' })
    expect(await readdir(join(h.root, 'small'))).toEqual([])
  })
})
