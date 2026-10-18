// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { PageController } from '../src/client/page-controller.ts'
import { PagePresentation } from '../src/client/PagePresentation.ts'

it.each(['aigc', 'skills'] as const)('settles %s preparation after its owned appearance is ready', async target => {
  const scope = { accountId: 'appearance-page', generation: 1 }
  const lease = { scope, lease: target, partition: target, entryUrl: target === 'aigc' ? 'http://127.0.0.1:43219/' : 'https://guijitongzhuo.com/skills' }
  const controller = new PageController(target, { acquire: async () => lease, release: async () => {}, setTheme: async () => {} })
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  const presentation = new PagePresentation(controller, () => target)
  try {
    controller.setScope(scope)
    let complete = false, finish!: (key: string) => void
    const prepared = presentation.prepare().then(() => { complete = true })
    await vi.waitFor(() => expect(document.querySelector('webview')).not.toBeNull())
    const guest = document.querySelector('webview')!
    const insertCSS = vi.fn(() => new Promise<string>(resolve => { finish = resolve }))
    Object.defineProperties(guest, { loadURL: { value: async () => {} }, insertCSS: { value: insertCSS } })
    guest.dispatchEvent(new Event('dom-ready'))
    if (target === 'aigc') {
      await vi.waitFor(() => expect(insertCSS).toHaveBeenCalledOnce())
      expect(complete).toBe(false)
      finish('owned-appearance')
    }
    await prepared
    expect(complete).toBe(true)
    await presentation.prepare()
    expect(insertCSS).toHaveBeenCalledTimes(target === 'aigc' ? 1 : 0)
  } finally { presentation.dispose(); controller.dispose(); vi.unstubAllGlobals() }
})

it.each(['styling-failed', 'account-replaced'] as const)('does not report AIGC prepared after %s during styling', async outcome => {
  const scope = { accountId: 'appearance-failure', generation: 1 }
  const lease = { scope, lease: outcome, partition: outcome, entryUrl: 'http://127.0.0.1:43219/' }
  const controller = new PageController('aigc', { acquire: async () => lease, release: async () => {}, setTheme: async () => {} })
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  const presentation = new PagePresentation(controller, () => 'AIGC')
  try {
    controller.setScope(scope)
    const prepared = presentation.prepare().then(() => 'ready', error => error.message)
    await vi.waitFor(() => expect(document.querySelector('webview')).not.toBeNull())
    const guest = document.querySelector('webview')!
    let rejectCSS!: (error: Error) => void
    const insertCSS = vi.fn(() => new Promise<string>((_, reject) => { rejectCSS = reject }))
    Object.defineProperties(guest, { loadURL: { value: async () => {} }, insertCSS: { value: insertCSS } })
    guest.dispatchEvent(new Event('dom-ready'))
    await vi.waitFor(() => expect(insertCSS).toHaveBeenCalledOnce())
    if (outcome === 'account-replaced') controller.setScope({ ...scope, generation: 2 })
    rejectCSS(new Error('guest styling unavailable'))
    expect(await prepared).toBe(outcome === 'account-replaced' ? 'COMMUNITY_LOAD_CANCELLED' : 'COMMUNITY_LOAD_FAILED')
    if (outcome === 'account-replaced') expect(controller.getSnapshot().errorCode).toBeNull()
    else expect(controller.getSnapshot().errorCode).toBe('COMMUNITY_LOAD_FAILED')
  } finally { presentation.dispose(); controller.dispose(); vi.unstubAllGlobals() }
})

it('prepares the real Skill document before panel entry and waits for navigation to finish', async () => {
  const scope = { accountId: 'background-page', generation: 1 }
  const lease = { scope, lease: 'background-skills', partition: 'background-partition', entryUrl: 'https://guijitongzhuo.com/skills?embed=desktop' }
  const controller = new PageController('skills', { acquire: async () => lease, release: async () => {}, setTheme: async () => {} })
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  const presentation = new PagePresentation(controller, () => 'Skill center')
  try {
    controller.setScope(scope)
    expect(presentation).toHaveProperty('prepare', expect.any(Function))
    let complete = false, finish!: () => void
    const prepared = presentation.prepare().then(() => { complete = true })
    await vi.waitFor(() => expect(document.querySelector('webview')).not.toBeNull())
    const guest = document.querySelector<HTMLElement>('webview')!
    const loadURL = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    Object.defineProperty(guest, 'loadURL', { value: loadURL })
    guest.dispatchEvent(new Event('dom-ready'))
    await Promise.resolve(); await Promise.resolve()
    expect(complete).toBe(false)
    expect(loadURL).toHaveBeenCalledExactlyOnceWith(lease.entryUrl)
    expect(guest.style.display).toBe('none')
    finish(); await prepared
    expect(complete).toBe(true)
    await presentation.prepare()
    expect(document.querySelector('webview')).toBe(guest)
    expect(loadURL).toHaveBeenCalledOnce()
  } finally { presentation.dispose(); controller.dispose(); vi.unstubAllGlobals() }
})

