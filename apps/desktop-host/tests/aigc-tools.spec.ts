import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { NativeAigcTools } from '../src/aigc-tools.ts'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0)) await close() })
it('shadows native writes only inside the admitted actor and revokes the scoped domain tools', async () => {
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  const parent = (await ctx.agents.create({ sessionId: SessionId('session-00000000-0000-4000-8000-000000000001'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const other = (await ctx.agents.create({ sessionId: SessionId('ordinary'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const body = vi.fn(async () => ({})); ctx.tools.register({ name: 'write', description: 'Native write', parameters: { type: 'object' }, output: { schema: { type: 'object' }, render: () => [] }, execute: body })
  const binding = { scope: { accountId: 'a', generation: 1 }, hostGeneration: '00000000-0000-4000-8000-000000000004', projectId: 'aigc-' + 'a'.repeat(48), workspaceId: 'workspace', sessionId: parent.id, lease: '00000000-0000-4000-8000-000000000002', authorizedRoot: process.cwd() }
  let current = true
  const parameters = { type: 'object', properties: { value: { type: 'string', pattern: '^OK$' } }, required: ['value'], additionalProperties: false }
  const invoke = vi.fn(async (_binding, _caller, operation) => operation === 'catalog' ? { tools: [{ name: 'write', description: 'Coordinated write', parameters, executionMode: 'sequential', promptGuidelines: [], plugin: { name: 'workspace', revision: 'a'.repeat(64) }, schemaSha256: createHash('sha256').update(JSON.stringify(parameters)).digest('hex') }] }
    : operation === 'resources' ? { text: 'Original enabled resources' } : operation === 'state' ? { connections: [] } : { content: [{ type: 'text', text: 'Coordinated once' }] })
  const tools = new NativeAigcTools(ctx, { invoke }, () => current, id => id === parent.id)
  await tools.mount(binding, parent)
  const call = (agent: typeof parent) => ctx.tools.execute({ name: 'write', callId: ToolCallId('call-a'), agent, arguments: { value: 'OK' }, signal: new AbortController().signal })
  expect((await call(parent)).isError).toBe(false); expect(body).not.toHaveBeenCalled()
  expect((await call(other)).isError).toBe(false); expect(body).toHaveBeenCalledOnce()
  current = false; expect((await call(parent)).isError).toBe(true); expect(invoke.mock.calls.filter(row => row[2] === 'execute')).toHaveLength(1)
  await tools.unmount(); expect((await call(parent)).isError).toBe(true); expect(body).toHaveBeenCalledTimes(1)
  current = true; await tools.mount(binding, parent); expect((await call(parent)).isError).toBe(false); expect(body).toHaveBeenCalledTimes(1)
})
