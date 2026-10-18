import type { EmbeddedPageLease, EmbeddedPageController } from './embedded-page-controller.ts'
import { observeEmbeddedSurface, projectEmbeddedSurface, readEmbeddedSurfaceTheme } from './embedded-surface-geometry.ts'
interface PageWebview extends HTMLElement {
  loadURL(url: string): Promise<void>
  insertCSS(css: string): Promise<string>
}
/** Retain a page across panel changes; conceal its interactive layer under foreground overlays. */
export class EmbeddedPagePresentation<T extends string> {
  #container: HTMLElement | null = null
  #guest: PageWebview | null = null
  #lease: string | null = null
  #stop: () => void
  #stopGeometry: (() => void) | undefined
  #frame: number | null = null
  #disposers: (() => void)[] = []
  #disposed = false
  #visible = false
  #documentReady: Promise<void> | null = null
  #cancelDocument: (() => void) | null = null
  constructor(private readonly controller: EmbeddedPageController<T>, private readonly label: () => string, private readonly style?: string, private readonly menus: 'hide' | 'cover' = 'hide') {
    this.#stop = controller.subscribe(() => { this.syncLease() })
  }
  /**
   * Prepare the retained guest through navigation, including concurrent foreground entry.
   * @returns Resolves after navigation and owned styling; rejects on failure or scope replacement.
   */
  prepare = async (): Promise<void> => {
    const scope = this.controller.getSnapshot().scope
    if (!scope || this.#disposed) throw new Error('COMMUNITY_LOAD_CANCELLED')
    await this.controller.acquire()
    const state = this.controller.getSnapshot(), ready = this.#documentReady, lease = this.#lease
    if (this.#disposed || scope.accountId !== state.scope?.accountId || scope.generation !== state.scope?.generation || !ready || !lease || state.errorCode) {
      throw new Error(state.errorCode ?? 'COMMUNITY_LOAD_CANCELLED')
    }
    await ready
    if (this.#disposed || lease !== this.#lease || this.controller.getSnapshot().errorCode) throw new Error('COMMUNITY_LOAD_CANCELLED')
  }
  attach = (container: HTMLElement): (() => void) => {
    this.#stopGeometry?.()
    this.#container = container
    const off = observeEmbeddedSurface(container, this.queue)
    this.#stopGeometry = off
    this.syncLease()
    this.queue()
    void this.controller.acquire()
    return () => {
      off()
      if (this.#container === container) { this.#container = null; this.#stopGeometry = undefined }
      this.queue()
    }
  }
  private syncLease(): void {
    if (this.#disposed) return
    const lease = this.controller.getSnapshot().lease
    if (lease?.lease === this.#lease) { this.queue(); return }
    this.removeGuest()
    if (lease) this.createGuest(lease)
    this.queue()
  }
  private createGuest(lease: EmbeddedPageLease): void {
    const guest = document.createElement('webview') as PageWebview
    this.#guest = guest
    this.#lease = lease.lease
    guest.setAttribute('partition', lease.partition)
    guest.setAttribute('src', 'about:blank#studybuddy-' + this.controller.target + '-' + lease.lease)
    guest.setAttribute('aria-label', this.label())
    guest.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:10;'
    let finish!: () => void, reject!: (error: Error) => void
    this.#documentReady = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail })
    // Foreground-only entry has no preparation waiter; failure still belongs to the controller.
    void this.#documentReady.catch(() => {})
    this.#cancelDocument = () => reject(new Error('COMMUNITY_LOAD_CANCELLED'))
    let navigated = false
    const fail = (): void => {
      if (this.#guest === guest) this.controller.reportFailure('COMMUNITY_LOAD_FAILED')
      reject(new Error('COMMUNITY_LOAD_FAILED'))
    }
    const ready = (): void => {
      if (!navigated) {
        navigated = true
        void guest.loadURL(lease.entryUrl).then(async () => {
          if (this.style !== undefined && this.#guest === guest) await guest.insertCSS(this.style)
          finish()
        }).catch(fail)
      }
      this.queue()
    }
    const failed = (event: Event): void => {
      const detail = event as Event & { errorCode?: number; isMainFrame?: boolean }
      if (detail.isMainFrame !== false && detail.errorCode !== -3) fail()
    }
    guest.addEventListener('dom-ready', ready)
    guest.addEventListener('did-fail-load', failed)
    this.#disposers.push(() => { guest.removeEventListener('dom-ready', ready); guest.removeEventListener('did-fail-load', failed) })
    document.body.append(guest)
  }
  theme = readEmbeddedSurfaceTheme
  private queue = (): void => {
    if (this.#disposed || this.#frame !== null) return
    this.#frame = requestAnimationFrame(() => { this.#frame = null; this.place() })
  }
  private place(): void {
    const guest = this.#guest
    if (!guest) return
    const projection = projectEmbeddedSurface(this.#container, this.menus), bounds = projection.bounds
    const visible = projection.visible && !this.controller.getSnapshot().errorCode
    const interactive = visible && projectEmbeddedSurface(this.#container).visible
    const properties: Record<string, string> = visible && bounds
      ? { display: 'flex', pointerEvents: interactive ? 'auto' : 'none', left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px` }
      : { display: 'none', pointerEvents: 'none' }
    for (const [name, value] of Object.entries(properties)) {
      if (Reflect.get(guest.style, name) !== value) Reflect.set(guest.style, name, value)
    }
    guest.setAttribute('aria-hidden', String(!interactive))
    guest.toggleAttribute('inert', !interactive)
    guest.tabIndex = interactive ? 0 : -1
    if (visible !== this.#visible) {
      this.#visible = visible
      if (visible) void this.controller.setTheme(this.theme())
      void this.controller.setVisible(visible)
    }
  }
  private removeGuest(): void {
    this.#cancelDocument?.()
    this.#cancelDocument = null
    this.#documentReady = null
    for (const dispose of this.#disposers.splice(0)) dispose()
    this.#guest?.remove()
    this.#guest = null
    this.#lease = null
    this.#visible = false
  }
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#stop()
    this.#stopGeometry?.()
    if (this.#frame !== null) cancelAnimationFrame(this.#frame)
    this.removeGuest()
  }
}
