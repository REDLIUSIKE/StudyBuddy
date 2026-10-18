import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import * as research from '../src/research-host.ts'
import { MockAdapter, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { createSessionTestController } from '../../../packages/api/session-controller/tests/test-remote.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
const op = '44444444-4444-4444-8444-444444444444'
const context = { scope: { accountId: 'account-a', generation: 3 }, hostGeneration: '22222222-2222-4222-8222-222222222222',
  projectId: 'project-a', workspaceId: 'workspace-a', sessionId: 'parent-a', lease: op }

async function setup(script: ConstructorParameters<typeof MockAdapter>[0] = [textResponse('Supported native output')]) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'studybuddy-research-native-')))
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter(script)
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const parent = await ctx.agents.create({ sessionId: SessionId('parent-a'), meta: { cwd: root }, agentOptions: { provider: 'mock', model: 'account-selected-model' } })
  createSessionTestController(ctx, { defaultModelSelection: () => ({ provider: 'mock', model: 'account-selected-model' }), cwd: root })
  ctx.provide('workspaceRegistry', { archivedSessionIds: [], pinnedSessionIds: [],
    get: (id: string) => id === 'workspace-a' ? { id, path: root, sessionIds: [parent.agent.id] } : undefined } as never)
  const binding = { ...context, authorizedRoots: [root] }
  const factory = (research as unknown as Record<string, unknown>).createNativeResearchExecution
  if (typeof factory !== 'function') throw Error('NATIVE_EXECUTION_NOT_IMPLEMENTED')
  const execution = factory(ctx, { binding: (value: typeof context) => value.lease === op ? binding : undefined,
    helperMaxTokens: { 'methods-draft': 4000, 'next-experiments': 6000, 'latex-assist': 4000 } }) as {
    admitted(value: typeof context): Promise<boolean>
    submit(value: typeof context, action: unknown, signal: AbortSignal): Promise<{ runId: string; state: string }>
    inspect(value: typeof context, runId: string, signal: AbortSignal): Promise<{ runId: string; state: string; result?: unknown }>
    cancel(value: typeof context, runId: string, signal: AbortSignal): Promise<{ runId: string; state: string }>
  }
  return { ctx, adapter, parent, execution }
}

describe('actual native Session research adapter', () => {
  it('admits only the captured existing Workspace and Session', async () => {
    const { execution, adapter } = await setup()
    expect(await execution.admitted(context)).toBe(true)
    expect(await execution.admitted({ ...context, workspaceId: 'another-workspace' })).toBe(false)
    expect(await execution.admitted({ ...context, sessionId: 'another-session' })).toBe(false)
    expect(adapter.requests).toHaveLength(0)
  })
  it('queues a conversation through the existing native Session API once', async () => {
    const { execution, adapter, parent } = await setup()
    const action = { operationId: op, kind: 'conversation', input: { prompt: 'Review the recorded study', references: [] } }
    expect(await execution.submit(context, action, new AbortController().signal)).toMatchObject({ runId: op })
    await parent.agent.whenIdle()
    expect((await execution.inspect(context, op, new AbortController().signal)).state).toBe('completed')
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]).toMatchObject({ provider: 'mock', model: 'account-selected-model' })
  })
  it('runs a prepared helper on the captured native selection with no tools', async () => {
    const { execution, adapter } = await setup()
    const action = { operationId: op, kind: 'methods-draft', input: { prompt: JSON.stringify({ systemPrompt: 'Use only reviewed records.', userPrompt: 'Reviewed scientific context' }), references: [] } }
    await execution.submit(context, action, new AbortController().signal)
    let result = await execution.inspect(context, op, new AbortController().signal)
    for (let attempt = 0; result.state === 'running' && attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10))
      result = await execution.inspect(context, op, new AbortController().signal)
    }
    expect(result).toMatchObject({ runId: op, state: 'completed', result: { kind: 'message', value: { text: 'Supported native output', nativeSessionId: op } } })
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]?.tools ?? []).toEqual([])
  })
  it('removes only the cancelled queued research message while keeping the current turn', async () => {
    const { execution, adapter, parent } = await setup(['hang'])
    parent.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Existing user work' }], source: { kind: 'user' } }))
    await vi.waitFor(() => expect(adapter.requests).toHaveLength(1))
    await execution.submit(context, { operationId: op, kind: 'conversation', input: { prompt: 'A later research request', references: [] } }, new AbortController().signal)
    expect(parent.agent.inbox.nextTurn).toHaveLength(1)
    expect((await execution.cancel(context, op, new AbortController().signal)).state).toBe('failed')
    expect(parent.agent.inbox.nextTurn).toHaveLength(0)
    expect(parent.agent.status).toBe('running')
    expect(adapter.requests).toHaveLength(1)
  })
  it('uses the existing native compaction service once, retaining its durable identity', async () => {
    const { execution, ctx, parent, adapter } = await setup()
    const compactNow = vi.fn(async (_agent: unknown, _signal: AbortSignal) => ({ compactionId: 'native-compact-a', startSeq: 12, endSeq: 16, shadowedRange: { start: 1, end: 10 }, shadowedSeqs: [1, 3, 10] }))
    ctx.provide('compaction', { compactNow } as never)
    const action = { operationId: op, kind: 'compaction', input: { prompt: 'Compact native context', references: [] } }
    await execution.submit(context, action, new AbortController().signal)
    await vi.waitFor(async () => expect(await execution.inspect(context, op, new AbortController().signal)).toMatchObject({
      state: 'completed', result: { kind: 'message', value: { nativeSessionId: 'parent-a', compactionId: 'native-compact-a', compacted: true } },
    }))
    await execution.submit(context, action, new AbortController().signal)
    expect(compactNow).toHaveBeenCalledTimes(1)
    expect(compactNow.mock.calls[0]?.[0]).toBe(parent.agent)
    expect(adapter.requests).toHaveLength(0)
  })
  it('does not turn a busy or no-op native compaction into a successful summary', async () => {
    const { execution, ctx } = await setup()
    const compactNow = vi.fn(async () => null)
    ctx.provide('compaction', { compactNow } as never)
    await execution.submit(context, { operationId: op, kind: 'compaction', input: { prompt: 'Compact native context', references: [] } }, new AbortController().signal)
    await vi.waitFor(async () => expect(await execution.inspect(context, op, new AbortController().signal)).toMatchObject({
      state: 'completed', result: { value: { compacted: false, nativeSessionId: 'parent-a' } },
    }))
    const second = '55555555-5555-4555-8555-555555555555'
    compactNow.mockRejectedValueOnce(Error('manual compaction requires an idle agent'))
    await execution.submit(context, { operationId: second, kind: 'compaction', input: { prompt: 'Compact native context', references: [] } }, new AbortController().signal)
    await vi.waitFor(async () => expect(await execution.inspect(context, second, new AbortController().signal)).toMatchObject({ state: 'failed' }))
  })
})
