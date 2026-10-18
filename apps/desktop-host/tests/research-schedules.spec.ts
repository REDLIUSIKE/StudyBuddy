import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import ScheduleService from '@deepseek-ai/dsh-schedule'
import { renderReminderFraming } from '@deepseek-ai/dsh-schedule'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as Include from '@deepseek-ai/cordis-plugin-include'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../packages/storage/storage-domain/tests/helpers/memory-backend.ts'
import { mountLocalActivations } from '../../../packages/subagent/subagent/tests/local-activation.ts'
import { createSessionTestController } from '../../../packages/api/session-controller/tests/test-remote.ts'
import { MockAdapter, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { NativeResearchAdvanced } from '../src/research-advanced.ts'
import type { NativeResearchSchedules, ResearchScheduleOptions } from '../src/research-schedules.ts'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose(); vi.useRealTimers() })
const context = { scope: { accountId: 'schedule-account', generation: 1 }, hostGeneration: '11111111-1111-4111-8111-111111111111', projectId: 'study', workspaceId: 'workspace-a', sessionId: 'parent-a', lease: '22222222-2222-4222-8222-222222222222' }
const id = '33333333-3333-4333-8333-333333333333'
const operation = '44444444-4444-4444-8444-444444444444'
const create = { action: 'create', operationId: id, name: 'Evidence review', trigger: { kind: 'interval', every: '1m', everyMs: 60000 }, catchUp: 'latest', quiet: true, sessionOnly: false, timeoutMs: null, target: { workflowScript: "return runs.run('review', {agent:'reviewer',task:'Review supplied evidence'});" } }

type ScheduleReply = Awaited<ReturnType<NativeResearchSchedules['command']>>
function scheduleList(reply: ScheduleReply) {
  if (!('schedules' in reply)) throw Error('Expected schedule list response')
  return reply
}
function scheduleHistory(reply: ScheduleReply) {
  if (!('deliveries' in reply)) throw Error('Expected schedule history response')
  return reply
}
function scheduleView(reply: ScheduleReply) {
  if (!('paused' in reply)) throw Error('Expected schedule view response')
  return reply
}

