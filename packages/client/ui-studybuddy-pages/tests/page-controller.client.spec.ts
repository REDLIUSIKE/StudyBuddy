import { expect, it, vi } from 'vitest'
import type { EmbeddedLease } from '@studybuddy/contracts'
import { PageController } from '../src/client/page-controller.ts'

const scope = { accountId: 'fixture-a', generation: 1 }
const lease: EmbeddedLease = { lease: 'lease-a', partition: 'private-a', entryUrl: 'https://guijitongzhuo.com/skills?embed=desktop', scope }

it('joins a foreground acquisition instead of declaring its background preparation complete', async () => {
  let finish!: (value: EmbeddedLease) => void
  const api = { acquire: vi.fn(() => new Promise<EmbeddedLease>(resolve => { finish = resolve })), release: vi.fn(async () => {}), setTheme: async () => {} }
  const controller = new PageController('skills', api)
  controller.setScope(scope)
  const foreground = controller.acquire()
  let complete = false
  const background = controller.acquire().then(() => { complete = true })
  await Promise.resolve(); await Promise.resolve()
  expect(complete).toBe(false)
  expect(api.acquire).toHaveBeenCalledOnce()
  finish(lease)
  await Promise.all([foreground, background])
  expect(complete).toBe(true)
  expect(controller.getSnapshot().lease).toBe(lease)
  controller.dispose()
})
it('retains the acquired page through repeat entry and wipes it on account generation replacement', async () => {
  const api = { acquire: vi.fn(async () => lease), release: vi.fn(async () => {}), setTheme: vi.fn(async () => {}) }
  const controller = new PageController('skills', api)
  controller.setScope(scope)
  await controller.acquire()
  await controller.acquire()
  expect(api.acquire).toHaveBeenCalledExactlyOnceWith('skills')
  expect(controller.getSnapshot().lease).toBe(lease)
  controller.setScope({ ...scope, generation: 2 })
  expect(controller.getSnapshot().lease).toBe(null)
  expect(api.release).toHaveBeenCalledExactlyOnceWith(lease.lease)
  controller.dispose()
})

it('releases a late acquisition without publishing old account content', async () => {
  let finish!: (value: EmbeddedLease) => void
  const api = {
    acquire: () => new Promise<EmbeddedLease>((resolve) => { finish = resolve }),
    release: vi.fn(async () => {}), setTheme: vi.fn(async () => {}),
  }
  const controller = new PageController('skills', api)
  controller.setScope(scope)
  const pending = controller.acquire()
  await Promise.resolve()
  controller.setScope(null)
  finish(lease)
  await pending
  expect(controller.getSnapshot()).toMatchObject({ scope: null, lease: null, busy: false })
  expect(api.release).toHaveBeenCalledExactlyOnceWith(lease.lease)
})

it('revokes an invalidated lease and exposes retry instead of retaining its invisible interaction layer', async () => {
  let invalid!: (id: string) => void
  const api = {
    acquire: async () => lease, release: vi.fn(async () => {}), setTheme: vi.fn(async () => {}),
    subscribeInvalid: (listener: (id: string) => void) => { invalid = listener; return vi.fn() },
  }
  const controller = new PageController('zhilian', api)
  controller.setScope(scope)
  await controller.acquire()
  invalid('another-lease')
  expect(controller.getSnapshot().lease).toBe(lease)
  invalid(lease.lease)
  expect(controller.getSnapshot()).toMatchObject({ lease: null, errorCode: 'AUTH_REQUIRED' })
  controller.dispose()
})

it('shows AIGC service failure and reacquires once on explicit retry', async () => {
  let invalid!: (id: string) => void
  const api = { acquire: vi.fn(async () => lease), release: vi.fn(async () => {}), setTheme: vi.fn(async () => {}),
    subscribeInvalid: (listener: (id: string) => void) => { invalid = listener; return () => {} } }
  const controller = new PageController('aigc', api)
  controller.setScope(scope); await controller.acquire()
  invalid(lease.lease)
  expect(controller.getSnapshot()).toMatchObject({ lease: null, errorCode: 'AIGC_SERVICE_EXITED' })
  expect(api.acquire).toHaveBeenCalledTimes(1)
  await controller.retry(); await controller.acquire()
  expect(api.acquire).toHaveBeenCalledTimes(2)
  controller.dispose()
})