it.each(['navigation-failed', 'account-replaced'] as const)('does not report a prepared Skill page after %s', async outcome => {
  const scope = { accountId: 'background-failure', generation: 1 }
  const lease = { scope, lease: outcome, partition: outcome, entryUrl: 'https://guijitongzhuo.com/skills?embed=desktop' }
  const controller = new PageController('skills', { acquire: async () => lease, release: async () => {}, setTheme: async () => {} })
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  const presentation = new PagePresentation(controller, () => 'Skill center')
  try {
    controller.setScope(scope)
    const prepared = presentation.prepare().then(() => 'ready', error => error.message)
    await vi.waitFor(() => expect(document.querySelector('webview')).not.toBeNull())
    const guest = document.querySelector('webview')!
    Object.defineProperty(guest, 'loadURL', { value: () => outcome === 'navigation-failed' ? Promise.reject(new Error('transport unavailable')) : new Promise<void>(() => {}) })
    guest.dispatchEvent(new Event('dom-ready'))
    if (outcome === 'account-replaced') controller.setScope({ ...scope, generation: 2 })
    expect(await prepared).toBe(outcome === 'navigation-failed' ? 'COMMUNITY_LOAD_FAILED' : 'COMMUNITY_LOAD_CANCELLED')
    if (outcome === 'account-replaced') expect(document.querySelector('webview')).toBeNull()
    else expect(controller.getSnapshot().errorCode).toBe('COMMUNITY_LOAD_FAILED')
  } finally { presentation.dispose(); controller.dispose(); vi.unstubAllGlobals() }
})

it.each(['aigc', 'skills', 'zhilian'] as const)('retains %s document through panel returns and clears it on account replacement', async (target) => {
  const scope = { accountId: 'retained-page', generation: 1 }
  const lease = { scope, lease: target, partition: target, entryUrl: target === 'aigc' ? 'http://127.0.0.1:43219/' : 'https://guijitongzhuo.com/' + target }
  const acquire = vi.fn(async () => lease), release = vi.fn(async () => {}), setVisible = vi.fn(async () => {})
  const controller = new PageController(target, { acquire, release, setVisible, setTheme: async () => {} })
  const frames = new Map<number, FrameRequestCallback>(); let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(0) }
  const container = document.createElement('div'); document.body.append(container)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 600, 400))
  const presentation = new PagePresentation(controller, () => target)
  const menu = document.createElement('div'); menu.setAttribute('role', 'menu')
  try {
    controller.setScope(scope)
    let detach = presentation.attach(container); await controller.acquire(); flush()
    const guest = document.querySelector('webview')!, loadURL = vi.fn(async () => {})
    Object.defineProperty(guest, 'loadURL', { value: loadURL })
    Object.defineProperty(guest, 'insertCSS', { value: async () => 'owned-appearance' })
    guest.dispatchEvent(new Event('dom-ready'))
    expect(loadURL).toHaveBeenCalledExactlyOnceWith(lease.entryUrl)
    expect(guest.getAttribute('aria-hidden')).toBe('false')
    for (let cycle = 0; cycle < 3; cycle++) {
      detach(); flush()
      expect(document.querySelector('webview')).toBe(guest)
      expect(guest.getAttribute('aria-hidden')).toBe('true')
      expect(guest.getAttribute('tabindex')).toBe('-1')
      detach = presentation.attach(container); await controller.acquire(); flush()
      expect(document.querySelector('webview')).toBe(guest)
      expect(guest.getAttribute('aria-hidden')).toBe('false')
      guest.dispatchEvent(new Event('dom-ready'))
    }
    expect(acquire).toHaveBeenCalledTimes(1)
    expect(loadURL).toHaveBeenCalledTimes(1)
    expect(release).not.toHaveBeenCalled()
    document.body.append(menu); window.dispatchEvent(new Event('resize')); flush()
    expect(guest.getAttribute('aria-hidden')).toBe('true')
    expect(guest.getAttribute('tabindex')).toBe('-1')
    menu.remove(); window.dispatchEvent(new Event('resize')); flush()
    expect(guest.getAttribute('aria-hidden')).toBe('false')
    controller.setScope({ ...scope, generation: 2 }); flush()
    expect(document.querySelector('webview')).toBeNull()
    expect(release).toHaveBeenCalledExactlyOnceWith(lease.lease)
  } finally {
    presentation.dispose(); controller.dispose(); container.remove(); menu.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  }
})
