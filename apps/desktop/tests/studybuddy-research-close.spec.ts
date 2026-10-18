import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, Session, WebContents } from 'electron'
import { expect, it } from 'vitest'
import { StudyBuddyResearch } from '../src/studybuddy/research.ts'
import { ResearchBridge } from '../src/studybuddy/research-bridge.ts'
import { accountResearchDirectory, type ResearchRuntime } from '../src/studybuddy/research-runtime.ts'
import { RESEARCH_IPC } from '../src/studybuddy/research-types.ts'

it('closing the last owned guest tab clears the composer and never binds a replacement, including after project re-entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-close-')), scope = { accountId: 'close-fixture', generation: 1 }, hostGeneration = randomUUID()
  const folder = join(accountResearchDirectory(root, scope.accountId), 'projects/study')
  await mkdir(join(folder, 'sandbox'), { recursive: true }); await writeFile(join(folder, 'project.json'), '{"id":"study"}')
  await writeFile(join(folder, 'original-history.log'), 'Preserve this original native history.\n')
  let current: typeof scope | null = scope
  const nativeCalls: string[] = [], notices: unknown[] = []
  const bridge = new ResearchBridge({ userDataRoot: root, isCurrent: candidate => current?.accountId === candidate.accountId && current.generation === candidate.generation,
    hostContext: () => ({ scope, hostGeneration }), command: async (action, data) => {
      nativeCalls.push(action)
      return action === 'bind' ? { ...data as object, workspaceId: 'workspace-study' } : null
    } })
  const origin = 'http://127.0.0.1:41513', owner = Object.assign(new EventEmitter(), { id: 911, isDestroyed: () => false, send: (_channel: string, value: unknown) => { notices.push(value) } }) as unknown as WebContents
  const browserSession = Object.assign(Object.create(null) as Session, { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {}, setDisplayMediaRequestHandler() {}, on() {}, webRequest: { onBeforeRequest() {}, onBeforeSendHeaders() {} }, clearStorageData: async () => {}, clearCache: async () => {} })
  const runtime = { ensure: async () => ({ origin }), requestHeaders: (_scope: unknown, url: string) => URL.canParse(url) && new URL(url).origin === origin ? { 'X-StudyBuddy-Research-Guest': 'fixture' } : {}, revoke: async () => {} } as unknown as ResearchRuntime
  const research = new StudyBuddyResearch({ userDataRoot: root, auth: { scope: () => current, withSession: async run => run({ scope, accessToken: 'fixture-not-forwarded' }) }, runtime, bridge, preload: 'owned-preload', fromPartition: () => browserSession })
  const handlers = new Map<string, Parameters<IpcMain['handle']>[1]>()
  const ipc = { handle: (name: string, handler: Parameters<IpcMain['handle']>[1]) => { handlers.set(name, handler) } } as IpcMain
  research.register(ipc, () => {})
  const lease = (await handlers.get(RESEARCH_IPC.acquire)!({ sender: owner } as IpcMainInvokeEvent)).data
  research.bind({ webContents: owner } as BrowserWindow, () => () => {}, () => false)
  let page = 'about:blank#studybuddy-research-' + lease.lease
  const frame = { url: origin + '/' }, guest = Object.assign(new EventEmitter(), { id: 912, mainFrame: frame, getURL: () => page, isDestroyed: () => false, hostWebContents: owner, setWindowOpenHandler() {}, executeJavaScript: async () => {}, close() { guest.emit('destroyed') } }) as unknown as WebContents
  owner.emit('did-attach-webview', {}, guest); guest.emit('dom-ready'); page = frame.url
  const request = handlers.get(RESEARCH_IPC.guestAction)!, event = { sender: guest, senderFrame: frame } as unknown as IpcMainInvokeEvent
  try {
    const first = await request(event, { kind: 'open-project', projectId: 'study' })
    expect(first.ok).toBe(true); const sessionId = first.data.sessionId as string, before = [...nativeCalls]
    const closed = await request(event, { kind: 'close-chat', projectId: 'study', sessionId })
    expect(closed).toEqual({ ok: true, data: { projectId: 'study', sessionId: null, chats: [{ sessionId, label: '研究对话 1', closed: true }], intents: [] } })
    expect(notices.at(-1)).toMatchObject({ action: { kind: 'close-chat' }, data: { projectId: 'study', sessionId: null } })
    expect((await request(event, { kind: 'open-project', projectId: 'study' })).data).toEqual(closed.data)
    await expect(bridge.bind(scope, 'study')).rejects.toThrow('RESEARCH_CHAT_NOT_SELECTED')
    expect(await request(event, { kind: 'draft', projectId: 'study', text: 'Do not open a replacement.', references: [] })).toEqual({ ok: false, error: { code: 'RESEARCH_CHAT_NOT_SELECTED' } })
    expect(nativeCalls).toEqual(before)
    const reopened = await request(event, { kind: 'select-chat', projectId: 'study', sessionId })
    expect(reopened.data.sessionId).toBe(sessionId); expect(reopened.data.chats).toHaveLength(1)
    const next = await request(event, { kind: 'new-chat', projectId: 'study' })
    expect(next.data.chats).toHaveLength(2); expect(next.data.sessionId).not.toBe(sessionId)
    expect(await readFile(join(folder, 'original-history.log'), 'utf8')).toBe('Preserve this original native history.\n')
    current = null
    expect((await request(event, { kind: 'close-chat', projectId: 'study', sessionId: next.data.sessionId })).ok).toBe(false)
  } finally { await research.revoke(); await rm(root, { recursive: true, force: true }) }
})
