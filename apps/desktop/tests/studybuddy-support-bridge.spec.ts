import { expect, it } from 'vitest'
import { parseSupportRequestId, type OwnedScope } from '@studybuddy/contracts'
import { installSupportBridge, type SupportBridgeDependencies, type SupportSender } from '../src/studybuddy/support-bridge.ts'
const owner: OwnedScope = { accountId: '123e4567-e89b-42d3-a456-426614174001', generation: 1 }
const requestId = parseSupportRequestId('123e4567-e89b-42d3-a456-426614174002')
const sender: SupportSender = { id: 1, mainFrame: true, url: 'dsh-app://app/' }
const log = { uploadId: '123e4567-e89b-42d3-a456-426614174003', publicCode: 'LOG-8K2P7M4Q', status: 'AVAILABLE' }
function fixture() {
  const handlers = new Map<string, (sender: SupportSender, args: readonly unknown[]) => Promise<unknown>>()
  let scope: OwnedScope | undefined = owner; let calls = 0; let release: (() => void) | undefined
  const wait = new Promise<void>((resolve) => { release = resolve })
  let delay = false
  const deps: SupportBridgeDependencies = {
    readScope: () => scope, isTrustedSender: event => event.mainFrame && event.id === 1 && event.url === sender.url,
    withSession: async (run) => { if (!scope) throw new Error('AUTH_REQUIRED'); return run({ scope, accessToken: 'fixture-only' }) },
    register: (name, handler) => { handlers.set(name, handler); return () => { handlers.delete(name) } },
    emit: () => {}, pickScreenshots: async () => ['C:/trusted/image.png'],
    native: { useSession: () => {}, subscribeSupportEvents: () => () => {}, invokeSupport: async (_scope, method) => {
      calls++; if (delay) await wait
      if (method === 'uploadSupportLogs' || method === 'getSupportOperation') return { state: 'available', flow: 'logs', requestId, log }
      if (method === 'stageSupportScreenshots') return [{ selectionId: requestId, name: 'image.png', mediaType: 'image/png', bytes: '1024' }]
      throw new Error('unexpected method')
    } },
    diagnostics: { record: () => {}, collect: async () => {}, flush: async () => {}, coverage: () => [],
      revoke: () => {}, dispose: () => {} },
  }
  const bridge = installSupportBridge(deps)
  const channel = (suffix: string) => `studybuddy:support-${suffix}`
  return { bridge, handlers, channel, get calls() { return calls }, delay: () => { delay = true }, release: () => release?.(),
    changeOwner: () => { scope = { ...owner, generation: 2 } }, call: (suffix: string, args: readonly unknown[], event = sender) => {
      const handler = handlers.get(channel(suffix)); if (!handler) throw new Error('missing closed handler'); return handler(event, args)
    } }
}
it('rejects guest, foreign, extra-owner and malformed requests before native work', async () => {
  const f = fixture()
  for (const event of [{ ...sender, mainFrame: false }, { ...sender, id: 2 }, { ...sender, url: 'https://foreign.invalid/' }])
    expect(await f.call('upload', [requestId, 'last_24_hours'], event)).toMatchObject({ ok: false })
  expect(await f.call('upload', [requestId, 'last_24_hours', { owner: 'other' }])).toMatchObject({ ok: false })
  expect(await f.call('upload', ['not-an-id', 'last_24_hours'])).toMatchObject({ ok: false }); expect(f.calls).toBe(0); f.bridge.dispose()
})
it('coalesces double-click uploads and recovers the same owner operation without another upload', async () => {
  const f = fixture(); f.delay(); const first = f.call('upload', [requestId, 'last_24_hours'])
  const second = f.call('upload', [requestId, 'last_24_hours']); await Promise.resolve(); f.release()
  expect(await first).toMatchObject({ ok: true, data: { state: 'available', log } }); await second; expect(f.calls).toBe(1)
  expect(await f.call('operation', [requestId])).toMatchObject({ ok: true, data: { state: 'available' } }); expect(f.calls).toBe(1)
  f.bridge.dispose()
})
it('drops a late completion after revocation and strips picker paths from the renderer result', async () => {
  const f = fixture(); const selected = await f.call('screenshots', []); expect(selected).toMatchObject({ ok: true, data: [{ name: 'image.png' }] })
  expect(JSON.stringify(selected)).not.toContain('C:/'); f.delay(); const uploading = f.call('upload', [requestId, 'last_24_hours'])
  await Promise.resolve(); f.changeOwner(); f.bridge.revoke(); f.release(); expect(await uploading).toMatchObject({ ok: false })
  f.bridge.dispose(); expect(f.handlers.size).toBe(0)
})
