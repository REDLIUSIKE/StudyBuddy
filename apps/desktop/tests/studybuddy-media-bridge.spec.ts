import {expect,it,vi} from 'vitest';
import {HarnessMediaBridge} from '../src/studybuddy/media-bridge.ts';
const scope={accountId:'11111111-1111-4111-8111-111111111111',generation:3};
const host='22222222-2222-4222-8222-222222222222',id='44444444-4444-4444-8444-444444444444';
const context={scope,hostGeneration:host,sessionId:'session-a'};
const input={requestId:id,modelId:'doubao-seedream-5-0-flash-260915',prompt:'A car',size:'1.5K'};
const invocation={schemaVersion:1,rpcId:id,context,operation:'create-image',input};
function setup(){
 let current={...scope};const rows=new Map<string,any>();let post=0;
 const task={schemaVersion:1,requestId:id,modelId:input.modelId,state:'completed',contentAvailable:true};
 const api={request:vi.fn(async(_s:any,p:string,body?:any)=>{if(p==='/images/catalog')return{schemaVersion:1,models:[{modelId:input.modelId,providerId:'owned-image',type:'image'}]};
  if(p==='/catalog')return{schemaVersion:1,models:[{modelId:'doubao-seedance-2-5-260628',providerId:'owned-video',type:'video'}]};
  if(body){post++;return task;}return task;}),
 content:vi.fn(async()=>new Response(new Uint8Array([137,80,78,71,13,10,26,10,1]),{headers:{'content-type':'image/png'}}))};
 const journal={claim:vi.fn(async(row:any)=>{const old=rows.get(row.requestId);if(old)return{row:old,created:false};rows.set(row.requestId,row);return{row,created:true};}),
 get:vi.fn(async(accountId:string,requestId:string)=>{const row=rows.get(requestId);return row?.accountId===accountId?row:null;})};
 const bridge=new HarnessMediaBridge({scope:()=>current,api,journal});
 return{bridge,api,journal,rows,post:()=>post,setScope:(value:any)=>{current=value;}};
}
it('forwards one exact image through the existing account API and reuses its owned request ID',async()=>{
 const s=setup();expect(await s.bridge.handle(invocation,host)).toMatchObject({requestId:id,kind:'image',sessionId:'session-a',state:'completed'});
 expect(await s.bridge.handle({...invocation,rpcId:'55555555-5555-4555-8555-555555555555'},host)).toMatchObject({requestId:id,state:'completed'});
 expect(s.post()).toBe(1);expect(s.api.request.mock.calls.find(c=>c[1]==='/images/requests')?.[2]).toMatchObject({requestId:id,handle:'owned-image',prompt:'A car',modelId:input.modelId,size:'1.5K'});
});
it('cannot reuse a request ID with different content or a different conversation',async()=>{
 const s=setup();await s.bridge.handle(invocation,host);
 await expect(s.bridge.handle({...invocation,input:{...input,prompt:'other'}},host)).rejects.toThrow('HARNESS_MEDIA_REQUEST_CONFLICT');
 await expect(s.bridge.handle({...invocation,operation:'status',context:{...context,sessionId:'foreign'},input:{requestId:id,kind:'image'}},host)).rejects.toThrow('HARNESS_MEDIA_TASK_NOT_FOUND');
 expect(s.post()).toBe(1);
});
it('checks account generation after a paid submission and prevents its late result delivery',async()=>{
 const s=setup(),original=s.api.request;s.api.request=vi.fn(async(...args:any[])=>{const result=await (original as any)(...args);if(args[2])s.setScope({...scope,generation:4});return result;});
 await expect(s.bridge.handle(invocation,host)).rejects.toThrow('HARNESS_MEDIA_SCOPE_REVOKED');expect(s.post()).toBe(1);
});
it('does not create a second paid request after an unknown network outcome',async()=>{
  const s=setup();s.api.request=vi.fn(async(_scope:any,p:string,body?:any)=>{if(p==='/images/catalog')return{schemaVersion:1,models:[{modelId:input.modelId,providerId:'owned-image',type:'image'}]};if(body)throw Error('network lost');return{schemaVersion:1,requestId:id,modelId:input.modelId,state:'queued',contentAvailable:false};});
 expect(await s.bridge.handle(invocation,host)).toMatchObject({requestId:id,sessionId:'session-a',kind:'image',state:'unknown',contentAvailable:false});
 expect(await s.bridge.handle(invocation,host)).toMatchObject({state:'queued'});expect(s.api.request.mock.calls.filter(c=>c[2]).length).toBe(1);
});
it('only returns bounded owned media bytes and refuses mismatched MIME',async()=>{
 const s=setup();await s.bridge.handle(invocation,host);const lookup={...invocation,operation:'content',input:{requestId:id,kind:'image'}};
 expect(await s.bridge.handle(lookup,host)).toMatchObject({requestId:id,mediaType:'image/png',bytes:9});
 s.api.content=vi.fn(async()=>new Response('not-an-image',{headers:{'content-type':'text/html'}}));
 await expect(s.bridge.handle(lookup,host)).rejects.toThrow('HARNESS_MEDIA_CONTENT_INVALID');
});
it('rejects stale Host and credential injection before touching the API',async()=>{
 const s=setup();await expect(s.bridge.handle(invocation,'foreign')).rejects.toThrow('HARNESS_MEDIA_SCOPE_REVOKED');
 await expect(s.bridge.handle({...invocation,input:{...input,apiKey:'forbidden'}},host)).rejects.toThrow();expect(s.api.request).not.toHaveBeenCalled();
});
it('completed cross-session reads require an explicit source grant and never generate again',async()=>{
 const s=setup();await s.bridge.handle(invocation,host)
 const caller={scope,hostGeneration:host,callerSessionId:'foreign-session',workspaceId:null,toolCallId:'import-call'}
 const deny=vi.fn(async()=>{throw Error('CAPABILITY_SOURCE_NOT_AUTHORIZED')})
 await expect(s.bridge.readCompletedContent(caller,id,'image',host,deny)).rejects.toThrow('CAPABILITY_SOURCE_NOT_AUTHORIZED')
 expect(s.api.content).not.toHaveBeenCalled()
 const allow=vi.fn(async(row:any,actual:any)=>{expect(row.sessionId).toBe('session-a');expect(actual.callerSessionId).toBe('foreign-session')})
 expect(await s.bridge.readCompletedContent(caller,id,'image',host,allow)).toMatchObject({requestId:id,bytes:9})
 expect(s.post()).toBe(1);expect(allow).toHaveBeenCalledTimes(1)
})
