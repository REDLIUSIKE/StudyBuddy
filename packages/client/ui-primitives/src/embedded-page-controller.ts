/** Account-scoped page leases; the native owner wipes partitions on revocation. */
export interface EmbeddedPageScope { accountId: string; generation: number }
export interface EmbeddedPageLease { lease: string; partition: string; entryUrl: string; scope: EmbeddedPageScope }
export interface EmbeddedPageTheme { mode: 'light' | 'dark'; variables: Record<string, string> }

export interface EmbeddedPageHost<T extends string> {
  acquire(target: T): Promise<EmbeddedPageLease>
  release(lease: string): Promise<void>
  setTheme(lease: string, theme: EmbeddedPageTheme): Promise<void>
  setVisible?(lease: string, visible: boolean): Promise<void>
  subscribeInvalid?(listener: (id: string) => void): () => void
}
export interface EmbeddedPageSnapshot { scope: EmbeddedPageScope | null; lease: EmbeddedPageLease | null; busy: boolean; errorCode: string | null }
const same = (a: EmbeddedPageScope | null, b: EmbeddedPageScope | null) => a?.accountId === b?.accountId && a?.generation === b?.generation
const code = (error: unknown) => error instanceof Error && /^[A-Z0-9_]{1,128}$/.test(error.message) ? error.message : 'COMMUNITY_LOAD_FAILED'

export class EmbeddedPageController<T extends string> {
  #state: EmbeddedPageSnapshot = { scope: null, lease: null, busy: false, errorCode: null }
  #listeners = new Set<() => void>()
  #epoch = 0
  #disposed = false
  #pending: Promise<void> | undefined
  #stop: (() => void) | undefined
  constructor(readonly target: T, private readonly host: EmbeddedPageHost<T> | undefined) {
    this.#stop = host?.subscribeInvalid?.((id) => {
      if (this.#state.lease?.lease !== id || this.#disposed) return
      ++this.#epoch
      this.#pending = undefined
      this.publish({ ...this.#state, lease: null, busy: false, errorCode: this.target === 'aigc' ? 'AIGC_SERVICE_EXITED' : 'AUTH_REQUIRED' })
    })
  }
  getSnapshot = (): EmbeddedPageSnapshot => this.#state
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener) } }
  private publish(state: EmbeddedPageSnapshot): void {
    this.#state = state
    for (const listener of this.#listeners) {
      try { listener() } catch { console.error('StudyBuddy page observer failed') }
    }
  }
  /** Re-read lifecycle authority after awaits and external observer callbacks. */
  private active(epoch: number): boolean { return !this.#disposed && epoch === this.#epoch }
  setScope(scope: EmbeddedPageScope | null): void {
    if (same(scope, this.#state.scope) || this.#disposed) return
    ++this.#epoch
    this.#pending = undefined
    const old = this.#state.lease
    this.publish({ scope, lease: null, busy: false, errorCode: null })
    if (old) void this.host?.release(old.lease).catch(() => {})
  }
  acquire = (): Promise<void> => {
    if (this.#disposed || !this.#state.scope || this.#state.lease) return Promise.resolve()
    if (this.#pending) return this.#pending
    const scope = this.#state.scope, epoch = this.#epoch
    const pending = Promise.resolve().then(() => this.acquireLease(scope, epoch)).finally(() => {
      if (this.#pending === pending) this.#pending = undefined
    })
    this.#pending = pending
    this.publish({ ...this.#state, busy: true, errorCode: null })
    return pending
  }
  private async acquireLease(scope: EmbeddedPageScope, epoch: number): Promise<void> {
    if (!this.active(epoch)) return
    try {
      if (!this.host) throw new Error('COMMUNITY_DESKTOP_REQUIRED')
      const lease = await this.host.acquire(this.target)
      if (!this.active(epoch) || !same(scope, lease.scope)) { await this.host.release(lease.lease); return }
      this.publish({ ...this.#state, lease })
    } catch (error) { if (this.active(epoch)) this.publish({ ...this.#state, errorCode: code(error) }) }
    finally { if (this.active(epoch)) this.publish({ ...this.#state, busy: false }) }
  }
  setTheme = async (theme: EmbeddedPageTheme): Promise<void> => {
    const id = this.#state.lease?.lease, epoch = this.#epoch
    if (!id || !this.host) return
    try { await this.host.setTheme(id, theme) }
    catch (error) { if (this.active(epoch)) this.reportFailure(code(error)) }
  }
  setVisible = async (visible: boolean): Promise<void> => {
    const id = this.#state.lease?.lease, epoch = this.#epoch
    if (!id || !this.host) return
    try { await this.host.setVisible?.(id, visible) }
    catch (error) { if (this.active(epoch)) this.reportFailure(code(error)) }
  }
  reportFailure = (errorCode: string): void => { if (!this.#disposed) this.publish({ ...this.#state, errorCode, busy: false }) }
  retry = async (): Promise<void> => {
    if (this.#disposed) return
    const old = this.#state.lease, epoch = ++this.#epoch
    this.#pending = undefined
    this.publish({ ...this.#state, lease: null, busy: false, errorCode: null })
    if (old) await this.host?.release(old.lease).catch(() => {})
    if (epoch === this.#epoch) await this.acquire()
  }
  dispose(): void {
    if (this.#disposed) return
    this.setScope(null); this.#disposed = true; ++this.#epoch; this.#stop?.(); this.#listeners.clear()
  }
}
