import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { OwnedScope } from '@studybuddy/contracts'
import { AigcRuntime, accountAigcDirectory } from '../src/studybuddy/aigc-runtime.ts'
import { StudyBuddyAigc } from '../src/studybuddy/aigc.ts'
import type { Session, WebContents, IpcMain, IpcMainInvokeEvent } from 'electron'

interface RuntimeFixture {
  runtime: AigcRuntime
  root: string
  scope: OwnedScope
  change(): void
  ready(): void
  exit(): void
  child: ChildProcessWithoutNullStreams
  launches: string[]
  bootstrap(): string
  onInvalidated(value: () => void): void
}
async function fixture(run: (value: RuntimeFixture) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'studybuddy-aigc-life-'))
  const scope = { accountId: 'synthetic-account-a', generation: 1 }
  let current = scope, text = '', child: ChildProcessWithoutNullStreams
  const launches: string[] = []
  let invalidated = () => {}
  const runtime = new AigcRuntime({ userDataRoot: root,
    isCurrent: value => current.accountId === value.accountId && current.generation === value.generation,
    resources: async () => ({ directory: root, bun: join(root, 'bin/bun.exe'), entry: join(root, 'server/studyBuddy.js') }),
    gateway: async () => undefined, invalidated: () => { invalidated() },
    launch: (exe, args, options) => {
      launches.push(JSON.stringify({ exe, args, options }))
      child = Object.assign(new ChildProcess(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
        killed: false, exitCode: null, kill: () => true }) as ChildProcessWithoutNullStreams
      child.stdin.on('data', (bytes: Buffer) => { text += bytes.toString() })
      return child
    },
  })
  try {
    await run({ runtime, root, scope, change: () => { current = { ...scope, generation: 2 } },
      ready: () => { child.stdout.emit('data', Buffer.from('{"type":"ready","origin":"http://127.0.0.1:42813"}\n')) },
      exit: () => { Object.assign(child, { exitCode: 0 }); child.emit('exit', 0, null) }, get child() { return child }, launches, bootstrap: () => text,
      onInvalidated: (value) => { invalidated = value } })
  } finally { await rm(root, { recursive: true, force: true }) }
}

it('shares one owned process and never puts guest authorization on argv or environment', async () => {
  await fixture(async (f) => {
    const first = f.runtime.ensure(f.scope), second = f.runtime.ensure(f.scope)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('guestAuthorization') })
    const bootstrap = JSON.parse(f.bootstrap().trim()) as { guestAuthorization: string; dataDirectory: string }
    expect(f.launches.join('')).not.toContain(bootstrap.guestAuthorization)
    expect(bootstrap.dataDirectory).toBe(accountAigcDirectory(f.root, f.scope.accountId))
    f.ready()
    expect(await first).toEqual({ origin: 'http://127.0.0.1:42813' })
    expect(await second).toEqual(await first)
    expect(f.launches).toHaveLength(1)
    expect(f.runtime.requestHeaders(f.scope, 'http://127.0.0.1:42813/', 'http://127.0.0.1:42813/api/settings/get')).toEqual({ 'X-StudyBuddy-Aigc-Guest': bootstrap.guestAuthorization })
    expect(f.runtime.requestHeaders(f.scope, 'http://127.0.0.1:42813/', 'http://127.0.0.1:42814/')).toEqual({})
    const project = join(bootstrap.dataDirectory, 'workspaces/project.json')
    await writeFile(project, 'saved project')
    let finished = false
    const cleanup = f.runtime.revoke().then(() => { finished = true })
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('shutdown') })
    expect(finished).toBe(false)
    expect(f.runtime.requestHeaders(f.scope, 'http://127.0.0.1:42813/', 'http://127.0.0.1:42813/')).toEqual({})
    f.exit(); await cleanup
    expect(await readFile(project, 'utf8')).toBe('saved project')
  })
})
it('notifies the captured lease when its service crashes so the shell can retry', async () => {
  await fixture(async (f) => {
    const start = f.runtime.ensure(f.scope)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('guestAuthorization') })
    f.ready(); await start
    const notices: unknown[][] = []
    const owner = Object.assign(new EventEmitter(), { id: 28, isDestroyed: () => false,
      send: (...args: unknown[]) => { notices.push(args) } }) as WebContents
    const browserSession = Object.assign(Object.create(null) as Session, {
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {},
      setDisplayMediaRequestHandler() {}, on() {},
      webRequest: { onBeforeRequest() {}, onBeforeSendHeaders() {} }, clearCache: async () => {}, clearStorageData: async () => {},
    })
    const manager = new StudyBuddyAigc({ runtime: f.runtime, fromPartition: () => browserSession,
      auth: { scope: () => f.scope, withSession: async run => run({ scope: f.scope, accessToken: 'unused' }) } })
    const handlers = new Map<string, (event: IpcMainInvokeEvent) => Promise<{ data: { lease: string } }>>()
    manager.register({ handle: (name, handler) => { handlers.set(name, handler) } } as IpcMain, () => {})
    const result = await handlers.get('studybuddy:aigc-acquire')!({ sender: owner } as IpcMainInvokeEvent)
    f.onInvalidated(() => { void manager.revoke() })
    f.exit()
    await vi.waitFor(() => { expect(notices).toEqual([['studybuddy:aigc-invalid', result.data.lease]]) })
  })
})
it('fences a late ready and waits for process exit when the account changes during startup', async () => {
  await fixture(async (f) => {
    const startup = f.runtime.ensure(f.scope).catch((error: unknown) => error instanceof Error ? error.message : 'UNKNOWN')
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('guestAuthorization') })
    f.change()
    const cleanup = f.runtime.revoke()
    f.ready()
    f.exit()
    expect(await startup).toBe('AIGC_SCOPE_REVOKED')
    await cleanup
    expect(accountAigcDirectory(f.root, 'synthetic-account-b')).not.toBe(accountAigcDirectory(f.root, f.scope.accountId))
  })
})
it('waits for the child even when guest storage cleanup fails', async () => {
  await fixture(async (f) => {
    const start = f.runtime.ensure(f.scope)
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('guestAuthorization') })
    f.ready(); await start
    const browserSession = Object.assign(Object.create(null) as Session, {
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {},
      setDisplayMediaRequestHandler() {}, on() {},
      webRequest: { onBeforeRequest() {}, onBeforeSendHeaders() {} }, clearCache: async () => {},
      clearStorageData: async () => { throw new Error('STORAGE_CLEANUP_FAILED') },
    })
    const owner = Object.assign(new EventEmitter(), { id: 27, isDestroyed: () => false, send: () => {} }) as unknown as WebContents
    const manager = new StudyBuddyAigc({ runtime: f.runtime, fromPartition: () => browserSession,
      auth: { scope: () => f.scope, withSession: async run => run({ scope: f.scope, accessToken: 'unused' }) } })
    const handlers = new Map<string, (event: IpcMainInvokeEvent) => Promise<unknown>>()
    manager.register({ handle: (name, handler) => { handlers.set(name, handler) } } as IpcMain, () => {})
    await handlers.get('studybuddy:aigc-acquire')!({ sender: owner } as IpcMainInvokeEvent)
    let settled = false
    const cleanup = manager.revoke().catch((error: unknown) => error instanceof Error ? error.message : 'UNKNOWN').finally(() => { settled = true })
    await vi.waitFor(() => { expect(f.bootstrap()).toContain('shutdown') })
    await new Promise<void>(accept => setImmediate(accept))
    expect(settled).toBe(false)
    f.exit()
    expect(await cleanup).toBe('STORAGE_CLEANUP_FAILED')
  })
})
