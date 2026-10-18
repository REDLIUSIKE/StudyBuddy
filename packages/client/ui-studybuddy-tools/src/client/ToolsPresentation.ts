import {
  observeEmbeddedSurface,
  projectEmbeddedSurface,
  readEmbeddedSurfaceTheme,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCenterController } from './tool-center-controller.ts'
/** One attach lifetime; foreground overlays hide the native surface, never cancel installs. */
export class ToolsPresentation {
  #off: (() => void) | undefined
  #container: HTMLElement | null = null
  #stop: () => void
  constructor(private readonly controller: ToolCenterController) {
    let lease: string | null = null,
      error: string | null = null
    this.#stop = controller.subscribe(() => {
      const state = controller.getSnapshot()
      if (lease === state.lease?.lease && error === state.errorCode) return
      lease = state.lease?.lease ?? null
      error = state.errorCode
      if (this.#container) {
        const value = projectEmbeddedSurface(this.#container)
        void controller.project({ ...value, visible: value.visible && !state.errorCode })
      }
    })
  }
  attach = (container: HTMLElement): (() => void) => {
    this.#off?.()
    this.#container = container
    const off = observeEmbeddedSurface(container, (value) => {
      void this.controller.project({ ...value, visible: value.visible && !this.controller.getSnapshot().errorCode })
    })
    this.#off = off
    void this.controller.acquire()
    return () => {
      off()
      if (this.#container === container) {
        this.#container = null
        this.#off = undefined
        void this.controller.project({ bounds: null, visible: false })
      }
    }
  }
  theme = readEmbeddedSurfaceTheme
  dispose(): void {
    this.#off?.()
    this.#stop()
    this.#container = null
    void this.controller.project({ bounds: null, visible: false })
  }
}