async function setup() {
  const file = new URL('../src/research-schedules.ts', import.meta.url)
  expect(existsSync(file), 'native research Schedule adapter is not implemented').toBe(true)
  const module = await import('../src/research-schedules.ts')
  const root = await realpath(await mkdtemp(join(tmpdir(), 'native-schedule-'))), ctx = new Context()
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(AgentLoop, { agents: [] }); await mountLocalActivations(ctx); await ctx.plugin(Subagents, {}); await ctx.plugin(Spawn, { providerName: 'spawn' })
  const adapter = new MockAdapter([textResponse('Canonical scheduled child output'), textResponse('Second scheduled child output'), textResponse('Ordinary parent message')])
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const parent = await ctx.agents.create({ sessionId: SessionId(context.sessionId), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'selected-parent-model' } })
  createSessionTestController(ctx, { defaultModelSelection: () => ({ provider: 'mock', model: 'selected-parent-model' }), cwd: root })
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend(new MemoryMediaPool()), facility = new DomainFacility(ctx, { backend: 'schedule-fixture' })
  ctx.effect(() => ctx.storage.backend.register('schedule-fixture', backend)); ctx.provide('storageDomain', facility)
  ctx.effect(() => async () => { await facility.closeAll(); await backend.close() })
  ctx.baseUrl = pathToFileURL(root).href + '/'; await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include; ctx.loader.builtins['research-schedule-fixture'] = ScheduleService
  const config = join(root, 'cordis.yml'); await writeFile(config, '- name: cordis:research-schedule-fixture\n  config: {}\n')
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } }); await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  let active = true, paused = false, persona = 'FROZEN_SCHEDULE_PERSONA', freezeCount = 0
  const advanced = new NativeResearchAdvanced(ctx, { current: () => active, directory: () => root, catalog: async () => ({ groups: [{ id: 'mock', models: [{ id: 'selected-parent-model' }] }] }) })
  const options: ResearchScheduleOptions = {
    current: () => active, directory: () => root,
    budget: async () => ({ paused }),
    freeze: async (_context, target) => {
      if (!target || typeof target !== 'object' || !('workflowScript' in target) || typeof target.workflowScript !== 'string') throw Error('Expected workflow script target')
      freezeCount++; return { model: 'mock/selected-parent-model', workflowScript: target.workflowScript, target: { label: 'reviewer', prompt: 'Review supplied evidence', persona, modelRef: 'mock/selected-parent-model', reasoningEffort: null, tools: [], inheritParentContext: false, maxTokens: 4000, systemPromptMode: 'replace', inheritProjectContext: false, inheritSkills: false } }
    },
    dispatch: async (owner, target, operationId) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) throw Error('Expected frozen specialist target')
      return advanced.command(owner, { action: 'start', operationId, ...target })
    },
    inspect: async (owner, operationId) => advanced.command(owner, { action: 'inspect', operationId }),
  }
  const owner = new module.NativeResearchSchedules(ctx, options)
  cleanups.push(async () => { await owner.close(); await advanced.close(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  return { ctx, owner, options, advanced, adapter, parent: parent.agent, root, setBudget: (value: boolean) => { paused = value }, setPersona: (value: string) => { persona = value }, freezeCount: () => freezeCount, revoke: () => { active = false } }
}

it('fires the existing durable native timer into one frozen specialist without a parent model turn', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  await x.owner.command(context, create); x.setPersona('CHANGED_AFTER_CREATION')
  x.ctx.effect(() => x.ctx.tools.register({ name: 'added-after-creation', description: 'Later tool', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'object', properties: {} }, render: () => [] }, execute: async () => ({}) }))
  expect(await x.ctx.schedule.list({ sessionId: SessionId(context.sessionId) })).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(60000)
  await vi.waitFor(async () => { const list = scheduleList(await x.owner.command(context, { action: 'list' })); expect(list.schedules[0]?.runs[0]?.state).toBe('completed') })
  expect(x.adapter.requests).toHaveLength(1)
  expect(x.adapter.requests[0]?.tools ?? []).toEqual([])
  expect(JSON.stringify(x.adapter.requests[0]?.messages)).toContain('FROZEN_SCHEDULE_PERSONA')
  expect(JSON.stringify(x.adapter.requests[0]?.messages)).not.toContain('CHANGED_AFTER_CREATION')
  expect(x.freezeCount()).toBe(1)
  const list = scheduleList(await x.owner.command(context, { action: 'list' })); expect(list.schedules[0]).toMatchObject({ model: 'mock/selected-parent-model', paused: false, trigger: { nextRunAt: '2026-10-13T00:02:00.000Z' }, runs: [expect.objectContaining({ state: 'completed', dueReason: 'timer', summary: 'Canonical scheduled child output' })] })
  expect((await x.ctx.schedule.catalog()).filter(record => record.status === 'active')).toHaveLength(1)
})

