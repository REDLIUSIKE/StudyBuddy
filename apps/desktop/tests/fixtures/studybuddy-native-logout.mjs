// Private child fixture retains an original logout checkpoint after one failed proof.
let bytes = Buffer.alloc(0), scope, attempts = 0
function send(value) {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4)
  header.writeUInt32LE(body.length)
  process.stdout.write(Buffer.concat([header, body]))
}
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk])
  while (bytes.length >= 4 && bytes.length >= 4 + bytes.readUInt32LE(0)) {
    const length = bytes.readUInt32LE(0), request = JSON.parse(bytes.subarray(4, 4 + length).toString('utf8'))
    bytes = bytes.subarray(4 + length)
    if (!scope) { scope = request.scope; send({ schemaVersion: 2, kind:'ready', scope, streamId:'fixture-stream', ready: true }); continue }
    if (request.method !== 'logoutNativeAccount') continue
    ++attempts
    const retry = process.argv[2] === 'retry' && attempts === 1
    send({ schemaVersion: 2, kind:'reply', requestId: request.requestId, scope, data: retry ? null : { localCleared: true, remoteRevoked: true, persistentCleanupRequired: process.argv[2] === 'repair' }, error: retry ? { code: 'INVALID_RESPONSE' } : null })
  }
})
