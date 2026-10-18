import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import * as ToolPwsh from '@deepseek-ai/dsh-tool-pwsh'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import * as ToolJobs from '@deepseek-ai/dsh-tool-jobs'
import { NativeResearchWorkflowHost } from '../src/research-workflow-host.ts'
import { NativeResearchTools } from '../src/research-tools.ts'
import type { ResearchToolRpc } from '../src/research-tool-rpc.ts'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0).reverse()) await dispose() })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'workflow-native-host-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true }); await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LocalJobRegistry); await ctx.plugin(ToolJobs)
  await ctx.plugin(LocalSubprocessRuntime); await ctx.plugin(ShellEnv); await ctx.plugin(PwshLocalExecutor, { timeoutMs: 5000, graceMs: 100 }); await ctx.plugin(ToolPwsh)
  const caller = (await ctx.agents.create({ sessionId: SessionId('host-caller'), meta: { cwd: root }, agentOptions: {} })).agent
  const foreign = (await ctx.agents.create({ sessionId: SessionId('host-foreign'), meta: { cwd: root }, agentOptions: {} })).agent
  const context = { scope: { accountId: 'account', generation: 1 }, hostGeneration: '22222222-2222-4222-8222-222222222222', projectId: 'study', workspaceId: 'workspace', sessionId: caller.id, lease: '33333333-3333-4333-8333-333333333333' }
  let current = true
  const options = { current: () => current, directory: () => root, proveCaller: async (_context: typeof context, id: string) => { if (id !== caller.id) throw Error('HARNESS_RESEARCH_CALLER_DENIED'); return caller } }
  const host = new NativeResearchWorkflowHost(ctx, options); cleanups.push(() => host.dispose())
  return { ctx, caller, foreign, context, host, root, options, revoke: () => { current = false } }
}
async function terminal(f: Awaited<ReturnType<typeof setup>>, id: string) {
  const deadline = Date.now() + 10000
  for (;;) {
    const result = await f.host.command(f.context, f.caller.id, { action: 'inspect', operationId: id })
    if (result.state !== 'running') return result
    if (Date.now() >= deadline) throw Error('workflow host fixture did not settle')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
it('returns immediately and uses actual native PowerShell output, cwd and exit status without opening a model turn', async () => {
  const f = await setup(), id = randomUUID()
  const started = await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Set-Content actual.txt actual; Write-Output "实际stdout"; [Console]::Error.WriteLine("actual stderr"); exit 3', timeoutMs: 5000 })
  expect(started.state).toBe('running')
  const result = await terminal(f, id)
  expect(result).toMatchObject({ state: 'failed', result: { kind: 'foreground', exitCode: 3, timedOut: false, aborted: false } })
  expect(result.result?.stdout.text).toContain('实际stdout'); expect(result.result?.stderr.text).toContain('actual stderr')
  expect((await readFile(join(f.root, 'actual.txt'), 'utf8')).trim()).toBe('actual')
  expect(f.caller.session.snapshotEvents().some(row => ['user/message', 'tool/call', 'assistant/message'].includes(row.type))).toBe(false)
  expect(f.caller.status).toBe('idle'); expect(f.ctx.jobs.list(f.caller.id)).toEqual([])
})
it('runs a stable operation once, rejects conflicting input and rejects another caller or account', async () => {
  const f = await setup(), id = randomUUID(), input = { action: 'start' as const, operationId: id, command: 'Add-Content count.txt one', timeoutMs: 5000 }
  await Promise.all([f.host.command(f.context, f.caller.id, input), f.host.command(f.context, f.caller.id, input)]); await terminal(f, id)
  await f.host.command(f.context, f.caller.id, input)
  expect((await readFile(join(f.root, 'count.txt'), 'utf8')).trim().split(/\r?\n/)).toEqual(['one'])
  await expect(f.host.command(f.context, f.caller.id, { ...input, command: 'Add-Content count.txt second' })).rejects.toThrow('HARNESS_RESEARCH_WORKFLOW_HOST_CONFLICT')
  await expect(f.host.command(f.context, f.foreign.id, { action: 'inspect', operationId: id })).rejects.toThrow('HARNESS_RESEARCH_CALLER_DENIED')
  await expect(f.host.command({ ...f.context, scope: { accountId: 'other', generation: 1 } }, f.caller.id, { action: 'inspect', operationId: id })).rejects.toThrow('HARNESS_RESEARCH_WORKFLOW_HOST_OWNER_DENIED')
})
it('keeps the original private research data guard on the real native shell dispatch', async () => {
  const f = await setup(); await mkdir(join(f.root, 'user_data')); await writeFile(join(f.root, 'user_data/raw.txt'), 'raw')
  const binding = { ...f.context, authorizedRoots: [f.root] }, rpc: Pick<ResearchToolRpc, 'invoke'> = { invoke: async (_context, operation) => operation === 'catalog' ? { tools: ['notebook', 'notebook_search', 'add_pdf_annotation', 'list_pdf_annotations', 'remove_pdf_annotation'].map(name => ({ name, description: name, parameters: { type: 'object' } })) } : { verdict: { kind: 'protected' }, destructiveConfirm: true } }
  const tools = new NativeResearchTools(f.ctx, rpc as ResearchToolRpc, () => true); await tools.mount(binding); cleanups.push(() => tools.unmount())
  const id = randomUUID(); await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Set-Content user_data/raw.txt replacement', timeoutMs: 5000 })
  expect((await terminal(f, id)).state).toBe('failed'); expect(await readFile(join(f.root, 'user_data/raw.txt'), 'utf8')).toBe('raw')
})
it('retains native approval instead of bypassing a destructive research ask', async () => {
  const f = await setup(); f.caller.ctx.on('tools/pre-execute', async (_exec, next) => { const decision = await next(); return decision.kind === 'allow' ? { kind: 'ask', reason: 'Original native approval required.' } : decision })
  const id = randomUUID(); await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Set-Content unapproved.txt bad', timeoutMs: 5000 })
  expect((await terminal(f, id)).state).toBe('failed'); await expect(readFile(join(f.root, 'unapproved.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('kills and drains the real native command at its timeout without a background completion waking an AI', async () => {
  const f = await setup(), id = randomUUID()
  await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Start-Sleep -Seconds 10; Set-Content late.txt late', timeoutMs: 100 })
  const result = await terminal(f, id)
  expect(result).toMatchObject({ state: 'failed', timedOut: true, aborted: true, canonicalResultUnavailable: true })
  await expect(readFile(join(f.root, 'late.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.ctx.jobs.list(f.caller.id).some(job => ['running', 'stopping'].includes(job.status))).toBe(false)
  expect(f.caller.status).toBe('idle'); expect(f.caller.session.snapshotEvents().some(row => row.type === 'assistant/message')).toBe(false)
})
it('cancels the owned command and labels the unavailable canonical value without inventing stdout or an exit code', async () => {
  const f = await setup(), id = randomUUID()
  await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Start-Sleep -Seconds 10; Set-Content after-cancel.txt bad', timeoutMs: 5000 })
  await new Promise(resolve => setTimeout(resolve, 50)); await f.host.command(f.context, f.caller.id, { action: 'cancel', operationId: id })
  expect(await terminal(f, id)).toMatchObject({ state: 'cancelled', aborted: true, canonicalResultUnavailable: true })
  await expect(readFile(join(f.root, 'after-cancel.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.ctx.jobs.list(f.caller.id).some(job => ['running', 'stopping'].includes(job.status))).toBe(false)
})
it('loads an interrupted durable intent as unknown and never repeats the process after recovery', async () => {
  const f = await setup(), id = randomUUID()
  await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Add-Content count.txt one; Start-Sleep -Seconds 10', timeoutMs: 5000 })
  const file = join(f.root, '.kady/native-workflow-host', id + '.json'), before = await readFile(file)
  await f.host.close(); await writeFile(file, before)
  const recovered = new NativeResearchWorkflowHost(f.ctx, f.options); cleanups.push(() => recovered.dispose())
  expect(await recovered.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Add-Content count.txt one; Start-Sleep -Seconds 10', timeoutMs: 5000 })).toMatchObject({ state: 'unknown' })
  expect(await recovered.command(f.context, f.caller.id, { action: 'cancel', operationId: id })).toMatchObject({ state: 'unknown' })
})
it('withdraws running work on scope change and refuses revoked observations', async () => {
  const f = await setup(), id = randomUUID()
  await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Start-Sleep -Seconds 10; Set-Content revoked.txt bad', timeoutMs: 5000 })
  f.revoke(); await f.host.close('study')
  await expect(f.host.command(f.context, f.caller.id, { action: 'inspect', operationId: id })).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
  await expect(readFile(join(f.root, 'revoked.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(f.ctx.jobs.list(f.caller.id).some(job => ['running', 'stopping'].includes(job.status))).toBe(false)
})
it('closes one project without waiting for another project caller admission', async () => {
  const f = await setup(), otherRoot = join(f.root, 'other'); await mkdir(otherRoot)
  const other = (await f.ctx.agents.create({ sessionId: SessionId('host-other-project'), meta: { cwd: otherRoot }, agentOptions: {} })).agent
  const otherContext = { ...f.context, projectId: 'other', workspaceId: 'other-workspace', sessionId: other.id }
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve }), hold = new Promise<void>(resolve => { release = resolve })
  const scoped = new NativeResearchWorkflowHost(f.ctx, { current: () => true, directory: context => context.projectId === 'other' ? otherRoot : f.root, proveCaller: async context => { if (context.projectId === 'other') { enter(); await hold; return other }; return f.caller } }); cleanups.push(() => scoped.dispose())
  const pending = scoped.command(otherContext, other.id, { action: 'start', operationId: randomUUID(), command: 'Write-Output other', timeoutMs: 5000 }); await entered
  let closed = false; const closing = scoped.close('study').then(() => { closed = true }); await new Promise(resolve => setTimeout(resolve, 10)); const observed = closed
  release(); await pending; await closing
  expect(observed).toBe(true)
})
it('does not turn missing or nonterminal native values into command success', async () => {
  const f = await setup()
  f.caller.ctx.tools.register({ name: 'pwsh', description: 'Contract fixture', parameters: { type: 'object', additionalProperties: true }, output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'exit code: 0; claimed successful output' }] }, execute: async () => ({ kind: 'background', jobId: 'unknown-job' }) })
  const id = randomUUID(); await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Contract fixture', timeoutMs: 5000 })
  const result = await terminal(f, id); expect(result.state).toBe('unknown'); expect(result.canonicalResultUnavailable).toBe(true); expect(result.result).toBeUndefined()
})
it('preserves simultaneous timeout and exit-zero facts in a validated native foreground value', async () => {
  const f = await setup()
  f.caller.ctx.tools.register({ name: 'pwsh', description: 'Timeout fact fixture', parameters: { type: 'object', additionalProperties: true }, output: { schema: { type: 'object', additionalProperties: true }, render: () => [] }, execute: async () => ({ kind: 'foreground', cwd: f.root, exitCode: 0, signal: null, timedOut: true, aborted: false, timeoutMs: 100, stdout: { text: 'actual fixture', truncated: true }, stderr: { text: '', truncated: false } }) })
  const id = randomUUID(); await f.host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Contract fixture', timeoutMs: 5000 })
  expect(await terminal(f, id)).toMatchObject({ state: 'failed', result: { exitCode: 0, timedOut: true, aborted: false, stdout: { truncated: true } } })
})
it('starts the command deadline after an outer execution observer finishes its before-state', async () => {
  const f = await setup()
  const remove = f.ctx.on('tools/execute', async (exec, next) => { if (exec.callId.startsWith('workflow-host:')) await new Promise(resolve => setTimeout(resolve, 1500)); return next() }, { prepend: true }); cleanups.push(async () => { remove() })
  const host = new NativeResearchWorkflowHost(f.ctx, f.options); cleanups.push(() => host.dispose())
  const id = randomUUID(); await host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Write-Output observed-after-prepare', timeoutMs: 1000 })
  const deadline = Date.now() + 5000
  let result = await host.command(f.context, f.caller.id, { action: 'inspect', operationId: id })
  while (result.state === 'running' && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 10)); result = await host.command(f.context, f.caller.id, { action: 'inspect', operationId: id }) }
  expect(result.state).toBe('completed'); expect(result.result?.stdout.text).toContain('observed-after-prepare')
})
it('stops the command deadline before an outer execution observer records its after-state', async () => {
  const f = await setup()
  let abortedDuringAfterState: boolean | undefined
  const remove = f.ctx.on('tools/execute', async (exec, next) => {
    const value = await next()
    if (exec.callId.startsWith('workflow-host:')) { await new Promise(resolve => setTimeout(resolve, 1500)); abortedDuringAfterState = exec.signal?.aborted }
    return value
  }, { prepend: true }); cleanups.push(async () => { remove() })
  const host = new NativeResearchWorkflowHost(f.ctx, f.options); cleanups.push(() => host.dispose())
  const id = randomUUID(); await host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Write-Output observed-before-after-state', timeoutMs: 1000 })
  const deadline = Date.now() + 5000
  let result = await host.command(f.context, f.caller.id, { action: 'inspect', operationId: id })
  while (result.state === 'running' && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 10)); result = await host.command(f.context, f.caller.id, { action: 'inspect', operationId: id }) }
  expect(abortedDuringAfterState).toBe(false); expect(result.state).toBe('completed'); expect(result.result?.stdout.text).toContain('observed-before-after-state')
})
it('preserves the actual completed process when cancellation arrives during an outer after-state observer', async () => {
  const f = await setup()
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { enter = resolve }), hold = new Promise<void>(resolve => { release = resolve })
  const remove = f.ctx.on('tools/execute', async (exec, next) => {
    const result = await next()
    if (exec.callId.startsWith('workflow-host:')) { enter(); await hold }
    return result
  }, { prepend: true }); cleanups.push(async () => { remove() })
  const host = new NativeResearchWorkflowHost(f.ctx, f.options); cleanups.push(() => host.dispose())
  const id = randomUUID(); await host.command(f.context, f.caller.id, { action: 'start', operationId: id, command: 'Write-Output completed-before-cancel', timeoutMs: 5000 }); await entered
  await host.command(f.context, f.caller.id, { action: 'cancel', operationId: id }); release()
  const deadline = Date.now() + 5000
  let result = await host.command(f.context, f.caller.id, { action: 'inspect', operationId: id })
  while (result.state === 'running' && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 10)); result = await host.command(f.context, f.caller.id, { action: 'inspect', operationId: id }) }
  expect(result).toMatchObject({ state: 'completed', cancelRequested: true, result: { exitCode: 0, aborted: false } }); expect(result.result?.stdout.text).toContain('completed-before-cancel')
})
