import { expect, it, vi } from 'vitest'
import type { InstallPlan, InstallRunView } from '@studybuddy/contracts'
import { ToolCenterBridge } from '../src/studybuddy/tool-center-bridge.ts'
import { toolViewFixture } from './fixtures/studybuddy-tool-view.ts'
// A synthetic process boundary; public operation validation remains in the production bridge.
const testNative = (value: unknown) => value as ConstructorParameters<typeof ToolCenterBridge>[1]
it('only the owned Labs frame can start a native safety conversation or prepare its fixed scanner', async () => {
  const f = toolViewFixture(), scope = { accountId: 'fixture-a', generation: 1 }, lease = await f.views.acquire(scope, 'labs')
  f.wc.mainFrame.url = 'dsh-tools://tool-center/labs.html'
  const native = vi.fn(), notice = vi.fn(), safety = { invoke: vi.fn(async () => ({ workspaceId: 'workspace-fixture', sessionId: 'session-fixture' })), release: vi.fn() }
  const bridge = new ToolCenterBridge(f.views, testNative({ invoke: native }), vi.fn(), vi.fn(), notice, safety)
  try {
    await expect(bridge.invoke(f.event, lease.lease, 'startSkillSafetyAssistant', [{ requestId: 'entry-fixture' }])).resolves.toEqual({ workspaceId: 'workspace-fixture', sessionId: 'session-fixture' })
    expect(safety.invoke).toHaveBeenCalledWith(lease, 'startSkillSafetyAssistant', [{ requestId: 'entry-fixture' }])
    expect(notice).toHaveBeenCalledWith({ scope, target: 'skill-safety', workspaceId: 'workspace-fixture', sessionId: 'session-fixture' })
    await expect(bridge.invoke(f.event, lease.lease, 'prepareSkillSafetyScanner', [{ requestId: 'x', url: 'https://example.com/' }])).rejects.toThrow('TOOL_OPERATION_DENIED')
    expect(native).not.toHaveBeenCalled()
    bridge.release(lease); expect(safety.release).toHaveBeenCalledWith(lease)
    f.wc.mainFrame.url = 'dsh-tools://tool-center/index.html'
    await expect(bridge.invoke(f.event, lease.lease, 'getSkillSafetyScannerStatus', [])).rejects.toThrow('TOOL_VIEW_DENIED')
  } finally { await f.views.dispose() }
})
it('rejects late safety results and never opens a session after account changes', async () => {
  const f = toolViewFixture(), lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 }, 'labs')
  f.wc.mainFrame.url = 'dsh-tools://tool-center/labs.html'
  let finish!: (value: unknown) => void
  const notice = vi.fn(), safety = { invoke: vi.fn(() => new Promise(resolve => { finish = resolve })), release: vi.fn() }
  const bridge = new ToolCenterBridge(f.views, testNative({ invoke: vi.fn() }), vi.fn(), vi.fn(), notice, safety)
  const started = bridge.invoke(f.event, lease.lease, 'startSkillSafetyAssistant', [{ requestId: 'entry-fixture' }])
  void started.catch(() => {})
  await vi.waitFor(() => expect(safety.invoke).toHaveBeenCalledOnce())
  f.setScope({ accountId: 'fixture-b', generation: 2 }); finish({ workspaceId: 'workspace-fixture', sessionId: 'session-fixture' })
  await expect(started).rejects.toThrow('TOOL_VIEW_DENIED'); expect(notice).not.toHaveBeenCalled()
  await f.views.dispose()
})
it('tool frames cannot call any safety operation even if they know a Labs method', async () => {
  const f = toolViewFixture(), lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 })
  const safety = { invoke: vi.fn(), release: vi.fn() }, bridge = new ToolCenterBridge(f.views, testNative({ invoke: vi.fn() }), vi.fn(), vi.fn(), vi.fn(), safety)
  for (const name of ['startSkillSafetyAssistant', 'getSkillSafetyScannerStatus', 'prepareSkillSafetyScanner', 'cancelSkillSafetyScannerPreparation']) await expect(bridge.invoke(f.event, lease.lease, name, name === 'getSkillSafetyScannerStatus' ? [] : [{ requestId: 'fixture' }])).rejects.toThrow('TOOL_OPERATION_DENIED')
  expect(safety.invoke).not.toHaveBeenCalled(); await f.views.dispose()
})
it('laboratory grants only its three zero-argument operations to its exact owned document', async () => {
  const f = toolViewFixture(), scope = { accountId: 'fixture-a', generation: 1 }
  const lease = await f.views.acquire(scope, 'labs')
  f.wc.mainFrame.url = 'dsh-tools://tool-center/labs.html'
  const status = { ui: { status: 'not_configured' }, package: { status: 'unavailable' }, canRestore: false }
  const invoke = vi.fn(async () => status), navigate = vi.fn()
  const bridge = new ToolCenterBridge(f.views, testNative({ invoke }), vi.fn(), vi.fn(), navigate)
  try {
    await expect(bridge.invoke(f.event, lease.lease, 'getCodexChineseStatus', [])).resolves.toEqual(status)
    await expect(bridge.invoke(f.event, lease.lease, 'applyCodexChinese', ['renderer-path'])).rejects.toThrow('TOOL_OPERATION_DENIED')
    await expect(bridge.invoke(f.event, lease.lease, 'startInstall', [{}])).rejects.toThrow('TOOL_OPERATION_DENIED')
    bridge.navigation(f.event, lease.lease, 'tools')
    expect(navigate).toHaveBeenCalledWith({ scope, target: 'tools' })
    f.wc.mainFrame.url = 'dsh-tools://tool-center/index.html'
    await expect(bridge.invoke(f.event, lease.lease, 'getCodexChineseStatus', [])).rejects.toThrow('TOOL_VIEW_DENIED')
    expect(invoke).toHaveBeenCalledOnce()
  } finally { await f.views.dispose() }
})
it('the tool page cannot invoke laboratory writes', async () => {
  const f = toolViewFixture(), lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 })
  const invoke = vi.fn(), bridge = new ToolCenterBridge(f.views, testNative({ invoke }), vi.fn(), vi.fn(), vi.fn())
  try {
    await expect(bridge.invoke(f.event, lease.lease, 'applyCodexChinese', [])).rejects.toThrow('TOOL_OPERATION_DENIED')
    expect(invoke).not.toHaveBeenCalled()
  } finally { await f.views.dispose() }
})
it('single-tool page preparation never returns or accepts a private native grant', async () => {
  const f = toolViewFixture(), lease = await f.views.acquire({accountId: 'fixture-a', generation: 1})
  const plan: InstallPlan = {schemaVersion: 1, catalogVersion: 'fixed', inventoryId: 'prepared', selectedComponentIds: ['openclaw'], items: [], totalDownloadBytes: 0, totalRequiredDiskBytes: 0, blockers: []}
  const inventory = {inventoryId: 'prepared', catalogVersion: 'fixed'}
  const run: InstallRunView = {runId: 'run-12345678-12345678-12345678', catalogVersion: 'fixed', phase: 'preparing', components: [], rebootRequired: false}
  const invoke = vi.fn(async (_scope: unknown, method: string, args: unknown[]) => {
    if (method === 'prepareToolInstallation') {expect(args).toEqual(['openclaw']); return {inventory, plan, authorizationId: 'hidden-authority'}}
    if (method === 'startInstall') {expect(args).toEqual(['hidden-authority', plan]); return run}
    throw Error('unexpected operation')
  })
  const bridge = new ToolCenterBridge(f.views, testNative({invoke}), vi.fn(), vi.fn(), vi.fn())
  try {
    const prepared = await bridge.invoke(f.event, lease.lease, 'prepareToolInstallation', ['openclaw'])
    expect(prepared).toEqual({inventory, plan})
    expect(prepared).not.toHaveProperty('authorizationId')
    await expect(bridge.invoke(f.event, lease.lease, 'prepareToolInstallation', ['openclaw', ['node']])).rejects.toThrow('TOOL_OPERATION_DENIED')
    await expect(bridge.invoke(f.event, lease.lease, 'startInstall', [plan])).resolves.toEqual(run)
    expect(invoke.mock.calls.filter(row => row[1] === 'prepareToolInstallation')).toHaveLength(1)
  } finally {await f.views.dispose()}
})
it('the original zero-argument page recovery reads a lost completed start without any event or second write', async () => {
  const f = toolViewFixture(),
    lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 })
  const plan: InstallPlan = {
    schemaVersion: 1,
    catalogVersion: 'fixed',
    inventoryId: 'inventory-a',
    selectedComponentIds: ['codex'],
    items: [],
    totalDownloadBytes: 0,
    totalRequiredDiskBytes: 0,
    blockers: [],
  }
  const run: InstallRunView = {
    runId: 'run-12345678-12345678-12345678',
    catalogVersion: 'fixed',
    phase: 'completed',
    components: [],
    rebootRequired: false,
  }
  let query = 0
  const invoke = vi.fn(async (_scope: unknown, method: string, args: unknown[]) => {
    if (method === 'prepareToolInstallation') return { inventory: {inventoryId: plan.inventoryId, catalogVersion: plan.catalogVersion}, plan, authorizationId: 'private-rust-grant' }
    if (method === 'startInstall') throw Object.assign(Error('lost reply'), { code: 'NATIVE_RESULT_UNKNOWN' })
    if (method === 'getActiveInstall') {
      if (!args.length) return null
      if (++query === 1) throw Object.assign(Error('temporarily unavailable'), { code: 'NATIVE_RESULT_UNKNOWN' })
      expect(args).toEqual(['private-rust-grant'])
      return { plan, run }
    }
    if (method === 'getInstallRun') return run
    throw Error('unexpected operation')
  })
  const bridge = new ToolCenterBridge(f.views, testNative({ invoke }), vi.fn(), vi.fn(), vi.fn())
  const prepared = await bridge.invoke(f.event, lease.lease, 'prepareToolInstallation', ['codex']) as {plan: InstallPlan}
  const issued = prepared.plan
  await expect(bridge.invoke(f.event, lease.lease, 'startInstall', [issued])).rejects.toMatchObject({
    code: 'NATIVE_RESULT_UNKNOWN',
  })
  await expect(bridge.invoke(f.event, lease.lease, 'getActiveInstall', [])).resolves.toEqual({ plan, run })
  await expect(bridge.invoke(f.event, lease.lease, 'getActiveInstall', [])).resolves.toBeNull()
  expect(invoke.mock.calls.filter(row => row[1] === 'startInstall')).toHaveLength(1)
  await f.views.dispose()
})
it('denies arbitrary RPC and late picker results without giving the page a URL or authorization capability', async () => {
  const f = toolViewFixture(),
    lease = await f.views.acquire({ accountId: 'fixture-a', generation: 1 }),
    invoke = vi.fn(async () => undefined)
  let finish!: (value: string | null) => void
  const picker = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve
        }),
    ),
    open = vi.fn(async () => {})
  const bridge = new ToolCenterBridge(f.views, { invoke }, picker, open, vi.fn())
  await expect(bridge.invoke(f.event, lease.lease, 'shell.exec', [])).rejects.toThrow('TOOL_OPERATION_DENIED')
  await expect(bridge.invoke(f.event, lease.lease, 'getActiveInstall', ['private-grant'])).rejects.toThrow(
    'TOOL_OPERATION_DENIED',
  )
  await expect(bridge.invoke({ ...f.event, senderFrame: null }, lease.lease, 'getManagedInstallRoot', [])).rejects.toThrow(
    'TOOL_VIEW_DENIED',
  )
  expect(invoke).not.toHaveBeenCalled()
  const pending = bridge.invoke(f.event, lease.lease, 'pickNativeWorkingDirectory', [])
  f.setScope({ accountId: 'fixture-b', generation: 2 })
  finish(null)
  await expect(pending).rejects.toThrow('TOOL_VIEW_DENIED')
  expect(open).not.toHaveBeenCalled()
  await f.views.dispose()
})
