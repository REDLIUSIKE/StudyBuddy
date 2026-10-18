import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import UserQuestions, { type AskUserQuestionAnswer, type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { brandString } from '@deepseek-ai/dsh-brand'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { registerSkillSafetyTools } from '../src/tools.ts'
import { apply as applySafetyTools } from '../src/tools.ts'
import { createScope } from '@deepseek-ai/dsh-scope'
import { expect, it, onTestFinished } from 'vitest'
import SkillSafety from '../src/index.ts'
import { createSkillSafetyProvider, type SkillSafetyHostControl, type SkillSafetyPreparedOperation } from '../src/provider.ts'
import type { SkillSafetyActor, SkillSafetyCommand, SkillSafetyIntentId, SkillSafetyInvocation, SkillSafetyJobId, SkillSafetyRequestId } from '../src/types.ts'

async function fixture() {
  const ctx = new Context(); onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(AgentRegistry); await ctx.plugin(UserQuestions); await ctx.plugin(SkillSafety)
  const session = Session.create(SessionId('safety-root'))
  const agent = { id: session.id, session, ctx, options: {}, status: 'idle' } as Agent
  const unregister = await ctx.agents.register(agent)
  const actor: SkillSafetyActor = { accountId: 'original-owner', generation: 1, sessionId: session.id }
  const requestId = brandString<SkillSafetyRequestId>('check-one')
  const prepared = { intentId: brandString<SkillSafetyIntentId>('intent-one'), requestId, argumentDigest: 'a'.repeat(64) }
  const command: SkillSafetyCommand = { kind: 'find', requestId, query: 'PDF' }
  const calls: { invocation: SkillSafetyInvocation; operation: SkillSafetyPreparedOperation; answer: AskUserQuestionAnswer | undefined }[] = [], released: string[] = []
  const control: SkillSafetyHostControl = {
    bindRootAgent: () => actor,
    preflight: async () => prepared,
    execute: async (invocation, operation, answer) => { calls.push({ invocation, operation, answer }); return { kind: 'candidates', value: { jobId: brandString<SkillSafetyJobId>('job'), status: 'no-match', candidates: [] } } },
    release: async (_invocation, operation) => { released.push(operation.intentId) },
    presentation: async sessionId => ({ sessionId, guide: true }),
  }
  return { ctx, agent, actor, command, control, prepared, calls, released, unregister }
}
it('exact live root and native answer are forwarded without model approval', async () => {
  const h = await fixture()
  const question = { id: 'native-confirm', question: '检查此来源并使用当前模型？', options: [{ label: '继续检查' }, { label: '取消' }] }
  h.control.preflight = async () => ({ ...h.prepared, question })
  const seen: AskUserQuestionRequest[] = []
  h.ctx.on('user-questions/request', async request => { seen.push(request); return { answers: [{ id: question.id, selected: ['继续检查'] }] } })
  const provider = createSkillSafetyProvider(h.ctx, h.control); h.ctx.skillSafety.registerProvider(provider)
  await h.ctx.skillSafety.execute(h.agent, h.command)
  expect(seen).toHaveLength(1)
  expect(seen[0]?.agent).toBe(h.agent); expect(seen[0]?.questions).toEqual([question])
  expect(h.calls[0]?.invocation.agent).toBe(h.agent); expect(h.calls[0]?.invocation.actor).toEqual(h.actor)
  expect(h.calls[0]?.answer).toEqual({ answers: [{ id: question.id, selected: ['继续检查'] }] })
  expect(h.released).toEqual(['intent-one'])
})
it('unregistered or substituted root cannot execute a private operation', async () => {
  const h = await fixture(), provider = createSkillSafetyProvider(h.ctx, h.control)
  await h.unregister()
  expect(() => provider.bindRootAgent(h.agent)).toThrow('SKILL_SAFETY_STALE_SCOPE')
  expect(h.calls).toEqual([])
})
it('a native question failure releases the prepared intent without execution', async () => {
  const h = await fixture()
  h.control.preflight = async () => ({ ...h.prepared, question: { id: 'confirm', question: '继续？' } })
  const provider = createSkillSafetyProvider(h.ctx, h.control); h.ctx.skillSafety.registerProvider(provider)
  await expect(h.ctx.skillSafety.execute(h.agent, h.command)).rejects.toThrow()
  expect(h.calls).toEqual([]); expect(h.released).toEqual(['intent-one'])
})
it('a root removed while its question is open cannot execute after an answer', async () => {
  const h = await fixture()
  h.control.preflight = async () => ({ ...h.prepared, question: { id: 'confirm', question: '继续？' } })
  h.ctx.on('user-questions/request', async () => { await h.unregister(); return { answers: [{ id: 'confirm', selected: ['继续'] }] } })
  const provider = createSkillSafetyProvider(h.ctx, h.control); h.ctx.skillSafety.registerProvider(provider)
  await expect(h.ctx.skillSafety.execute(h.agent, h.command)).rejects.toThrow('SKILL_SAFETY_STALE_SCOPE')
  expect(h.calls).toEqual([]); expect(h.released).toEqual(['intent-one'])
})
it('another session in a captured actor cannot impersonate the live root', async () => {
  const h = await fixture(); h.control.bindRootAgent = () => ({ ...h.actor, sessionId: SessionId('other-session') })
  const provider = createSkillSafetyProvider(h.ctx, h.control)
  expect(() => provider.bindRootAgent(h.agent)).toThrow('SKILL_SAFETY_STALE_SCOPE')
})
it('four closed feature tools are registered; preparation has no URL or approval field', async () => {
  const h = await fixture(); await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(Tools)
  registerSkillSafetyTools(h.ctx)
  expect(h.ctx.tools.schemas().map(value => value.name)).toEqual(['skill_safety_find', 'skill_safety_prepare_scanner', 'skill_safety_scan', 'skill_safety_install'])
  const schema = h.ctx.tools.schemas().find(value => value.name === 'skill_safety_prepare_scanner')
  expect(schema?.parameters).toMatchObject({ properties: { requestId: { type: 'string' } } })
  expect(Object.keys(schema?.parameters.properties ?? {})).toEqual(['requestId'])
})
it('model_approved_field_cannot_write through the actual tool dispatcher', async () => {
  const h = await fixture(); await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(Tools)
  const provider = createSkillSafetyProvider(h.ctx, h.control); h.ctx.skillSafety.registerProvider(provider)
  registerSkillSafetyTools(h.ctx)
  const result = await h.ctx.tools.execute({ callId: ToolCallId('model-forged-approval'), name: 'skill_safety_install', arguments: { requestId: 'install-one', reportId: 'report-one', approved: true }, agent: h.agent, signal: new AbortController().signal })
  expect(result.isError).toBe(true)
  expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('SKILL_SAFETY_COMMAND_INVALID') }]); expect(h.calls).toEqual([])
})
it('unlisted scoped generic tool cannot execute, even when an extension allows it', async () => {
  const h = await fixture(); await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(Tools)
  let calls = 0
  await h.ctx.plugin(Object.assign((inner: Context) => {
    const scope = createScope(inner, h.agent)
    applySafetyTools(scope.ctx)
    scope.ctx.tools.register({ name: 'generic_shell', description: 'Untrusted extra capability', parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: () => [] }, execute: async () => { calls++; return 'executed' } })
    scope.ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }), { prepend: true })
  }, { inject: ['tools', 'systemPrompt', 'skillSafety', 'agents'] }))
  const result = await h.ctx.tools.execute({ callId: ToolCallId('forbidden-shell'), name: 'generic_shell', arguments: {}, agent: h.agent, signal: new AbortController().signal })
  expect(result.isError).toBe(true); expect(calls).toBe(0)
})
it('a native root inherits the preset feature tools at its first step without global capabilities', async () => {
  const h = await fixture(); await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(Tools)
  await h.ctx.plugin(Object.assign(async (inner: Context) => {
    inner.tools.register({ name: 'global_shell', description: 'Ordinary chat capability', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => 'ordinary' })
    const presetKey = {}, preset = createScope(inner, presetKey)
    applySafetyTools(preset.ctx)
    preset.ctx.tools.register({ name: 'ask_user_question', description: 'Native clarification', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => 'answer' })
    const root = createScope(inner, h.agent, { parent: presetKey })
    Object.assign(h.agent, { ctx: root.ctx })
    expect(inner.tools.schemas(h.agent).map(tool => tool.name)).toEqual(expect.arrayContaining(['skill_safety_find', 'skill_safety_prepare_scanner', 'skill_safety_scan', 'skill_safety_install', 'ask_user_question']))
    const first = await inner.systemPrompt.assemble({ agent: h.agent, scope: h.agent })
    expect(first.tools.map(tool => tool.name)).toEqual(['ask_user_question', 'skill_safety_find', 'skill_safety_install', 'skill_safety_prepare_scanner', 'skill_safety_scan'])
    await agentEvents(inner, h.agent).waterfall('agent/pre-step', { messages: [], turn: 1, step: 1, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages: [] }))
    inner.tools.register({ name: 'late_global', description: 'Later ordinary capability', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => 'ordinary' })
    const later = await inner.systemPrompt.assemble({ agent: h.agent, scope: h.agent })
    expect(later.tools.map(tool => tool.name)).toEqual(['ask_user_question', 'skill_safety_find', 'skill_safety_install', 'skill_safety_prepare_scanner', 'skill_safety_scan'])
    expect(inner.tools.schemas().map(tool => tool.name)).toEqual(['global_shell', 'late_global'])
    const ordinary = await inner.tools.execute({ callId: ToolCallId('ordinary-remains'), name: 'global_shell', arguments: {}, signal: new AbortController().signal })
    expect(ordinary.isError).not.toBe(true)
  }, { inject: ['tools', 'systemPrompt', 'skillSafety', 'agents'] }))
})
