import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { smokePackagedMain } from '../scripts/smoke-packaged-main.mjs'

const state = vi.hoisted(() => ({ loadedWindows: 0, responseDelay: 0, exitOnQuit: false, child: undefined as EventEmitter | undefined }))
// Only external process/network/log I/O is replaced; inspector handling and timeout cleanup stay real.
vi.mock('node:child_process', () => ({ spawn: () => state.child = Object.assign(new EventEmitter(), {
  stdout: new PassThrough(), stderr: new PassThrough(),
}) }))
vi.mock('node:net', () => ({ createServer: () => ({ once() {}, listen(_port: number, _host: string, done: () => void) { done() },
  address: () => ({ port: 49000 }), close(done: () => void) { done() },
}) }))
vi.mock('node:fs', () => ({ createWriteStream: () => new PassThrough() }))

const profileRoot = resolve('synthetic-smoke-profile'), resources = resolve('synthetic-smoke/resources')
class InspectorSocket {
  static OPEN = 1
  readyState = 1
  onopen?: () => void
  onerror?: () => void
  onmessage?: (event: { data: string }) => void
  constructor() { queueMicrotask(() => this.onopen?.()) }
  send(data: string) {
    const request = JSON.parse(data) as { id: number; params: { expression: string } }
    const quit = request.params.expression.includes('setTimeout')
    const value = quit ? true : {
      packaged: true, profile: join(profileRoot, 'StudyBuddy-Harness'), appPath: join(resources, 'app.asar'),
      version: '1.0.6', ready: true, loadedWindows: state.loadedWindows,
    }
    const respond = () => {
      this.onmessage?.({ data: JSON.stringify({ id: request.id, result: { result: { value } } }) })
      if (quit && state.exitOnQuit) setTimeout(() => state.child?.emit('exit', 0), 100)
    }
    if (state.responseDelay) setTimeout(respond, state.responseDelay)
    else queueMicrotask(respond)
  }
  close() { this.readyState = 3 }
}
afterEach(() => { state.responseDelay = 0; state.exitOnQuit = false; vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

it.each([0, 1])('keeps the primary startup failure when cleanup also times out (loaded=%i)', async loaded => {
  state.loadedWindows = loaded
  vi.useFakeTimers(); vi.stubEnv('APPDATA', profileRoot)
  vi.stubGlobal('WebSocket', InspectorSocket)
  vi.stubGlobal('fetch', async () => ({ json: async () => [{ webSocketDebuggerUrl: 'ws://synthetic-inspector' }] }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const outcome = smokePackagedMain(resolve('synthetic-smoke/StudyBuddy.exe'), resources, { startupTimeoutMs: 25_000 }).then(() => null, (error: unknown) => error)
  await vi.advanceTimersByTimeAsync(40_000)
  const failure = await outcome
  if (!(failure instanceof Error)) throw Error('Expected the real smoke check to reject')
  expect(failure.message).toContain(loaded ? 'PACKAGED_MAIN_NORMAL_QUIT_REQUIRED' : 'PACKAGED_MAIN_WINDOW_NOT_READY')
})

it('allows an inspector response within the bounded cold-start budget and still requires normal exit', async () => {
  state.loadedWindows = 1; state.responseDelay = 6_000; state.exitOnQuit = true
  vi.useFakeTimers(); vi.stubEnv('APPDATA', profileRoot)
  vi.stubGlobal('WebSocket', InspectorSocket)
  vi.stubGlobal('fetch', async () => ({ json: async () => [{ webSocketDebuggerUrl: 'ws://synthetic-inspector' }] }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const outcome = smokePackagedMain(resolve('synthetic-smoke/StudyBuddy.exe'), resources).then(() => null, (error: unknown) => error)
  await vi.advanceTimersByTimeAsync(40_000)
  expect(await outcome).toBeNull()
})
