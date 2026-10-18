import { EventEmitter } from 'node:events'
import { expect, it } from 'vitest'
import type { BrowserWindow, Session, WebContents } from 'electron'
import { StudyBuddyEmbeddedGuests } from '../src/studybuddy/embedded-guests.ts'
import type { MainSession } from '../src/studybuddy/services.ts'

async function setup(target: 'research' | 'aigc' | 'skills' | 'zhilian' = 'research', entry = 'http://127.0.0.1:43219/') {
  const scope = { accountId: 'microphone-account', generation: 1 }, origin = new URL(entry).origin
  let current: typeof scope | null = scope, focused = true, destroyed = false, ownerDestroyed = false, invalidated = false
  type Check = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
  type Request = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
  let check!: Check, request!: Request, device!: (details: unknown) => boolean, display!: (request: unknown, callback: (streams: unknown) => void) => void
  const browserSession = Object.assign(Object.create(null) as Session, {
    setPermissionCheckHandler(handler: Check) { check = handler }, setPermissionRequestHandler(handler: Request) { request = handler },
    setDevicePermissionHandler(handler: typeof device) { device = handler }, setDisplayMediaRequestHandler(handler: typeof display) { display = handler },
    on() {}, webRequest: { onBeforeRequest() {} }, clearStorageData: async () => {}, clearCache: async () => {},
  })
  const owner = Object.assign(new EventEmitter(), { id: 162, isDestroyed: () => ownerDestroyed }) as WebContents
  const allowed = (value: string) => !invalidated && URL.canParse(value) && new URL(value).origin === origin
  const manager = new StudyBuddyEmbeddedGuests({ scope: () => current,
    withSession: async <T>(run: (session: MainSession) => Promise<T>) => run({ scope, accessToken: 'not-used' }) },
    async () => { throw Error('PUBLIC_EXCHANGE_FORBIDDEN') }, () => browserSession, undefined, undefined,
    { target, validateEntry: value => String(value), navigationAllowed: allowed, issue: async () => ({ entryUrl: entry, requestAllowed: allowed }) })
  const lease = await manager.acquire(owner), initial = `about:blank#studybuddy-${target}-${lease.lease}`
  let page = initial
  const guest = Object.assign(new EventEmitter(), { id: 163, getURL: () => page, isDestroyed: () => destroyed, isFocused: () => focused,
    setWindowOpenHandler() {}, executeJavaScript: async () => {}, close() { destroyed = true; guest.emit('destroyed') } }) as unknown as WebContents
  const details = { isMainFrame: true, requestingUrl: entry, securityOrigin: origin }
  const requested = (extra: Record<string, unknown> = {}, permission: Parameters<Request>[1] = 'media', contents = guest) => {
    let granted = false
    request(contents, permission, result => { granted = result }, { ...details, mediaTypes: ['audio'], ...extra } as Parameters<Request>[3])
    return granted
  }
  const attach = async () => {
    manager.bind({ webContents: owner } as BrowserWindow, () => () => {}, () => false)
    owner.emit('will-attach-webview', { preventDefault() {} }, {}, { src: initial, partition: lease.partition })
    owner.emit('did-attach-webview', {}, guest); guest.emit('dom-ready'); page = entry
    await manager.setVisible(owner, lease.lease, true)
  }
  return { manager, lease, owner, guest, origin, entry, details, check: (...args: Parameters<Check>) => check(...args), requested,
    device: () => device({}), display: () => { let result: unknown; display({}, streams => { result = streams }); return result }, attach,
    page: (value: string) => { page = value }, focus: (value: boolean) => { focused = value }, destroy: () => { destroyed = true },
    destroyOwner: () => { ownerDestroyed = true }, account: (value: typeof current) => { current = value }, invalidate: () => { invalidated = true }, scope }
}
it('admits audio only for the owned attached visible focused Research entry in both Electron gates', async () => {
  const f = await setup()
  try {
    const details = { ...f.details, mediaType: 'audio' as const }
    expect(f.check(f.guest, 'media', f.origin, details)).toBe(false); expect(f.requested()).toBe(false)
    await f.attach()
    expect(f.check(f.guest, 'media', f.origin, details)).toBe(true); expect(f.requested()).toBe(true)
    expect(f.device()).toBe(false); expect(f.display()).toEqual({})
    for (const permission of ['display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'usb', 'hid', 'serial'] as const) {
      expect(f.check(f.guest, permission, f.origin, details)).toBe(false); expect(f.requested({}, permission)).toBe(false)
    }
  } finally { await f.manager.revoke() }
})
it('denies video, mixed or unknown media, subframes and forged origins or entry URLs', async () => {
  const f = await setup()
  try {
    await f.attach()
    for (const mediaTypes of [undefined, [], ['video'], ['audio', 'video'], ['audio', 'audio'], ['unknown']]) expect(f.requested({ mediaTypes })).toBe(false)
    expect(f.check(f.guest, 'media', f.origin, f.details)).toBe(false)
    for (const mediaType of ['video', 'unknown'] as const) expect(f.check(f.guest, 'media', f.origin, { ...f.details, mediaType })).toBe(false)
    expect(f.requested({ requestingUrl: undefined })).toBe(false)
    expect(f.check(f.guest, 'media', f.origin, { isMainFrame: true, securityOrigin: f.origin, mediaType: 'audio' })).toBe(false)
    for (const frame of [{ isMainFrame: false }, { requestingUrl: 'http://127.0.0.1:43220/' },
      { requestingUrl: f.origin + '/office' }, { requestingUrl: f.entry + '?forged=1' }, { requestingUrl: 'blob:' + f.entry + 'foreign' },
      { securityOrigin: 'http://127.0.0.1:43220' }]) {
      expect(f.requested(frame)).toBe(false)
      expect(f.check(f.guest, 'media', f.origin, { ...f.details, mediaType: 'audio', ...frame })).toBe(false)
    }
    expect(f.check(f.guest, 'media', 'http://127.0.0.1:43220', { ...f.details, mediaType: 'audio' })).toBe(false)
    expect(f.check(null, 'media', f.origin, { ...f.details, mediaType: 'audio' })).toBe(false)
    const stranger = Object.assign(new EventEmitter(), { getURL: () => f.entry, isFocused: () => true, isDestroyed: () => false }) as WebContents
    expect(f.check(stranger, 'media', f.origin, { ...f.details, mediaType: 'audio' })).toBe(false); expect(f.requested({}, 'media', stranger)).toBe(false)
    f.page(f.origin + '/office'); expect(f.requested()).toBe(false)
  } finally { await f.manager.revoke() }
})
it('fences background, changed account, invalidated and released Research guests', async () => {
  const f = await setup(), details = { ...f.details, mediaType: 'audio' as const }
  try {
    await f.attach(); f.focus(false); expect(f.requested()).toBe(false); expect(f.check(f.guest, 'media', f.origin, details)).toBe(false)
    f.focus(true); await f.manager.setVisible(f.owner, f.lease.lease, false); expect(f.requested()).toBe(false)
    await f.manager.setVisible(f.owner, f.lease.lease, true)
    for (const scope of [null, { ...f.scope, generation: 2 }, { ...f.scope, accountId: 'different' }]) {
      f.account(scope); expect(f.requested()).toBe(false); expect(f.check(f.guest, 'media', f.origin, details)).toBe(false)
    }
    f.account(f.scope); f.invalidate(); expect(f.requested()).toBe(false)
    await f.manager.release(f.owner, f.lease.lease); expect(f.requested()).toBe(false)
  } finally { await f.manager.revoke() }
})
it.each(['aigc', 'skills', 'zhilian'] as const)('does not grant microphone access to another embedded target (%s)', async target => {
  const f = await setup(target)
  try { await f.attach(); expect(f.requested()).toBe(false); expect(f.check(f.guest, 'media', f.origin, { ...f.details, mediaType: 'audio' })).toBe(false) }
  finally { await f.manager.revoke() }
})
it.each(['https://guijitongzhuo.com/', 'http://localhost:43219/', 'http://127.0.0.1/', 'http://user@127.0.0.1:43219/'])('refuses a noncanonical Research entry (%s)', async entry => {
  const f = await setup('research', entry)
  try { await f.attach(); expect(f.requested()).toBe(false) } finally { await f.manager.revoke() }
})
