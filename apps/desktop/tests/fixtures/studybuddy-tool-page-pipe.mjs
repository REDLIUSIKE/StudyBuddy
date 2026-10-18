// Synthetic read-only protocol peer. It never opens a vault or a tool configuration.
import { NATIVE_TOOLS } from '@studybuddy/contracts'
let pending = Buffer.alloc(0),
  scope,
  seq = 0
const send = (value) => {
  const body = Buffer.from(JSON.stringify(value)),
    head = Buffer.alloc(4)
  head.writeUInt32LE(body.length)
  process.stdout.write(Buffer.concat([head, body]))
}
process.stdin.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk])
  while (pending.length >= 4 && pending.length >= 4 + pending.readUInt32LE(0)) {
    const size = pending.readUInt32LE(0),
      row = JSON.parse(pending.subarray(4, size + 4))
    pending = pending.subarray(size + 4)
    if (!scope) {
      scope = row.scope
      send({ schemaVersion: 2, kind: 'ready', scope, streamId: 'fixture-page-stream', ready: true })
      continue
    }
    let data = []
    if (row.method === 'getNativeToolCatalog')
      data = { schemaVersion: 2, catalogRevision: 'synthetic-page', tools: NATIVE_TOOLS, models: [] }
    if (row.method === 'scanNativeTools')
      data = NATIVE_TOOLS.map((tool) => ({
        id: tool.id,
        name: tool.displayName,
        installed: false,
        noModelConfig: tool.noModelConfig,
      }))
    if (row.method === 'getManagedInstallRoot') data = { configured: false }
    if (row.method === 'listInstallDrives') data = []
    if (row.method === 'getActiveInstall') {
      data = null
      const run = {
        runId: 'fixture-page-run',
        catalogVersion: 'fixture',
        phase: 'preparing',
        components: [],
        rebootRequired: false,
      }
      send({
        schemaVersion: 2,
        kind: 'install-event',
        scope,
        streamId: 'fixture-page-stream',
        runId: run.runId,
        seq: ++seq,
        payload: { sequence: seq, revision: seq, run },
      })
    }
    send({ schemaVersion: 2, kind: 'reply', requestId: row.requestId, scope, data, error: null })
  }
})
process.stdin.on('end', () => process.exit(0))
