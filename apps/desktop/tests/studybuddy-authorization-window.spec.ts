import type { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'
import { StudyBuddyAuthorizationWindow } from '../src/studybuddy/authorization-window.ts'
import { StudyBuddyAuth } from '../src/studybuddy/services.ts'

interface TestWindow extends EventEmitter {
  options: Record<string, unknown>
  webContents: EventEmitter
  destroy(): void
  isDestroyed(): boolean
  show: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
}
const owned = vi.hoisted(() => ({ windows: [] as TestWindow[] }))
vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  return {
    app: { getAppPath: () => 'C:/studybuddy-test' },
    BrowserWindow: class extends Emitter {
      destroyed = false
      show = vi.fn()
      focus = vi.fn()
      removeMenu = vi.fn()
      loadURL = vi.fn(async () => {})
      webContents = Object.assign(new Emitter(), {
        setWindowOpenHandler: vi.fn(),
        session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
      })
      constructor(readonly options: Record<string, unknown>) { super(); owned.windows.push(this) }
      isDestroyed() { return this.destroyed }
      isMinimized() { return false }
      restore() {}
      destroy() { this.destroyed = true; this.emit('closed') }
    },
  }
})
beforeEach(() => { owned.windows.length = 0 })
const requestId = '11111111-1111-4111-8111-111111111111'
const started = { requestId, authorizationUrl: `https://guijitongzhuo.com/login/desktop?request=${requestId}`,
  cancelToken: 'c'.repeat(43), pollToken: 'p'.repeat(43), nextPollAfterMs: 2000, expiresInSeconds: 300 }

it('closes its website window after account verification without cancelling a successful login', async () => {
  const dismissed = vi.fn()
  const owner = new StudyBuddyAuthorizationWindow(() => undefined, dismissed)
  const account = Promise.withResolvers<Response>()
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(started))
    .mockResolvedValueOnce(Response.json({ status: 'authenticated', accessToken: 'access', refreshToken: 'refresh',
      accessTokenExpiresInSeconds: 900, refreshTokenExpiresInSeconds: 2592000 }))
    .mockReturnValueOnce(account.promise)
  const auth = new StudyBuddyAuth({ fetch: fetcher, vault: { read: async () => null, write: async () => {}, clear: async () => {} },
    openBrowser: url => owner.open(url), schedule: () => () => {} })
  auth.subscribe((state) => { owner.synchronize(state) })
  await auth.start()
  const window = owned.windows[0]!
  expect(window.show).toHaveBeenCalledOnce()
  const polling = auth.poll()
  await vi.waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(3) })
  expect(window.isDestroyed()).toBe(false)
  account.resolve(Response.json({ id: requestId, status: 'active' }))
  await polling
  expect(auth.state.phase).toBe('authenticated')
  expect(window.isDestroyed()).toBe(true)
  expect(dismissed).not.toHaveBeenCalled()
  auth.dispose()
})
it('cancels the owned attempt when the user closes the website window', async () => {
  const dismissed = vi.fn()
  const owner = new StudyBuddyAuthorizationWindow(() => undefined, dismissed)
  await owner.open(started.authorizationUrl)
  owned.windows[0]!.destroy()
  expect(dismissed).toHaveBeenCalledOnce()
  owner.close()
  expect(dismissed).toHaveBeenCalledOnce()
})
it('confines remote navigation and isolates the website from native APIs', async () => {
  const owner = new StudyBuddyAuthorizationWindow(() => undefined, () => {})
  await owner.open(started.authorizationUrl)
  const window = owned.windows[0]!
  expect(window.options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false })
  expect(window.options.webPreferences).not.toHaveProperty('preload')
  const event = { preventDefault: vi.fn() }
  window.webContents.emit('will-redirect', event, 'https://example.com/steal')
  expect(event.preventDefault).toHaveBeenCalledOnce()
  owner.close()
})
it('reuses and focuses the current window and refuses another website', async () => {
  const owner = new StudyBuddyAuthorizationWindow(() => undefined, () => {})
  await owner.open(started.authorizationUrl)
  await owner.open(started.authorizationUrl)
  expect(owned.windows).toHaveLength(1)
  expect(owned.windows[0]!.focus).toHaveBeenCalledOnce()
  await expect(owner.open('https://example.com')).rejects.toThrow('Invalid authorization origin')
  owner.close()
})
