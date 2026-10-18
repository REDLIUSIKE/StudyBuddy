import { expect, it, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { ResearchToolRpc } from '../src/research-tool-rpc.ts'
import { NativeResearchProvenance } from '../src/research-provenance.ts'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bindScopeParent } from '@deepseek-ai/dsh-scope'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'native-observer-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  const parent = (await ctx.agents.create({ sessionId: SessionId('research-parent'), meta: { cwd: root }, agentOptions: {} })).agent
  const ordinary = (await ctx.agents.create({ sessionId: SessionId('ordinary-parent'), meta: { cwd: root }, agentOptions: {} })).agent
  const binding = { scope: { accountId: 'account', generation: 1 }, hostGeneration: '22222222-2222-4222-8222-222222222222', projectId: 'study', workspaceId: 'workspace', sessionId: parent.id, lease: '33333333-3333-4333-8333-333333333333', authorizedRoots: [root] }
  let current = true; const records: Record<string, unknown>[] = []
  let begin: (() => Promise<void>) | undefined
  let finishAttempts = 0, loseFinish = false
  const rpc: Pick<ResearchToolRpc, 'invoke'> = { invoke: async (_context, operation, _callId, record) => {
    expect(operation).toBe('advanced')
    const row = record as { name: string; arguments: Record<string, unknown> }
    expect(row.name).toBe('research_provenance'); records.push(row.arguments)
    if (row.arguments.action === 'begin') await begin?.()
    if (row.arguments.action === 'finish' && loseFinish && finishAttempts++ === 0) throw Error('HARNESS_RESEARCH_TOOL_UNAVAILABLE')
    return { observed: true, state: row.arguments.action === 'begin' ? 'prepared' : 'finished' }
  } }
  const provenance = new NativeResearchProvenance(ctx, rpc, () => current); provenance.mount(binding)
  cleanups.push(() => provenance.unmount())
  ctx.tools.register({ name: 'write', description: 'Local output', parameters: { type: 'object', additionalProperties: true }, output: { schema: { type: 'object' }, render: () => [] }, execute: async () => { await writeFile(join(root, 'actual.txt'), 'actual bytes'); return {} } })
  const run = (actor = parent, signal = new AbortController().signal, args: object = { file_path: 'actual.txt', content: 'raw media', api_key: 'test-secret' }) => ctx.tools.execute({ name: 'write', callId: ToolCallId('call-one'), arguments: args, agent: actor, signal })
  return { ctx, parent, ordinary, root, binding, provenance, records, run, loseFinish: () => { loseFinish = true }, revoke: () => { current = false }, gate: (wait: () => Promise<void>) => { begin = wait } }
}
it('awaits a private before-state before the actual native tool writes and records bounded safe parameters', async () => {
  const f = await setup(); let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve }); f.gate(() => wait)
  const pending = f.run(); await new Promise(resolve => setTimeout(resolve, 10))
  await expect(readFile(join(f.root, 'actual.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  release(); expect(await pending).toMatchObject({ isError: false }); expect(await readFile(join(f.root, 'actual.txt'), 'utf8')).toBe('actual bytes')
  expect(f.records.map(row => row.action)).toEqual(['begin', 'finish'])
  expect(f.records[0]).toMatchObject({ actorSessionId: f.parent.id, rootSessionId: f.parent.id, toolCallId: 'call-one', argumentsSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(JSON.stringify(f.records)).not.toContain('test-secret'); expect(JSON.stringify(f.records)).not.toContain('raw media')
})
it('observes owned descendants once and excludes ordinary sessions at the same filesystem root', async () => {
  const f = await setup(); const child = (await f.parent.ctx.agents.create({ sessionId: SessionId('research-child'), parentAgent: f.parent, meta: { cwd: f.root, parentSession: f.parent.id }, agentOptions: {} })).agent
  bindScopeParent(child, f.parent); f.provenance.mount(f.binding, child)
  expect(await f.run(child)).toMatchObject({ isError: false }); expect(f.records[0]).toMatchObject({ actorSessionId: child.id, parentSessionId: f.parent.id })
  expect(f.records).toHaveLength(2); await f.run(f.ordinary); expect(f.records).toHaveLength(2)
  await f.provenance.unmount(); await f.run(); expect(f.records).toHaveLength(2)
})
it('fences revocation before tool dispatch', async () => {
  const f = await setup(); f.gate(async () => { f.revoke() })
  expect(await f.run()).toMatchObject({ isError: true }); await expect(readFile(join(f.root, 'actual.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('retries only the same observation receipt after an uncertain acknowledgement', async () => {
  const f = await setup(); f.loseFinish(); await f.run(); await new Promise(resolve => setTimeout(resolve, 10))
  const attempts = f.records.filter(row => row.action === 'finish')
  expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0])
  expect(await readFile(join(f.root, 'actual.txt'), 'utf8')).toBe('actual bytes')
})
it('can reattach an admitted project after unmount without installing duplicate observers', async () => {
  const f = await setup(); await f.provenance.unmount(); f.provenance.mount(f.binding)
  await f.run(); expect(f.records).toHaveLength(2)
})
it('does not record denied tools as dispatched file-producing operations', async () => {
  const f = await setup(); f.parent.ctx.tools.guard(() => 'Denied')
  expect(await f.run()).toMatchObject({ isError: true }); expect(f.records).toHaveLength(0)
})
it('records a cancelled body only after its actual file effect reaches quiescence', async () => {
  const f = await setup(), controller = new AbortController()
  f.parent.ctx.tools.register({ name: 'cancelled_write', description: 'Cancelled local output', parameters: { type: 'object' }, output: { schema: { type: 'object' }, render: () => [] }, execute: async () => { await writeFile(join(f.root, 'partial.txt'), 'partial'); controller.abort(); return {} } })
  expect(await f.ctx.tools.execute({ name: 'cancelled_write', callId: ToolCallId('cancelled'), agent: f.parent, arguments: {}, signal: controller.signal })).toMatchObject({ isError: true })
  expect(await readFile(join(f.root, 'partial.txt'), 'utf8')).toBe('partial')
  expect(f.records.at(-1)).toMatchObject({ action: 'finish', isError: true, outcome: 'cancelled' })
})
it('keeps shell process failure and timeout facts even when the native tool returned a successful structured value', async () => {
  const f = await setup()
  f.parent.ctx.tools.register({ name: 'pwsh', description: 'Structured process result', parameters: { type: 'object' }, output: { schema: { type: 'object', additionalProperties: true }, render: () => [] }, execute: async () => ({ kind: 'foreground', exitCode: 0, signal: null, timedOut: true, aborted: false }) })
  expect(await f.ctx.tools.execute({ name: 'pwsh', callId: ToolCallId('process'), agent: f.parent, arguments: {}, signal: new AbortController().signal })).toMatchObject({ isError: false })
  expect(f.records.at(-1)).toMatchObject({ isError: true, outcome: 'failed', process: { exitCode: 0, timedOut: true } })
})
it('keeps background shell acceptance distinct from process completion', async () => {
  const f = await setup()
  f.parent.ctx.tools.register({ name: 'pwsh', description: 'Background process handle', parameters: { type: 'object' }, output: { schema: { type: 'object', additionalProperties: true }, render: () => [] }, execute: async () => ({ kind: 'background', jobId: 'background-1' }) })
  await f.ctx.tools.execute({ name: 'pwsh', callId: ToolCallId('background'), agent: f.parent, arguments: {}, signal: new AbortController().signal })
  expect(f.records.at(-1)).toMatchObject({ outcome: 'unknown', process: { kind: 'background' } })
})
it('waits for an already dispatched tool and its local observation before Host teardown resolves', async () => {
  const f = await setup(); let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve }), held = new Promise<void>(resolve => { release = resolve })
  f.parent.ctx.tools.register({ name: 'held_write', description: 'Held local output', parameters: { type: 'object' }, output: { schema: { type: 'object' }, render: () => [] }, execute: async () => { enter(); await held; await writeFile(join(f.root, 'held.txt'), 'held bytes'); return {} } })
  const pending = f.ctx.tools.execute({ name: 'held_write', callId: ToolCallId('held'), agent: f.parent, arguments: {}, signal: new AbortController().signal }); await entered
  let closed = false; const closing = f.provenance.close().then(() => { closed = true }); await new Promise(resolve => setTimeout(resolve, 10))
  expect(closed).toBe(false); release(); await pending; await closing
  expect(f.records.map(row => row.action)).toEqual(['begin', 'finish'])
})
