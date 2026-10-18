import { expect, it, vi } from 'vitest'
import { ModelCatalogSync } from '../src/studybuddy/model-catalog-sync.ts'

const scope = { accountId: 'owner-a', generation: 1 }
type SyncResult = Awaited<ReturnType<ConstructorParameters<typeof ModelCatalogSync>[0]['tools']>>
function fixture() {
  let current: typeof scope | null = scope
  const timers: (() => void)[] = [], cancelled: (() => void)[] = [], delays: number[] = []
  const platform = vi.fn(async () => {}), tools = vi.fn(async (): Promise<SyncResult> => ({ schemaVersion: 1, records: [] })), changed = vi.fn(), failed = vi.fn()
  const sync = new ModelCatalogSync({ scope: () => current, platform, tools, changed, failed,
    schedule: (callback, delay) => { timers.push(callback); delays.push(delay); return () => { cancelled.push(callback) } },
  })
  return { sync, platform, tools, changed, failed, timers, cancelled, delays, account: (next: typeof scope | null) => { current = next } }
}
it('automatically refreshes the current approved menu and managed native catalogs without overlapping ticks', async () => {
  const f = fixture()
  f.sync.start()
  expect(f.timers).toHaveLength(1)
  expect(f.delays[0]).toBe(0)
  f.timers[0]!()
  await vi.waitFor(() => expect(f.tools).toHaveBeenCalledOnce())
  expect(f.platform).toHaveBeenCalledWith(scope)
  expect(f.tools).toHaveBeenCalledWith(scope)
  await vi.waitFor(() => expect(f.timers).toHaveLength(2))
  await f.sync.dispose()
  expect(f.cancelled).toHaveLength(1)
})
it('prepares tool directories while the independent platform catalog is still loading', async () => {
  const f = fixture()
  let finish: (() => void) | undefined
  f.platform.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  f.tools.mockResolvedValueOnce({ schemaVersion: 1, records: [{ toolId: 'workbuddy', state: 'prepared', catalogRevision: 'r1', errorCode: null }] })
  f.sync.start(); f.timers[0]!()
  await vi.waitFor(() => expect(f.tools).toHaveBeenCalledWith(scope))
  expect(f.changed).toHaveBeenCalledWith(scope)
  finish!()
  await f.sync.dispose()
})
it('starts tool preparation immediately without duplicating platform setup already owned by startup', async () => {
  const f = fixture()
  f.sync.start({ platformAlreadyLoading: true }); f.timers[0]!()
  await vi.waitFor(() => expect(f.timers).toHaveLength(2))
  expect(f.tools).toHaveBeenCalledOnce()
  expect(f.platform).not.toHaveBeenCalled()
  f.timers[1]!()
  await vi.waitFor(() => expect(f.platform).toHaveBeenCalledOnce())
  await f.sync.dispose()
})
it('a failed tool synchronization does not prevent the independent Harness menu from refreshing or stop retries', async () => {
  const f = fixture()
  f.tools.mockRejectedValueOnce(new Error('private failure'))
  f.sync.start(); f.timers[0]!()
  await vi.waitFor(() => expect(f.failed).toHaveBeenCalledWith('tools'))
  expect(f.platform).toHaveBeenCalledOnce()
  f.timers[1]!()
  await vi.waitFor(() => expect(f.tools).toHaveBeenCalledTimes(2))
  await f.sync.dispose()
})
it('never refreshes a view from a late result of a signed-out account and waits for its owned work on disposal', async () => {
  const f = fixture()
  let finish: ((value: { schemaVersion: 1; records: { toolId: string; state: string; catalogRevision: string | null; errorCode: string | null }[] }) => void) | undefined
  f.tools.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  f.sync.start(); f.timers[0]!()
  await vi.waitFor(() => expect(f.tools).toHaveBeenCalledOnce())
  f.account(null)
  const disposal = f.sync.dispose()
  finish!({ schemaVersion: 1, records: [{ toolId: 'codex', state: 'updated', catalogRevision: 'r2', errorCode: null }] })
  await disposal
  expect(f.changed).not.toHaveBeenCalled()
  expect(f.timers).toHaveLength(1)
})
it('does not invoke either authority while signed out and only updates the tool page when a managed catalog changed', async () => {
  const f = fixture()
  f.account(null); f.sync.start(); f.timers[0]!()
  await vi.waitFor(() => expect(f.timers).toHaveLength(2))
  expect(f.tools).not.toHaveBeenCalled(); expect(f.platform).not.toHaveBeenCalled()
  f.account(scope)
  f.tools.mockResolvedValueOnce({ schemaVersion: 1, records: [{ toolId: 'codex', state: 'updated', catalogRevision: 'r2', errorCode: null }] })
  f.timers[1]!()
  await vi.waitFor(() => expect(f.changed).toHaveBeenCalledWith(scope))
  await f.sync.dispose()
})
