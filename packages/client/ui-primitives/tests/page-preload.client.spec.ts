// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PagePreloader } from '../src/page-preload.ts'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => { vi.spyOn(document, 'hidden', 'get').mockReturnValue(false) })

it('prepares a signed-in page while the client is hidden instead of waiting for its first visit', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  const idle = vi.fn(() => 7)
  vi.stubGlobal('requestIdleCallback', idle)
  const queue = new PagePreloader(), prepare = vi.fn(async () => {})
  const stop = queue.register([{ id: 'skills', priority: 5, prepare }])
  await vi.advanceTimersByTimeAsync(1200)
  expect(prepare).toHaveBeenCalledOnce()
  expect(idle).not.toHaveBeenCalled()
  stop()
})

it('starts preparation when a hidden window never receives its queued idle callback', async () => {
  vi.useFakeTimers()
  let hidden = false
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.stubGlobal('requestIdleCallback', vi.fn(() => 9))
  const cancel = vi.fn(); vi.stubGlobal('cancelIdleCallback', cancel)
  const queue = new PagePreloader(), prepare = vi.fn(async () => {})
  const stop = queue.register([{ id: 'skills', priority: 5, prepare }])
  await vi.advanceTimersByTimeAsync(1200)
  hidden = true
  await vi.advanceTimersByTimeAsync(2000)
  expect(prepare).toHaveBeenCalledOnce()
  expect(cancel).toHaveBeenCalledWith(9)
  stop()
})

it('leaves startup alone, serializes every owner, and spaces background work', async () => {
  vi.useFakeTimers()
  const queue = new PagePreloader(), order: string[] = []
  let finish!: () => void
  const first = new Promise<void>(resolve => { finish = resolve })
  const stopA = queue.register([{ id: 'skills', priority: 40, prepare: async () => { order.push('skills') } }])
  const stopB = queue.register([
    { id: 'tools', priority: 10, prepare: async () => { order.push('tools'); await first } },
    { id: 'profile', priority: 20, prepare: async () => { order.push('profile') } },
  ])
  await vi.advanceTimersByTimeAsync(1199); expect(order).toEqual([])
  await vi.advanceTimersByTimeAsync(1); expect(order).toEqual(['tools'])
  await vi.advanceTimersByTimeAsync(400); expect(order).toEqual(['tools'])
  finish(); await vi.advanceTimersByTimeAsync(349); expect(order).toEqual(['tools'])
  await vi.advanceTimersByTimeAsync(1); expect(order).toEqual(['tools', 'profile'])
  await vi.advanceTimersByTimeAsync(350); expect(order).toEqual(['tools', 'profile', 'skills'])
  stopA(); stopB()
})

it('cancels one account while allowing the replacement and surviving owners to prepare', async () => {
  vi.useFakeTimers()
  const queue = new PagePreloader(), stale = vi.fn(async () => {}), next = vi.fn(async () => {})
  const stop = queue.register([{ id: 'profile', priority: 10, prepare: stale }]); stop()
  const dispose = queue.register([{ id: 'profile', priority: 10, prepare: next }])
  await vi.advanceTimersByTimeAsync(1200)
  expect(stale).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce(); dispose()
})

it('continues after a failure and a timed out page without leaving the queue stuck', async () => {
  vi.useFakeTimers()
  const queue = new PagePreloader(), finish = vi.fn(async () => {})
  const stop = queue.register([
    { id: 'failed', priority: 10, prepare: async () => { throw new Error('unavailable') } },
    { id: 'slow', priority: 20, prepare: () => new Promise<void>(() => {}) },
    { id: 'ready', priority: 30, prepare: finish },
  ])
  await vi.advanceTimersByTimeAsync(1200 + 350 + 30000 + 350)
  expect(finish).toHaveBeenCalledOnce(); stop()
})

it('uses visible browser idle time and cancels queued idle callbacks', async () => {
  vi.useFakeTimers()
  let callback: IdleRequestCallback | null = null
  vi.stubGlobal('requestIdleCallback', vi.fn((next: IdleRequestCallback) => { callback = next; return 7 }))
  const cancel = vi.fn(); vi.stubGlobal('cancelIdleCallback', cancel)
  const queue = new PagePreloader(), prepare = vi.fn(async () => {})
  const stop = queue.register([{ id: 'skills', priority: 10, prepare }])
  await vi.advanceTimersByTimeAsync(1200); expect(prepare).not.toHaveBeenCalled()
  expect(callback).not.toBeNull(); stop(); expect(cancel).toHaveBeenCalledWith(7)
  const invoke=callback as IdleRequestCallback|null
  invoke?.({ didTimeout: false, timeRemaining: () => 10 }); await Promise.resolve()
  expect(prepare).not.toHaveBeenCalled()
})

it('releases a cancelled running preparation so the next account does not wait for it', async () => {
  vi.useFakeTimers()
  const queue = new PagePreloader(), next = vi.fn(async () => {})
  const stop = queue.register([{ id: 'profile', priority: 10, prepare: () => new Promise<void>(() => {}) }])
  await vi.advanceTimersByTimeAsync(1200); stop()
  const dispose = queue.register([{ id: 'profile', priority: 10, prepare: next }])
  await vi.advanceTimersByTimeAsync(350); expect(next).toHaveBeenCalledOnce(); dispose()
})
