import { randomUUID } from 'node:crypto'
let bytes=Buffer.alloc(0),scope,streamId=randomUUID(),heldReport,heldOther;const views=new Map()
const send=value=>{const payload=Buffer.from(JSON.stringify(value));const header=Buffer.alloc(4);header.writeUInt32LE(payload.length);process.stdout.write(Buffer.concat([header,payload]))}
process.stdin.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(bytes.length>=4&&bytes.length>=4+bytes.readUInt32LE(0)){
  const size=bytes.readUInt32LE(0),request=JSON.parse(bytes.subarray(4,4+size));bytes=bytes.subarray(4+size)
  if(!scope){scope=request.scope;send({kind:'ready',schemaVersion:2,scope,streamId,ready:true});continue}
  const id=request.args[0];let data
  if(request.method==='uploadSupportLogs'){
    data={state:'available',flow:'logs',requestId:id,log:{uploadId:'123e4567-e89b-42d3-a456-426614174003',publicCode:'LOG-8K2P7M4Q',status:'AVAILABLE'}};views.set(id,data)
    const event=(sequence,phase,operation,eventScope=scope,eventStream=streamId)=>send({kind:'support-event',schemaVersion:2,scope:eventScope,streamId:eventStream,payload:{requestId:id,sequence,phase,operation}})
    event(1,'preparing',{state:'running',flow:'logs',requestId:id,phase:'preparing'});event(2,'completed',data);event(2,'completed',data)
    event(3,'completed',data,{...scope,generation:scope.generation+1});event(3,'completed',data,scope,randomUUID())
  }else if(request.method==='submitSupportIssue'){
    heldReport=request;const operation={state:'running',flow:'issue',requestId:id,phase:'uploading'};views.set(id,operation)
    send({kind:'support-event',schemaVersion:2,scope,streamId,payload:{requestId:id,sequence:1,phase:'uploading',operation}});continue
  }else if(request.method==='getSupportOperation'){
    if(heldReport){const reportId=heldReport.args[0],log={uploadId:'123e4567-e89b-42d3-a456-426614174003',publicCode:'LOG-8K2P7M4Q',status:'AVAILABLE'}
      const available={state:'available',flow:'issue',requestId:reportId,log,issue:{issueId:'123e4567-e89b-42d3-a456-426614174004',publicCode:'ISSUE-8K2P7M4Q',logUploadId:log.uploadId,logPublicCode:log.publicCode,status:'OPEN'}}
      views.set(reportId,available);send({kind:'reply',schemaVersion:2,requestId:heldReport.requestId,scope,data:available,error:null});heldReport=undefined
      if(heldOther){send({kind:'reply',schemaVersion:2,requestId:heldOther.requestId,scope,data:[],error:null});heldOther=undefined}
    }
    data=views.get(id)??{state:'idle'}
  }else if(request.method==='scanNativeTools'){heldOther=request;continue}
  else if(request.method==='readSupportPreviousExit')data={detected:false}
  else if(request.method==='recordHarnessDiagnostics')data={recorded:request.args[0].events.length,duplicates:0}
  else {send({kind:'reply',schemaVersion:2,requestId:request.requestId,scope,data:null,error:{code:'NATIVE_OPERATION_DENIED'}});continue}
  send({kind:'reply',schemaVersion:2,requestId:request.requestId,scope,data,error:null})
}})
