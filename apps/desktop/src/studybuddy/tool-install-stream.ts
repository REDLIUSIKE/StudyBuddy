/** Subscribe before snapshots. Keep durable journal facts separate from transport sequence. */
import type { ActiveInstallView, HarnessInstallEventV2, InstallEventView, OwnedScope } from '@studybuddy/contracts'
import type { NativeAccountClient } from './native-account-client.ts'
import { BusinessFailure } from './business-api.ts'
type Native = Pick<NativeAccountClient, 'invoke' | 'subscribeInstallEvents' | 'subscribeInstallStream'>
const same = (a: OwnedScope, b: OwnedScope) => a.accountId === b.accountId && a.generation === b.generation
const identity = (scope: OwnedScope) => JSON.stringify([scope.accountId, scope.generation])
interface Attachment {
  alive: boolean
  streamId?: string
  epoch: number
  buffering: boolean
  buffer: HarnessInstallEventV2[]
  transport: Map<string, number>
  durable: Map<string, number>
  stop: () => void
}
/** Snapshots remain InstallRunView, never fabricated InstallEventView progress. */
export class ToolInstallStream {
  private readonly attachments = new Map<string, Set<Attachment>>()
  private readonly revoked = new Set<string>()
  constructor(
    private readonly native: Native,
    private readonly snapshot: (scope: OwnedScope, active: ActiveInstallView | null) => void = () => {},
  ) {}
  async attach(scope: OwnedScope, listener: (event: InstallEventView) => void): Promise<() => void> {
    const key = identity(scope)
    if (this.revoked.has(key)) throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED')
    const state: Attachment = {
      alive: true,
      epoch: 0,
      buffering: true,
      buffer: [],
      transport: new Map(),
      durable: new Map(),
      stop: () => {},
    }
    const owners = this.attachments.get(key) ?? new Set<Attachment>()
    this.attachments.set(key, owners)
    owners.add(state)
    const current = () => state.alive && !this.revoked.has(key)
    const deliver = (event: HarnessInstallEventV2) => {
      if (!current() || !same(event.scope, scope) || (state.streamId && state.streamId !== event.streamId)) return
      if (!state.streamId) state.streamId = event.streamId
      const sequence = state.transport.get(event.runId) ?? 0
      if (event.seq <= sequence) return
      state.transport.set(event.runId, event.seq)
      if (state.buffering) {
        state.buffer.push(event)
        return
      }
      const revision = state.durable.get(event.runId) ?? -1
      if (event.payload.revision <= revision) return
      state.durable.set(event.runId, event.payload.revision)
      listener(event.payload)
    }
    const refresh = async () => {
      const epoch = ++state.epoch
      state.buffering = true
      const active = await this.native.invoke(scope, 'getActiveInstall', [])
      if (!current()) throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED')
      if (epoch !== state.epoch) return
      let latest = active
      if (active) latest = { ...active, run: await this.native.invoke(scope, 'getInstallRun', [active.run.runId]) }
      if (!current()) throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED')
      if (epoch !== state.epoch) return
      this.snapshot(scope, latest)
      if (!current()) throw new BusinessFailure('ACCOUNT_SCOPE_CHANGED')
      state.buffering = false
      const buffered = state.buffer
      state.buffer = []
      // Transport duplicates were removed on receipt. Durable revisions order
      // original coordinator payloads within each run, not webpage percentages.
      for (const event of buffered) {
        if (!current()) break
        const revision = state.durable.get(event.runId) ?? -1
        if (event.payload.revision <= revision || state.streamId !== event.streamId) continue
        state.durable.set(event.runId, event.payload.revision)
        listener(event.payload)
      }
    }
    const offEvents = this.native.subscribeInstallEvents(scope, deliver)
    let initial = true
    const offStreams = this.native.subscribeInstallStream(scope, (streamId) => {
      if (!current() || state.streamId === streamId) return
      state.streamId = streamId
      state.transport.clear()
      state.durable.clear()
      state.buffer = []
      if (!initial)
        void refresh().catch(() => {
          if (current()) state.stop()
        })
    })
    state.stop = () => {
      if (!state.alive) return
      state.alive = false
      ++state.epoch
      state.buffer = []
      offEvents()
      offStreams()
      owners.delete(state)
      if (!owners.size) this.attachments.delete(key)
    }
    try {
      await refresh()
      initial = false
      return state.stop
    } catch (error) {
      state.stop()
      throw error
    }
  }
  revoke(scope: OwnedScope): void {
    const key = identity(scope)
    this.revoked.add(key)
    for (const state of [...(this.attachments.get(key) ?? [])]) state.stop()
  }
}
