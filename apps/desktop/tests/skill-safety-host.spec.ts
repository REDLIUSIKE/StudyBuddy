import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import SkillSafety from '@deepseek-ai/dsh-skill-safety-assistant'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { SessionId } from '@deepseek-ai/dsh-session'
import { it, expect, onTestFinished, vi } from 'vitest'
import { installSkillSafetyHostControl } from '../../desktop-host/src/studybuddy-skill-safety.ts'
import { createSkillSafetyProvider } from '@deepseek-ai/dsh-skill-safety-assistant/provider'
import type { SkillSafetyWireInvocation } from '@deepseek-ai/dsh-skill-safety-assistant/wire'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SkillSafetyRequestId } from '@deepseek-ai/dsh-skill-safety-assistant/types'
const hostGeneration = 'd95d0a09-73e9-4d06-9099-673d136b52db'
const accountId = '1d5d0a09-73e9-4d06-9099-673d136b52db'
async function fixture() {
  const ctx = new Context(); onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] }); await ctx.plugin(SkillSafety); await ctx.plugin(UserQuestions)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('session-safety'), meta: { agentPreset: 'skill-safety' } })
  const session = agent.session
  const cancel = vi.spyOn(agent, 'cancel')
  const sent: object[] = []
  const control = installSkillSafetyHostControl(ctx, async message => { sent.push(message) }, hostGeneration)
  await control.command('scope', { hostGeneration, scope: { accountId, generation: 1 } })
  await control.command('bind', { sessionId: session.id })
  return { ctx, control, session, agent, sent, cancellations: () => cancel.mock.calls.length }
}
it('only an admitted exact live root can use a private captured account', async () => {
  const h = await fixture()
  expect(h.control.bindRootAgent(h.agent)).toEqual({ accountId, generation: 1, sessionId: h.session.id })
  expect(() => h.control.bindRootAgent({ ...h.agent })).toThrow('SKILL_SAFETY_STALE_SCOPE')
  const other = h.ctx.sessions.create(SessionId('ordinary'), { meta: { agentPreset: 'standard' } })
  await expect(h.control.command('bind', { sessionId: other.id })).rejects.toThrow('SKILL_SAFETY_STALE_SCOPE')
})
it('native request strips Agent/signal and correlates only a current private reply', async () => {
  const h = await fixture(), provider = createSkillSafetyProvider(h.ctx, h.control)
  const actor = provider.bindRootAgent(h.agent), lifetime = new AbortController()
  const promise = h.control.preflight({ agent: h.agent, actor, signal: lifetime.signal }, { kind: 'prepare-scanner', requestId: brandString<SkillSafetyRequestId>('prepare') })
  await Promise.resolve()
  const message = h.sent[0] as { type: string; request: SkillSafetyWireInvocation }
  expect(message.type).toBe('skill-safety-request'); expect(Object.keys(message.request.context)).toEqual(['hostGeneration', 'actor'])
  h.control.result({ type: 'skill-safety-result', rpcId: 'not-this-call', data: {} })
  h.control.result({ type: 'skill-safety-result', rpcId: message.request.rpcId, data: { intentId: 'intent', requestId: 'prepare', argumentDigest: 'a'.repeat(64) } })
  await expect(promise).resolves.toMatchObject({ intentId: 'intent' })
})
it('cancel waits for Main quiescence and account change rejects a late success', async () => {
  const h = await fixture(), lifetime = new AbortController()
  const actor = h.control.bindRootAgent(h.agent)
  const promise = h.control.preflight({ agent: h.agent, actor, signal: lifetime.signal }, { kind: 'prepare-scanner', requestId: brandString<SkillSafetyRequestId>('prepare') })
  await Promise.resolve(); lifetime.abort(); await Promise.resolve()
  expect(h.sent.map(message => (message as { type: string }).type)).toEqual(['skill-safety-request', 'skill-safety-cancel'])
  const message = h.sent[0] as { request: SkillSafetyWireInvocation }
  await h.control.command('scope', null)
  h.control.result({ type: 'skill-safety-result', rpcId: message.request.rpcId, data: { intentId: 'intent', requestId: 'prepare', argumentDigest: 'a'.repeat(64) } })
  await expect(promise).rejects.toThrow('SKILL_SAFETY_CANCELLED')
})
it('revoking the account cancels only the admitted native root, including its open question', async () => {
  const h = await fixture()
  await h.control.command('scope', null)
  expect(h.cancellations()).toBe(1)
  expect(() => h.control.bindRootAgent(h.agent)).toThrow('SKILL_SAFETY_STALE_SCOPE')
})