it('retains original interval anchor and delivery history through pause, resume and immediate manual run', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  await x.owner.command(context, create); await x.owner.command(context, { action: 'pause', id })
  await vi.advanceTimersByTimeAsync(150000); expect(x.adapter.requests).toHaveLength(0)
  await x.owner.command(context, { action: 'resume', id }); await vi.waitFor(async () => expect(scheduleList(await x.owner.command(context, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('completed'))
  expect(scheduleList(await x.owner.command(context, { action: 'list' })).schedules[0]?.trigger.nextRunAt).toBe('2026-10-13T00:03:00.000Z')
  await x.owner.command(context, { action: 'run', id, operationId: operation }); await vi.waitFor(async () => expect(scheduleHistory(await x.owner.command(context, { action: 'history', id })).runs[0]?.state).toBe('completed'))
  await x.owner.command(context, { action: 'run', id, operationId: operation }); expect(x.adapter.requests).toHaveLength(2)
  const result = scheduleHistory(await x.owner.command(context, { action: 'history', id })); expect(result.runs).toHaveLength(2); expect(result.runs[0]?.dueReason).toBe('manual')
})

it('holds due work at the existing soft CNY budget and resumes once through the native budget-check timer', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  await x.owner.command(context, create); x.setBudget(true); await vi.advanceTimersByTimeAsync(60000)
  expect(x.adapter.requests).toHaveLength(0); await vi.waitFor(async () => expect(scheduleList(await x.owner.command(context, { action: 'list' })).heldByBudget).toEqual([id]))
  await expect(x.owner.command(context, { action: 'run', id, operationId: operation })).rejects.toThrow('HARNESS_RESEARCH_BUDGET_REACHED')
  x.setBudget(false); await vi.advanceTimersByTimeAsync(60000)
  await vi.waitFor(async () => expect(scheduleList(await x.owner.command(context, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('completed'))
  expect(x.adapter.requests).toHaveLength(1)
})

it('denies stale account, foreign Session and child ownership without starting a model', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z')); await x.owner.command(context, create)
  await expect(x.owner.command({ ...context, scope: { accountId: 'other-account', generation: 1 } }, { action: 'run', id, operationId: operation })).rejects.toThrow('HARNESS_RESEARCH_SCHEDULE_NOT_FOUND')
  await expect(x.owner.command({ ...context, sessionId: 'foreign-session' }, { action: 'run', id, operationId: operation })).rejects.toThrow('HARNESS_RESEARCH_SCHEDULE_OWNER_DENIED')
  const child = await x.ctx.agents.create({ sessionId: SessionId('child-a'), meta: { cwd: x.root, parentSession: SessionId(context.sessionId), delegationDepth: 1 }, agentOptions: { provider: 'mock', model: 'selected-parent-model' } })
  await expect(x.owner.command({ ...context, sessionId: child.agent.id }, create)).rejects.toThrow('HARNESS_RESEARCH_SCHEDULE_OWNER_DENIED')
  x.revoke(); await expect(x.owner.command(context, { action: 'list' })).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED'); expect(x.adapter.requests).toHaveLength(0)
})

it('does not treat native inbox delivery as model completion or replay an unknown dispatch after restoration', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  await x.owner.close()
  const module = await import('../src/research-schedules.ts'), owner = new module.NativeResearchSchedules(x.ctx, { ...x.options, dispatch: async () => { throw Error('UNCERTAIN_START') } })
  cleanups.push(() => owner.close()); await owner.command(context, create); await vi.advanceTimersByTimeAsync(60000)
  await vi.waitFor(async () => expect(scheduleList(await owner.command(context, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('unknown'))
  await owner.close(); const restored = new module.NativeResearchSchedules(x.ctx, x.options); cleanups.push(() => restored.close())
  await restored.command(context, { action: 'ensure-host' }); expect(scheduleList(await restored.command(context, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('unknown'); expect(x.adapter.requests).toHaveLength(0)
  x.parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Ordinary user work' }] })); await x.parent.whenIdle(); expect(x.adapter.requests).toHaveLength(1)
})

it('preserves frozen targets across account-generation recovery and consumes a duplicated old timer delivery', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  await x.owner.command(context, create); const firstTimer = (await x.ctx.schedule.catalog())[0]!
  await vi.advanceTimersByTimeAsync(60000); await vi.waitFor(async () => expect(scheduleList(await x.owner.command(context, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('completed'))
  x.parent.followup(createUserMessage({ source: { kind: 'schedule' }, content: [{ type: 'text', text: renderReminderFraming({ id: firstTimer.id, kind: 'at', title: firstTimer.title, prompt: firstTimer.prompt, scheduledAt: firstTimer.scheduledAt }) }] })); await x.parent.whenIdle(); expect(x.adapter.requests).toHaveLength(1)
  await x.owner.suspend(); x.setPersona('AFTER_ACCOUNT_REBIND'); await vi.advanceTimersByTimeAsync(150000)
  const renewed = { ...context, scope: { ...context.scope, generation: 2 }, lease: '99999999-9999-4999-8999-999999999999' }
  await x.owner.command(renewed, { action: 'ensure-host' }); await vi.waitFor(async () => expect(scheduleList(await x.owner.command(renewed, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('completed'))
  expect(x.adapter.requests).toHaveLength(2); expect(x.freezeCount()).toBe(1); expect(JSON.stringify(x.adapter.requests[1]?.messages)).toContain('FROZEN_SCHEDULE_PERSONA'); expect(scheduleList(await x.owner.command(renewed, { action: 'list' })).schedules[0]?.trigger.nextRunAt).toBe('2026-10-13T00:04:00.000Z')
})

it('supports original authored schedule ids with exact ownership and rejects inconsistent interval metadata', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  const created = scheduleView(await x.owner.command(context, { ...create, alias: 'qc-nightly' })); expect(created.id).toBe('qc-nightly')
  await x.owner.command(context, { action: 'pause', id: 'qc-nightly' }); expect(scheduleView(await x.owner.command(context, { action: 'show', id: 'qc-nightly' })).paused).toBe(true)
  await expect(x.owner.command(context, { ...create, operationId: operation, alias: 'qc-nightly' })).rejects.toThrow('HARNESS_RESEARCH_SCHEDULE_OPERATION_CONFLICT')
  await expect(x.owner.command(context, { ...create, operationId: operation, trigger: { kind: 'interval', every: '1m', everyMs: 600000 } })).rejects.toThrow('HARNESS_RESEARCH_SCHEDULE_INPUT_INVALID')
})

it('loads Schedule through the real Cordis composition and withdraws the private dispatch guard at final disposal', async () => {
  const x = await setup(); expect([...x.ctx.loader.entries()].some(entry => entry.options.name === 'cordis:research-schedule-fixture' && entry.fiber)).toBe(true)
  const before = x.ctx.events._hooks['agent/pre-step']?.length ?? 0; await x.owner.close(); expect(x.ctx.events._hooks['agent/pre-step']?.length ?? 0).toBe(before - 1)
})

it('denies a private native timer message before account controllers are installed', async () => {
  const x = await setup(); await x.owner.close(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z'))
  const module = await import('../src/research-schedules.ts'); expect(typeof module.installResearchScheduleSafetyGuard, 'startup private Schedule gate is missing').toBe('function')
  const dispose = module.installResearchScheduleSafetyGuard(x.ctx)
  try { await x.ctx.schedule.create(SessionId(context.sessionId), { title: 'Saved research target', prompt: 'studybuddy-research-schedule-v1:' + id + ':' + operation, after_seconds: 1 }); await vi.advanceTimersByTimeAsync(1000); await vi.waitFor(async () => expect((await x.ctx.schedule.catalog())[0]?.status).toBe('inactive')); await x.parent.whenIdle(); expect(x.adapter.requests).toHaveLength(0) }
  finally { dispose() }
})

it('retains a visible earlier-delivery gap when bounded history prunes a restored receipt', async () => {
  const x = await setup(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00Z')); await x.owner.command(context, create); await x.owner.suspend()
  const file = join(x.root, '.studybuddy', 'native-schedules', id + '.json'), saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!saved || typeof saved !== 'object' || !('deliveries' in saved)) throw Error('Expected persisted delivery history')
  saved.deliveries = Array.from({ length: 200 }, (_, index) => ({ nativeId: 'archived-timer-' + index, messageId: 'archived-message-' + index, scheduledAt: '2026-10-12T00:00:00.000Z', deliveredAt: '2026-10-12T00:00:01.000Z', prompt: 'Saved private schedule occurrence' }))
  writeFileSync(file, JSON.stringify(saved) + '\n'); await x.owner.command(context, { action: 'ensure-host' }); await vi.advanceTimersByTimeAsync(60000)
  await vi.waitFor(async () => expect(scheduleList(await x.owner.command(context, { action: 'list' })).schedules[0]?.runs[0]?.state).toBe('completed'))
  const history = scheduleHistory(await x.owner.command(context, { action: 'history', id })); expect(history.deliveries).toHaveLength(200); expect(history.earlierDeliveriesUnavailable).toBe(true)
})
