import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarRightPresentation } from './shell/SidebarRight.tsx'

/** Root presentation that temporarily covers, rather than replaces, Session previews. */
export class GlobalRightPanel {
  readonly source = createSnapshotStore<string | null>(null)
  private sessionVisible = true
  private session: SidebarRightPresentation = { shown: false, track: false, fullscreen: false }

  constructor(private readonly layout: Pick<ILayout, 'openRightbar' | 'closeRightbar'>) {}

  /** @param key - registered root panel key. */
  open(key: string): void {
    this.source.set(key)
    this.layout.openRightbar(true, false)
  }

  /** Restore the current context without navigating to a previous Session. */
  close(): void {
    this.source.set(null)
    this.presentSession()
  }

  /** @param visible - whether the main column currently displays Conversation. */
  setSessionVisible(visible: boolean): void {
    this.sessionVisible = visible
    if (this.source.getSnapshot() === null && !visible) this.layout.closeRightbar()
  }

  /** @param presentation - active Session's committed presentation. */
  reportSession(presentation: SidebarRightPresentation): void {
    if (this.source.getSnapshot() !== null) return
    this.session = presentation
    this.presentSession()
  }

  private presentSession(): void {
    if (this.sessionVisible && this.session.shown) this.layout.openRightbar(this.session.track, this.session.fullscreen)
    else this.layout.closeRightbar()
  }
}
