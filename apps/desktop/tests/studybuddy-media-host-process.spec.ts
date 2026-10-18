import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {expect,it,vi} from 'vitest';
import {DesktopHostProcess} from '../src/host-process.ts';
it('only admits media IPC from the actual Host generation and returns correlated private results',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sb-media-host-'));
 const entry=join(root,'node_modules','@deepseek-ai','dsh-desktop-host','lib');await mkdir(entry,{recursive:true});
 const hostGeneration='22222222-2222-4222-8222-222222222222';
 await writeFile(join(entry,'index.js'),`import {createServer} from 'node:http';
 const server=createServer((req,res)=>{const id=crypto.randomUUID();const request={schemaVersion:1,rpcId:id,context:{scope:{accountId:'owned',generation:3},hostGeneration:req.url==='/foreign'?'33333333-3333-4333-8333-333333333333':'${hostGeneration}',sessionId:req.url==='/slow'?'session-b':'session-a'},operation:'status',input:{requestId:'44444444-4444-4444-8444-444444444444',kind:'image'}};
 const listener=m=>{if(m.type==='media-result'&&m.rpcId===id){process.off('message',listener);res.end(JSON.stringify(m));}};process.on('message',listener);process.send({type:'media-request',request});});
 server.listen(0,'127.0.0.1',()=>process.send({type:'ready',hostGeneration:'${hostGeneration}',url:'http://127.0.0.1:'+server.address().port}));
 process.on('message',m=>{if(m.type==='shutdown'){server.closeAllConnections();server.close(()=>{process.send({type:'shutdown-complete'},()=>process.exit(0));});}});`)
 let waiting:AbortSignal|undefined;
 const handle=vi.fn(async(request:any,signal:AbortSignal)=>{
  if(request.context.sessionId==='session-b'){waiting=signal;return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({state:'unknown'}),{once:true}));}
  return{state:'completed'};
 });
 const host=new DesktopHostProcess(process.execPath,root,root,undefined,process.env,undefined,undefined,undefined,undefined,undefined,undefined,handle);
 try{const ready=await host.start(),reply=await(await fetch(ready.url+'/owned',{signal:AbortSignal.timeout(4000)})).json();expect(reply.data).toEqual({state:'completed'});expect(handle).toHaveBeenCalledTimes(1);
  const foreign=await(await fetch(ready.url+'/foreign',{signal:AbortSignal.timeout(4000)})).json();expect(foreign.error).toBe('HARNESS_MEDIA_SCOPE_REVOKED');expect(handle).toHaveBeenCalledTimes(1);
  const pending=fetch(ready.url+'/slow',{signal:AbortSignal.timeout(4000)}).catch(()=>null);
  await vi.waitFor(()=>expect(waiting).toBeDefined());await host.stop();await pending;expect(waiting?.aborted).toBe(true);
 }finally{await host.stop();}
});
