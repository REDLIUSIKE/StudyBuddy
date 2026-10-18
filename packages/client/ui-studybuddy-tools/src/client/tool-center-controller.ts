/** React-free owner of one tool surface. Unknown native writes are never retried here. */
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { OwnedScope, ToolViewLease, EmbeddedTheme, ToolSurfaceBounds } from '@studybuddy/contracts'
export interface ToolsSurfaceHost {
  acquire(target?:'tools'|'labs'): Promise<ToolViewLease>
  release(lease: string): Promise<void>
  resize(lease: string, bounds: ToolSurfaceBounds): Promise<void>
  setVisible(lease: string, visible: boolean): Promise<void>
  setTheme(lease: string, theme: EmbeddedTheme): Promise<void>
  subscribeInvalid(listener: (lease: string) => void): () => void
}
export interface ToolCenterSnapshot {
  scope: OwnedScope | null
  lease: ToolViewLease | null
  busy: boolean
  errorCode: string | null
}
const same = (a: OwnedScope | null, b: OwnedScope | null) =>
  a === b || (a !== null && b !== null && a.accountId === b.accountId && a.generation === b.generation)
const code = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message)
      ? error.message
      : 'TOOL_VIEW_UNAVAILABLE'
export class ToolCenterController {
  #snapshot: ToolCenterSnapshot = { scope: null, lease: null, busy: false, errorCode: null }
  #listeners = new Set<() => void>()
  #epoch = 0
  #disposed = false
  #acquiring: Promise<void> | undefined
  #pending = new Set<Promise<void>>()
  #projection: string | null = null
  #shown = false
  #write: Promise<void> = Promise.resolve()
  #invalid: (() => void) | undefined
  constructor(private readonly host: ToolsSurfaceHost | undefined) {
    this.#invalid = host?.subscribeInvalid((id) => {
      if (this.#snapshot.lease?.lease === id) {
        ++this.#epoch
        this.publish({ ...this.#snapshot, lease: null, busy: false, errorCode: 'TOOL_VIEW_UNAVAILABLE' })
      }
    })
  }
  getSnapshot = (): ToolCenterSnapshot => this.#snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
  private publish(value: ToolCenterSnapshot): void {
    this.#snapshot = value
    notifySubscribers(this.#listeners, 'studybuddy tools')
  }
  private report(error: unknown): void {
    console.error('StudyBuddy tool surface unavailable', code(error))
  }
  setScope(scope: OwnedScope | null): void {
    if (this.#disposed || same(scope, this.#snapshot.scope)) return
    ++this.#epoch
    this.#acquiring = undefined
    this.#projection = null
    this.#shown = false
    const old = this.#snapshot.lease
    this.publish({ scope, lease: null, busy: false, errorCode: null })
    if (old) this.#write = this.#write.then(() => this.host?.release(old.lease)).catch(error => this.report(error))
  }
  acquire = (): Promise<void> => {
    if (this.#disposed || !this.#snapshot.scope || this.#snapshot.lease) return Promise.resolve()
    if (this.#acquiring) return this.#acquiring
    const epoch = this.#epoch,
      scope = this.#snapshot.scope
    this.publish({ ...this.#snapshot, busy: true, errorCode: null })
    const pending = (async () => {
      try {
        if (!this.host) throw new Error('TOOL_DESKTOP_REQUIRED')
        const lease = await this.host.acquire()
        if (this.#disposed || epoch !== this.#epoch || !same(lease.scope, scope)) {
          await this.host.release(lease.lease)
          return
        }
        this.publish({ ...this.#snapshot, lease })
      } catch (error) {
        if (!this.#disposed && epoch === this.#epoch) this.publish({ ...this.#snapshot, errorCode: code(error) })
        else this.report(error)
      } finally {
        if (!this.#disposed && epoch === this.#epoch) this.publish({ ...this.#snapshot, busy: false })
      }
    })().finally(() => {
      if (this.#acquiring === pending) this.#acquiring = undefined
      this.#pending.delete(pending)
    })
    this.#acquiring = pending
    this.#pending.add(pending)
    return pending
  }
  /** Serialized visibility/bounds updates; stale queued projections cannot reattach old views. */
  project = (value: { bounds: ToolSurfaceBounds | null; visible: boolean }): Promise<void> => {
    const epoch = this.#epoch,
      lease = this.#snapshot.lease
    const signature = JSON.stringify([lease?.lease, value])
    if (this.#projection === signature) return this.#write
    this.#projection = signature
    const current = () => !this.#disposed && epoch === this.#epoch && this.#snapshot.lease === lease
    this.#write = this.#write
      .then(async () => {
        if (!lease || !this.host || !current()) return
        if (!value.visible || !value.bounds) {
          await this.host.setVisible(lease.lease, false)
          this.#shown = false
          return
        }
        if (!this.#shown) await this.host.setVisible(lease.lease, false)
        if (!current()) return
        await this.host.resize(lease.lease, value.bounds)
        if (current()) {
          await this.host.setVisible(lease.lease, true)
          this.#shown = true
        }
      })
      .catch((error) => {
        this.#projection = null
        this.#shown = false
        if (current()) this.publish({ ...this.#snapshot, errorCode: code(error) })
        this.report(error)
      })
    return this.#write
  }
  setTheme = async (theme: EmbeddedTheme): Promise<void> => {
    const epoch = this.#epoch,
      lease = this.#snapshot.lease
    if (!lease || !this.host) return
    try {
      await this.host.setTheme(lease.lease, theme)
    } catch (error) {
      if (!this.#disposed && epoch === this.#epoch) this.publish({ ...this.#snapshot, errorCode: code(error) })
      this.report(error)
    }
  }
  retry = async (): Promise<void> => {
    if (this.#disposed) return
    const old = this.#snapshot.lease
    ++this.#epoch
    this.publish({ ...this.#snapshot, lease: null, errorCode: null })
    if (old)
      try {
        await this.host?.release(old.lease)
      } catch (error) {
        this.publish({ ...this.#snapshot, errorCode: code(error) })
        return
      }
    await this.acquire()
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.setScope(null)
    this.#disposed = true
    this.#invalid?.()
    this.#listeners.clear()
    await Promise.all([...this.#pending])
    await this.#write
  }
}
