import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, onTestFinished } from 'vitest'
import SkillSafety from '../src/index.ts'
import type { SkillSafetyActor, SkillSafetyJobId, SkillSafetyProvider, SkillSafetyResult, SkillSafetyRequestId } from '../src/types.ts'

function fixture() {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  const session = Session.create(SessionId('skill-check-session'))
  // Host owns live-root admission; this service fixture exercises the session reference it delegates.
  const agent = { id: session.id, session } as Agent
  const actor: SkillSafetyActor = { accountId: 'account-one', generation: 1, sessionId: session.id }
  const jobId = 'job-one' as SkillSafetyJobId
  const value: SkillSafetyResult = {
    kind: 'candidates', value: { jobId, status: 'no-match', candidates: [] },
  }
  const provider: SkillSafetyProvider = {
    bindRootAgent: () => actor,
    execute: async () => value,
    presentation: async sessionId => ({ sessionId, guide: true }),
  }
  return { ctx, agent, session, actor, jobId, provider }
}

describe('SkillSafety', () => {
  it('the_provider_receives_the_actual_live_root_with_its_cancellation', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    const calls: unknown[] = []
    h.ctx.skillSafety.registerProvider({
      ...h.provider,
      execute: async invocation => { calls.push(invocation); return { kind: 'candidates', value: { jobId: h.jobId, status: 'no-match', candidates: [] } } },
    })
    await h.ctx.skillSafety.execute(h.agent, { kind: 'find', requestId: 'find-one' as SkillSafetyRequestId, query: 'PDF' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ agent: h.agent, actor: h.actor, signal: expect.any(AbortSignal) })
  })

  it('missing_provider_rejects_without_fabricating_a_result', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    await expect(h.ctx.skillSafety.execute(h.agent, { kind: 'find', requestId: 'read-one' as SkillSafetyRequestId, query: 'pdf' }))
      .rejects.toMatchObject({ code: 'SKILL_SAFETY_UNAVAILABLE' })
  })

  it('provider_disposal_revokes_calls', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    const remove = h.ctx.skillSafety.registerProvider(h.provider)
    const request = { kind: 'find' as const, requestId: 'read-one' as SkillSafetyRequestId, query: 'pdf' }
    await expect(h.ctx.skillSafety.execute(h.agent, request)).resolves.toMatchObject({
      kind: 'candidates', value: { status: 'no-match' },
    })
    remove()
    remove()
    await expect(h.ctx.skillSafety.execute(h.agent, request)).rejects.toMatchObject({ code: 'SKILL_SAFETY_UNAVAILABLE' })
  })

  it('root_binding_failure_prevents_execution', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    h.ctx.skillSafety.registerProvider({
      ...h.provider,
      bindRootAgent: () => { throw Object.assign(new Error('revoked'), { code: 'SKILL_SAFETY_STALE_SCOPE' }) },
    })
    await expect(h.ctx.skillSafety.execute(h.agent, { kind: 'find', requestId: 'read-one' as SkillSafetyRequestId, query: 'pdf' }))
      .rejects.toMatchObject({ code: 'SKILL_SAFETY_STALE_SCOPE' })
  })

  it('an_aborted_request_never_becomes_a_success', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    h.ctx.skillSafety.registerProvider(h.provider)
    const abort = new AbortController()
    abort.abort()
    await expect(h.ctx.skillSafety.execute(h.agent, { kind: 'find', requestId: 'read-one' as SkillSafetyRequestId, query: 'pdf' }, abort.signal))
      .rejects.toMatchObject({ code: 'SKILL_SAFETY_CANCELLED' })
  })

  it('read_only_presentation_uses_the_native_session', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    h.ctx.skillSafety.registerProvider(h.provider)
    await expect(h.ctx.skillSafety.presentation(h.session)).resolves.toMatchObject({
      sessionId: h.session.id, guide: true,
    })
  })

  it('provider_fiber_unload_removes_the_capability', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    const fiber = h.ctx.plugin({
      name: 'skill-safety-test-provider', inject: ['skillSafety'],
      apply: (ctx: Context) => { ctx.skillSafety.registerProvider(h.provider) },
    })
    await fiber
    const command = { kind: 'find' as const, requestId: 'read-one' as SkillSafetyRequestId, query: 'pdf' }
    await expect(h.ctx.skillSafety.execute(h.agent, command)).resolves.toMatchObject({ kind: 'candidates' })
    await fiber.dispose()
    await expect(h.ctx.skillSafety.execute(h.agent, command)).rejects.toMatchObject({ code: 'SKILL_SAFETY_UNAVAILABLE' })
  })

  it('duplicate_provider_is_rejected_without_replacing_the_owner', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    h.ctx.skillSafety.registerProvider(h.provider)
    expect(() => h.ctx.skillSafety.registerProvider(h.provider)).toThrowError(expect.objectContaining({ code: 'SKILL_SAFETY_PROVIDER_EXISTS' }))
    await expect(h.ctx.skillSafety.presentation(h.session)).resolves.toMatchObject({ guide: true })
  })

  it('a_late_provider_reply_after_unload_is_not_published_as_success', async () => {
    const h = fixture()
    await h.ctx.plugin(SkillSafety)
    let resolveReply: ((value: SkillSafetyResult) => void) | undefined
    const remove = h.ctx.skillSafety.registerProvider({
      ...h.provider, execute: () => new Promise(resolve => { resolveReply = resolve }),
    })
    const result = h.ctx.skillSafety.execute(h.agent, { kind: 'find', requestId: 'late-one' as SkillSafetyRequestId, query: 'pdf' })
    const rejection = expect(result).rejects.toMatchObject({ code: 'SKILL_SAFETY_CANCELLED' })
    remove()
    resolveReply!({ kind: 'candidates', value: { jobId: h.jobId, status: 'no-match', candidates: [] } })
    await rejection
  })
})
