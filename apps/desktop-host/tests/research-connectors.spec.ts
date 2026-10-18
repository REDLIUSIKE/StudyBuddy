import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies, provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { resolve } from 'node:path'
import { NativeResearchConnectors } from '../src/research-connectors.ts'
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcRunRequest, PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
it('uses the actual native MCP client in the admitted Agent scope and awaits its disposal', async () => {
  const ctx = new Context(); contexts.push(ctx); await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  const research = (await ctx.agents.create({ sessionId: SessionId('research'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const ordinary = (await ctx.agents.create({ sessionId: SessionId('ordinary'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  let current = true
  const fixture = resolve('../../../integrations/k-dense/server/test/fixtures/echo-mcp-server.mjs')
  const connectors = new NativeResearchConnectors(ctx, () => current)
  const binding = { sessionId: 'research', projectId: 'study', authorizedRoots: [process.cwd()] } as never
  await connectors.mount(binding, { autoEnableCodemode: false, connectors: [{ name: 'echo', scope: 'project', state: 'ready', config: {
    transport: 'stdio', serverName: 'echo', command: process.execPath, args: [fixture], env: {}, cwd: process.cwd(), exposure: 'direct', toolCallTimeoutMs: 3000, failOnStartupError: true,
  } }] })
  const invoke = (agent: typeof research) => ctx.tools.execute({ agent, name: 'mcp__echo__echo', callId: ToolCallId('fixture-echo'), arguments: { text: 'Native research fixture' }, signal: new AbortController().signal })
  const result = await invoke(research); expect(result.isError, JSON.stringify(result)).toBe(false); expect(JSON.stringify(result)).toContain('Native research fixture')
  expect((await invoke(ordinary)).isError).toBe(true)
  current = false; await connectors.unmount(); expect((await invoke(research)).isError).toBe(true)
})
it('runs code-mode connector calls through the native bridge and records nested dispatches', async () => {
  const ctx = new Context(); contexts.push(ctx); await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  provideWorkingDirectoryFixture(ctx)
  class FixtureRuntime extends PtcRuntime {
    readonly language = 'typescript'; readonly isolation = 'fixture'
    resolve(request: PtcRunRequest): PtcRunSpec { return { ...request, cwd: process.cwd(), timeoutMs: 3000 } }
    async run(request: PtcRunRequest) {
      const functions = request.bindings[0]!.functions; expect(Object.keys(functions)).toEqual(['mcp__echo__echo', 'mcp__echo__add'])
      return { logs: [], value: await functions.mcp__echo__echo!({ text: 'Nested native connector' }) }
    }
  }
  await ctx.plugin(FixtureRuntime)
  const research = (await ctx.agents.create({ sessionId: SessionId('code-research'), meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const connectors = new NativeResearchConnectors(ctx, () => true)
  await connectors.mount({ sessionId: research.id, projectId: 'study', authorizedRoots: [process.cwd()] } as never, {
    autoEnableCodemode: true, connectors: [{ name: 'echo', scope: 'project', state: 'ready', config: { transport: 'stdio', serverName: 'echo', command: process.execPath,
      args: [resolve('../../../integrations/k-dense/server/test/fixtures/echo-mcp-server.mjs')], env: {}, cwd: process.cwd(), exposure: 'codemode', toolCallTimeoutMs: 3000, failOnStartupError: true } }],
  })
  const result = await ctx.tools.execute({ name: 'research_connector_code', agent: research, callId: ToolCallId('native-code'), arguments: { code: 'fixture bridge', description: 'Read connector fixture' }, signal: new AbortController().signal })
  expect(result.isError, JSON.stringify(result)).toBe(false)
  expect(research.session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch-start')).toHaveLength(1)
  expect(research.session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch')).toHaveLength(1)
  await connectors.unmount()
})
