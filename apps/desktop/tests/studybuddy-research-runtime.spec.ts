import { ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ResearchRuntime, accountResearchDirectory } from '../src/studybuddy/research-runtime.ts'
import type { PrivateResearchRequest } from '../src/studybuddy/research-types.ts'
type FixtureChild = ChildProcessWithoutNullStreams & { stdin: PassThrough; stdout: PassThrough }

async function fixture(run: (f: { runtime: ResearchRuntime; root: string; scope: { accountId: string; generation: number }; child(): FixtureChild;
  bootstrap(): string; requests: unknown[]; ready(): void; exit(): void; revokeScope(): void; launches: unknown[]; keepRunning(): void; forceFail(): void }) => Promise<void>,
  invoke?: (request: PrivateResearchRequest, signal: AbortSignal) => Promise<unknown>) {
  const root = await mkdtemp(join(tmpdir(), 'research-runtime-'))
  const scope = { accountId: 'synthetic-a', generation: 1 }, requests: unknown[] = [], launches: unknown[] = []
  let live = true, text = '', child: FixtureChild, keep = false, forceFailure = false
  const runtime = new ResearchRuntime({ userDataRoot: root, isCurrent: () => live, invalidated: vi.fn(),
    terminate: async () => { if (forceFailure) throw Error('RESEARCH_PROCESS_STOP_FAILED'); Object.assign(child, { exitCode: 0 }); child.emit('exit', 0) },
    resources: async () => ({ directory: root, node: join(root, 'shared/node.exe'), python: join(root, 'shared/python.exe'), entry: join(root, 'shared/dsh/lib/bin.js'),
      plugin: join(root, 'shared/host/lib/research-plugin.js'), domainEntry: join(root, 'server/research-domain.mjs'),
      staticDirectory: join(root, 'web'), manifestSha256: 'a'.repeat(64) }),
    invoke: async (_scope, request, signal) => { requests.push(request); return invoke ? invoke(request, signal) : { state: 'ready' } },
    launch: (exe, args, options) => {
      launches.push({ exe, args, options })
      child = Object.assign(new ChildProcess(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null }) as FixtureChild
      child.stdin.on('data', bytes => { text += String(bytes) })
      child.stdin.on('end', () => { if (!keep) { Object.assign(child, { exitCode: 0 }); child.emit('exit', 0) } })
      return child
    },
  })
  try { await run({ runtime, root, scope, requests, launches, child: () => child, bootstrap: () => text,
    ready: () => { child.stdout.write('{"type":"ready","origin":"http://127.0.0.1:42815"}\n') },
    exit: () => { Object.assign(child, { exitCode: 0 }); child.emit('exit', 0) }, revokeScope: () => { live = false }, keepRunning: () => { keep = true }, forceFail: () => { forceFailure = true } }) }
  finally { vi.useRealTimers(); await runtime.revoke().catch(() => {}); await rm(root, { recursive: true, force: true }) }
}

