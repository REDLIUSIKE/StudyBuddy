/** The current account owns one private Bun service and its retained saved projects. */
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import type { OwnedScope } from '@studybuddy/contracts'
import { assertAigcPath } from './aigc-resources.ts'
import { terminateAigcProcess } from './aigc-process.ts'
import { accountAigcDirectory } from './aigc-data.ts'
export { accountAigcDirectory } from './aigc-data.ts'

interface Options {
  userDataRoot: string
  isCurrent(scope: OwnedScope): boolean
  resources(): Promise<{ directory: string; bun: string; entry: string }>
  gateway(scope: OwnedScope): Promise<{ origin: string; authorization: string } | undefined>
  launch(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams
  invalidated(): void
}
interface Running {
  scope: OwnedScope
  authorization: string
  pending: Promise<{ origin: string }>
  child?: ChildProcessWithoutNullStreams
  stopped?: Promise<void>
  exited?: Promise<void>
  rejectReady?: (error: Error) => void
  origin?: string | undefined
  revoked: boolean
}
const same = (a: OwnedScope, b: OwnedScope): boolean => a.accountId === b.accountId && a.generation === b.generation

/** Serialized account process owner; revocation waits for startup and child quiescence. */
export class AigcRuntime {
  private current: Running | undefined
  private cleanup: Promise<void> = Promise.resolve()
  constructor(private readonly options: Options) {}
  /** Acquire the existing process or start one for the current account.
   * @param scope - Main-owned authenticated account generation.
   * @returns The admitted local origin without authorization material. */
  ensure(scope: OwnedScope): Promise<{ origin: string }> {
    if (!this.options.isCurrent(scope)) return Promise.reject(new Error('AIGC_SCOPE_REVOKED'))
    if (this.current && same(this.current.scope, scope) && !this.current.revoked) return this.current.pending
    const row: Running = { scope, authorization: randomBytes(32).toString('hex'), revoked: false, pending: Promise.resolve({ origin: '' }) }
    const previous = this.current
    if (previous) this.cleanup = Promise.all([this.stop(previous), previous.pending.catch(() => undefined)]).then(() => undefined)
    this.current = row
    row.pending = this.start(row).catch(async (error: unknown) => { await this.stop(row); throw error })
    return row.pending
  }
  private assert(row: Running): void {
    if (row.revoked || this.current !== row || !this.options.isCurrent(row.scope)) throw new Error('AIGC_SCOPE_REVOKED')
  }
  private async start(row: Running): Promise<{ origin: string }> {
    await this.cleanup; this.assert(row)
    const resources = await this.options.resources(); this.assert(row)
    const dataDirectory = accountAigcDirectory(this.options.userDataRoot, row.scope.accountId)
    await assertAigcPath(dataDirectory)
    await mkdir(join(dataDirectory, 'workspaces'), { recursive: true }); this.assert(row)
    const gateway = await this.options.gateway(row.scope); this.assert(row)
    const child = this.options.launch(resources.bun, [resources.entry], {
      cwd: resources.directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: dirname(resources.bun), NODE_ENV: 'production' },
    })
    row.child = child
    row.exited = new Promise<void>((accept) => { child.once('exit', () => { accept() }); child.once('error', () => { accept() }) })
    const ready = new Promise<{ origin: string }>((accept, reject) => {
      row.rejectReady = reject
      let text = ''
      const timer = setTimeout(() => { reject(new Error('AIGC_START_TIMEOUT')) }, 45000)
      const finish = (): void => { clearTimeout(timer) }
      child.once('error', () => { finish(); reject(new Error('AIGC_START_FAILED')) })
      child.once('exit', () => {
        finish(); reject(new Error(row.revoked ? 'AIGC_SCOPE_REVOKED' : 'AIGC_SERVICE_EXITED'))
        if (this.current === row) { row.origin = undefined; row.revoked = true; this.options.invalidated() }
      })
      child.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString('utf8')
        if (text.length > 65536) { finish(); reject(new Error('AIGC_CONTROL_INVALID')); return }
        const lines = text.split('\n'); text = lines.pop() ?? ''
        for (const line of lines) {
          let message: unknown
          try { message = JSON.parse(line) } catch { continue /* Non-control output has no authority. */ }
          if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'ready') continue
          try {
            this.assert(row)
            if (!('origin' in message) || typeof message.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(message.origin)
              || Number(new URL(message.origin).port) > 65535) throw new Error('AIGC_CONTROL_INVALID')
            row.origin = message.origin; finish(); accept({ origin: row.origin })
          } catch (error) { finish(); reject(error instanceof Error ? error : new Error('AIGC_CONTROL_INVALID')) }
        }
      })
      child.stderr.resume()
      child.stdin.on('error', () => { finish(); reject(new Error('AIGC_START_FAILED')) })
    })
    child.stdin.write(JSON.stringify({ dataDirectory, workspaceRoots: [join(dataDirectory, 'workspaces')], guestAuthorization: row.authorization, gateway }) + '\n')
    return ready
  }
  /** Authorization is injected only for the captured account and exact issued origin.
   * @param scope - Account generation that issued the guest.
   * @param entryUrl - Main-owned entry of this guest.
   * @param value - Request URL received from Electron's session dispatcher.
   * @returns Private headers or an empty record for any revoked/foreign request. */
  requestHeaders(scope: OwnedScope, entryUrl: string, value: string): Readonly<Record<string, string>> {
    const row = this.current
    if (!row || row.revoked || !same(row.scope, scope) || !this.options.isCurrent(scope)
      || !row.origin || !URL.canParse(value) || !URL.canParse(entryUrl)) return {}
    const url = new URL(value)
    if (url.origin !== row.origin || new URL(entryUrl).origin !== row.origin || url.username || url.password) return {}
    return { 'X-StudyBuddy-Aigc-Guest': row.authorization }
  }
  private stop(row: Running): Promise<void> {
    row.revoked = true; row.origin = undefined
    row.rejectReady?.(new Error('AIGC_SCOPE_REVOKED'))
    return row.stopped ??= (async () => {
      const child = row.child
      if (!child || child.exitCode !== null || child.signalCode !== null) return
      child.stdin.end('{"type":"shutdown"}\n')
      let forced: Promise<void> | undefined
      const failed = new Promise<never>((_accept, reject) => {
        const timer = setTimeout(() => { forced = terminateAigcProcess(child); forced.catch(reject) }, 8000)
        row.exited?.finally(() => { clearTimeout(timer) }).catch(reject)
      })
      await Promise.race([row.exited, failed]); await forced
    })()
  }
  /** Revoke access immediately and wait until owned asynchronous work cannot start a late child.
   * @param scope - Optional generation filter for account teardown.
   * @returns Completion after startup has settled and its child has exited. */
  revoke(scope?: OwnedScope): Promise<void> {
    const row = this.current
    if (!row || scope && !same(row.scope, scope)) return this.cleanup
    row.revoked = true; row.origin = undefined; row.rejectReady?.(new Error('AIGC_SCOPE_REVOKED'))
    this.cleanup = Promise.all([this.stop(row), row.pending.catch(() => undefined)]).then(() => {
      if (this.current === row) this.current = undefined
    })
    return this.cleanup
  }
}
