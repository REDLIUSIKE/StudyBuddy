/** StudyBuddy owns the signed-out login window; upstream account onboarding is not part of startup. */
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  events: [] as string[],
  options: undefined as Record<string, unknown> | undefined,
  setWindowOpenHandler: vi.fn(),
  on: vi.fn(),
  loadURL: vi.fn<(url: string) => Promise<void>>(),
  show: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getAppPath: () => 'C:\\fixture-app' },
  BrowserWindow: class {
    readonly webContents = {
      setWindowOpenHandler: state.setWindowOpenHandler,
      on: state.on,
    }

    constructor(options: Record<string, unknown>) {
      state.options = options
      state.events.push('construct')
    }

    async loadURL(url: string): Promise<void> {
      state.events.push('load')
      await state.loadURL(url)
    }

    show(): void {
      state.events.push('show')
      state.show()
    }

    destroy(): void {
      state.events.push('destroy')
      state.destroy()
    }
  },
}))

vi.mock('../src/welcome-window.ts', () => ({
  welcomeWindowOptions: () => ({
    show: false,
    width: 560,
    height: 640,
    webPreferences: { contextIsolation: true, sandbox: true },
  }),
}))

import { openStudyBuddyLogin } from '../src/studybuddy/login-window.ts'

beforeEach(() => {
  state.events.length = 0
  state.options = undefined
  state.setWindowOpenHandler.mockReset()
  state.on.mockReset()
  state.loadURL.mockReset().mockResolvedValue(undefined)
  state.show.mockReset()
  state.destroy.mockReset()
})

it('creates the owned login window before loading and keeps navigation inside the shell', async () => {
  const created = vi.fn(() => { state.events.push('created') })
  const window = await openStudyBuddyLogin({ id: 'zh-CN' } as never, created)

  expect(created).toHaveBeenCalledExactlyOnceWith(window)
  expect(state.events).toEqual(['construct', 'created', 'load', 'show'])
  expect(state.options).toMatchObject({
    show: false,
    icon: join('C:\\fixture-app', 'resources/icon-windows.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  expect(state.loadURL).toHaveBeenCalledExactlyOnceWith('dsh-app://shell/welcome.html')
  expect(state.show).toHaveBeenCalledOnce()
  expect(state.destroy).not.toHaveBeenCalled()

  const popupPolicy = state.setWindowOpenHandler.mock.calls[0]?.[0] as () => unknown
  expect(popupPolicy()).toEqual({ action: 'deny' })
  const navigation = state.on.mock.calls.find(([name]) => name === 'will-navigate')?.[1] as
    ((event: { preventDefault(): void }) => void) | undefined
  const preventDefault = vi.fn()
  navigation?.({ preventDefault })
  expect(preventDefault).toHaveBeenCalledOnce()
})

it('destroys a login window whose shell document cannot load', async () => {
  state.loadURL.mockRejectedValueOnce(new Error('login document unavailable'))

  await expect(openStudyBuddyLogin({ id: 'zh-CN' } as never, vi.fn()))
    .rejects.toThrow('login document unavailable')
  expect(state.events).toEqual(['construct', 'load', 'destroy'])
  expect(state.destroy).toHaveBeenCalledOnce()
  expect(state.show).not.toHaveBeenCalled()
})
