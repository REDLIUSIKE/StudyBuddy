import { expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { toolSurfaceBounds } from '../src/studybuddy/tool-center-views.ts'
import { toolViewFixture } from './fixtures/studybuddy-tool-view.ts'
import { parseAiAccountSummary } from '@studybuddy/contracts'
const accountSummary = (balance: string) =>
  parseAiAccountSummary({ balance, availableBalance: balance, frozenBalance: '0', platformAccess: null })
it('laboratory acquires its own fixed entry and rejects arbitrary surface destinations', async () => {
  const f = toolViewFixture(), scope = { accountId: 'fixture-a', generation: 1 }
  try {
    const lease = await f.views.acquire(scope, 'labs')
    expect(f.view.webContents.loadURL).toHaveBeenCalledWith('dsh-tools://tool-center/labs.html')
    await expect(f.views.acquire(scope, 'https://untrusted.invalid' as never)).rejects.toThrow('TOOL_VIEW_DENIED')
    expect(f.create).toHaveBeenCalledOnce()
    await expect(f.views.acquire(scope, 'labs')).resolves.toEqual(lease)
  } finally { await f.views.dispose() }
})
it('retained tool page refreshes authoritative summary after recharge and recovers an initial summary failure', async () => {
  const zero = accountSummary('0'),
    paid = accountSummary('10')
  const summary = vi.fn(async () => zero),
    f = toolViewFixture(summary),
    scope = { accountId: 'fixture-a', generation: 1 }
  const lease = await f.views.acquire(scope)
  await f.views.resize(lease.lease, { x: 0, y: 0, width: 600, height: 500 })
  await f.views.setVisible(lease.lease, true)
  await f.views.setVisible(lease.lease, false)
  summary.mockResolvedValue(paid)
  await f.views.setVisible(lease.lease, true)
  await vi.waitFor(() => expect(f.views.get(lease.lease).state.accountSummary).toEqual(paid))
  expect(f.views.get(lease.lease).state.returnRevision).toBe(0)
  expect(f.views.get(lease.lease).state.refreshRevision).toBe(0)
  expect(f.create).toHaveBeenCalledOnce()
  await f.views.dispose()
  const initialFailure = vi.fn(async () => paid).mockRejectedValueOnce(new Error('synthetic transient failure'))
  const retry = toolViewFixture(initialFailure),
    retryLease = await retry.views.acquire(scope)
  expect(retry.views.get(retryLease.lease).state.accountSummary).toBeNull()
  retry.views.refresh(scope)
  await vi.waitFor(() => expect(retry.views.get(retryLease.lease).state.accountSummary).toEqual(paid))
  await retry.views.dispose()
})
it('balance polling updates retained tools without invalidating model or connection inventories', async () => {
  const f = toolViewFixture(async () => accountSummary('10')),
    scope = { accountId: 'fixture-a', generation: 1 }
  try {
    const lease = await f.views.acquire(scope)
    for (const visible of [false, true, false]) {
      await f.views.resize(lease.lease, { x: 0, y: 0, width: 600, height: 500 })
      await f.views.setVisible(lease.lease, visible)
      await Promise.resolve()
      for (let poll = 0; poll < 5; ++poll) f.views.refresh(scope, accountSummary(String(20 + poll)))
      const state = f.views.get(lease.lease).state
      expect(state.accountSummary?.availableBalance).toBe('24')
      expect(state.refreshRevision).toBe(0)
      expect(state.returnRevision).toBe(0)
    }
  } finally { await f.views.dispose() }
})
it('a configuration change invalidates tools once while its summary readback stays independent', async () => {
  const f = toolViewFixture(async () => accountSummary('10')),
    scope = { accountId: 'fixture-a', generation: 1 }
  try {
    const lease = await f.views.acquire(scope)
    f.views.refresh(scope)
    await vi.waitFor(() => expect(f.views.get(lease.lease).state.accountSummary?.availableBalance).toBe('10'))
    await Promise.resolve()
    expect(f.views.get(lease.lease).state.refreshRevision).toBe(1)
    f.views.refresh(scope, accountSummary('9'))
    expect(f.views.get(lease.lease).state.refreshRevision).toBe(1)
    expect(f.views.get(lease.lease).state.accountSummary?.availableBalance).toBe('9')
  } finally { await f.views.dispose() }
})
it('late summary refresh cannot overwrite a newer authoritative readback or another account', async () => {
  const first = accountSummary('0'),
    next = accountSummary('10')
  let finish!: (value: typeof first) => void
  const summary = vi.fn(async () => first),
    f = toolViewFixture(summary),
    scope = { accountId: 'fixture-a', generation: 1 }
  const lease = await f.views.acquire(scope)
  summary.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  f.views.refresh(scope)
  f.views.refresh(scope, next)
  finish(first)
  await vi.waitFor(() => expect(f.views.get(lease.lease).state.accountSummary).toEqual(next))
  summary.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  f.views.refresh(scope)
  f.setScope({ accountId: 'fixture-b', generation: 2 })
  finish(next)
  await Promise.resolve()
  expect(() => f.views.get(lease.lease)).toThrow('TOOL_VIEW_DENIED')
  await f.views.dispose()
})
it('binds a sandboxed view to one page, frame, module and account and removes hidden input layers', async () => {
  const f = toolViewFixture(),
    lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 })
  expect(f.create.mock.calls[0]?.[0]?.webPreferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    preload: 'fixed-preload.cjs',
  })
  expect(f.views.checked(f.event, lease.lease).lease).toEqual(lease)
  for (const event of [
    { ...f.event, sender: {} },
    { ...f.event, senderFrame: { ...f.event.senderFrame } },
    { ...f.event, senderFrame: null },
  ])
    expect(() => f.views.checked(event as IpcMainInvokeEvent, lease.lease)).toThrow('TOOL_VIEW_DENIED')
  await f.views.resize(lease.lease, { x: 10, y: 20, width: 600, height: 500 })
  expect(f.view.setBounds).toHaveBeenCalledWith({ x: 13, y: 25, width: 750, height: 625 })
  await f.views.setVisible(lease.lease, true)
  await f.views.setVisible(lease.lease, false)
  expect(f.owner.contentView.removeChildView).toHaveBeenCalledWith(f.view)
  const navigation = { preventDefault: vi.fn() }
  f.wc.emit('will-navigate', navigation, 'https://evil.example')
  expect(navigation.preventDefault).toHaveBeenCalled()
  f.setScope({ accountId: 'fixture-b', generation: 2 })
  expect(() => f.views.checked(f.event, lease.lease)).toThrow('TOOL_VIEW_DENIED')
  await f.views.dispose()
  expect(f.browserSession.clearStorageData).toHaveBeenCalledOnce()
  expect(f.released).toHaveBeenCalledWith(lease)
})
it('rejects nonfinite bounds and never applies devicePixelRatio a second time', () => {
  expect(toolSurfaceBounds({ x: 2, y: 3, width: 400, height: 300 }, 1.5, { width: 1000, height: 800 })).toEqual({
    x: 3,
    y: 5,
    width: 600,
    height: 450,
  })
  expect(() => toolSurfaceBounds({ x: NaN, y: 0, width: 1, height: 2 }, 1, { width: 100, height: 100 })).toThrow()
})
it('projects the existing account summary and rejects a late summary across account changes', async () => {
  const summary = { syntheticSummary: true } as unknown as import('@studybuddy/contracts').AiAccountSummary
  const f = toolViewFixture(async () => summary),
    lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 })
  expect(f.views.checked(f.event, lease.lease).state.accountSummary).toBe(summary)
  await f.views.dispose()
  let finish!: (value: typeof summary) => void
  const late = toolViewFixture(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = late.views.acquire({ accountId: 'fixture-a', generation: 1 })
  late.setScope({ accountId: 'fixture-b', generation: 2 })
  finish(summary)
  await expect(pending).rejects.toThrow('TOOL_VIEW_DENIED')
  expect(late.create).not.toHaveBeenCalled()
  await late.views.dispose()
})
