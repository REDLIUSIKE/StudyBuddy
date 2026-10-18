// Synthetic private stdio fixture. Disk data is test-only and contains no credentials.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2], behavior = process.argv[3]
const checkpoint = join(directory, 'checkpoint.json'), events = join(directory, 'events.jsonl')
const complete = { localCleared: true, remoteRevoked: true, persistentCleanupRequired: false }
let bytes = Buffer.alloc(0), bootstrapped = false, recovering = false, scope
function read() { return JSON.parse(readFileSync(checkpoint, 'utf8')) }
function send(value, exit = false) {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4)
  header.writeUInt32LE(body.length)
  process.stdout.write(Buffer.concat([header, body]), () => { if (exit) process.exit(0) })
}
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk])
  while (bytes.length >= 4 && bytes.length >= 4 + bytes.readUInt32LE(0)) {
    const length = bytes.readUInt32LE(0), request = JSON.parse(bytes.subarray(4, 4 + length).toString('utf8'))
    bytes = bytes.subarray(4 + length)
    appendFileSync(events, JSON.stringify({ keys: Object.keys(request), ...(request.mode ? { mode: request.mode } : {}), ...(request.method ? { method: request.method } : {}) }) + '\n')
    if (!bootstrapped) {
      bootstrapped = true; recovering = request.mode === 'recoverLogout'; scope = request.scope
      send({ schemaVersion: 2, kind:recovering?'logout-recovery':'ready', ready: true, ...(recovering ? { logoutRecovery: read() } : {scope,streamId:'fixture-stream'}), ...(behavior === 'outer-extra' ? { accessToken: 'fixture-access' } : {}) })
      continue
    }
    if (recovering) {
      if (request.mode !== 'acknowledgeLogout') { send({ schemaVersion: 2, kind:'logout-ack', acknowledged: false, error: { code: 'NATIVE_LOGOUT_ACK_FAILED' } }); continue }
      if (read().state !== 'complete' || behavior === 'ack-fail') { send({ schemaVersion: 2, kind:'logout-ack', acknowledged: false, error: { code: 'NATIVE_LOGOUT_ACK_FAILED' } }); continue }
      writeFileSync(checkpoint, JSON.stringify({ state: 'none' }))
      if (behavior === 'ack-drop-once' && !existsSync(join(directory, 'dropped'))) { writeFileSync(join(directory, 'dropped'), '1'); process.exit(0) }
      send({ schemaVersion: 2, kind:'logout-ack', acknowledged: true }, true)
      continue
    }
    if (request.method === 'logoutNativeAccount') {
      writeFileSync(checkpoint, JSON.stringify({ state: 'complete', outcome: complete }))
      send({ schemaVersion: 2, kind:'reply', requestId: request.requestId, scope, data: complete, error: null })
    }
  }
})
