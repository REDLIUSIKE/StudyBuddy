import { expect, it, vi } from 'vitest'
import type { ToolViewLease } from '@studybuddy/contracts'
import { ToolCenterController } from '../src/client/tool-center-controller.ts'
const scope = { accountId: 'synthetic-tools', generation: 1 }
const lease: ToolViewLease = { lease: 'synthetic-lease', scope, moduleId: 'sha256:' + '1'.repeat(64) }
it('releases late acquisitions and stops every listener across account change and disposal', async () => {
  let finish!: (value: ToolViewLease) => void
  const off = vi.fn(),
    api = {
      acquire: vi.fn(
        () =>
          new Promise<ToolViewLease>((resolve) => {
            finish = resolve
          }),
      ),
      release: vi.fn(async () => {}),
      resize: vi.fn(async () => {}),
      setVisible: vi.fn(async () => {}),
      setTheme: vi.fn(async () => {}),
      subscribeInvalid: vi.fn(() => off),
    }
  const controller = new ToolCenterController(api)
  controller.setScope(scope)
  const pending = controller.acquire()
  controller.setScope({ ...scope, generation: 2 })
  finish(lease)
  await pending
  expect(api.release).toHaveBeenCalledExactlyOnceWith(lease.lease)
  expect(controller.getSnapshot().lease).toBeNull()
  await controller.dispose()
  expect(off).toHaveBeenCalledOnce()
})
it('hides before geometry changes and never opens local capabilities on a web-only host', async () => {
  const api = {
    acquire: vi.fn(async () => lease),
    release: vi.fn(async (_lease: string) => {}),
    resize: vi.fn(async (_lease: string, _bounds: unknown) => {}),
    setVisible: vi.fn(async (_lease: string, _visible: boolean) => {}),
    setTheme: vi.fn(async (_lease: string, _theme: unknown) => {}),
    subscribeInvalid: vi.fn(() => () => {}),
  }
  const controller = new ToolCenterController(api)
  controller.setScope(scope)
  await controller.acquire()
  await controller.project({ bounds: { x: 10, y: 20, width: 400, height: 300 }, visible: true })
  await controller.project({ bounds: { x: 10, y: 20, width: 400, height: 300 }, visible: false })
  expect(api.resize).toHaveBeenCalledWith(lease.lease, { x: 10, y: 20, width: 400, height: 300 })
  expect(api.setVisible.mock.calls.map(row => row[1])).toEqual([false, true, false])
  await controller.dispose()
  const web = new ToolCenterController(undefined)
  web.setScope(scope)
  await web.acquire()
  expect(web.getSnapshot().lease).toBeNull()
  expect(web.getSnapshot().errorCode).toBe('TOOL_DESKTOP_REQUIRED')
  await web.dispose()
})
