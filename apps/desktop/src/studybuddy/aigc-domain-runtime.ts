/** One account-owned Node profile. Activation is tied to the complete native AIGC candidate. */
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import type { OwnedScope } from '@studybuddy/contracts'
import type { AigcLaunchResources } from './aigc-types.ts'
import { accountAigcDirectory } from './aigc-data.ts'
import { prepareAigcProfile } from './aigc-profile.ts'
import { assertAigcPath } from './aigc-resources.ts'
import { terminateAigcProcess } from './aigc-process.ts'

type NativeOperation = 'question' | 'temporary' | 'budget'
interface Options {
  userDataRoot: string
  isCurrent(scope: OwnedScope): boolean
  resources(): Promise<AigcLaunchResources>
  gateway(scope: OwnedScope): Promise<{ origin: string; authorization: string } | undefined>
  native(scope: OwnedScope, operation: NativeOperation, input: unknown, signal: AbortSignal): Promise<unknown>
  launch(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams
  invalidated(): void
}
interface Pending { resolve(value: unknown): void; reject(error: Error): void; detach(): void }
interface Running {
  scope: OwnedScope
  authorization: string
  controller: AbortController
  pending: Promise<{ origin: string }>
  requests: Map<string, Pending>
  native: Map<string, { controller: AbortController; settled: Promise<void> }>
  child?: ChildProcessWithoutNullStreams
  exited?: Promise<void>
  stopped?: Promise<void>
  rejectReady?: (error: Error) => void
  origin?: string | undefined
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const same = (a: OwnedScope, b: OwnedScope) => a.accountId === b.accountId && a.generation === b.generation
const operations: readonly NativeOperation[] = ['question', 'temporary', 'budget']

export class AigcDomainRuntime {
  private current: Running | undefined
  private cleanup: Promise<void> = Promise.resolve()
  constructor(private readonly options: Options) {}
  private assert(row: Running) { if (this.current !== row || row.controller.signal.aborted || !this.options.isCurrent(row.scope)) throw Error('AIGC_SCOPE_REVOKED') }
  ensure(scope: OwnedScope): Promise<{ origin: string }> {
    if (!this.options.isCurrent(scope)) return Promise.reject(Error('AIGC_SCOPE_REVOKED'))
    const previous = this.current
    if (previous && same(previous.scope, scope) && !previous.controller.signal.aborted) return previous.pending
    if (previous) this.cleanup = Promise.all([this.stop(previous), previous.pending.catch(() => {})]).then(() => {})
    const row: Running = { scope: { ...scope }, authorization: randomBytes(32).toString('hex'), controller: new AbortController(),
      pending: Promise.resolve({ origin: '' }), requests: new Map(), native: new Map() }
    this.current = row
    row.pending = this.start(row).catch(async error => { await this.stop(row); throw error })
    return row.pending
  }
  private async send(row: Running, value: object): Promise<void> {
    this.assert(row)
    if (!row.child || row.child.stdin.destroyed || row.child.stdin.writableEnded) return Promise.reject(Error('AIGC_CONTROL_DISCONNECTED'))
    const text = JSON.stringify(value) + '\n'
    if (Buffer.byteLength(text) > 32 * 1024 * 1024) return Promise.reject(Error('AIGC_CONTROL_TOO_LARGE'))
    return new Promise((resolve, reject) => { row.child!.stdin.write(text, error => { if (error) reject(Error('AIGC_CONTROL_DISCONNECTED')); else resolve() }) })
  }
  private async start(row: Running): Promise<{ origin: string }> {
    await this.cleanup; this.assert(row)
    const resources = await this.options.resources(); this.assert(row)
    const directory = accountAigcDirectory(this.options.userDataRoot, row.scope.accountId)
    await assertAigcPath(directory); await mkdir(join(directory, 'workspaces'), { recursive: true }); this.assert(row)
    const home = await prepareAigcProfile(directory, resources); this.assert(row)
    const gateway = await this.options.gateway(row.scope); this.assert(row)
    const child = this.options.launch(resources.node, [resources.entry, '--profile', 'studybuddy-aigc'], {
      cwd: resources.directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: [dirname(resources.node), join(resources.directory, 'bin')].join(delimiter),
        ProgramFiles: process.env.ProgramFiles, 'ProgramFiles(x86)': process.env['ProgramFiles(x86)'], LOCALAPPDATA: process.env.LOCALAPPDATA, USERPROFILE: process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP,
        NODE_ENV: 'production', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--experimental-vm-modules' },
    })
    row.child = child
    row.exited = new Promise(resolve => { child.once('exit', () => { resolve() }); child.once('error', () => { resolve() }) })
    const ready = new Promise<{ origin: string }>((resolve, reject) => {
      row.rejectReady = reject
      let buffer = '', settled = false
      const decoder = new StringDecoder('utf8'), timer = setTimeout(() => { reject(Error('AIGC_START_TIMEOUT')) }, 45000)
      const fail = (code: string) => { clearTimeout(timer); reject(Error(code)); void this.stop(row).catch(() => {}) }
      child.once('error', () => { fail('AIGC_START_FAILED') })
      child.stdin.on('error', () => { fail('AIGC_CONTROL_DISCONNECTED') })
      child.once('exit', () => {
        clearTimeout(timer); reject(Error(row.controller.signal.aborted ? 'AIGC_SCOPE_REVOKED' : 'AIGC_SERVICE_EXITED'))
        if (this.current === row && !row.controller.signal.aborted) { void this.stop(row).catch(() => {}); this.options.invalidated() }
      })
      child.stderr.resume()
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += decoder.write(chunk)
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        if (Buffer.byteLength(buffer) > 32 * 1024 * 1024) { fail('AIGC_CONTROL_INVALID'); return }
        for (const line of lines) {
          if (Buffer.byteLength(line) > 32 * 1024 * 1024) { fail('AIGC_CONTROL_INVALID'); return }
          let value: unknown
          try { value = JSON.parse(line) } catch { continue }
          if (!value || typeof value !== 'object' || !('type' in value)) continue
          if (value.type === 'ready') {
            try {
              this.assert(row)
              if (settled || Object.keys(value).length !== 2 || !('origin' in value) || typeof value.origin !== 'string'
                || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value.origin) || Number(new URL(value.origin).port) > 65535) throw Error('AIGC_CONTROL_INVALID')
              row.origin = value.origin; settled = true; clearTimeout(timer); resolve({ origin: value.origin })
            } catch { fail('AIGC_CONTROL_INVALID') }
          } else {
            try { this.message(row, value) } catch { fail('AIGC_CONTROL_INVALID') }
          }
        }
      })
    })
    child.stdin.write(JSON.stringify({ dataDirectory: directory, workspaceRoots: [join(directory, 'workspaces')], guestAuthorization: row.authorization, gateway }) + '\n')
    return ready
  }
  private message(row: Running, value: object): void {
    this.assert(row)
    if (!('rpcId' in value) || typeof value.rpcId !== 'string' || !uuid.test(value.rpcId)) throw Error('AIGC_CONTROL_INVALID')
    const id = value.rpcId, type = Reflect.get(value, 'type')
    if (type === 'result') {
      const pending = row.requests.get(id); if (!pending) return
      row.requests.delete(id); pending.detach()
      if ('error' in value) pending.reject(Error(typeof value.error === 'string' && /^[A-Z0-9_]{1,128}$/.test(value.error) ? value.error : 'AIGC_DOMAIN_OPERATION_FAILED'))
      else if ('data' in value) pending.resolve(value.data)
      else pending.reject(Error('AIGC_CONTROL_INVALID'))
      return
    }
    if (type === 'native-cancel' && Object.keys(value).length === 2) { row.native.get(id)?.controller.abort(Error('AIGC_OPERATION_CANCELLED')); return }
    if (type !== 'native-request' || Object.keys(value).length !== 4 || !('operation' in value) || !('input' in value)
      || typeof value.operation !== 'string' || !operations.some(operation => operation === value.operation) || row.native.has(id) || row.native.size >= 128) throw Error('AIGC_CONTROL_INVALID')
    const operation = operations.find(operation => operation === value.operation)!, controller = new AbortController(), settled = Promise.withResolvers<void>()
    row.native.set(id, { controller, settled: settled.promise })
    void (async () => {
      try {
        const data = await this.options.native(row.scope, operation, value.input, AbortSignal.any([row.controller.signal, controller.signal])); this.assert(row)
        controller.signal.throwIfAborted(); await this.send(row, { type: 'native-result', rpcId: id, data: data ?? null })
      } catch (error) {
        if (!row.controller.signal.aborted && this.current === row) await this.send(row, { type: 'native-result', rpcId: id,
          error: error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'AIGC_NATIVE_OPERATION_FAILED' })
      } finally { row.native.delete(id); settled.resolve() }
    })().catch(() => { void this.stop(row).catch(() => {}) })
  }
  async invoke(scope: OwnedScope, input: unknown, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted(); await this.ensure(scope); signal.throwIfAborted()
    const row = this.current; if (!row || !same(row.scope, scope)) throw Error('AIGC_SCOPE_REVOKED'); this.assert(row)
    if (row.requests.size >= 128) throw Error('AIGC_CHANNEL_BUSY')
    const rpcId = randomUUID()
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (!row.requests.delete(rpcId)) return
        signal.removeEventListener('abort', abort); reject(Error('AIGC_OPERATION_CANCELLED'))
        void this.send(row, { type: 'cancel', rpcId }).catch(() => {})
      }
      row.requests.set(rpcId, { resolve, reject, detach: () => { signal.removeEventListener('abort', abort) } })
      signal.addEventListener('abort', abort, { once: true })
      void this.send(row, { type: 'command', rpcId, input }).catch(() => {
        const pending = row.requests.get(rpcId); if (!pending) return
        row.requests.delete(rpcId); pending.detach(); reject(Error('AIGC_CONTROL_DISCONNECTED'))
      })
    })
  }
  requestHeaders(scope: OwnedScope, entryUrl: string, target: string): Readonly<Record<string, string>> {
    const row = this.current
    if (!row || row.controller.signal.aborted || !same(row.scope, scope) || !this.options.isCurrent(scope) || !row.origin || !URL.canParse(entryUrl) || !URL.canParse(target)) return {}
    const url = new URL(target)
    return url.origin === row.origin && new URL(entryUrl).origin === row.origin && !url.username && !url.password ? { 'X-StudyBuddy-Aigc-Guest': row.authorization } : {}
  }
  private stop(row: Running): Promise<void> {
    row.origin = undefined; row.controller.abort(Error('AIGC_SCOPE_REVOKED')); row.rejectReady?.(Error('AIGC_SCOPE_REVOKED'))
    for (const pending of row.requests.values()) { pending.detach(); pending.reject(Error('AIGC_SCOPE_REVOKED')) }
    row.requests.clear()
    for (const pending of row.native.values()) pending.controller.abort(Error('AIGC_SCOPE_REVOKED'))
    return row.stopped ??= (async () => {
      const native = Promise.all([...row.native.values()].map(value => value.settled))
      const child = row.child
      if (child && child.exitCode === null && child.signalCode === null) {
        child.stdin.end('{"type":"shutdown"}\n')
        let forced: Promise<void> | undefined
        const failed = new Promise<never>((_resolve, reject) => {
          const timer = setTimeout(() => { forced = terminateAigcProcess(child); void forced.catch(reject) }, 8000)
          void row.exited?.finally(() => { clearTimeout(timer) }).catch(reject)
        })
        await Promise.race([row.exited, failed]); await forced
      }
      await native
    })()
  }
  revoke(scope?: OwnedScope): Promise<void> {
    const row = this.current
    if (!row || scope && !same(scope, row.scope)) return this.cleanup
    return this.cleanup = Promise.all([this.stop(row), row.pending.catch(() => {})]).then(() => { if (this.current === row) this.current = undefined })
  }
}
