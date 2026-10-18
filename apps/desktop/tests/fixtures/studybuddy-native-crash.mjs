// Real child fixture: bootstrap over the pipe, accept one frame, lose its result.
let bytes=Buffer.alloc(0),ready=false
process.stdin.on('data',chunk=>{
  bytes=Buffer.concat([bytes,chunk])
  while(bytes.length>=4&&bytes.length>=4+bytes.readUInt32LE(0)){
    const length=bytes.readUInt32LE(0),request=JSON.parse(bytes.subarray(4,4+length).toString('utf8'));bytes=bytes.subarray(4+length)
    if(ready)process.exit(1)
    ready=true
    const payload=Buffer.from(JSON.stringify({schemaVersion:2,kind:'ready',scope:request.scope,streamId:'fixture-stream',ready:true})),header=Buffer.alloc(4)
    header.writeUInt32LE(payload.length);process.stdout.write(Buffer.concat([header,payload]))
  }
})
