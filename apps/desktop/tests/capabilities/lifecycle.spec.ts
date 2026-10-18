import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect,it,vi} from 'vitest'
import {DesktopHostProcess} from '../../src/host-process.ts'
it('private capability IPC rejects another Host and cancels owned work on stop',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sb-cap-host-')),entry=join(root,'node_modules/@deepseek-ai/dsh-desktop-host/lib');await mkdir(entry,{recursive:true})
 const generation='22222222-2222-4222-8222-222222222222'
 await writeFile(join(entry,'index.js'),`import{createServer}from'node:http';const server=createServer((req,res)=>{const rpcId=crypto.randomUUID(),caller={scope:{accountId:'account-a',generation:1},hostGeneration:req.url==='/foreign'?'33333333-3333-4333-8333-333333333333':'${generation}',callerSessionId:req.url==='/slow'?'slow-session':'ordinary-session',workspaceId:null,toolCallId:'call-a'};const listener=value=>{if(value.type==='capability-result'&&value.rpcId===rpcId){process.off('message',listener);res.end(JSON.stringify(value));}};process.on('message',listener);process.send({type:'capability-request',request:{schemaVersion:1,rpcId,caller,operation:'catalog',target:null,input:{moduleId:'video'}}});});server.listen(0,'127.0.0.1',()=>process.send({type:'ready',hostGeneration:'${generation}',url:'http://127.0.0.1:'+server.address().port}));process.on('message',value=>{if(value.type==='shutdown'){server.closeAllConnections();server.close(()=>process.send({type:'shutdown-complete'},()=>process.exit(0)));}});`)
 let waiting:AbortSignal|undefined
 const handle=vi.fn(async(request:any,signal:AbortSignal)=>{if(request.caller.callerSessionId==='slow-session'){waiting=signal;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}return{data:{ready:true},artifacts:[],operationRef:null}})
 const args:any[]=[process.execPath,root,root,undefined,process.env];args[17]=handle
 const host=Reflect.construct(DesktopHostProcess,args) as DesktopHostProcess
 try{
  const ready=await host.start(),reply=await(await fetch(ready.url+'/owned',{signal:AbortSignal.timeout(4000)})).json();expect(reply.data.data.ready).toBe(true)
  const foreign=await(await fetch(ready.url+'/foreign',{signal:AbortSignal.timeout(4000)})).json();expect(foreign.error).toBe('CAPABILITY_SCOPE_REVOKED');expect(handle).toHaveBeenCalledTimes(1)
  const slow=fetch(ready.url+'/slow',{signal:AbortSignal.timeout(4000)}).catch(()=>null);await vi.waitFor(()=>expect(waiting).toBeDefined());await host.stop();await slow;expect(waiting?.aborted).toBe(true)
 }finally{await host.stop();await rm(root,{recursive:true,force:true})}
})
