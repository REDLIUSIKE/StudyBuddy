import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MockAdapter, textResponse, toolCallResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { NativeAigcTemporary } from '../src/aigc-temporary.ts'
import { nativeAigcRecords } from '../src/aigc-records.ts'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
it('executes client callbacks in a real native child, records native results and never resubmits a repeated run', async () => {
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter([toolCallResponse('call-a', 'preview', { value: 'OK' }), textResponse('Rendered')]); ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const parent = (await ctx.agents.create({ sessionId: SessionId('session-00000000-0000-4000-8000-000000000001'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const engine = new NativeAigcTemporary(ctx, () => true); cleanups.push(() => engine.close())
  const id = '00000000-0000-4000-8000-000000000002', runId = '00000000-0000-4000-8000-000000000003'
  await engine.open(parent, 'project', { id, systemPrompt: 'Render supplied preview', tools: [{ name: 'preview', description: 'Preview', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] })
  await engine.start(id, runId, { provider: 'mock', model: 'exact-model' }, [{ type: 'text', text: 'Render' }])
  let cursor = 0, complete = false, seen: any[] = []
  for (let i = 0; i < 100 && !complete; i++) {
    const result = await engine.poll(id, runId, cursor, new AbortController().signal); cursor = result.cursor; seen.push(...result.events)
    for (const event of result.events) {
      if (event.type === 'clientTool' && typeof event.callId === 'string') { engine.toolResult(id, event.callId, { partial: true, result: { content: [{ type: 'text', text: 'Working preview' }] } }); engine.toolResult(id, event.callId, { result: { content: [{ type: 'text', text: JSON.stringify({ browserSessionId: 'browser-live', status: 'running', answer: 'Preview saved' }) }] } }) }
      if (event.type === 'complete') complete = true
    }
  }
  expect(complete).toBe(true); expect(seen).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'complete', text: 'Rendered' })]))
  const child = ctx.agents.get(SessionId('session-' + id))!; expect(child.session.snapshotEvents().filter(event => event.type === 'tool/result')).toHaveLength(1)
  await expect(engine.start(id, runId, { provider: 'mock', model: 'exact-model' }, [{ type: 'text', text: 'Repeat' }])).rejects.toThrow('AIGC_RUN_ALREADY_USED')
  expect(adapter.requests).toHaveLength(2)
  expect(seen).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tool', tool: expect.objectContaining({ status: 'running', result: expect.stringContaining('Working preview') }) })]))
  expect(nativeAigcRecords(child)).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'preview', status: 'success', result: expect.stringContaining('Preview saved') })])); expect(adapter.requests).toHaveLength(2)
  expect(JSON.parse(nativeAigcRecords(child)[0]!.result!).browserSessionId).toBe('browser-live')
  expect(JSON.parse(seen.find(event => event.type === 'tool' && event.tool.status === 'success').tool.result).browserSessionId).toBe('browser-live')
})

it('settles oversized streams and pending client callbacks when cancelled', async () => {
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter([{ hangAfter: [{ type: 'block-start', index: 0, blockType: 'text' }, { type: 'text-delta', index: 0, text: 'X'.repeat(25 * 1024 * 1024) }] }, toolCallResponse('cancel-call', 'wait', {})]); ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const parent = (await ctx.agents.create({ sessionId: SessionId('session-00000000-0000-4000-8000-000000000021'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const engine = new NativeAigcTemporary(ctx, () => true); cleanups.push(() => engine.close())
  const id = '00000000-0000-4000-8000-000000000022', runId = '00000000-0000-4000-8000-000000000023'
  await engine.open(parent, 'project', { id, systemPrompt: 'Write', tools: [{ name: 'wait', description: 'Wait', parameters: { type: 'object' } }] })
  await engine.start(id, runId, { provider: 'mock', model: 'exact-model' }, [{ type: 'text', text: 'Write' }]); await ctx.agents.get(SessionId('session-' + id))!.whenIdle()
  const overflow = await engine.poll(id, runId, 0, new AbortController().signal)
  expect(overflow.finished).toBe(true); expect(overflow.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', message: 'AIGC_EVENT_BACKPRESSURE' }), expect.objectContaining({ type: 'done' })]))
  const nextRun = '00000000-0000-4000-8000-000000000024'; await engine.start(id, nextRun, { provider: 'mock', model: 'exact-model' }, [{ type: 'text', text: 'Wait' }])
  let cursor = 0, callId: string | undefined
  for (let count = 0; count < 8 && !callId; count++) { const result = await engine.poll(id, nextRun, cursor, new AbortController().signal); cursor = result.cursor; callId = result.events.find(row => row.type === 'clientTool')?.callId as string | undefined }
  expect(callId).toBeTruthy(); await engine.control(id, 'stop', nextRun)
  expect(() => engine.toolResult(id, callId!, { result: null })).toThrow('AIGC_TOOL_CALLBACK_EXPIRED')
  await engine.control(id, 'close'); expect(adapter.requests).toHaveLength(2)
}, 15000)

it('coalesces a long native stream while the guest is idle and completes without losing text', async () => {
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  const text = '长'.repeat(17000), adapter = new MockAdapter([textResponse(text)]); ctx.effect(() => ctx.llm.registerAdapter(['mock'], adapter))
  const parent = (await ctx.agents.create({ sessionId: SessionId('session-00000000-0000-4000-8000-000000000011'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const engine = new NativeAigcTemporary(ctx, () => true); cleanups.push(() => engine.close())
  const id = '00000000-0000-4000-8000-000000000012', runId = '00000000-0000-4000-8000-000000000013'
  await engine.open(parent, 'project', { id, systemPrompt: 'Write', tools: [] })
  await engine.start(id, runId, { provider: 'mock', model: 'exact-model' }, [{ type: 'text', text: 'Write' }])
  await ctx.agents.get(SessionId('session-' + id))!.whenIdle()
  const result = await engine.poll(id, runId, 0, new AbortController().signal)
  expect(result.events.find(event => event.type === 'complete')?.text).toBe(text)
  expect(result.events.filter(event => event.type === 'text').map(event => event.delta).join('')).toBe(text)
  expect(result.events.length).toBeLessThan(20)
  expect(result.finished).toBe(true)
})
