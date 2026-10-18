import { expect, it, vi } from 'vitest'
import type { EnvironmentInventory, InstallPlan, InstallRunView, HarnessInstallEventV2, ToolViewLease } from '@studybuddy/contracts'
import { ToolInstallAuthorizations } from '../src/studybuddy/tool-install-authorizations.ts'
import { ToolInstallStream } from '../src/studybuddy/tool-install-stream.ts'
// Explicit synthetic transport boundary; decoded production DTOs are tested separately.
const testTransport = (value: unknown) => value as ConstructorParameters<typeof ToolInstallStream>[0]
const scope = { accountId: 'owner-a', generation: 1 }
const owner: ToolViewLease = { scope, lease: 'lease-a', moduleId: 'sha256:fixture' }
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
const inventory: EnvironmentInventory = {
  schemaVersion: 1, catalogVersion: 'fixed', inventoryId: 'inventory-a', components: [], checkedAt: 'fixture',
  system: {os: 'windows', architecture: 'x86_64', windowsBuild: 22631, logicalProcessorCount: 4,
    totalMemoryBytes: null, systemDriveFreeBytes: null, elevated: false, pendingReboot: false,
    webview2RuntimeVersion: null, supportLevel: 'supported'},
}
const run: InstallRunView = {
  runId: 'run-12345678-12345678-12345678',
  catalogVersion: 'fixed',
  phase: 'preparing',
  components: [],
  rebootRequired: false,
}
function fixture() {
  const invoke = vi.fn(
    async (
      _scope: unknown,
      method: string,
      _args?: unknown[],
    ): Promise<
      | InstallRunView
      | { plan: InstallPlan; authorizationId: string | null }
      | { inventory: EnvironmentInventory; plan: InstallPlan; authorizationId: string | null }
      | { plan: InstallPlan; run: InstallRunView }
      | null
    > => {
      if (method === 'prepareToolInstallation') return {inventory: structuredClone(inventory), plan: structuredClone(plan), authorizationId: 'private-rust-grant'}
      if (method === 'startInstall' || method === 'getInstallRun') return structuredClone(run)
      if (method === 'getActiveInstall') return { plan: structuredClone(plan), run: structuredClone(run) }
      throw Error('unexpected operation')
    },
  )
  return { invoke }
}
it('single-tool preparation keeps authority private, binds the lease and never replays a lost start', async () => {
  const native = fixture(), grants = new ToolInstallAuthorizations(testTransport(native))
  const original = native.invoke.getMockImplementation()!
  native.invoke.mockImplementation(async (s, m, a) => {
    if (m === 'startInstall') throw Object.assign(Error('lost reply'), {code: 'NATIVE_RESULT_UNKNOWN'})
    return original(s, m, a)
  })
  const prepared = await grants.prepare(owner, 'codex')
  expect(prepared).toEqual({inventory, plan})
  expect(prepared).not.toHaveProperty('authorizationId')
  await expect(grants.start({...owner, lease: 'another-lease'}, prepared.plan)).rejects.toMatchObject({code: 'INSTALL_PLAN_STALE'})
  await expect(grants.start(owner, {...prepared.plan, inventoryId: 'tampered'})).rejects.toMatchObject({code: 'INSTALL_PLAN_STALE'})
  await expect(grants.start(owner, prepared.plan)).resolves.toEqual(run)
  await expect(grants.start(owner, prepared.plan)).resolves.toEqual(run)
  expect(native.invoke.mock.calls.filter(row => row[1] === 'prepareToolInstallation')).toHaveLength(1)
  expect(native.invoke.mock.calls.filter(row => row[1] === 'startInstall')).toHaveLength(1)
})
it('preparation is exclusive and late results cannot escape a revoked owner', async () => {
  const native = fixture(), grants = new ToolInstallAuthorizations(testTransport(native))
  let finish!: (value: {inventory: EnvironmentInventory; plan: InstallPlan; authorizationId: string}) => void
  native.invoke.mockImplementationOnce(() => new Promise(resolve => {finish = resolve}))
  const preparing = grants.prepare(owner, 'codex')
  await expect(grants.prepare(owner, 'codex')).rejects.toMatchObject({code: 'INSTALL_PLAN_BUSY'})
  grants.revoke(owner)
  finish({inventory, plan, authorizationId: 'late-private-grant'})
  await expect(preparing).rejects.toMatchObject({code: 'ACCOUNT_SCOPE_CHANGED'})
  expect(native.invoke).toHaveBeenCalledOnce()
})
it('in-flight and unconfirmed starts prevent replacement preparation', async () => {
  const native = fixture(), grants = new ToolInstallAuthorizations(testTransport(native))
  const prepared = await grants.prepare(owner, 'codex')
  let fail!: (error: Error) => void
  native.invoke.mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject}))
  const writing = grants.start(owner, prepared.plan)
  await expect(grants.prepare(owner, 'codex')).rejects.toMatchObject({code: 'INSTALL_PLAN_BUSY'})
  native.invoke.mockResolvedValueOnce(null)
  fail(Object.assign(Error('lost'), {code: 'NATIVE_RESULT_UNKNOWN'}))
  await expect(writing).rejects.toMatchObject({code: 'NATIVE_RESULT_UNKNOWN'})
  await expect(grants.prepare(owner, 'codex')).rejects.toMatchObject({code: 'NATIVE_RESULT_UNKNOWN'})
  expect(native.invoke.mock.calls.filter(row => row[1] === 'prepareToolInstallation')).toHaveLength(1)
  expect(native.invoke.mock.calls.filter(row => row[1] === 'startInstall')).toHaveLength(1)
})
it('an unconfirmed preparation cannot be replayed on the same lease', async () => {
  const native = fixture(), grants = new ToolInstallAuthorizations(testTransport(native))
  native.invoke.mockRejectedValueOnce(Object.assign(Error('lost preparation reply'), {code: 'NATIVE_RESULT_UNKNOWN'}))
  await expect(grants.prepare(owner, 'codex')).rejects.toMatchObject({code: 'NATIVE_RESULT_UNKNOWN'})
  await expect(grants.prepare(owner, 'codex')).rejects.toMatchObject({code: 'NATIVE_RESULT_UNKNOWN'})
  expect(native.invoke).toHaveBeenCalledOnce()
})
it('blocks private grants for blocked or target-mismatched preparation', async () => {
  const native = fixture(), grants = new ToolInstallAuthorizations(testTransport(native))
  const blocked = {...plan, blockers: [{code: 'COMPONENT_UNKNOWN', componentId: 'codex' as const}]}
  native.invoke.mockResolvedValueOnce({inventory, plan: blocked, authorizationId: null})
  const view = await grants.prepare(owner, 'codex')
  expect(view).toEqual({inventory, plan: blocked})
  await expect(grants.start(owner, view.plan)).rejects.toMatchObject({code: 'INSTALL_PLAN_STALE'})
  await expect(grants.prepare(owner, 'openclaw')).rejects.toMatchObject({code: 'NATIVE_RESPONSE_INVALID'})
  expect(native.invoke.mock.calls.filter(row => row[1] === 'startInstall')).toHaveLength(0)
})
it.each(['completed', 'failed', 'cancelled'] as const)(
  'a confirmed %s installation permits the next exact plan after original readback',
  async (phase) => {
    const native = fixture(),
      authorizations = new ToolInstallAuthorizations(testTransport(native))
    const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
    await authorizations.start(owner, issued)
    const original = native.invoke.getMockImplementation()!
    native.invoke.mockImplementation((s, m, a) =>
      m === 'getInstallRun' ? Promise.resolve({ ...run, phase }) : original(s, m, a),
    )
    await expect(
      authorizations.prepare(owner, 'codex').then(view => view.plan),
    ).resolves.toEqual(plan)
    expect(native.invoke.mock.calls.filter(row => row[1] === 'getInstallRun')).toHaveLength(1)
    expect(native.invoke.mock.calls.filter(row => row[1] === 'prepareToolInstallation')).toHaveLength(2)
  },
)
it('a confirmed but still active installation cannot be replaced with a new plan', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  await authorizations.start(owner, issued)
  await expect(
    authorizations.prepare(owner, 'codex').then(view => view.plan),
  ).rejects.toMatchObject({ code: 'INSTALL_PLAN_BUSY' })
  expect(native.invoke.mock.calls.filter(row => row[1] === 'prepareToolInstallation')).toHaveLength(1)
})
it('zero-event lost start reply resolves an already completed original run on the first UI start call', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native)),
    original = native.invoke.getMockImplementation()!
  const completed = { ...run, phase: 'completed' as const }
  native.invoke.mockImplementation(async (s, m, a) => {
    if (m === 'startInstall') throw Object.assign(Error('lost reply'), { code: 'NATIVE_RESULT_UNKNOWN' })
    if (m === 'getActiveInstall') return a?.[0] === 'private-rust-grant' ? { plan, run: completed } : null
    if (m === 'getInstallRun') return completed
    return original(s, m, a)
  })
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  await expect(authorizations.start(owner, issued)).resolves.toEqual(completed)
  expect(native.invoke.mock.calls.filter(row => row[1] === 'startInstall')).toHaveLength(1)
})
it('serializes concurrent plan issuance without replacing its private grant', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  let finish!: (value: { inventory: EnvironmentInventory; plan: InstallPlan; authorizationId: string }) => void
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const first = authorizations.prepare(owner, 'codex').then(view => view.plan)
  const second = authorizations.prepare(owner, 'codex').then(view => view.plan)
  await expect(second).rejects.toMatchObject({ code: 'INSTALL_PLAN_BUSY' })
  finish({ inventory, plan, authorizationId: 'first-private-grant' })
  await authorizations.start(owner, await first)
  expect(native.invoke.mock.calls.filter(row => row[1] === 'prepareToolInstallation')).toHaveLength(1)
  expect(native.invoke.mock.calls.find(row => row[1] === 'startInstall')?.[2]).toEqual(['first-private-grant', plan])
})
it('an existing plan cannot start while a replacement authorization is being issued', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  const existing = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  let finish!: (value: { inventory: EnvironmentInventory; plan: InstallPlan; authorizationId: string }) => void
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const replacing = authorizations.prepare(owner, 'codex').then(view => view.plan)
  await expect(authorizations.start(owner, existing)).rejects.toMatchObject({ code: 'INSTALL_PLAN_BUSY' })
  finish({ inventory, plan, authorizationId: 'replacement-private-grant' })
  await replacing
  expect(native.invoke.mock.calls.filter(row => row[1] === 'startInstall')).toHaveLength(0)
})
it('unissuedAndChangedPlansNeverStart', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  await expect(authorizations.start(owner, plan)).rejects.toMatchObject({ code: 'INSTALL_PLAN_STALE' })
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  expect(issued).not.toHaveProperty('authorizationId')
  for (const other of [
    { ...owner, lease: 'other-view' },
    { ...owner, scope: { accountId: 'owner-b', generation: 2 } },
  ]) {
    await expect(authorizations.start(other, issued)).rejects.toMatchObject({ code: 'INSTALL_PLAN_STALE' })
  }
  await expect(authorizations.start(owner, { ...issued, inventoryId: 'changed' })).rejects.toMatchObject({
    code: 'INSTALL_PLAN_STALE',
  })
  await authorizations.start(owner, issued)
  await authorizations.start(owner, structuredClone(issued))
  expect(native.invoke.mock.calls.filter(call => call[1] === 'startInstall')).toHaveLength(1)
  expect(native.invoke.mock.calls.find(call => call[1] === 'startInstall')?.[2]).toEqual(['private-rust-grant', plan])
  authorizations.revoke(owner)
  await expect(authorizations.start(owner, issued)).rejects.toMatchObject({ code: 'ACCOUNT_SCOPE_CHANGED' })
})
it('unknownStartReadsOriginalRunWithoutNewGrant', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  const invoke = native.invoke.getMockImplementation()!
  native.invoke.mockImplementation(async (s, method, ...args) => {
    if (method === 'startInstall') throw Object.assign(Error('unknown'), { code: 'NATIVE_RESULT_UNKNOWN' })
    return invoke(s, method, ...args)
  })
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  await expect(authorizations.start(owner, issued)).resolves.toEqual(run)
  expect(await authorizations.start(owner, issued)).toEqual(run)
  expect(native.invoke.mock.calls.filter(call => call[1] === 'startInstall')).toHaveLength(1)
  expect(native.invoke.mock.calls.filter(call => call[1] === 'prepareToolInstallation')).toHaveLength(1)
  expect(native.invoke.mock.calls.filter(call => call[1] === 'getActiveInstall')).toHaveLength(1)
})
it('unknown result cannot issue a fresh plan and an in-flight revoked lease cannot return', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  let release: ((run: InstallRunView) => void) | undefined
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const writing = authorizations.start(owner, issued)
  authorizations.revoke(owner)
  release?.(run)
  await expect(writing).rejects.toMatchObject({ code: 'ACCOUNT_SCOPE_CHANGED' })
})
function event(seq: number, streamId = 'stream-a', owned = scope): HarnessInstallEventV2 {
  return {
    kind: 'install-event',
    schemaVersion: 2,
    scope: owned,
    streamId,
    runId: run.runId,
    seq,
    payload: { sequence: seq, revision: seq, run: { ...run, phase: seq === 3 ? 'completed' : 'preparing' } },
  }
}
it('subscribeThenSnapshotDoesNotLoseProgress and new stream accepts sequence one', async () => {
  let receive: ((event: HarnessInstallEventV2) => void) | undefined, started: ((stream: string) => void) | undefined
  const native = {
    ...fixture(),
    subscribeInstallEvents: vi.fn((_scope, cb) => {
      receive = cb
      return vi.fn()
    }),
    subscribeInstallStream: vi.fn((_scope, cb) => {
      started = cb
      return vi.fn()
    }),
  }
  native.invoke.mockImplementation(async (_scope, method) => {
    if (method === 'getActiveInstall') {
      receive?.(event(1))
      return { plan, run }
    }
    if (method === 'getInstallRun') {
      receive?.(event(2))
      return run
    }
    throw Error('unexpected')
  })
  const snapshots: InstallRunView[] = [],
    delivered: number[] = []
  const stream = new ToolInstallStream(testTransport(native), (_scope, active) => {
    if (active) snapshots.push(active.run)
  })
  const stop = await stream.attach(scope, e => delivered.push(e.sequence))
  receive?.(event(3))
  receive?.(event(3))
  receive?.(event(50, 'stream-a', { accountId: 'other', generation: 2 }))
  expect(delivered).toEqual([1, 2, 3])
  expect(snapshots).toHaveLength(1)
  started?.('stream-b')
  await vi.waitFor(() => expect(snapshots).toHaveLength(2))
  receive?.(event(1, 'stream-b'))
  receive?.(event(100, 'stream-a'))
  expect(delivered.at(-1)).toBe(1)
  stop()
  receive?.(event(2, 'stream-b'))
  expect(delivered.at(-1)).toBe(1)
})
it('oldScopeCannotAdoptRun or publish delayed snapshots', async () => {
  let resolve: ((value: unknown) => void) | undefined
  const native = {
    invoke: vi.fn(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    ),
    subscribeInstallEvents: vi.fn(() => vi.fn()),
    subscribeInstallStream: vi.fn(() => vi.fn()),
  }
  const snapshots = vi.fn(),
    stream = new ToolInstallStream(testTransport(native), snapshots)
  const attaching = stream.attach(scope, vi.fn())
  stream.revoke(scope)
  resolve?.({ plan, run })
  await expect(attaching).rejects.toMatchObject({ code: 'ACCOUNT_SCOPE_CHANGED' })
  expect(snapshots).not.toHaveBeenCalled()
})
it('definitive stale inventory can request a new Rust plan but unknown writes cannot', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  const original = native.invoke.getMockImplementation()!
  native.invoke.mockImplementation((s, m, a) => (m === 'getActiveInstall' ? Promise.resolve(null) : original(s, m, a)))
  native.invoke.mockRejectedValueOnce(Object.assign(Error('stale'), { code: 'INSTALL_PLAN_STALE' }))
  await expect(authorizations.start(owner, issued)).rejects.toMatchObject({ code: 'INSTALL_PLAN_STALE' })
  await expect(authorizations.prepare(owner, 'codex').then(view => view.plan)).resolves.toEqual(
    plan,
  )
  native.invoke.mockRejectedValueOnce(Object.assign(Error('unknown'), { code: 'NATIVE_RESULT_UNKNOWN' }))
  await expect(authorizations.start(owner, plan)).rejects.toMatchObject({ code: 'NATIVE_RESULT_UNKNOWN' })
  await expect(
    authorizations.prepare(owner, 'codex').then(view => view.plan),
  ).rejects.toMatchObject({ code: 'NATIVE_RESULT_UNKNOWN' })
  expect(native.invoke.mock.calls.filter(call => call[1] === 'prepareToolInstallation')).toHaveLength(2)
})
it('revocation during buffered delivery cannot publish later old-scope progress', async () => {
  let receive: ((event: HarnessInstallEventV2) => void) | undefined
  const native = {
    ...fixture(),
    subscribeInstallEvents: vi.fn((_scope, cb) => {
      receive = cb
      return vi.fn()
    }),
    subscribeInstallStream: vi.fn(() => vi.fn()),
  }
  native.invoke.mockImplementation(async (_scope, method) => {
    if (method === 'getActiveInstall') {
      receive?.(event(1))
      receive?.(event(2))
      return { plan, run }
    }
    if (method === 'getInstallRun') return run
    throw Error('unexpected')
  })
  const stream = new ToolInstallStream(testTransport(native)),
    delivered: number[] = []
  await stream.attach(scope, (e) => {
    delivered.push(e.sequence)
    stream.revoke(scope)
  })
  expect(delivered).toEqual([1])
})
it('unknown completed start resolves the exact original authorization instead of only active runs', async () => {
  const native = fixture(),
    authorizations = new ToolInstallAuthorizations(testTransport(native))
  const original = native.invoke.getMockImplementation()!
  const completed = { ...run, phase: 'completed' as const }
  native.invoke.mockImplementation(async (s, m, a) => {
    if (m === 'startInstall') throw Object.assign(Error('unknown'), { code: 'NATIVE_RESULT_UNKNOWN' })
    if (m === 'getActiveInstall') return a?.[0] === 'private-rust-grant' ? { plan, run: completed } : null
    if (m === 'getInstallRun') return completed
    return original(s, m, a)
  })
  const issued = await authorizations.prepare(owner, 'codex').then(view => view.plan)
  await expect(authorizations.start(owner, issued)).resolves.toEqual(completed)
  await expect(authorizations.start(owner, issued)).resolves.toEqual(completed)
  expect(native.invoke.mock.calls.filter(call => call[1] === 'startInstall')).toHaveLength(1)
})
