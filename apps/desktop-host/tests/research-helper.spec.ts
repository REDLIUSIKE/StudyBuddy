import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as research from '../src/research-host.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
async function setup(script: ConstructorParameters<typeof MockAdapter>[0] = [textResponse('A supported Methods draft')]) {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter(script)
  ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const parent = await ctx.agents.create({ sessionId: SessionId('parent-a'), agentOptions: { provider: 'mock', model: 'selected-parent-model' } })
  const factory = (research as unknown as Record<string, unknown>).runNativeResearchHelper
  if (typeof factory !== 'function') throw Error('NATIVE_HELPER_NOT_IMPLEMENTED')
  const input = { parent: parent.agent, sessionId: SessionId('helper-a'), selection: { provider: 'mock', model: 'selected-parent-model' },
    systemPrompt: 'Only describe supplied records.', userPrompt: 'Dataset record for review.', maxTokens: 4000, signal: new AbortController().signal }
  return { ctx, adapter, input, run: () => factory(ctx, input) as Promise<{ text: string; sessionId: string }> }
}

describe('native one-shot research execution', () => {
  it('uses the real loop, frozen parent selection and no tools for one helper request', async () => {
    const { run, adapter } = await setup()
    expect(await run()).toMatchObject({ text: 'A supported Methods draft', sessionId: 'helper-a' })
    expect(adapter.requests).toHaveLength(1)
    expect(adapter.requests[0]).toMatchObject({ provider: 'mock', model: 'selected-parent-model' })
    expect(adapter.requests[0]?.tools ?? []).toEqual([])
  })
  it('does not execute or continue a model-invented tool call', async () => {
    const { run, adapter } = await setup([toolCallResponse('call-a', 'write', { path: 'user_data/study.csv', content: 'Overwrite data' }), textResponse('Must not request a second call')])
    await expect(run()).rejects.toThrow('HARNESS_RESEARCH_HELPER_INCOMPLETE')
    expect(adapter.requests).toHaveLength(1)
  })
  it('rejects an aborted helper before dispatching any model request', async () => {
    const { run, adapter, input } = await setup()
    const controller = new AbortController()
    controller.abort()
    input.signal = controller.signal
    await expect(run()).rejects.toThrow()
    expect(adapter.requests).toHaveLength(0)
  })
  it('does not retry a failed selected model or consume the next scripted response', async () => {
    const { run, adapter } = await setup([[{ type: 'finish', reason: { kind: 'error', failure: { code: 'CAPACITY', message: 'Selected model is at capacity' } } }], textResponse('Must not retry')])
    await expect(run()).rejects.toThrow('HARNESS_RESEARCH_HELPER_INCOMPLETE')
    expect(adapter.requests).toHaveLength(1)
  })
})
