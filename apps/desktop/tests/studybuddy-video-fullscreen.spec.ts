import { EventEmitter } from 'node:events'
import type { BrowserWindow, Session, WebContents } from 'electron'
import { expect, it, vi } from 'vitest'
import { StudyBuddyEmbeddedGuests } from '../src/studybuddy/embedded-guests.ts'
import type { MainSession } from '../src/studybuddy/services.ts'

it('permits fullscreen only for the owned visible video editor main frame and current account', async () => {
  let scope = { accountId: 'video-account', generation: 1 }
  const owner = Object.assign(new EventEmitter(), { id: 41, isDestroyed: () => false, getURL: () => 'dsh-app://app/' }) as WebContents
  const request = vi.fn<Session['setPermissionRequestHandler']>(), check = vi.fn<Session['setPermissionCheckHandler']>()
  const session = Object.assign(Object.create(null) as Session, {
    setPermissionRequestHandler: request, setPermissionCheckHandler: check, setDevicePermissionHandler() {},
    setDisplayMediaRequestHandler() {}, on() {}, webRequest: { onBeforeRequest() {} },
    clearStorageData: async () => {}, clearCache: async () => {},
  })
  const entry = 'http://127.0.0.1:5678/'
  const manager = new StudyBuddyEmbeddedGuests({ scope: () => scope,
    withSession: async <T>(run: (value: MainSession) => Promise<T>) => run({ scope, accessToken: 'synthetic-access' }),
  }, vi.fn(), () => session, undefined, undefined, {
    target: 'video', validateEntry: value => String(value),
    navigationAllowed: value => value.startsWith(entry), issue: async () => ({ entryUrl: entry }),
  })
  const lease = await manager.acquire(owner)
  let url = 'about:blank#studybuddy-video-' + lease.lease
  const guest = Object.assign(new EventEmitter() as WebContents, { getURL: () => url, isDestroyed: () => false,
    executeJavaScript: async () => undefined, setWindowOpenHandler() {}, close() { guest.emit('destroyed') },
  })
  manager.bind({ webContents: owner } as BrowserWindow, () => () => {}, () => false)
  owner.emit('did-attach-webview', {}, guest); guest.emit('dom-ready'); url = entry + 'projects/project-one'
  await manager.setVisible(owner, lease.lease, true)
  const ask = request.mock.calls[0]![0]!, inspect = check.mock.calls[0]![0]!, done = vi.fn()
  const details = { isMainFrame: true, requestingUrl: url }
  ask(guest, 'fullscreen', done, details)
  expect(done).toHaveBeenLastCalledWith(true)
  expect(inspect(guest, 'fullscreen', new URL(entry).origin, details)).toBe(true)
  for (const [contents, permission, data] of [
    [guest, 'fullscreen', { ...details, isMainFrame: false }],
    [guest, 'fullscreen', { ...details, requestingUrl: 'http://localhost:5679/p/film.html' }],
    [guest, 'fullscreen', { ...details, requestingUrl: 'https://example.com/' }],
    [owner, 'fullscreen', details], [guest, 'media', details], [guest, 'automatic-fullscreen', details],
  ] as const) { ask(contents, permission, done, data); expect(done).toHaveBeenLastCalledWith(false) }
  expect(inspect(null, 'fullscreen', new URL(entry).origin, details)).toBe(false)
  expect(inspect(guest, 'fullscreen', 'https://example.com', details)).toBe(false)
  await manager.setVisible(owner, lease.lease, false)
  ask(guest, 'fullscreen', done, details); expect(done).toHaveBeenLastCalledWith(false)
  await manager.setVisible(owner, lease.lease, true)
  scope = { ...scope, generation: 2 }
  ask(guest, 'fullscreen', done, details); expect(done).toHaveBeenLastCalledWith(false)
  await manager.revoke()
})
