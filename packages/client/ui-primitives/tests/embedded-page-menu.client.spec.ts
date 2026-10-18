// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { EmbeddedPageController } from '../src/embedded-page-controller.ts'
import { EmbeddedPagePresentation } from '../src/embedded-page-presentation.ts'

it('keeps the video guest painted under model menus without input, reload or suspension', async () => {
  const frames = new Set<FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.add(callback); return frames.size })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const flush = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      for (const callback of [...frames]) { frames.delete(callback); callback(0) }
    }
  }
  const scope = { accountId: 'video-menu', generation: 1 }
  const lease = { scope, lease: 'video-menu-lease', partition: 'video-menu-partition', entryUrl: 'http://127.0.0.1:43219/projects/current' }
  const acquire = vi.fn(async () => lease), release = vi.fn(async () => {}), setVisible = vi.fn(async () => {})
  const controller = new EmbeddedPageController('video', { acquire, release, setVisible, setTheme: async () => {} })
  const presentation = new EmbeddedPagePresentation(controller, () => 'Video editor', undefined, 'cover')
  const container = document.createElement('div'), menu = document.createElement('div'), dialog = document.createElement('div')
  container.getBoundingClientRect = () => ({ left: 280, top: 40, width: 680, height: 740 }) as DOMRect
  document.body.append(container)
  let detach: (() => void) | undefined
  try {
    controller.setScope(scope)
    detach = presentation.attach(container)
    await controller.acquire(); await flush()
    const guest = document.querySelector<HTMLElement>('webview')!
    const loadURL = vi.fn(async () => {})
    Object.defineProperty(guest, 'loadURL', { value: loadURL })
    guest.dispatchEvent(new Event('dom-ready')); await flush()
    expect(guest.style.display).toBe('flex')
    expect(guest.style.pointerEvents).toBe('auto')
    expect(setVisible).toHaveBeenLastCalledWith(lease.lease, true)
    setVisible.mockClear()

    menu.setAttribute('role', 'menu'); document.body.append(menu); await flush()
    expect(document.querySelector('webview')).toBe(guest)
    expect(guest.style.display).toBe('flex')
    expect(guest.style.pointerEvents).toBe('none')
    expect(guest.hasAttribute('inert')).toBe(true)
    expect(guest.tabIndex).toBe(-1)
    expect(setVisible).not.toHaveBeenCalled()
    menu.remove(); await flush()
    expect(guest.style.pointerEvents).toBe('auto')
    expect(guest.hasAttribute('inert')).toBe(false)
    expect(guest.tabIndex).toBe(0)

    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); document.body.append(dialog); await flush()
    expect(guest.style.display).toBe('none')
    expect(setVisible).toHaveBeenLastCalledWith(lease.lease, false)
    dialog.remove(); await flush()
    expect(guest.style.display).toBe('flex')
    expect(setVisible).toHaveBeenLastCalledWith(lease.lease, true)
    expect(loadURL).toHaveBeenCalledExactlyOnceWith(lease.entryUrl)
    expect(acquire).toHaveBeenCalledOnce()

    controller.setScope(null); await flush()
    expect(document.querySelector('webview')).toBeNull()
    expect(release).toHaveBeenCalledExactlyOnceWith(lease.lease)
  } finally {
    detach?.(); presentation.dispose(); controller.dispose()
    container.remove(); menu.remove(); dialog.remove(); vi.unstubAllGlobals()
  }
})
