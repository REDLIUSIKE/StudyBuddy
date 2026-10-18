import { expect, it, vi } from 'vitest'
import { settleCleanup } from '../src/settle-cleanup.ts'

it('does not quit after one cleanup fails while Skill and Host are still stopping', async () => {
  let stopSkill!: () => void, stopHost!: () => void
  const skillExit = new Promise<void>((resolve) => { stopSkill = resolve }),
    hostExit = new Promise<void>((resolve) => { stopHost = resolve })
  const failure = new Error('BROWSER_STORAGE_FAILED'), logged = vi.fn(), quit = vi.fn()
  const shutdown = settleCleanup([Promise.reject(failure), skillExit, hostExit]).catch(logged).finally(quit)
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(quit).not.toHaveBeenCalled(); expect(logged).not.toHaveBeenCalled()
    stopSkill()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(quit).not.toHaveBeenCalled()
    stopHost(); await shutdown
    expect(logged).toHaveBeenCalledExactlyOnceWith(failure)
    expect(quit).toHaveBeenCalledOnce()
  } finally { stopSkill(); stopHost(); await shutdown }
})

it('waits for the last successful cleanup and accepts a synchronous void disposer', async () => {
  let stopped!: () => void, settled = false
  const exit = new Promise<void>((resolve) => { stopped = resolve })
  const cleanup = settleCleanup([undefined, Promise.resolve(), exit]).then(() => { settled = true })
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(settled).toBe(false)
    stopped(); await cleanup
    expect(settled).toBe(true)
  } finally { stopped(); await cleanup }
})
