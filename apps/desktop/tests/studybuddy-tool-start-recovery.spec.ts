import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { expect, it } from 'vitest'
import type { InstallPlan, InstallRunView, ToolViewLease } from '@studybuddy/contracts'
import { NativeAccountClient } from '../src/studybuddy/native-account-client.ts'
import { ToolInstallAuthorizations } from '../src/studybuddy/tool-install-authorizations.ts'

const scope = { accountId: 'owner-a', generation: 1 }
const owner: ToolViewLease = { scope, lease: 'lease-a', moduleId: 'sha256:fixture' }
const plan: InstallPlan = {
  schemaVersion: 1,
  catalogVersion: 'fixture',
  inventoryId: 'fixture',
  selectedComponentIds: ['codex'],
  items: [],
  totalDownloadBytes: 0,
  totalRequiredDiskBytes: 0,
  blockers: [],
}
const completed: InstallRunView = {
  runId: 'run-12345678-12345678-12345678',
  catalogVersion: 'fixture',
  phase: 'completed',
  components: [],
  rebootRequired: false,
}

/** Only the process edge is simulated; framing, strict decoder and grant recovery are production classes. */
function transport(mode: 'reply' | 'event', loseRecovery = false) {
  let writes = 0,
    queries = 0
  let journal: InstallRunView | null = null
  const client = new NativeAccountClient({
    start: async () => {
      const child = new EventEmitter()
      const stdin = new PassThrough(),
        stdout = new PassThrough(),
        stderr = new PassThrough()
      let closed = false,
        ready = false,
        bytes = Buffer.alloc(0)
      const kill = () => {
        if (!closed) {
          closed = true
          queueMicrotask(() => child.emit('close', 0))
        }
        return true
      }
      Object.assign(child, { stdin, stdout, stderr, kill })
      const send = (value: unknown) => {
        const body = Buffer.from(JSON.stringify(value)),
          header = Buffer.alloc(4)
        header.writeUInt32LE(body.length)
        stdout.write(Buffer.concat([header, body]))
      }
      stdin.on('data', (chunk: Buffer) => {
        bytes = Buffer.concat([bytes, chunk])
        while (bytes.length >= 4) {
          const length = bytes.readUInt32LE()
          if (bytes.length < length + 4) return
          const request = JSON.parse(bytes.subarray(4, length + 4).toString()) as {
            requestId?: string
            method?: string
            args?: unknown[]
          }
          bytes = bytes.subarray(length + 4)
          if (!ready) {
            ready = true
            send({ schemaVersion: 2, kind: 'ready', scope, streamId: 'fixture-stream', ready: true })
            continue
          }
          const reply = (data: unknown) =>
            send({
              schemaVersion: 2,
              kind: 'reply',
              scope,
              requestId: request.requestId,
              data,
              error: null,
            })
          if (request.method === 'prepareToolInstallation') reply({ inventory: {inventoryId: plan.inventoryId, catalogVersion: plan.catalogVersion}, plan, authorizationId: 'private-rust-grant' })
          else if (request.method === 'startInstall') {
            writes++
            journal = completed
            if (mode === 'reply')
              send({
                schemaVersion: 2,
                kind: 'reply',
                scope,
                requestId: request.requestId,
                data: completed,
                error: null,
                forbidden: true,
              })
            else
              send({
                schemaVersion: 2,
                kind: 'install-event',
                scope,
                streamId: 'fixture-stream',
                runId: completed.runId,
                seq: 1,
                payload: { sequence: 1, revision: 1, run: completed },
                forbidden: true,
              })
          } else if (request.method === 'getActiveInstall') {
            if (request.args?.[0] === 'private-rust-grant') {
              queries++
              if (loseRecovery && queries === 1) kill()
              else reply(journal ? { plan, run: journal } : null)
            } else reply(null)
          } else if (request.method === 'getInstallRun') reply(journal)
          else throw Error('unexpected fixture operation')
        }
      })
      // An explicit test-process boundary, not a production unknown cast.
      return child as ChildProcessWithoutNullStreams
    },
  })
  client.useSession({ scope, accessToken: 'synthetic-private-access' })
  return { client, counts: () => ({ writes, queries }) }
}

it.each(['reply', 'event'] as const)(
  'malformed %s after the write recovers the exact journal on the first start',
  async (mode) => {
    const fixture = transport(mode),
      grants = new ToolInstallAuthorizations(fixture.client)
    try {
      const issued = await grants.prepare(owner, 'codex').then(view => view.plan)
      await expect(grants.start(owner, issued)).resolves.toEqual(completed)
      expect(fixture.counts()).toEqual({ writes: 1, queries: 1 })
      await expect(grants.active(owner)).resolves.toBeNull()
    } finally {
      await fixture.client.dispose()
    }
  },
)

it('a failed readback after an invalid reply stays unknown and the ordinary page query later recovers it', async () => {
  const fixture = transport('reply', true),
    grants = new ToolInstallAuthorizations(fixture.client)
  try {
    const issued = await grants.prepare(owner, 'codex').then(view => view.plan)
    await expect(grants.start(owner, issued)).rejects.toMatchObject({ code: 'NATIVE_RESULT_UNKNOWN' })
    await expect(grants.active(owner)).resolves.toEqual({ plan, run: completed })
    expect(fixture.counts()).toEqual({ writes: 1, queries: 2 })
  } finally {
    await fixture.client.dispose()
  }
})
