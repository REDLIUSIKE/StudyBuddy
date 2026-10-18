// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createSupportPreload } from '../src/studybuddy/support-preload.ts'
const electron = vi.hoisted(() => ({ contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn() } }))
vi.mock('electron', () => electron)
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
it('exposes closed support actions without a path, token or generic method proxy', () => {
  const api = createSupportPreload({ invoke: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED' } }),
    on: () => {}, off: () => {} })
  expect(Object.keys(api).sort()).toEqual(['getOperation', 'preview', 'readPreviousExit', 'selectScreenshots', 'submitIssue', 'subscribe', 'uploadLogs'])
  expect(Reflect.has(api, 'invoke')).toBe(false); expect(Reflect.has(api, 'stagePaths')).toBe(false)
})
it.each(['dsh-app://app/', 'dsh-app://shell/welcome.html', 'https://guijitongzhuo.com/skills?embed=desktop'])('exposes support only to the owned local application, not %s guests', async (url) => {
  vi.stubGlobal('location', new URL(url)); vi.stubGlobal('process', { ...process, isMainFrame: true })
  const { exposeStudyBuddy } = await import('../src/studybuddy/preload.ts'); exposeStudyBuddy()
  const exposed: unknown = electron.contextBridge.exposeInMainWorld.mock.calls.find(([name]) => name === 'studybuddy')?.[1]
  expect(Boolean(exposed && typeof exposed === 'object' && Reflect.has(exposed, 'support'))).toBe(url === 'dsh-app://app/')
})
