// Synthetic v2 pipe fixture. Never opens user configuration or credentials.
let bytes = Buffer.alloc(0), scope, sequence = 0, deferredSourceReply
const mode = process.argv[2], streamId = process.argv[3] || 'new-stream'
function send(value) {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4)
  header.writeUInt32LE(body.length)
  process.stdout.write(Buffer.concat([header, body]))
}
function event(stream = streamId, seq = ++sequence, owner = scope) {
  const run={runId:'fixture-run',catalogVersion:'fixture',phase:'preparing',components:[],rebootRequired:false}
  if(mode==='invalid-event-phase')run.phase='invented'
  if(mode==='invalid-event-extra')run.command='not-allowed'
  send({schemaVersion:2,kind:'install-event',scope:owner,streamId:stream,runId:'fixture-run',seq,
    payload:{sequence:seq,revision:seq,run}})
}
process.stdin.on('data', chunk => {
  bytes = Buffer.concat([bytes, chunk])
  while (bytes.length >= 4 && bytes.length >= 4 + bytes.readUInt32LE(0)) {
    const length = bytes.readUInt32LE(0), request = JSON.parse(bytes.subarray(4, 4 + length).toString('utf8'))
    bytes = bytes.subarray(4 + length)
    if (!scope) {
      if (request.schemaVersion !== 2 || !request.scope) process.exit(2)
      scope = request.scope
      send({schemaVersion:2,kind:'ready',scope,streamId,ready:true})
      continue
    }
    if (mode === 'invalid-length') {const header=Buffer.alloc(4);header.writeUInt32LE(16*1024*1024+1);process.stdout.write(header);continue}
    if (mode === 'partial-header') {process.stdout.write(Buffer.from([1,0]));setTimeout(()=>process.exit(2),10);continue}
    if (mode === 'restart') {event('old-stream',101);event();event(streamId,2,{accountId:'foreign',generation:scope.generation})}
    else for (let i=0;i<(mode==='mixed'?5:1);++i) event()
    const reply={schemaVersion:2,kind:'reply',requestId:request.requestId,scope,data:request.method==='syncNativeModelCatalogs'?{schemaVersion:1,records:[]}:[],error:null}
    if (mode === 'blocked-tool-operation' && request.method === 'syncNativeModelCatalogs') continue
    if (mode === 'blocked-source-read' && request.method === 'listNativeUserSourcesV3') { deferredSourceReply = reply; continue }
    if (deferredSourceReply) { send(deferredSourceReply); deferredSourceReply = undefined }
    if (mode === 'delayed') setTimeout(()=>send(reply),100)
    else send(reply)
  }
})
