import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Selects the Session actually displayed by the active main panel, without changing chat navigation. */
export class SidebarSessionSurfaces {
  readonly source = createSnapshotStore<SessionId | undefined>(undefined)
  private readonly panels = new Map<string, { source: HostObservable<SessionId | undefined>; stop: () => void }>()
  private readonly stop: (() => void)[]
  private disposed = false

  constructor(private readonly panel: HostObservable<string | null>, private readonly conversation: HostObservable<SessionId | undefined>) {
    this.stop = [panel.subscribe(this.sync), conversation.subscribe(this.sync)]
    this.sync()
  }

  /** Register one panel-owned selected Session source; disposal withdraws its preview surface immediately. */
  register(panelId: string, source: HostObservable<SessionId | undefined>): () => void {
    if (this.disposed) throw new Error('Sidebar Session surfaces disposed')
    if (this.panels.has(panelId)) throw new Error('Sidebar Session surface already registered')
    const entry = { source, stop: source.subscribe(this.sync) }
    this.panels.set(panelId, entry)
    this.sync()
    return () => {
      if (this.panels.get(panelId) !== entry) return
      entry.stop()
      this.panels.delete(panelId)
      this.sync()
    }
  }

  /** Release every source and clear the foreground Session when the provider unloads. */
  dispose(): void {
    this.disposed = true
    for (const stop of this.stop) stop()
    for (const entry of this.panels.values()) entry.stop()
    this.panels.clear()
    this.source.set(undefined)
  }

  private sync = (): void => {
    if (this.disposed) return
    const panel = this.panel.getSnapshot()
    this.source.set(panel === null ? this.conversation.getSnapshot() : this.panels.get(panel)?.source.getSnapshot())
  }
}
