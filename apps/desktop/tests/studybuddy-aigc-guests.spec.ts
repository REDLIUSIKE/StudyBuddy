import { it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import type { BrowserWindow, Session, WebContents } from 'electron'
import { StudyBuddyEmbeddedGuests } from '../src/studybuddy/embedded-guests.ts'
import type { MainSession } from '../src/studybuddy/services.ts'
import { communityNavigationAllowed } from '../src/studybuddy/community-routes.ts'

it.each([{ target: 'aigc', writeAllowed: true }, { target: 'skills', writeAllowed: true },
  { target: 'zhilian', writeAllowed: false }] as const)('limits clipboard writes to the live foreground permitted main frame ($target)', async ({ target, writeAllowed }) => {
  const scope = { accountId: 'clipboard-account', generation: 1 }
  const origin = target === 'aigc' ? 'http://127.0.0.1:43219' : 'https://guijitongzhuo.com'
  const entry = origin + (target === 'skills' ? '/skills?embed=desktop' : target === 'zhilian' ? '/leaderboards' : '/')
  let current: typeof scope | null = scope, invalidated = false
  type PermissionCheck = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
  type PermissionRequest = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
  let check!: PermissionCheck, request!: PermissionRequest
  const browserSession = Object.assign(Object.create(null) as Session, {
    setPermissionRequestHandler(handler: PermissionRequest) { request = handler },
    setPermissionCheckHandler(handler: PermissionCheck) { check = handler },
    setDevicePermissionHandler() {}, setDisplayMediaRequestHandler() {}, on() {},
    webRequest: { onBeforeRequest() {} }, clearStorageData: async () => {}, clearCache: async () => {},
  })
  const owner = Object.assign(new EventEmitter(), { id: 52, isDestroyed: () => false }) as WebContents
  const allowed = (value: string) => !invalidated && (target === 'aigc'
    ? URL.canParse(value) && new URL(value).origin === origin : communityNavigationAllowed(target, value))
  const manager = new StudyBuddyEmbeddedGuests({ scope: () => current,
    withSession: async <T>(run: (session: MainSession) => Promise<T>) => run({ scope, accessToken: 'not-used' }) },
  async () => { throw Error('PUBLIC_EXCHANGE_FORBIDDEN') }, () => browserSession, undefined, undefined, {
    target, validateEntry: value => String(value), navigationAllowed: allowed,
    issue: async () => ({ entryUrl: entry, requestAllowed: allowed }),
  })
  const lease = await manager.acquire(owner), initial = 'about:blank#studybuddy-' + target + '-' + lease.lease
  let page = initial, destroyed = false
  const guest = Object.assign(new EventEmitter(), { id: 53, getURL: () => page, isDestroyed: () => destroyed,
    setWindowOpenHandler() {}, executeJavaScript: async () => {},
    close() { destroyed = true; guest.emit('destroyed') },
  }) as unknown as WebContents
  const details = { requestingUrl: entry, isMainFrame: true }
  const requested = (permission: Parameters<PermissionRequest>[1], frame = details, contents = guest) => {
    let granted = false
    request(contents, permission, (result) => { granted = result }, frame)
    return granted
  }
  try {
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
    manager.bind({ webContents: owner } as BrowserWindow, () => () => {}, () => false)
    owner.emit('will-attach-webview', { preventDefault() {} }, {}, { src: initial, partition: lease.partition })
    owner.emit('did-attach-webview', {}, guest); guest.emit('dom-ready')
    page = details.requestingUrl
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
    await manager.setVisible(owner, lease.lease, true)
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(writeAllowed)
    expect(requested('clipboard-sanitized-write')).toBe(writeAllowed)
    for (const permission of ['clipboard-read', 'deprecated-sync-clipboard-read', 'media', 'display-capture', 'notifications'] as const) {
      expect(check(guest, permission, origin, details)).toBe(false)
      expect(requested(permission)).toBe(false)
    }
    const stranger = Object.assign(new EventEmitter(), { getURL: () => page, isDestroyed: () => false }) as WebContents
    expect(check(stranger, 'clipboard-sanitized-write', origin, details)).toBe(false)
    expect(requested('clipboard-sanitized-write', details, stranger)).toBe(false)
    expect(check(null, 'clipboard-sanitized-write', origin, details)).toBe(false)
    expect(check(guest, 'clipboard-sanitized-write', origin, { isMainFrame: true })).toBe(false)
    expect(check(guest, 'clipboard-sanitized-write', 'http://127.0.0.1:43220', details)).toBe(false)
    for (const frame of [{ ...details, isMainFrame: false }, { ...details, requestingUrl: 'http://127.0.0.1:43220/' },
      { ...details, requestingUrl: 'https://foreign.example/' }, { ...details, requestingUrl: 'blob:' + origin + '/foreign-frame' }]) {
      expect(check(guest, 'clipboard-sanitized-write', origin, frame)).toBe(false)
      expect(requested('clipboard-sanitized-write', frame)).toBe(false)
    }
    page = 'http://127.0.0.1:43220/'
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
    page = details.requestingUrl
    await manager.setVisible(owner, lease.lease, false)
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
    expect(requested('clipboard-sanitized-write')).toBe(false)
    await manager.setVisible(owner, lease.lease, true)
    current = { ...scope, generation: 2 }
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
    expect(requested('clipboard-sanitized-write')).toBe(false)
    current = scope; invalidated = true
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
    invalidated = false
    await manager.release(owner, lease.lease)
    expect(check(guest, 'clipboard-sanitized-write', origin, details)).toBe(false)
  } finally { await manager.revoke() }
})

it('admits only an issued AIGC origin, injects scoped headers privately and leaves no secret in leases', async () => {
  const scope = { accountId: 'guest-account', generation: 1 }, origin = 'http://127.0.0.1:43219'
  let revoked = false
  let request!: (details: { url: string }, callback: (result: { cancel: boolean }) => void) => void
  let headers!: (details: { url: string; requestHeaders: Record<string, string> },
    callback: (result: { requestHeaders: Record<string, string> }) => void) => void
  const browserSession = Object.assign(Object.create(null) as Session, {
    setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {},
    setDisplayMediaRequestHandler() {}, on() {},
    webRequest: { onBeforeRequest(value: typeof request) { request = value },
      onBeforeSendHeaders(value: typeof headers) { headers = value } },
    clearStorageData: async () => {}, clearCache: async () => {},
  })
  const owner = Object.assign(new EventEmitter(), { id: 51, isDestroyed: () => false }) as WebContents
  const allowed = (value: string) => URL.canParse(value) && new URL(value).origin === origin
  const manager = new StudyBuddyEmbeddedGuests({ scope: () => revoked ? null : scope,
    withSession: async <T>(run: (session: MainSession) => Promise<T>) => run({ scope, accessToken: 'not-used' }) },
  async () => { throw Error('PUBLIC_EXCHANGE_FORBIDDEN') }, () => browserSession, undefined, undefined, {
    target: 'aigc', validateEntry: value => String(value), navigationAllowed: allowed,
    issue: async () => ({ entryUrl: origin + '/', requestAllowed: allowed,
      requestHeaders: value => allowed(value) && !revoked ? { 'X-StudyBuddy-Aigc-Guest': 'private-guest-authority' } : {} }),
  })
  const lease = await manager.acquire(owner)
  expect(JSON.stringify(lease)).not.toContain('private-guest-authority')
  const admission = (url: string) => { let cancel = true; request({ url }, (value) => { cancel = value.cancel }); return cancel }
  expect(admission(origin + '/api/settings/get')).toBe(false)
  expect(admission('http://127.0.0.1:43220/api/settings/get')).toBe(true)
  expect(admission('https://foreign.example')).toBe(true)
  let result: Record<string, string> = {}
  headers({ url: origin + '/', requestHeaders: {} }, (value) => { result = value.requestHeaders })
  expect(result['X-StudyBuddy-Aigc-Guest']).toBe('private-guest-authority')
  revoked = true
  headers({ url: origin + '/', requestHeaders: {} }, (value) => { result = value.requestHeaders })
  expect(result).toEqual({})
  await manager.revoke()
})
