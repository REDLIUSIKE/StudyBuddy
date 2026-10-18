// Synthetic install worker. No filesystem, network or real tool access.
let scope,starting;let bytes=Buffer.alloc(0);
const run={runId:'run-12345678-12345678-12345678',catalogVersion:'fixture',phase:'installing',components:[],rebootRequired:false};
function send(value){const body=Buffer.from(JSON.stringify(value));const header=Buffer.alloc(4);header.writeUInt32LE(body.length);process.stdout.write(Buffer.concat([header,body]));}
function reply(request,data){send({schemaVersion:2,kind:'reply',scope,requestId:request.requestId,data,error:null});}
function receive(request){
 if(!scope){scope=request.scope;send({schemaVersion:2,kind:'ready',scope,streamId:'fixture-install-stream',ready:true});return;}
 if(request.method==='getConfigurationViews'){reply(request,[]);return;}
 if(request.method==='getNativeToolCatalog'){send({schemaVersion:2,kind:'reply',scope,requestId:request.requestId,data:null,error:{code:'NATIVE_CONNECTION_RATE_LIMITED',message:'连接服务请求过于频繁，请重试原操作。',requestId:'fixture-request-123',availableAt:'2026-10-11T00:00:00Z'}});return;}
 if(request.method==='startInstall'){starting=request;send({schemaVersion:2,kind:'install-event',scope,streamId:'fixture-install-stream',runId:run.runId,seq:1,payload:{sequence:1,revision:1,run}});return;}
 if(request.method==='getInstallRun'){reply(request,run);return;}
 if(request.method==='cancelInstall'){const cancelled={...run,phase:'cancelled'};reply(request,cancelled);reply(starting,cancelled);return;}
 process.exitCode=2;process.stdin.destroy();
}
process.stdin.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(bytes.length>=4){const n=bytes.readUInt32LE();if(bytes.length<n+4)return;const value=JSON.parse(bytes.subarray(4,n+4).toString());bytes=bytes.subarray(n+4);receive(value);}});
