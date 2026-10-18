import { vi, type Mock } from 'vitest'
import { EventEmitter } from 'node:events'
import type { BrowserWindow, Session, WebContentsView, IpcMainInvokeEvent } from 'electron'
import { ToolCenterViews } from '../../src/studybuddy/tool-center-views.ts'
interface ToolViewFixture {
  views: ToolCenterViews
  view: WebContentsView
  owner: BrowserWindow
  browserSession: Session
  create: Mock<(options: ConstructorParameters<typeof WebContentsView>[0]) => WebContentsView>
  invalid: Mock
  released: Mock
  wc: EventEmitter & {
    mainFrame: { routingId: number; url: string }
    id: number
    getURL(): string
    isDestroyed(): boolean
    close(): void
  }
  event: IpcMainInvokeEvent
  setScope(scope: { accountId: string; generation: number } | undefined): void
}
export function toolViewFixture(
  summary?: () => Promise<import('@studybuddy/contracts').AiAccountSummary | null>,
): ToolViewFixture {
  let scope: { accountId: string; generation: number } | undefined = { accountId: 'fixture-a', generation: 1 }
  const mainFrame = { routingId: 2, url: 'dsh-tools://tool-center/index.html' }
  let destroyed = false
  const wc = Object.assign(new EventEmitter(), {
    id: 3,
    mainFrame,
    getURL: () => mainFrame.url,
    isDestroyed: () => destroyed,
    loadURL: vi.fn(async () => {}),
    setWindowOpenHandler: vi.fn(),
    send: vi.fn(),
    close: () => {
      destroyed = true
      wc.emit('destroyed')
    },
  })
  const view = Object.assign(Object.create(null) as WebContentsView, {
    webContents: wc,
    setBounds: vi.fn(),
    setVisible: vi.fn(),
  })
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: Object.assign(new EventEmitter(), { getZoomFactor: () => 1.25 }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    getContentBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
  }) as unknown as BrowserWindow
  const browserSession = Object.assign(Object.create(null) as Session, {
    protocol: { handle: vi.fn() },
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    on: vi.fn(),
    webRequest: { onBeforeRequest: vi.fn() },
    clearStorageData: vi.fn(async () => {}),
    clearCache: vi.fn(async () => {}),
  })
  const create = vi.fn((_options: ConstructorParameters<typeof WebContentsView>[0]) => view),
    invalid = vi.fn(),
    released = vi.fn()
  const views = new ToolCenterViews({
    scope: () => scope,
    owner: () => owner,
    runtime: async () => ({
      directory: 'fixture-root',
      companion: 'native',
      sourceHead: 'a'.repeat(40),
      files: {},
      module: { moduleId: 'sha256:' + 'b'.repeat(64), entry: 'index.html', files: { 'index.html': 'c'.repeat(64) } },
    }),
    create,
    session: () => browserSession,
    preload: 'fixed-preload.cjs',
    invalidated: invalid,
    released,
    ...(summary ? { summary } : {}),
  })
  return {
    views,
    wc,
    view,
    owner,
    create,
    invalid,
    released,
    browserSession,
    event: { sender: wc, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent,
    setScope: (next: typeof scope) => {
      scope = next
    },
  }
}
