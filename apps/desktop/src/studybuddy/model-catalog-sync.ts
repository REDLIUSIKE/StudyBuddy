/** Main-owned refresh of approved catalogs; credentials and model admission stay in their existing owners. */
import type { OwnedScope } from '@studybuddy/contracts'
interface SyncResult {
  schemaVersion: 1
  records: readonly { toolId: string; state: string; catalogRevision: string | null; errorCode: string | null }[]
}
interface Dependencies {
  scope(): OwnedScope | null
  platform(scope: OwnedScope): Promise<void>
  tools(scope: OwnedScope): Promise<SyncResult>
  changed(scope: OwnedScope): void
  failed(source: 'platform' | 'tools'): void
  schedule(callback: () => void, delay: number): () => void
}
/** Poll only the current account, retry independent authorities, and await owned work on shutdown. */
export class ModelCatalogSync {
  private stopped = true
  private cancel: (() => void) | undefined
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly deps: Dependencies) {}
  /** Start tools immediately; startup can retain ownership of the first platform setup. */
  start(options: { platformAlreadyLoading?: boolean } = {}): void {
    if (!this.stopped) return
    this.stopped = false
    this.arm(0, options.platformAlreadyLoading === true)
  }
  private arm(delay: number, skipPlatform = false): void {
    if (this.stopped) return
    this.cancel = this.deps.schedule(() => {
      this.cancel = undefined
      this.pending = this.refresh(skipPlatform).finally(() => { this.arm(60_000) })
    }, delay)
  }
  private current(scope: OwnedScope): boolean {
    const current = this.deps.scope()
    return !this.stopped && current?.accountId === scope.accountId && current.generation === scope.generation
  }
  private async refresh(skipPlatform = false): Promise<void> {
    const scope = this.deps.scope()
    if (!scope || !this.current(scope)) return
    await Promise.all([
      (async () => { if (skipPlatform) return; try { await this.deps.platform(scope) } catch { if (this.current(scope)) this.deps.failed('platform') } })(),
      (async () => {
        try {
          const result = await this.deps.tools(scope)
          if (this.current(scope) && result.records.some(row => row.state === 'updated' || row.state === 'prepared')) this.deps.changed(scope)
        } catch { if (this.current(scope)) this.deps.failed('tools') }
      })(),
    ])
  }
  /** Cancel future work and wait for the current account-fenced refresh to settle. */
  async dispose(): Promise<void> { this.stopped = true; this.cancel?.(); this.cancel = undefined; await this.pending }
}
