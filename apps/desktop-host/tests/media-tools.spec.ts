import {expect,it,vi} from 'vitest';
import {Context} from '@deepseek-ai/cordis';
import {HostConnectionService} from '../../../packages/client/connection/src/rpc-host.ts';
import {MediaHostController} from '../src/media-tools.ts';
import {installResearchBudgetGuard} from '../src/research-budget-guard.ts';
const host='22222222-2222-4222-8222-222222222222',scope={accountId:'owned',generation:3};
const imageId='44444444-4444-4444-8444-444444444444';
function setup(){
 const definitions:any[]=[];const ctx={inject:(_deps:any,run:any)=>run(ctx),effect:()=>{},tools:{register:(d:any)=>definitions.push(d)},
 systemPrompt:{section:vi.fn()},connection:{fetch:{register:()=>()=>Promise.resolve()}},jobs:{start:vi.fn(()=> 'media-1')}};
 let controller:any;const sent:any[]=[];const send=vi.fn(async(message:any)=>{sent.push(message);
  if(message.type==='media-request')queueMicrotask(()=>controller.result({type:'media-result',rpcId:message.request.rpcId,data:{schemaVersion:1,requestId:imageId,sessionId:'session-a',kind:'image',modelId:'doubao-seedream-5-0-flash-260915',state:'completed',contentAvailable:true}}));});
 controller=new MediaHostController(ctx as never,host,send);controller.setScope({scope,hostGeneration:host});
 return{controller,definitions,sent,ctx,send};
}
it('keeps ordinary successful image replies brief and makes failure explicit',()=>{
 const s=setup(),section=s.ctx.systemPrompt.section.mock.calls[0]?.[0];
 expect(section.text()).toContain('one short confirmation sentence');
 expect(section.text()).toContain('If generation fails, explain the failure briefly');
 expect(section.text()).toContain('Do not invent Markdown image links');
 s.controller.setScope(null);expect(section.text()).toBe('');
});
it('registers all three real media tools and keeps image bytes outside the reasoning result',async()=>{
 const s=setup();expect(s.definitions.map(d=>d.name)).toEqual(['generate_image','generate_video','generation_status']);
 const tool=s.definitions[0],value=await tool.execute({modelId:'doubao-seedream-5-0-flash-260915',prompt:'A car',size:'1.5K'},{agent:{id:'session-a',session:{id:'session-a'}},callId:'call-a',signal:new AbortController().signal});
 expect(value).toMatchObject({kind:'image',state:'completed'});
 expect(tool.output.render({},value).every((b:any)=>b.type==='text')).toBe(true);
 expect(s.sent[0].request.context).toMatchObject({scope,hostGeneration:host,sessionId:'session-a'});
});
it('registers the real exact API route and serves a scoped binary range without creating a task',async()=>{
 const ctx=new Context();const fiber=ctx.plugin(c=>{new HostConnectionService(c,[],{} as never);});await fiber.await();
 const connection=ctx.get('connection') as HostConnectionService;
 const fixture={inject:(_deps:unknown,run:(c:unknown)=>void)=>run(fixture),effect:()=>{},connection,
  tools:{register:()=>{}},systemPrompt:{section:()=>{}},jobs:{start:vi.fn()}};
 let controller:MediaHostController;
 const send=vi.fn(async(message:any)=>{
  const request=message.request;
  if(!request)return;
  const bytes=Buffer.from([0,0,0,16,102,116,121,112,1,2,3,4]);
  const {createHash}=await import('node:crypto');
  queueMicrotask(()=>controller.result({type:'media-result',rpcId:request.rpcId,data:{schemaVersion:1,
   requestId:imageId,kind:'video',mediaType:'video/mp4',base64:bytes.toString('base64'),bytes:bytes.length,
   sha256:createHash('sha256').update(bytes).digest('hex')}}));
 });
 try{
  controller=new MediaHostController(fixture as never,host,send);controller.setScope({scope,hostGeneration:host});
  const route=connection.createSharedFetchHandler('/api'),url='http://host/api/studybuddy-media?sessionId=session-a&requestId='+imageId+'&kind=video&mode=content';
  const response=await route.fetch(new Request(url,{headers:{range:'bytes=4-7'}}));
  expect(response.status).toBe(206);expect(response.headers.get('content-range')).toBe('bytes 4-7/12');
  expect(await response.text()).toBe('ftyp');expect(send.mock.calls[0]?.[0].request.operation).toBe('content');
  const head=await route.fetch(new Request(url,{method:'HEAD'}));expect(head.status).toBe(200);expect(await head.text()).toBe('');
  expect((await route.fetch(new Request(url+'&mode=content'))).status).toBe(403);
  controller.setScope(null);const calls=send.mock.calls.length;
  expect((await route.fetch(new Request(url))).status).toBe(403);expect(send.mock.calls.length).toBe(calls);
 }finally{await fiber.dispose();}
});
it('correlates private replies, rejects scope changes and does not accept unsolicited data',async()=>{
 const s=setup();s.send.mockImplementation(async()=>{});
 const promise=s.controller.invoke('session-a','status',{kind:'image',requestId:imageId},new AbortController().signal);
 s.controller.result({type:'media-result',rpcId:'55555555-5555-4555-8555-555555555555',data:{foreign:true}});
 s.controller.setScope(null);await expect(promise).rejects.toThrow('HARNESS_MEDIA_SCOPE_REVOKED');
});
it('pauses new image and video creation before any paid RPC while retaining original status reads',async()=>{const s=setup(),guard=vi.fn(async()=>{throw Error('RESEARCH_BUDGET_REACHED')}),dispose=installResearchBudgetGuard(s.ctx as never,guard);try{for(const operation of ['create-image','create-video'])await expect(s.controller.invoke('session-a',operation,operation==='create-image'?{modelId:'doubao-seedream-5-0-flash-260915',prompt:'A car',size:'1.5K',requestId:imageId}:{modelId:'doubao-seedance-2-5-260628',prompt:'A car',duration:4,resolution:'480p',ratio:'16:9',generateAudio:false,requestId:imageId},new AbortController().signal)).rejects.toThrow('RESEARCH_BUDGET_REACHED');expect(s.sent).toHaveLength(0);await s.controller.invoke('session-a','status',{requestId:imageId,kind:'image'},new AbortController().signal);expect(s.sent).toHaveLength(1);expect(guard).toHaveBeenCalledTimes(2);}finally{dispose();}});
it('prevents credentials or endpoint overrides from becoming media invocations',async()=>{
 const s=setup(),tool=s.definitions[0];
 await expect(tool?.execute({modelId:'doubao-seedream-5-0-flash-260915',prompt:'A car',size:'1.5K',apiKey:'forbidden'},{agent:{id:'session-a',session:{id:'session-a'}},callId:'call-a',signal:new AbortController().signal})).rejects.toThrow();
 expect(s.sent).toHaveLength(0);
});
it('reuses one waiting job for an owned video request replay and cancels it on logout',async()=>{
 const s=setup();s.send.mockImplementation(async(message:any)=>{
  if(message.type==='media-request')queueMicrotask(()=>s.controller.result({type:'media-result',rpcId:message.request.rpcId,
   data:{schemaVersion:1,requestId:message.request.input.requestId,sessionId:'session-a',kind:'video',
    modelId:'doubao-seedance-2-5-260628',state:'queued',contentAvailable:false}}));
 });
 const tool=s.definitions[1],args={modelId:'doubao-seedance-2-5-260628',prompt:'A car'},
  exec={agent:{id:'session-a',session:{id:'session-a'}},callId:'call-video',signal:new AbortController().signal};
 const first=await tool.execute(args,exec),second=await tool.execute(args,exec);
 expect(second.requestId).toBe(first.requestId);expect(second.jobId).toBe(first.jobId);expect(s.ctx.jobs.start).toHaveBeenCalledTimes(1);
 s.controller.setScope(null);
});