it('prepares one process for concurrent first entry and keeps private handoff off argv/env', async () => {
  await fixture(async f => {
    const first = f.runtime.ensure(f.scope), second = f.runtime.ensure(f.scope)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('guestAuthorization') })
    const control = JSON.parse(f.bootstrap().trim())
    expect(JSON.stringify(f.launches)).not.toContain(control.guestAuthorization)
    expect(control.projectsRoot).toBe(join(accountResearchDirectory(f.root, f.scope.accountId), 'projects'))
    f.ready(); expect(await first).toEqual(await second); expect(f.launches).toHaveLength(1)
    expect(f.runtime.requestHeaders(f.scope, 'http://127.0.0.1:42815/')).toEqual({ 'X-StudyBuddy-Research-Guest': control.guestAuthorization })
    expect(f.runtime.requestHeaders(f.scope, 'http://127.0.0.1:42816/')).toEqual({})
  })
})
it('launches the shared dsh installation through the account-owned research profile', async () => {
  await fixture(async f => {
    const pending = f.runtime.ensure(f.scope)
    await vi.waitFor(() => expect(f.bootstrap()).toContain('projectsRoot'))
    const launch = f.launches[0] as { exe: string; args: string[]; options: { env: Record<string, string> } }
    expect(launch.exe).toBe(join(f.root, 'shared/node.exe'))
    expect(launch.args).toEqual([join(f.root, 'shared/dsh/lib/bin.js'), '--profile', 'studybuddy-research'])
    expect(launch.options.env.DSH_HOME).toBe(join(accountResearchDirectory(f.root, f.scope.accountId), 'runtime-v2', 'a'.repeat(64)))
    expect(launch.options.env).not.toHaveProperty('NEXT_TELEMETRY_DISABLED')
    expect(launch.options.env.PYTHONDONTWRITEBYTECODE).toBe('1')
    f.ready(); await pending
  })
})
it('preserves Chinese request text when the owned process stdout splits a UTF-8 character',async()=>{
 await fixture(async f=>{const first=f.runtime.ensure(f.scope);await vi.waitFor(()=>expect(f.bootstrap()).toContain('projectsRoot'));f.ready();await first;const bytes=Buffer.from(JSON.stringify({type:'host-request',rpcId:'33333333-3333-4333-8333-333333333333',projectId:'study',operation:'submit',input:{prompt:'论文😀'}})+'\n'),offset=bytes.indexOf(Buffer.from('论'))+1;f.child().stdout.write(bytes.subarray(0,offset));f.child().stdout.write(bytes.subarray(offset));await vi.waitFor(()=>expect(f.requests).toHaveLength(1));expect(f.requests[0]).toMatchObject({input:{prompt:'论文😀'}})})
})
it('propagates forced-stop failure instead of hanging or leaking a rejected timer promise', async () => {
  await fixture(async f => {
    const start = f.runtime.ensure(f.scope)
    await vi.waitFor(() => expect(f.bootstrap()).toContain('projectsRoot')); f.ready(); await start
    f.keepRunning(); f.forceFail(); vi.useFakeTimers()
    const cleanup = f.runtime.revoke().then(() => 'stopped', error => error.message)
    await vi.advanceTimersByTimeAsync(90001)
    const outcome = await Promise.race([cleanup, Promise.resolve('still-pending')])
    f.exit(); await cleanup
    expect(outcome).toBe('RESEARCH_PROCESS_STOP_FAILED')
  })
})
it('revokes a startup before late readiness and waits for child exit', async () => {
  await fixture(async f => {
    const start = f.runtime.ensure(f.scope).catch(error => error.message)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('projectsRoot') })
    f.revokeScope(); const cleanup = f.runtime.revoke(); f.ready()
    expect(await start).toBe('RESEARCH_SCOPE_REVOKED'); await cleanup
    expect(f.runtime.requestHeaders(f.scope, 'http://127.0.0.1:42815/')).toEqual({})
  })
})
it('reports early process exit instead of treating it as a ready empty workbench', async () => {
  await fixture(async f => {
    const start = f.runtime.ensure(f.scope).catch(error => error.message)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('projectsRoot') }); f.exit()
    expect(await start).toBe('RESEARCH_SERVICE_EXITED')
  })
})
it('rejects malformed private requests and never relays a stale account request', async () => {
  await fixture(async f => {
    const start = f.runtime.ensure(f.scope)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('projectsRoot') }); f.ready(); await start
    f.child().stdout.write('{"type":"host-request","rpcId":"malformed","operation":"raw-provider","projectId":"default"}\n')
    await new Promise<void>(resolve => setImmediate(resolve)); expect(f.requests).toEqual([])
    f.revokeScope()
    f.child().stdout.write('{"type":"host-request","rpcId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","operation":"capabilities","projectId":"default","input":null}\n')
    await new Promise<void>(resolve => setImmediate(resolve)); expect(f.requests).toEqual([])
  })
})
it('cancels the exact ASR RPC before a deferred admission can dispatch and suppresses its late result', async () => {
  const rpcId = '33333333-3333-4333-8333-333333333333', sessionId = 'session-44444444-4444-4444-8444-444444444444'
  let release!: () => void, captured!: AbortSignal, dispatches = 0
  const admission = new Promise<void>(resolve => { release = resolve })
  try {
    await fixture(async f => {
      const start = f.runtime.ensure(f.scope)
      await vi.waitFor(() => expect(f.bootstrap()).toContain('projectsRoot')); f.ready(); await start
      f.child().stdout.write(JSON.stringify({ type: 'host-request', rpcId, projectId: 'study', sessionId, operation: 'speech-transcribe', input: { requestId: rpcId } }) + '\n')
      await vi.waitFor(() => expect(f.requests).toHaveLength(1))
      f.child().stdout.write(JSON.stringify({ type: 'host-cancel', rpcId, projectId: 'study', sessionId }) + '\n')
      expect(captured.aborted).toBe(true)
      release(); await new Promise<void>(resolve => setImmediate(resolve))
      expect(dispatches).toBe(0)
      expect(f.bootstrap()).not.toContain('host-result')
    }, async (_request, signal) => { captured = signal; await admission; signal.throwIfAborted(); dispatches++; return { text: 'late result' } })
  } finally { release() }
})
it('denies malformed and foreign cancellation while isolating sibling RPCs and preserving account revocation', async () => {
  const rpcA = '33333333-3333-4333-8333-333333333333', rpcB = '55555555-5555-4555-8555-555555555555'
  const sessionA = 'session-44444444-4444-4444-8444-444444444444', sessionB = 'session-66666666-6666-4666-8666-666666666666'
  const signals = new Map<string, AbortSignal>()
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  try {
    await fixture(async f => {
      const start = f.runtime.ensure(f.scope)
      await vi.waitFor(() => expect(f.bootstrap()).toContain('projectsRoot')); f.ready(); await start
      for (const [rpcId, sessionId] of [[rpcA, sessionA], [rpcB, sessionB]]) f.child().stdout.write(JSON.stringify({ type: 'host-request', rpcId, projectId: 'study', sessionId, operation: 'speech-transcribe', input: null }) + '\n')
      await vi.waitFor(() => expect(signals.size).toBe(2))
      for (const invalid of [
        { rpcId: rpcA, projectId: 'other', sessionId: sessionA }, { rpcId: rpcA, projectId: 'study', sessionId: sessionB },
        { rpcId: rpcA, projectId: 'study' }, { rpcId: rpcA, projectId: 'study', sessionId: sessionA, input: null },
        { rpcId: '77777777-7777-4777-8777-777777777777', projectId: 'study', sessionId: sessionA },
      ]) f.child().stdout.write(JSON.stringify({ type: 'host-cancel', ...invalid }) + '\n')
      expect(signals.get(rpcA)!.aborted).toBe(false); expect(signals.get(rpcB)!.aborted).toBe(false)
      f.child().stdout.write(JSON.stringify({ type: 'host-cancel', rpcId: rpcA, projectId: 'study', sessionId: sessionA }) + '\n')
      expect(signals.get(rpcA)!.aborted).toBe(true); expect(signals.get(rpcB)!.aborted).toBe(false)
      f.revokeScope(); await f.runtime.revoke(); expect(signals.get(rpcB)!.aborted).toBe(true)
      release(); await new Promise<void>(resolve => setImmediate(resolve))
      expect(f.requests).toHaveLength(2); expect(f.bootstrap()).not.toContain('host-result')
    }, async (request, signal) => { signals.set(request.rpcId, signal); await waiting; return { text: 'late result' } })
  } finally { release() }
})
it('keeps the original cancellation registration when a duplicate RPC is rejected and denies stale child notifications', async () => {
  const rpcId = '33333333-3333-4333-8333-333333333333', sessionId = 'session-44444444-4444-4444-8444-444444444444'
  let release!: () => void, signal!: AbortSignal
  const waiting = new Promise<void>(resolve => { release = resolve })
  try {
    await fixture(async f => {
      const start = f.runtime.ensure(f.scope)
      await vi.waitFor(() => expect(f.bootstrap()).toContain('projectsRoot')); f.ready(); await start
      const frame = JSON.stringify({ type: 'host-request', rpcId, projectId: 'study', sessionId, operation: 'speech-transcribe', input: null }) + '\n'
      f.child().stdout.write(frame); await vi.waitFor(() => expect(f.requests).toHaveLength(1))
      f.child().stdout.write(frame); await new Promise<void>(resolve => setImmediate(resolve)); expect(f.requests).toHaveLength(1)
      f.child().stdout.write(JSON.stringify({ type: 'host-cancel', rpcId, projectId: 'study', sessionId }) + '\n')
      expect(signal.aborted).toBe(true)
      f.revokeScope(); await f.runtime.revoke(); const responses = f.bootstrap()
      f.child().stdout.write(frame)
      f.child().stdout.write(JSON.stringify({ type: 'host-cancel', rpcId, projectId: 'study', sessionId }) + '\n')
      release(); await new Promise<void>(resolve => setImmediate(resolve))
      expect(f.requests).toHaveLength(1); expect(f.bootstrap()).toBe(responses)
    }, async (_request, incoming) => { signal = incoming; await waiting; return { text: 'late result' } })
  } finally { release() }
})
it('propagates an actual Research stdio ASR abort across the owned child pipe before the native admission dispatch', async () => {
  // Research retains its own compiler options; this fixture exercises the runtime wire boundary.
  const { StdioNativeChannel } = await vi.importActual<{
    StdioNativeChannel: new (input: PassThrough, output: PassThrough) => {
      request(projectId: string, operation: string, input: unknown, signal: AbortSignal, sessionId?: string): Promise<unknown>
      close(): void
    }
  }>('../../../integrations/k-dense/server/src/runtime/stdio-channel.ts')
  let release!: () => void, nativeSignal!: AbortSignal, dispatches = 0
  const admission = new Promise<void>(resolve => { release = resolve })
  try {
    await fixture(async f => {
      const start = f.runtime.ensure(f.scope)
      await vi.waitFor(() => expect(f.bootstrap()).toContain('projectsRoot')); f.ready(); await start
      const channel = new StdioNativeChannel(f.child().stdin, f.child().stdout)
      const controller = new AbortController()
      try {
        const result = channel.request('study', 'speech-transcribe', { requestId: '33333333-3333-4333-8333-333333333333' },
          controller.signal, 'session-44444444-4444-4444-8444-444444444444').then(() => 'ready', error => error.message)
        await vi.waitFor(() => expect(f.requests).toHaveLength(1))
        controller.abort(); expect(await result).toBe('RESEARCH_TRANSPORT_DISCONNECTED')
        expect(nativeSignal.aborted).toBe(true)
        release(); await new Promise<void>(resolve => setImmediate(resolve))
        expect(dispatches).toBe(0); expect(f.bootstrap()).not.toContain('host-result')
      } finally { channel.close() }
    }, async (_request, signal) => { nativeSignal = signal; await admission; signal.throwIfAborted(); dispatches++; return { text: 'late result' } })
  } finally { release() }
})
