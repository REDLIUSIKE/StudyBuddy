import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import GoalService from '@deepseek-ai/dsh-goal'
import * as GoalDriver from '@deepseek-ai/dsh-goal-round-driver'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { mountLocalActivations } from '../../../packages/subagent/subagent/tests/local-activation.ts'
import { createSessionTestController } from '../../../packages/api/session-controller/tests/test-remote.ts'
import { NativeResearchAdvanced } from '../src/research-advanced.ts'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { HarnessResearchContextV1 } from '@studybuddy/contracts'
import * as leaf from '../src/research-goal.ts'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fs from 'node:fs'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const context: HarnessResearchContextV1 = { scope: { accountId: 'goal-fixture', generation: 1 }, hostGeneration: '11111111-1111-4111-8111-111111111111', projectId: 'study', workspaceId: 'workspace-a', sessionId: 'root-goal', lease: '22222222-2222-4222-8222-222222222222' }
const missionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function response(usage?: TokenUsage): StreamChunk[] { return [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'block-end', index: 0, block: { type: 'text', text: 'Observed output' } }, ...(usage ? [{ type: 'usage' as const, usage }] : []), { type: 'finish', reason: { kind: 'stop' } }] }
class Adapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly script: (StreamChunk[] | ((options: GenerateOptions) => Promise<StreamChunk[]>))[]) { super() }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (!entry) throw Error('Unexpected paid dispatch')
    let abort: (() => void) | undefined
    const cancellation = new Promise<StreamChunk[]>(resolve => { abort = () => resolve([]); options.signal?.addEventListener('abort', abort, { once: true }) })
    try { for (const chunk of typeof entry === 'function' ? await Promise.race([entry(options), cancellation]) : entry) yield chunk }
    finally { if (abort) options.signal?.removeEventListener('abort', abort) }
  }
}
async function setup(script: ConstructorParameters<typeof Adapter>[0], driver = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'research-goal-'))), ctx = new Context()
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(GoalService)
  if (driver) await ctx.plugin(GoalDriver)
  await ctx.plugin(AgentLoop, { agents: [] })
  await mountLocalActivations(ctx); await ctx.plugin(Subagents, {}); await ctx.plugin(Spawn, { providerName: 'spawn' })
  const adapter = new Adapter(script); ctx.llm.registerAdapter(['mock'], adapter)
  const rootEntry = await ctx.agents.create({ sessionId: SessionId(context.sessionId), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'exact-model', maxTokens: 7 } })
  let current = true
  createSessionTestController(ctx, { defaultModelSelection: () => ({ provider: 'mock', model: 'exact-model' }), cwd: root })
  const advanced = new NativeResearchAdvanced(ctx, { current: () => current, directory: () => root, catalog: async () => ({ groups: [{ id: 'mock', models: [{ id: 'exact-model' }] }] }), maxDepth: 3 })
  const options = { current: (owner: HarnessResearchContextV1) => current && owner.scope.accountId === context.scope.accountId && owner.projectId === context.projectId && owner.workspaceId === context.workspaceId && owner.sessionId === context.sessionId, directory: () => root, maxDepth: 3, freeze: async (context: HarnessResearchContextV1, id: string, objective: string) => advanced.freezeStart(context, { action: 'start', operationId: id, label: 'Continuous mission', prompt: objective, persona: '', modelRef: null, reasoningEffort: null, tools: null, inheritParentContext: false, systemPromptMode: 'append', inheritProjectContext: true, inheritSkills: true, maxTokens: 7 }) }
  const Owner = (leaf as Record<string, any>).NativeResearchGoals
  if (typeof Owner !== 'function') throw Error('NATIVE_RESEARCH_GOAL_NOT_IMPLEMENTED')
  const owner = new Owner(ctx, options)
  cleanup.push(async () => { await owner.close(); await advanced.close(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  let calls = 0
  let goalSessionId: string | undefined
  const sync = async (overrides: Record<string, unknown> = {}) => {
    const request = { action: 'sync', missionId, objective: 'Compare the recorded observations', tokenBudget: 90, state: 'active', explicit: true, callId: 'mission-auth-' + ++calls, ...overrides }
    let previous: any
    try { previous = await owner.command(context, { action: 'inspect', missionId: request.missionId }) } catch (error) { if ((error as Error).message !== 'HARNESS_RESEARCH_GOAL_NOT_FOUND') throw error }
    if (['cancelled', 'disabled', 'complete'].includes(String(request.state)) || previous && ['unknown', 'cancelled', 'disabled', 'complete'].includes(previous.state)) return owner.command(context, request)
    let release: (() => void) | undefined
    if (rootEntry.agent.status === 'idle') {
      const before = adapter.requests.length
      const wait = new Promise<void>(resolve => { release = resolve })
      script.unshift(async () => { await wait; return response({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }) })
      rootEntry.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Enable this explicit mission Goal with a cumulative 90 Token budget.' }] }))
      await vi.waitFor(() => expect(adapter.requests.length).toBeGreaterThan(before))
    }
    const dispose = rootEntry.agent.ctx.tools.register({ name: 'research_mission', description: 'Set the explicit authored mission Goal.', parameters: { type: 'object', additionalProperties: true }, output: { schema: { type: 'object', additionalProperties: true }, render: () => [] }, execute: async (_args, exec) => {
      const revoke = owner.authorizeMission(context, exec, { action: 'mission.create', mission: { title: 'Recorded observations', objective: request.objective, goal: true, budget: { tokens: request.tokenBudget } } })
      try { return await owner.command(context, request) } finally { revoke() }
    } })
    try {
      const result = await ctx.agents.withInitiator(rootEntry.agent, () => rootEntry.agent.ctx.tools.execute({ callId: ToolCallId(request.callId), name: 'research_mission', arguments: {}, agent: rootEntry.agent, signal: new AbortController().signal }))
      if (result.isError) throw Error(result.error.message)
      if (result.value && typeof result.value === 'object' && 'goalSessionId' in result.value && typeof result.value.goalSessionId === 'string' && request.missionId === missionId) goalSessionId = result.value.goalSessionId
      return result.value
    } finally { dispose(); if (release) { release(); await rootEntry.agent.whenIdle() } }
  }
  return { root, ctx, adapter, owner, advanced, get agent() { return goalSessionId ? ctx.agents.get(SessionId(goalSessionId)) ?? rootEntry.agent : rootEntry.agent }, rootAgent: rootEntry.agent, sync, options, revoke: () => { current = false } }
}

it('uses actual native Goal rounds and stops before dispatching past the cumulative terminal token cap', async () => {
  const x = await setup([response({ inputTokens: 20, outputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 5, reasoningTokens: 4, totalTokens: 65 }), response({ inputTokens: 20, outputTokens: 5, totalTokens: 25 })])
  await x.sync()
  await vi.waitFor(async () => expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'budget-exhausted', tokensUsed: 90, unknownRequests: [] }))
  expect(await x.owner.command(context, { action: 'inspect', missionId })).not.toHaveProperty('accountingError')
  expect(x.ctx.goals.get(x.agent)).toMatchObject({ phase: 'blocked', blockedReason: { code: 'research-token-limit' } })
  await x.agent.whenIdle()
  expect(x.adapter.requests).toHaveLength(3)
  expect(x.adapter.requests.map(request => request.maxTokens)).toEqual([7, 7, 7])
  expect(x.agent.session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'goal')).toHaveLength(2)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'budget-exhausted', tokensUsed: 90, tokenBudget: 90, unknownRequests: [] })
})
it.each([undefined, { inputTokens: 20, outputTokens: 5 }, { inputTokens: 20, outputTokens: 5, totalTokens: 24 }])('keeps missing or inconsistent terminal usage unknown and denies the next native request: %j', async usage => {
  const x = await setup([response(usage)])
  await x.sync()
  await vi.waitFor(() => expect(x.ctx.goals.get(x.agent)).toMatchObject({ phase: 'blocked', blockedReason: { code: 'research-usage-unconfirmed' } }))
  expect(x.adapter.requests).toHaveLength(2)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'unknown', tokensUsed: 0, unknownRequests: [expect.any(String)] })
  await expect(x.sync()).rejects.toThrow('HARNESS_RESEARCH_GOAL_USAGE_UNCONFIRMED')
})
it('blocks a stream retry after an unconfirmed failed attempt even when native retry policy permits it', async () => {
  const failed: StreamChunk[] = [{ type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'Dropped stream' } } }]
  const x = await setup([failed, response({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })])
  x.agent.ctx.on('agent/request-error', async (_error, next) => { await next(); return { kind: 'retry' } })
  await x.sync()
  await vi.waitFor(() => expect(x.ctx.goals.get(x.agent)).toMatchObject({ phase: 'blocked' }))
  await x.agent.whenIdle()
  expect(x.adapter.requests).toHaveLength(2)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'unknown', tokensUsed: 0 })
})
it('counts each terminal Session identity once through repeated events and observer restart', async () => {
  const x = await setup([response({ inputTokens: 20, outputTokens: 5, totalTokens: 25 })], false)
  await x.sync()
  x.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the explicit goal' }] }))
  await x.agent.whenIdle()
  const event = x.agent.session.snapshotEvents().find(event => event.type === 'assistant/message')!
  // Repeated observer delivery must not append the same event into the native
  // writer a second time; its canonical Session cut remains unchanged.
  const row = [...x.owner.rows.values()][0]
  x.owner.observe(row, x.agent.session, event); x.owner.observe(row, x.agent.session, event)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 25 })
  await x.owner.close()
  const reopened = new (leaf as Record<string, any>).NativeResearchGoals(x.ctx, x.options)
  cleanup.push(() => reopened.close())
  expect(await reopened.command({ ...context, lease: '33333333-3333-4333-8333-333333333333' }, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 25, activation: 'disarmed' })
  expect(x.adapter.requests).toHaveLength(2)
})
it('counts genuine same-project descendants without double counting parent tools and rejects foreign account access', async () => {
  const x = await setup([response({ inputTokens: 8, outputTokens: 2, totalTokens: 10 })], false)
  await x.sync()
  const child = await x.ctx.agents.create({ sessionId: SessionId('child-goal'), parentAgent: x.agent, meta: { cwd: x.root, parentSession: x.agent.id }, agentOptions: { provider: 'mock', model: 'exact-model', maxTokens: 3 } })
  child.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Count only this native child request' }] }))
  await child.agent.whenIdle()
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 10, sessions: expect.arrayContaining([expect.objectContaining({ sessionId: 'child-goal', tokensUsed: 10 })]) })
  await expect(x.owner.command({ ...context, scope: { accountId: 'other', generation: 1 } }, { action: 'inspect', missionId })).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
  await expect(x.owner.command({ ...context, projectId: 'other' }, { action: 'inspect', missionId })).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
})
it('does not create goals from ordinary tasks and excludes a request already dispatched before explicit goal creation', async () => {
  let release!: (value: StreamChunk[]) => void
  const gate = new Promise<StreamChunk[]>(resolve => { release = resolve })
  const x = await setup([() => gate, response({ inputTokens: 4, outputTokens: 1, totalTokens: 5 })], false)
  x.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Ordinary task' }] }))
  await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(1))
  expect(x.ctx.goals.get(x.agent)).toBeUndefined()
  await x.sync()
  release(response({ inputTokens: 80, outputTokens: 20, totalTokens: 100 })); await x.rootAgent.whenIdle()
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 0 })
  x.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue' }] })); await x.agent.whenIdle()
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 5 })
})
it('persists cancellation and refuses to revive the same authored goal or erase its spent usage', async () => {
  const x = await setup([response({ inputTokens: 20, outputTokens: 5, totalTokens: 25 })], false)
  await x.sync(); x.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue' }] })); await x.agent.whenIdle()
  await x.sync({ state: 'cancelled' })
  await x.owner.close()
  const reopened = new (leaf as Record<string, any>).NativeResearchGoals(x.ctx, x.options); cleanup.push(() => reopened.close())
  await expect(reopened.command(context, { action: 'sync', missionId, objective: 'Compare the recorded observations', tokenBudget: 90, state: 'active', explicit: true, callId: 'forged' })).rejects.toThrow('HARNESS_RESEARCH_GOAL_TERMINAL')
  expect(await reopened.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'cancelled', tokensUsed: 25 })
})
it('refuses a model-authored explicit marker without a live direct-human mission tool authorization', async () => {
  const x = await setup([], false)
  await expect(x.owner.command(context, { action: 'sync', missionId, objective: 'Model-authored plan', tokenBudget: 90, state: 'active', explicit: true, callId: 'forged' })).rejects.toThrow('HARNESS_RESEARCH_GOAL_AUTHORITY_REQUIRED')
  expect(x.ctx.goals.get(x.agent)).toBeUndefined(); expect(x.adapter.requests).toEqual([])
})
it('refuses to overwrite a same-UUID receipt owned by another account during new Goal admission', async () => {
  const x = await setup([], false); await x.sync(); await x.owner.suspend()
  const file = join(x.root, '.studybuddy', 'native-goals', missionId + '.json'), saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  saved.context.scope.accountId = 'foreign-account'
  const foreign = JSON.stringify(saved) + '\n'; fs.writeFileSync(file, foreign)
  await expect(x.sync()).rejects.toThrow('HARNESS_RESEARCH_GOAL_NOT_FOUND')
  expect(fs.readFileSync(file, 'utf8')).toBe(foreign)
})
it('repeated mounting keeps an armed goal running and scope suspension retains observers for the next binding', async () => {
  const x = await setup([response({ inputTokens: 20, outputTokens: 5, totalTokens: 25 }), response({ inputTokens: 20, outputTokens: 10, totalTokens: 30 })], false)
  await x.sync(); await x.agent.whenIdle(); await x.owner.mount(context); await x.owner.mount(context)
  expect(x.ctx.goals.get(x.agent)).toMatchObject({ activation: 'armed' })
  x.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue the goal' }] })); await x.agent.whenIdle()
  await x.owner.suspend(); await x.owner.mount(context)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 25, activation: 'disarmed' })
  await x.sync()
  x.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Resume with human authority' }] })); await x.agent.whenIdle()
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 55 })
})
it('runs multiple authored missions in distinct native child Goals and never assigns root control tokens to either budget', async () => {
  const firstRound = Promise.withResolvers<StreamChunk[]>(), secondRound = Promise.withResolvers<StreamChunk[]>()
  const x = await setup([() => firstRound.promise, () => secondRound.promise])
  const first: any = await x.sync({ tokenBudget: 40 }), secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(2))
  const second: any = await x.sync({ missionId: secondId, tokenBudget: 60, objective: 'Independent second mission' })
  await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(4))
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'active', tokensUsed: 0 })
  expect(await x.owner.command(context, { action: 'inspect', missionId: secondId })).toMatchObject({ state: 'active', tokensUsed: 0 })
  firstRound.resolve(response({ inputTokens: 30, outputTokens: 10, totalTokens: 40 }))
  await vi.waitFor(async () => expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 40, state: 'budget-exhausted' }))
  expect(await x.owner.command(context, { action: 'inspect', missionId: secondId })).toMatchObject({ state: 'active', tokensUsed: 0 })
  secondRound.resolve(response({ inputTokens: 50, outputTokens: 10, totalTokens: 60 }))
  await vi.waitFor(async () => expect(await x.owner.command(context, { action: 'inspect', missionId: secondId })).toMatchObject({ tokensUsed: 60, state: 'budget-exhausted' }))
  expect(first.goalSessionId).toMatch(/^session-[a-f0-9-]{36}$/); expect(second.goalSessionId).not.toBe(first.goalSessionId)
  expect(x.ctx.goals.get(x.rootAgent)).toBeUndefined()
  expect((await x.ctx.subagents.listChildren(x.rootAgent.id)).map(child => child.id)).toEqual(expect.arrayContaining([first.goalSessionId, second.goalSessionId]))
  const view: any = await x.owner.command(context, { action: 'inspect', missionId })
  expect(view).toMatchObject({ nativeSessionId: context.sessionId, goalSessionId: first.goalSessionId, sessions: [{ sessionId: first.goalSessionId, parentSessionId: context.sessionId, tokensUsed: 40 }] })
  expect(x.adapter.requests).toHaveLength(4)
})
it('settles all already-dispatched parent and child calls at the cap while denying a later descendant request', async () => {
  const parentRound = Promise.withResolvers<StreamChunk[]>(), childRound = Promise.withResolvers<StreamChunk[]>()
  const x = await setup([() => parentRound.promise, () => childRound.promise])
  await x.sync({ tokenBudget: 40 }); await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(2))
  const child = await x.ctx.agents.create({ sessionId: SessionId('session-cccccccc-cccc-4ccc-8ccc-cccccccccccc'), parentAgent: x.agent, meta: { cwd: x.root, parentSession: x.agent.id }, agentOptions: { provider: 'mock', model: 'exact-model', maxTokens: 7 } })
  x.agent.session.append('subagent/catalog', { version: 0, childId: child.agent.id, childCreatedAt: child.agent.session.header.createdAt, mode: 'continuable', label: 'Linked in-flight request' })
  child.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'An already admitted child call' }] }))
  await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(3))
  parentRound.resolve(response({ inputTokens: 30, outputTokens: 10, totalTokens: 40 })); await x.agent.whenIdle()
  expect(child.agent.status).toBe('running')
  childRound.resolve(response({ inputTokens: 20, outputTokens: 10, totalTokens: 30 })); await child.agent.whenIdle()
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'budget-exhausted', tokensUsed: 70, unknownRequests: [] })
  child.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'This call must be denied' }] })); await child.agent.whenIdle()
  expect(x.adapter.requests).toHaveLength(3)
  await child.dispose()
})
it('restoring a real persisted child before the accounting owner is mounted remains natively disarmed', async () => {
  const x = await setup([], false), created: any = await x.sync(); await x.owner.suspend()
  await x.ctx.plugin(GoalDriver)
  const resumed = await x.ctx.agents.resume({ resumeSessionId: SessionId(created.goalSessionId), parentAgent: x.rootAgent, agentOptions: { provider: 'mock', model: 'exact-model', maxTokens: 7 } })
  expect(x.ctx.goals.get(resumed.agent)).toMatchObject({ phase: 'active', activation: 'disarmed' })
  await resumed.agent.whenIdle(); expect(x.adapter.requests).toHaveLength(1)
  await resumed.dispose(); await x.owner.mount(context)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ activation: 'disarmed', tokensUsed: 0, state: 'paused' })
})
it('scope suspension drains a real managed nested child before removing accounting or disposing its Goal parent', async () => {
  const x = await setup([() => new Promise<StreamChunk[]>(() => {})], false); await x.sync()
  const nested = await x.advanced.commandForCaller(context, { action: 'start', operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', label: 'Managed mission descendant', prompt: 'Count this actual nested request', persona: '', modelRef: null, reasoningEffort: null, tools: [], inheritParentContext: false, maxTokens: 7 }, x.agent.id)
  if (!('nativeSessionId' in nested)) throw Error('Expected a published native specialist receipt')
  await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(2))
  await x.owner.suspend()
  expect(x.ctx.agents.get(SessionId(nested.nativeSessionId))).toBeUndefined()
  await x.owner.mount(context)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'unknown', tokensUsed: 0, unknownRequests: [expect.any(String)], sessions: expect.arrayContaining([expect.objectContaining({ sessionId: nested.nativeSessionId, tokensUsed: 0 })]) })
  expect(x.adapter.requests).toHaveLength(2)
})
it('restores an unresolved in-flight request as unknown and cannot replay a paid start after cancellation', async () => {
  const x = await setup([() => new Promise<StreamChunk[]>(() => {})])
  await x.sync(); await vi.waitFor(() => expect(x.adapter.requests).toHaveLength(2))
  await x.owner.suspend(); await x.owner.mount(context)
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'unknown', tokensUsed: 0, unknownRequests: [expect.stringMatching(/^session-[a-f0-9-]{36}:/)] })
  x.agent.cancel({ kind: 'user' }); await x.agent.whenIdle()
  await expect(x.sync()).rejects.toThrow('HARNESS_RESEARCH_GOAL_USAGE_UNCONFIRMED')
  expect(x.adapter.requests).toHaveLength(2)
})
it('mirrors native Goal completion and pause and excludes later ordinary tasks', async () => {
  const x = await setup([response({ inputTokens: 20, outputTokens: 10, totalTokens: 30 })], false); await x.sync(); await x.agent.whenIdle()
  let goal = x.ctx.goals.get(x.agent)!; x.ctx.goals.pause(x.agent, { id: goal.id, revision: goal.revision })
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'paused' })
  goal = x.ctx.goals.get(x.agent)!; x.ctx.goals.complete(x.agent, { id: goal.id, revision: goal.revision })
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ state: 'complete' })
  x.rootAgent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A new ordinary task after Goal completion' }] })); await x.rootAgent.whenIdle()
  expect(await x.owner.command(context, { action: 'inspect', missionId })).toMatchObject({ tokensUsed: 0, state: 'complete' })
})
