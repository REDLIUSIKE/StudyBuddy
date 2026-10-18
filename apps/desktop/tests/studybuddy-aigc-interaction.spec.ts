import { EventEmitter } from 'node:events'
import type { IpcMain, Session, WebContents } from 'electron'
import { expect, it } from 'vitest'
import { StudyBuddyAigc } from '../src/studybuddy/aigc.ts'
import { AIGC_IPC } from '../src/studybuddy/aigc-types.ts'
import type { AigcBridge } from '../src/studybuddy/aigc-bridge.ts'
import type { HarnessAigcContextV1 } from '@studybuddy/contracts'

it('waits for the owning shell native Session, rejects foreign acknowledgements and cancels on lease release', async () => {
  const scope = { accountId: 'a', generation: 1 }, notices: any[] = [], handlers = new Map<string, (...args: any[]) => Promise<any>>()
  const owner = Object.assign(new EventEmitter(), { id: 71, isDestroyed: () => false, send: (_name: string, data: unknown) => { notices.push(data) } }) as unknown as WebContents
  const browserSession = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {}, setDisplayMediaRequestHandler() {}, on() {}, webRequest: { onBeforeRequest() {}, onBeforeSendHeaders() {} }, clearStorageData: async () => {}, clearCache: async () => {} } as unknown as Session
  let present: Parameters<AigcBridge['setQuestionPresenter']>[0] | undefined
  const bridge = { setQuestionPresenter: (value: typeof present) => { present = value }, revoke: async () => {} } as unknown as AigcBridge
  const app = new StudyBuddyAigc({ auth: { scope: () => scope, withSession: async run => run({ scope, accessToken: 'unused' }) },
    runtime: { ensure: async () => ({ origin: 'http://127.0.0.1:43219' }), requestHeaders: () => ({ 'x-studybuddy-aigc-guest': 'not-exported' }), revoke: async () => {} }, bridge, fromPartition: () => browserSession })
  app.register({ handle: (name: string, callback: Parameters<IpcMain['handle']>[1]) => { handlers.set(name, callback) } } as unknown as IpcMain, event => { if (event.sender !== owner) throw Error('OWNER_DENIED') })
  const invoke = (name: string, data?: unknown, sender = owner) => handlers.get(name)!({ sender }, data)
  const context = { scope, hostGeneration: '00000000-0000-4000-8000-000000000001', lease: '00000000-0000-4000-8000-000000000002', projectId: 'aigc-' + 'a'.repeat(48), workspaceId: 'helper', sessionId: 'session-00000000-0000-4000-8000-000000000003' } as HarnessAigcContextV1
  let cancelled = 0
  try {
    const acquired = await invoke(AIGC_IPC.acquire); expect(acquired.ok).toBe(true)
    const pending = present!(context, new AbortController().signal, () => { cancelled++ })
    await expect.poll(() => notices[0]?.data.active).toBe(true)
    const id = notices[0].data.id
    expect((await invoke(AIGC_IPC.interactionReady, id, { id: 72 } as WebContents)).ok).toBe(false)
    expect((await invoke(AIGC_IPC.interactionReady, id)).ok).toBe(true)
    const close = await pending; close(); expect(notices.at(-1).data.active).toBe(false)
    const next = present!(context, new AbortController().signal, () => { cancelled++ }); void next.catch(() => {})
    await invoke(AIGC_IPC.release, acquired.data.lease)
    await expect(next).rejects.toThrow('AIGC_QUESTION_SURFACE_CLOSED'); expect(cancelled).toBe(2)
  } finally { await app.revoke() }
})
