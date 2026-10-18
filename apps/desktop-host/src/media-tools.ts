/** Native conversational media plugin, with private Main RPC and owned background waiting. */
import {createHash,randomUUID} from 'node:crypto'
import {defineTool} from '@deepseek-ai/dsh-tools'
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import {
 HARNESS_IMAGE_MODELS,HARNESS_VIDEO_MODEL,parseHarnessMediaInvocationV1,parseNativeBuiltinHostContextV1,
} from '@studybuddy/contracts'
import type {OwnedScope,HarnessMediaContextV1,HarnessMediaInvocationV1,HarnessMediaTaskV1,HarnessMediaContentV1} from '@studybuddy/contracts'
import {assertResearchModelBudget} from './research-budget-guard.ts'

declare module '@deepseek-ai/dsh-jobs/view' {interface JobKindMap {media:'media'}}
const taskSchema={type:'object',additionalProperties:false,properties:{
 schemaVersion:{type:'integer',required:true},requestId:{type:'string',required:true},sessionId:{type:'string',required:true},
 kind:{type:'string',enum:['image','video'],required:true},modelId:{type:'string',required:true},
 state:{type:'string',enum:['queued','in_progress','completed','failed','unknown'],required:true},
 contentAvailable:{type:'boolean',required:true},jobId:{type:'string'},
}} as const
function task(value:unknown):HarnessMediaTaskV1 {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('HARNESS_MEDIA_RESPONSE_INVALID')
 const r=value as HarnessMediaTaskV1
 if(r.schemaVersion!==1||typeof r.requestId!=='string'||typeof r.sessionId!=='string'||
  !['image','video'].includes(r.kind)||![...HARNESS_IMAGE_MODELS,HARNESS_VIDEO_MODEL].includes(r.modelId as never)||
  !['queued','in_progress','completed','failed','unknown'].includes(r.state)||typeof r.contentAvailable!=='boolean')throw Error('HARNESS_MEDIA_RESPONSE_INVALID')
 return{schemaVersion:1,requestId:r.requestId,sessionId:r.sessionId,kind:r.kind,modelId:r.modelId,state:r.state,contentAvailable:r.contentAvailable}
}
function nonce(account:string,session:string,call:string):string {
 const b=createHash('sha256').update(JSON.stringify([account,session,call])).digest().subarray(0,16)
 b[6]=((b[6]??0)&15)|64;b[8]=((b[8]??0)&63)|128
 const s=b.toString('hex');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20)
}
interface Pending {
 context:HarnessMediaContextV1;resolve(value:unknown):void;reject(error:Error):void
 timer:ReturnType<typeof setTimeout>;cleanup():void
}
/** Installed once in the actual Desktop Host; no callable page-side control methods. */
export class MediaHostController {
 private scope:OwnedScope|undefined
 private readonly pending=new Map<string,Pending>()
 private readonly waits=new Map<string,{controller:AbortController;jobId:string}>()
 constructor(private readonly ctx:Context,private readonly hostGeneration:string,private readonly send:(message:object)=>Promise<void>){
  ctx.inject(['tools','jobs','connection','systemPrompt'],ctx=>{
   for(const definition of this.definitions())ctx.tools.register(definition)
   ctx.connection.fetch.register({path:'/api/studybuddy-media',methods:['GET','HEAD'],requestBody:'buffered',fetch:request=>this.fetch(request)})
   ctx.systemPrompt.section({name:'studybuddy-media-tools',order:80,text:()=>this.scope?
    'When asked to create an image or video, use generate_image or generate_video. Use the exact approved model ID. Never invent a completed generation. Media is displayed by the application; image input support is not required to invoke generation. A requestId or taskId is a correlation identifier, not a file path or image URL. Do not invent Markdown image links from those identifiers. For an existing request use generation_status, never generate again just to check progress. After successful image generation for a simple image request, finish with one short confirmation sentence. Include technical details only when the user asks. If generation fails, explain the failure briefly and never claim success.':''})
  })
  ctx.effect(()=>()=>this.setScope(null))
 }
 /** Main-owned account epoch; updates revoke old RPCs, waits and notifications. */
 setScope(value:unknown):void {
  const next=value===null?undefined:parseNativeBuiltinHostContextV1(value)
  if(next&&next.hostGeneration!==this.hostGeneration)throw Error('HARNESS_MEDIA_SCOPE_REVOKED')
  if(JSON.stringify(next?.scope)===JSON.stringify(this.scope))return
  this.scope=next?.scope
  for(const [id,p] of this.pending){clearTimeout(p.timer);p.cleanup();p.reject(Error('HARNESS_MEDIA_SCOPE_REVOKED'));this.pending.delete(id)
   void this.send({type:'media-cancel',rpcId:id,context:p.context}).catch(()=>{})}
  for(const wait of this.waits.values())wait.controller.abort();this.waits.clear()
 }
 private context(sessionId:string):HarnessMediaContextV1 {
  if(!this.scope)throw Error('HARNESS_MEDIA_SCOPE_REVOKED')
  return{scope:{...this.scope},hostGeneration:this.hostGeneration,sessionId}
 }
 private current(context:HarnessMediaContextV1):boolean {
  return this.scope?.accountId===context.scope.accountId&&this.scope.generation===context.scope.generation
 }
 /** Correlate one private response to its captured account; unsolicited responses are ignored. */
 result(message:unknown):void {
  if(!message||typeof message!=='object'||!('rpcId' in message)||typeof message.rpcId!=='string')return
  const p=this.pending.get(message.rpcId);if(!p)return
  this.pending.delete(message.rpcId);clearTimeout(p.timer);p.cleanup()
  if(!this.current(p.context)){p.reject(Error('HARNESS_MEDIA_SCOPE_REVOKED'));return}
  const m=message as {data?:unknown;error?:unknown}
  if(m.error!==undefined){p.reject(Error(typeof m.error==='string'&&/^(?:HARNESS_MEDIA|AIGC)_[A-Z_]{1,64}$/.test(m.error)?m.error:'HARNESS_MEDIA_UNAVAILABLE'));return}
  if(!Object.hasOwn(m,'data')){p.reject(Error('HARNESS_MEDIA_RESPONSE_INVALID'));return}p.resolve(m.data)
 }
 async invoke(sessionId:string,operation:HarnessMediaInvocationV1['operation'],input:unknown,signal:AbortSignal):Promise<unknown>{
  signal.throwIfAborted()
  const request=parseHarnessMediaInvocationV1({schemaVersion:1,rpcId:randomUUID(),context:this.context(sessionId),operation,input})
  if(request.operation==='create-image'||request.operation==='create-video')await assertResearchModelBudget(this.ctx,{sessionId,requestId:request.input.requestId,modelId:request.input.modelId,fundingSource:'platform'})
  return new Promise((resolve,reject)=>{
   const abort=()=>{
    const p=this.pending.get(request.rpcId);if(!p)return;this.pending.delete(request.rpcId);clearTimeout(p.timer);p.cleanup()
    void this.send({type:'media-cancel',rpcId:request.rpcId,context:request.context}).catch(()=>{})
    reject(Error('HARNESS_MEDIA_WAIT_CANCELLED'))
   }
   const timer=setTimeout(abort,200000);timer.unref()
   this.pending.set(request.rpcId,{context:request.context,resolve,reject,timer,cleanup:()=>signal.removeEventListener('abort',abort)})
   signal.addEventListener('abort',abort,{once:true})
   void this.send({type:'media-request',request}).catch(()=>{const p=this.pending.get(request.rpcId);if(!p)return;this.pending.delete(request.rpcId);clearTimeout(p.timer);p.cleanup();reject(Error('HARNESS_MEDIA_UNAVAILABLE'))})
  })
 }
 private owner(exec:{agent?:{id:string;session:{id:string}}}):string {
  if(!exec.agent||exec.agent.id!==exec.agent.session.id)throw Error('HARNESS_MEDIA_SESSION_REQUIRED')
  return exec.agent.id
 }
 private background(value:HarnessMediaTaskV1,context:HarnessMediaContextV1,owner:NonNullable<Parameters<Context['jobs']['start']>[0]['owner']>):string {
  if(!this.current(context))throw Error('HARNESS_MEDIA_SCOPE_REVOKED')
  const key=context.scope.accountId+':'+value.sessionId+':'+value.requestId,controller=new AbortController()
  const existing=this.waits.get(key);if(existing)return existing.jobId
  const id=this.ctx.jobs.start({kind:'media',owner,label:'视频生成 · '+value.requestId,outputLimitBytes:2048,
   run:job=>{
    const done=(async()=>{
     try{for(let attempt=0;attempt<400;attempt++){
      if(controller.signal.aborted||!this.current(context))return{status:'killed' as const,detail:'已停止等待；已提交的任务保留原请求 ID'}
      const current=task(await this.invoke(value.sessionId,'status',{requestId:value.requestId,kind:'video'},controller.signal))
      job.updateProgress(current.state==='in_progress'?'视频生成中':'等待视频生成')
      if(current.state==='completed'||current.state==='failed')return{status:current.state==='completed'?'completed' as const:'failed' as const,
       result:JSON.stringify(current),detail:current.state==='completed'?'视频已完成，请查询原请求领取结果':'视频生成失败'}
      await new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',finish);resolve()},
       timer=setTimeout(finish,3000);controller.signal.addEventListener('abort',finish,{once:true});if(controller.signal.aborted)finish()})
     }return{status:'failed' as const,detail:'等待超时；可用原请求 ID 查询进度'}
     }catch{return{status:controller.signal.aborted?'killed' as const:'failed' as const,detail:'进度查询已停止，可查询原请求恢复'}}
     finally{if(this.waits.get(key)?.controller===controller)this.waits.delete(key)}
    })()
    return{cancel:()=>controller.abort(),done}
   }})
  const jobId=String(id);this.waits.set(key,{controller,jobId});return jobId
 }
 /** Purely typed definitions; images/video bytes never enter the reasoning content. */
 definitions(){
  const output={schema:taskSchema,render:(_args:unknown,value:HarnessMediaTaskV1&{jobId?:string})=>[{type:'text' as const,text:JSON.stringify(value)}],
   presentationMeta:(_args:unknown,value:HarnessMediaTaskV1&{jobId?:string})=>({...value})}
  return[
   defineTool({name:'generate_image',description:'生成一张图片并在当前对话展示。modelId 必须是列出的精确模型；用户未指定时建议 Flash。不要用这个工具查询既有任务。',
    parameters:{modelId:{type:'string',enum:HARNESS_IMAGE_MODELS,required:true},prompt:{type:'string',required:true},size:{type:'string',enum:['1K','1.5K','2K']}},
    output,timeoutMs:200000,presentCall:()=>({card:'generic',title:'生成图片',kind:'execute'}),
    execute:async(args,exec)=>{const session=this.owner(exec),context=this.context(session)
     return task(await this.invoke(session,'create-image',{...args,size:args.size??'1.5K',requestId:nonce(context.scope.accountId,session,exec.callId)},exec.signal))}}),
   defineTool({name:'generate_video',description:'提交视频生成，后台查询同一请求并在当前对话展示结果。不要重复提交来查询进度；使用 generation_status。',
    parameters:{modelId:{type:'string',enum:[HARNESS_VIDEO_MODEL],required:true},prompt:{type:'string',required:true},
     duration:{type:'integer'},resolution:{type:'string',enum:['480p','720p','1080p']},ratio:{type:'string',enum:['16:9','4:3','1:1','3:4','9:16','21:9']},generateAudio:{type:'boolean'}},
    output,timeoutMs:90000,presentCall:()=>({card:'generic',title:'生成视频',kind:'execute'}),
    execute:async(args,exec)=>{const session=this.owner(exec),context=this.context(session),
     value=task(await this.invoke(session,'create-video',{...args,duration:args.duration??4,resolution:args.resolution??'480p',ratio:args.ratio??'16:9',generateAudio:args.generateAudio??false,
      requestId:nonce(context.scope.accountId,session,exec.callId)},exec.signal))
     return value.state==='queued'||value.state==='in_progress'?{...value,jobId:this.background(value,context,exec.agent!.id)}:value}}),
   defineTool({name:'generation_status',description:'查询当前对话中已经提交的图片或视频任务；此工具不会再次生成。',
    parameters:{requestId:{type:'string',required:true},kind:{type:'string',enum:['image','video'],required:true}},output,isConcurrencySafe:()=>true,
    presentCall:()=>({card:'generic',title:'生成进度',kind:'read'}),
    execute:async(args,exec)=>task(await this.invoke(this.owner(exec),'status',args,exec.signal))}),
  ]
 }
 private async fetch(request:Request):Promise<Response>{
  try{
   const q=new URL(request.url).searchParams,keys=['sessionId','requestId','kind','mode']
   if([...q.keys()].length!==keys.length||[...q.keys()].some(k=>!keys.includes(k)))throw Error('HARNESS_MEDIA_REQUEST_INVALID')
   const session=q.get('sessionId')??'',input={requestId:q.get('requestId'),kind:q.get('kind')},mode=q.get('mode')
   if(mode==='status')return Response.json(task(await this.invoke(session,'status',input,request.signal)),{headers:{'Cache-Control':'no-store'}})
   if(mode!=='content')throw Error('HARNESS_MEDIA_REQUEST_INVALID')
   const context=this.context(session),value=await this.invoke(session,'content',input,request.signal) as HarnessMediaContentV1
   if(!this.current(context)||value?.schemaVersion!==1||value.requestId!==input.requestId||value.kind!==input.kind||
    !['image/png','image/jpeg','image/webp','video/mp4'].includes(value.mediaType)||typeof value.base64!=='string'||
    !Number.isSafeInteger(value.bytes)||value.bytes<=0||value.bytes>(value.kind==='image'?16:100)*1024*1024)throw Error('HARNESS_MEDIA_CONTENT_INVALID')
   const bytes=Buffer.from(value.base64,'base64')
   if(bytes.length!==value.bytes||bytes.toString('base64')!==value.base64||createHash('sha256').update(bytes).digest('hex')!==value.sha256)throw Error('HARNESS_MEDIA_CONTENT_INVALID')
   const extension=value.mediaType==='image/jpeg'?'.jpg':value.mediaType==='image/webp'?'.webp':value.mediaType==='image/png'?'.png':'.mp4'
   const headers={'Content-Type':value.mediaType,'Cache-Control':'no-store','Accept-Ranges':'bytes','Content-Disposition':'inline; filename="StudyBuddy-'+value.requestId+extension+'"'},range=request.headers.get('range')
   if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range),start=Number(m?.[1]),end=m?.[2]?Number(m[2]):bytes.length-1
    if(!m||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||end>=bytes.length)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.length}})
    return new Response(request.method==='HEAD'?null:bytes.subarray(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}})}
   return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Length':String(bytes.length)}})
  }catch{return Response.json({code:'HARNESS_MEDIA_UNAVAILABLE'},{status:403,headers:{'Cache-Control':'no-store'}})}
 }
}
