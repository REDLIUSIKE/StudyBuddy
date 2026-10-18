/** A dedicated Skill pipe; it does not share the private Key/tool protocol or its trust manifest. */
import { createHash, randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import type { OwnedScope } from '@studybuddy/contracts'
import type { MainSession } from './services.ts'
import type { SkillSafetyNativeInventory, SkillSafetyNativeSnapshot } from './skill-safety-sources.ts'
import { skillSafetyNativeInventorySchema, skillSafetyNativeSnapshotSchema } from './skill-safety-sources.ts'
const MAX = 16 * 1024 * 1024
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const exact = (value: Record<string, unknown>, names: string[]): boolean => Object.keys(value).sort().join(',') === [...names].sort().join(',')
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const same = (value: unknown, scope: OwnedScope): boolean => record(value) && exact(value, ['accountId', 'generation']) && value.accountId === scope.accountId && value.generation === scope.generation
const failure = (code: string): Error => Object.assign(new Error(code), { code })
interface VerifiedSkillRuntime { directory: string; companion: string; sourceHead: string; files: Readonly<Record<string, string>> }
async function noLink(path: string): Promise<void> {
  for (let current = resolve(path); ;) {
    if ((await lstat(current)).isSymbolicLink()) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
}
/** Reject changed bytes, links, traversal and unlisted DLLs before the companion can execute. */
export async function verifySkillRuntime(directory: string): Promise<VerifiedSkillRuntime> {
  try {
    const base = resolve(directory), path = join(base, 'skills-manifest.json')
    await noLink(path)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.size > 1024 * 1024) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    const companion = process.platform === 'win32' ? 'studybuddy-harness-skills.exe' : 'studybuddy-harness-skills'
    if (!record(value) || !exact(value, ['schemaVersion', 'sourceHead', 'companion', 'files']) || value.schemaVersion !== 1 || value.companion !== companion || typeof value.sourceHead !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceHead) || !record(value.files)) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
    const files: Record<string, string> = {}, names = new Set<string>()
    for (const [name, digest] of Object.entries(value.files)) {
      if (!name || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..') || names.has(name.toLowerCase()) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
      names.add(name.toLowerCase()); files[name] = digest
    }
    if (!Object.hasOwn(files, companion) || Object.keys(files).length > 4096) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
    const discovered: string[] = []
    const walk = async (parent: string, relative: string): Promise<void> => {
      for (const entry of await readdir(parent, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
        const name = relative + entry.name
        if (entry.isDirectory()) await walk(join(parent, entry.name), name + '/')
        else if (entry.isFile()) discovered.push(name)
        else throw failure('SKILL_NATIVE_RUNTIME_INVALID')
        if (discovered.length > 4097) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
      }
    }
    await walk(base, '')
    if (discovered.filter(name => name !== 'skills-manifest.json').sort().join('\n') !== Object.keys(files).sort().join('\n')) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
    for (const [name, digest] of Object.entries(files)) {
      const target = join(base, name); await noLink(target)
      const stat = await lstat(target)
      if (!stat.isFile() || stat.size > 1024 * 1024 * 1024 || createHash('sha256').update(await readFile(target)).digest('hex') !== digest) throw failure('SKILL_NATIVE_RUNTIME_INVALID')
    }
    return { directory: base, companion, sourceHead: value.sourceHead, files: Object.freeze(files) }
  } catch { throw failure('SKILL_NATIVE_RUNTIME_INVALID') }
}
export interface SkillsRuntime { start(): Promise<ChildProcessWithoutNullStreams> }
/** Main-owned fixed runtime location; credentials travel solely in the private bootstrap pipe. */
export function trustedSkillsRuntime(directory: string): SkillsRuntime {
  return { async start() {
    const runtime = await verifySkillRuntime(directory)
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key) && key !== 'STUDYBUDDY_API_BASE_URL'))
    return spawn(join(runtime.directory, runtime.companion), [], { cwd: runtime.directory, windowsHide: true, stdio: 'pipe', env })
  } }
}
interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  progress: string | undefined
  watch: string | undefined
  stopWatch: string | undefined
}
interface Channel { requestId: string; kind: 'progress' | 'watch'; send(channel: string, payload: unknown): void }
/** Parallel requests let cancellation run while an install waits; EOF revokes every original bridge. */
export class SkillsNativeClient {
  #child: ChildProcessWithoutNullStreams | undefined
  #starting: Promise<void> | undefined
  #exit: Promise<void> = Promise.resolve()
  #ready: { resolve(): void; reject(error: Error): void } | undefined
  #buffer = Buffer.alloc(0)
  #pending = new Map<string, Pending>()
  #channels = new Map<string, Channel>()
  #watches = new Map<string, string>()
  #closed = false
  #closing: Promise<void> | undefined
  #renewing: Promise<void> | undefined
  #operations = new Set<Promise<unknown>>()
  constructor(private readonly runtime: SkillsRuntime, private session: MainSession,
    private readonly home: string, private readonly version: string) {
    if (!isAbsolute(home) || typeof version !== 'string' || version.length > 128) throw failure('SKILL_NATIVE_BOOTSTRAP_INVALID')
  }
  private async start(): Promise<void> {
    if (this.#closed) throw failure('SKILL_NATIVE_CLOSED')
    if (this.#starting) return this.#starting
    this.#starting = (async () => {
      const child = await this.runtime.start()
      this.#child = child
      this.#exit = new Promise(resolve => child.once('exit', () => { this.fail('SKILL_NATIVE_CLOSED'); resolve() }))
      child.on('error', () => { this.fail('SKILL_NATIVE_CLOSED') })
      child.stdin.on('error', () => { this.fail('SKILL_NATIVE_CLOSED') })
      child.stderr.resume()
      child.stdout.on('data', (chunk: Uint8Array) => { this.receive(Buffer.from(chunk)) })
      if (this.#closed) { child.kill(); throw failure('SKILL_NATIVE_CLOSED') }
      const ready = new Promise<void>((resolve, reject) => { this.#ready = { resolve, reject } })
      const timeout = setTimeout(() => { this.fail('SKILL_NATIVE_START_TIMEOUT') }, 15_000)
      try {
        child.stdin.write(JSON.stringify({ schemaVersion: 1, scope: this.session.scope, accessToken: this.session.accessToken, harnessHome: this.home, harnessVersion: this.version }) + '\n')
        await ready
      } finally { clearTimeout(timeout) }
    })()
    return this.#starting
  }
  private receive(chunk: Buffer): void {
    if (this.#closed) return
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    for (;;) {
      const end = this.#buffer.indexOf(10)
      if (end < 0) { if (this.#buffer.length > MAX) this.fail('SKILL_NATIVE_PROTOCOL_INVALID'); return }
      if (end > MAX) { this.fail('SKILL_NATIVE_PROTOCOL_INVALID'); return }
      const bytes = this.#buffer.subarray(0, end); this.#buffer = this.#buffer.subarray(end + 1)
      try { this.frame(JSON.parse(bytes.toString('utf8'))) } catch { this.fail('SKILL_NATIVE_PROTOCOL_INVALID'); return }
    }
  }
  private frame(value: unknown): void {
    if (!record(value) || value.schemaVersion !== 1 || !same(value.scope, this.session.scope)) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
    if (this.#ready) {
      if (value.ready === false && exact(value, ['schemaVersion', 'ready', 'scope', 'error']) && record(value.error) && exact(value.error, ['code']) && typeof value.error.code === 'string' && /^[A-Z0-9_]{1,128}$/.test(value.error.code)) { this.fail(value.error.code); return }
      if (!exact(value, ['schemaVersion', 'ready', 'scope']) || value.ready !== true) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
      this.#ready.resolve(); this.#ready = undefined; return
    }
    if (Object.hasOwn(value, 'kind')) {
      if (!exact(value, ['schemaVersion', 'kind', 'scope', 'requestId', 'channelId', 'payload']) || !uuid(value.requestId) || !uuid(value.channelId) || !['progress', 'watch'].includes(String(value.kind))) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
      const channel = this.#channels.get(value.channelId)
      if (!channel) return
      if (channel.requestId !== value.requestId || channel.kind !== value.kind) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
      channel.send(value.channelId, value.payload); return
    }
    if (!exact(value, ['schemaVersion', 'requestId', 'scope', 'data', 'error']) || !uuid(value.requestId)) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
    const pending = this.#pending.get(value.requestId)
    if (!pending) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
    if (value.error !== null && (!record(value.error) || !exact(value.error, ['code']) || typeof value.error.code !== 'string' || !/^[A-Z0-9_]{1,128}$/.test(value.error.code) || value.data !== null)) throw failure('SKILL_NATIVE_PROTOCOL_INVALID')
    this.#pending.delete(value.requestId)
    if (pending.progress) this.#channels.delete(pending.progress)
    if (pending.watch) {
      if (value.error === null && record(value.data) && uuid(value.data.watchId)) this.#watches.set(value.data.watchId, pending.watch)
      else this.#channels.delete(pending.watch)
    }
    if (pending.stopWatch) {
      const channel = this.#watches.get(pending.stopWatch)
      if (channel) this.#channels.delete(channel)
      this.#watches.delete(pending.stopWatch)
    }
    if (value.error === null) pending.resolve(value.data)
    else pending.reject(failure((value.error as { code: string }).code))
  }
  async invoke(command: string, input: Record<string, unknown>, page: string,
    send: (channel: string, payload: unknown) => void = () => {}): Promise<unknown> {
    const cancellation = command === 'skill_center_cancel_operation'
    if (!cancellation) await this.#renewing
    await this.start()
    if (!cancellation) await this.#renewing
    const child = this.#child
    if (this.#closed || !child) throw failure('SKILL_NATIVE_CLOSED')
    const requestId = randomUUID(), frame = JSON.stringify({ schemaVersion: 1, requestId, scope: this.session.scope, command, input, page })
    const operation = this.sendFrame(requestId, frame, input, send)
    this.#operations.add(operation)
    try { return await operation } finally { this.#operations.delete(operation) }
  }
  /**
   * Offer a Main-owned renewal between admitted operations without replacing the bridge.
   * @param session - Current credential for the original account generation; never a guest input.
   * @returns Resolves after the native owner/device checks and private acknowledgement.
   */
  renewSession(session: MainSession): Promise<void> {
    if (!same(session.scope, this.session.scope)) return Promise.reject(failure('ACCOUNT_SCOPE_CHANGED'))
    const pending = (this.#renewing ?? Promise.resolve()).then(async () => {
      if (this.#closed) throw failure('SKILL_NATIVE_CLOSED')
      if (this.#starting) await this.#starting
      if (session.accessToken === this.session.accessToken) return
      while (this.#operations.size) await Promise.allSettled([...this.#operations])
      if (this.#closed) throw failure('SKILL_NATIVE_CLOSED')
      if (this.#child) {
        const requestId = randomUUID()
        await this.sendFrame(requestId, JSON.stringify({ schemaVersion: 1, requestId, scope: session.scope, accessToken: session.accessToken }))
      }
      this.session = session
    }).catch(error => { this.fail('SKILL_NATIVE_CLOSED'); throw error }).finally(() => {
      if (this.#renewing === pending) this.#renewing = undefined
    })
    this.#renewing = pending
    return pending
  }
  private sendFrame(requestId: string, frame: string, input: Record<string, unknown> = {},
    send: (channel: string, payload: unknown) => void = () => {}): Promise<unknown> {
    const child = this.#child
    if (this.#closed || !child) return Promise.reject(failure('SKILL_NATIVE_CLOSED'))
    if (Buffer.byteLength(frame) > MAX) throw failure('SKILL_NATIVE_REQUEST_INVALID')
    const progress = uuid(input.onProgress) ? input.onProgress : undefined, watch = uuid(input.onChange) ? input.onChange : undefined
    if (progress) this.#channels.set(progress, { requestId, kind: 'progress', send })
    if (watch) this.#channels.set(watch, { requestId, kind: 'watch', send })
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject, progress, watch, stopWatch: uuid(input.watchId) ? input.watchId : undefined })
      child.stdin.write(frame + '\n')
    })
  }
  /**
   * Query known installed sources over the Main-only pipe, without environment detection.
   * @param signal - Caller cancellation, checked before start and after native settlement.
   * @returns Validated metadata; no original filesystem paths or credentials.
   */
  async safetyInventory(signal: AbortSignal): Promise<SkillSafetyNativeInventory> {
    const parsed = skillSafetyNativeInventorySchema.safeParse(await this.safetyInvoke('skill_safety_inventory', {}, signal))
    if (!parsed.success) throw failure('SKILL_SAFETY_SOURCE_INVALID')
    return parsed.data
  }
  /**
   * Copy one resolved instance to native-owned private staging; never modify the original.
   * @param input - Native instance/revision and deployment bounds, not a caller path.
   * @param signal - Caller cancellation; late replies cannot authorize further use.
   * @returns Private verified file witnesses, available only to Main.
   */
  async safetySnapshot(input: { instanceId: string; revision: string; maxBytes: number; maxFiles: number }, signal: AbortSignal): Promise<SkillSafetyNativeSnapshot> {
    const parsed = skillSafetyNativeSnapshotSchema.safeParse(await this.safetyInvoke('skill_safety_snapshot', { action: 'copy', ...input }, signal))
    if (!parsed.success || parsed.data.instanceId !== input.instanceId || parsed.data.revision !== input.revision) throw failure('SKILL_SAFETY_SOURCE_INVALID')
    return parsed.data
  }
  /**
   * Recheck original selected bytes against the complete snapshot manifest.
   * @param input - Resolved native identity and actual immutable witnesses.
   * @param signal - Caller cancellation.
   * @throws {Error} for changed source, revoked scope or malformed native reply.
   */
  async safetyVerify(input: { instanceId: string; revision: string; maxBytes: number; maxFiles: number; files: SkillSafetyNativeSnapshot['files'] }, signal: AbortSignal): Promise<void> {
    const result = await this.safetyInvoke('skill_safety_snapshot', { action: 'verify', ...input }, signal)
    if (!record(result) || !exact(result, ['current']) || result.current !== true) throw failure('SKILL_SAFETY_SOURCE_INVALID')
  }
  private async safetyInvoke(command: 'skill_safety_inventory' | 'skill_safety_snapshot', input: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw failure('SKILL_SAFETY_CANCELLED')
    try {
      const result = await this.invoke(command, input, 'studybuddy-native://skill-safety')
      if (signal.aborted) throw failure('SKILL_SAFETY_CANCELLED')
      return result
    } catch (error) {
      if (signal.aborted) throw failure('SKILL_SAFETY_CANCELLED')
      if (error instanceof Error && 'code' in error && error.code === 'SKILL_SOURCE_CHANGED') throw failure('SKILL_SAFETY_SOURCE_CHANGED')
      throw error
    }
  }
  private fail(code: string): void {
    this.#closed = true
    this.#ready?.reject(failure(code)); this.#ready = undefined
    for (const row of this.#pending.values()) row.reject(failure(code))
    this.#pending.clear(); this.#channels.clear(); this.#watches.clear()
    if (code !== 'SKILL_NATIVE_CLOSED') this.#child?.kill()
  }
  dispose(): Promise<void> {
    if (this.#closing) return this.#closing
    this.fail('SKILL_NATIVE_CLOSED')
    this.#closing = (async () => {
      await this.#starting?.catch(() => {})
      const child = this.#child
      if (!child || child.exitCode !== null || child.signalCode !== null) return
      child.stdin.end()
      const timeout = setTimeout(() => child.kill(), 10_000)
      try { await this.#exit } finally { clearTimeout(timeout) }
    })()
    return this.#closing
  }
}
