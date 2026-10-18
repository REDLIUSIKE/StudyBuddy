import { Context } from '@deepseek-ai/cordis'
import type { Readable,Writable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-cmdline'
import { VideoChannel } from './video-editing-channel.ts'
import { CompiledVideoEditingService } from './video-editing-service.ts'
import type { EmbeddedVideoDomain,EmbeddedVideoOptions,VideoScope,VideoCapabilityResult,VideoEdit } from './video-domain-types.ts'

const absolute=z.string().min(1).refine(isAbsolute)
const Scope=z.strictObject({accountGeneration:z.string().min(1).max(512),workspaceId:z.string().min(1).max(512),projectId:z.string().min(1).max(512),sessionId:z.string().min(1).max(512)})
const Binding=z.strictObject({scope:Scope,projectRoot:absolute})
const Runtime=z.strictObject({browserExecutable:absolute,ffmpegExecutable:absolute,ffprobeExecutable:absolute,identities:z.record(z.string(),z.strictObject({sha256:z.string().regex(/^[a-f0-9]{64}$/),version:z.string().min(1)}))})
const Bootstrap=z.strictObject({accountGeneration:z.string().min(1),workspaceRoot:absolute,stateRoot:absolute,guestAuthorization:z.string().regex(/^[a-f0-9]{64}$/),bindings:z.array(Binding).max(128),renderRuntime:Runtime.optional()})
const PathAdmission=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('project'),accountGeneration:z.string().min(1),paths:z.array(absolute).min(1).max(128)}),
 z.strictObject({kind:z.enum(['asset','export']),accountGeneration:z.string().min(1),paths:z.array(absolute).min(1).max(128),scope:Scope}),
])
const Caller=z.strictObject({schemaVersion:z.literal(1),grantRef:z.uuid(),sessionId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),toolCallId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/)})
const Command=z.strictObject({type:z.literal('command'),id:z.string().min(1).max(512),operation:z.enum(['bind','unbind','capability','readProject','readGuide','readFile','applyEdit','look','transcribe','translate','mediaRequest','createExport','cancelExport','readExports']),scope:Scope,projectRoot:absolute.optional(),caller:Caller.optional(),input:z.unknown().optional()})
const CapabilityResult=z.strictObject({type:z.literal('capability-result'),id:z.string(),result:z.unknown().optional(),error:z.string().optional()})
/** Main supplies only verified compiled resources; secrets arrive through private stdin. */
export const Config=z.strictObject({domainEntry:absolute,staticDirectory:absolute})
export type Config=z.infer<typeof Config>
export const inject=['appReady','appExit']

function isDomain(value:unknown):value is EmbeddedVideoDomain{
  if(!value||typeof value!=='object')return false
  return ['start','quiesceProject','admitPaths','projectInfo','readProject','readGuide','readFile','applyEdit','look','transcribe','translate','mediaRequest','createExport','cancelExport','readExports','close'].every(key=>key in value&&typeof Reflect.get(value,key)==='function')
}
/** Mount the profile's service/provider/consumer with owned private transport.
 * @param ctx - Cordis profile context.
 * @param config - Verified module/static paths.
 * @param input - Main's private commands and native results.
 * @param output - Correlated replies, native requests and readiness.
 * @returns Initialization; disposal awaits domain and transport quiescence. */
export async function mountVideoPlugin(ctx:Context,config:Config,input:Readable,output:Writable):Promise<void>{
  const ready=ctx.get('appReady'),exit=ctx.get('appExit')
  if(!ready||!exit)throw Error('VIDEO_LAUNCHER_REQUIRED')
  const io=new VideoChannel(input,output),abort=new AbortController()
  let domain:EmbeddedVideoDomain|undefined,service:CompiledVideoEditingService|undefined
  let startup=Promise.resolve(),closing:Promise<void>|undefined
  let stopped=false
  let accountGeneration:string|undefined
  const bindings=new Map<string,z.infer<typeof Binding>>()
  const projectControllers=new Map<string,AbortController>(),closingProjects=new Set<string>()
  const pending=new Map<string,{resolve(value:unknown):void,reject(error:Error):void}>()
  const commands=new Set<Promise<void>>()
  const transcriptions=new Map<string,{scope:VideoScope;controller:AbortController}>()
  const validBinding=(scope:VideoScope):boolean=>{
    const binding=bindings.get(scope.sessionId)
    return !abort.signal.aborted&&scope.accountGeneration===accountGeneration&&!!binding&&Object.keys(scope).every(key=>Reflect.get(scope,key)===Reflect.get(binding.scope,key))
  }
  const current=(scope:VideoScope):boolean=>!closingProjects.has(scope.sessionId)&&validBinding(scope)
  const close=():Promise<void>=>{
    if(closing)return closing
    stopped=true;abort.abort();for(const controller of projectControllers.values())controller.abort();for(const work of transcriptions.values())work.controller.abort();io.close()
    for(const request of pending.values())request.reject(Error('VIDEO_SCOPE_REVOKED'));pending.clear()
    return closing=(async()=>{await startup.catch(()=>{});await(service?.close()??domain?.close());await Promise.allSettled([...commands]);bindings.clear();projectControllers.clear();closingProjects.clear()})()
  }
  ctx.effect(()=>close,'video.domain-and-transport')
  ctx.on('internal/plugin',fiber=>{if(fiber===ctx.fiber&&fiber.uid===null){stopped=true;abort.abort()}},{global:true})
  io.onStop(error=>{if(!stopped){stopped=true;abort.abort();void close().then(()=>exit(error.message==='VIDEO_CHANNEL_CLOSED'?0:1),()=>exit(1))}})
  const handle=async(raw:unknown):Promise<void>=>{
    const projectCommand=z.strictObject({type:z.literal('command'),id:z.string(),operation:z.literal('capabilityProjects'),input:z.discriminatedUnion('action',[z.strictObject({action:z.literal('list')}),z.strictObject({action:z.literal('create'),title:z.string().min(1).max(160)})])}).safeParse(raw)
    if(projectCommand.success){
      try{if(!service)throw Error('VIDEO_DOMAIN_UNAVAILABLE');const value=await service.capabilityProjects(projectCommand.data.input);await io.send({type:'result',id:projectCommand.data.id,result:value})}
      catch(error){await io.send({type:'result',id:projectCommand.data.id,error:error instanceof Error&&error.message.startsWith('VIDEO_')?error.message:'VIDEO_PROJECT_INVALID'})}return
    }
    const admission=z.strictObject({type:z.literal('command'),id:z.string().min(1).max(512),operation:z.literal('admitPaths'),input:PathAdmission}).safeParse(raw)
    if(admission.success){
      try{
        const input=admission.data.input
        if(!service||input.accountGeneration!==accountGeneration||input.kind!=='project'&&!current(input.scope))throw Error('VIDEO_SCOPE_REVOKED')
        const value=await service.admitPaths(input)
        if(!abort.signal.aborted)await io.send({type:'result',id:admission.data.id,result:value})
      }catch(error){if(!abort.signal.aborted)await io.send({type:'result',id:admission.data.id,error:error instanceof Error&&error.message.startsWith('VIDEO_')?error.message:'VIDEO_PATH_DENIED'})}
      return
    }
    const info=z.strictObject({type:z.literal('command'),id:z.string().min(1).max(512),operation:z.literal('projectInfo'),projectId:z.string().min(1).max(512)}).safeParse(raw)
    if(info.success){
      try{if(!service)throw Error('VIDEO_DOMAIN_UNAVAILABLE');const value=await service.projectInfo(info.data.projectId);if(!abort.signal.aborted)await io.send({type:'result',id:info.data.id,result:value})}
      catch{if(!abort.signal.aborted)await io.send({type:'result',id:info.data.id,error:'VIDEO_PROJECT_UNAVAILABLE'})}
      return
    }
    // Document edits retain their revision transaction; transcription can stop its owned work.
    const cancellation=z.strictObject({type:z.literal('cancel-command'),id:z.string().min(1).max(512)}).safeParse(raw)
    if(cancellation.success){transcriptions.get(cancellation.data.id)?.controller.abort();return}
    const result=CapabilityResult.safeParse(raw)
    if(result.success){
      const request=pending.get(result.data.id)
      if(request){pending.delete(result.data.id);result.data.error?request.reject(Error(result.data.error)):request.resolve(result.data.result)}
      return
    }
    const parsed=Command.safeParse(raw)
    if(!parsed.success)throw Error('VIDEO_COMMAND_INVALID')
    const command=parsed.data
    if(transcriptions.has(command.id))throw Error('VIDEO_REQUEST_CONFLICT')
    try{
      let value:unknown
      if(command.operation==='bind'){
        if(command.scope.accountGeneration!==accountGeneration)throw Error('VIDEO_SCOPE_REVOKED')
        if(!command.projectRoot)throw Error('VIDEO_BINDING_INVALID')
        if(closingProjects.has(command.scope.sessionId))throw Error('VIDEO_SCOPE_REVOKED')
        const previous=bindings.get(command.scope.sessionId)
        if(previous&&(previous.projectRoot!==command.projectRoot||Object.keys(command.scope).some(key=>Reflect.get(command.scope,key)!==Reflect.get(previous.scope,key))))throw Error('VIDEO_BINDING_CONFLICT')
        if(!previous){projectControllers.set(command.scope.sessionId,new AbortController());bindings.set(command.scope.sessionId,{scope:command.scope,projectRoot:command.projectRoot})}value={bound:true}
      }else{
        if(!current(command.scope))throw Error('VIDEO_SCOPE_REVOKED')
        if(command.operation==='unbind'){
          closingProjects.add(command.scope.sessionId);projectControllers.get(command.scope.sessionId)?.abort()
          for(const work of transcriptions.values())if(work.scope.sessionId===command.scope.sessionId)work.controller.abort()
          if(!service)throw Error('VIDEO_DOMAIN_UNAVAILABLE');await service.quiesceProject(command.scope)
          bindings.delete(command.scope.sessionId);projectControllers.delete(command.scope.sessionId);closingProjects.delete(command.scope.sessionId);value={bound:false}
        }
        else{
          if(!service)throw Error('VIDEO_DOMAIN_UNAVAILABLE')
          const scope=command.scope
          switch(command.operation){
            case'capability':{
              if(!command.caller)throw Error('VIDEO_CALLER_INVALID')
              const data=z.strictObject({operation:z.enum(['readProject','readGuide','readFile','applyEdit','look','transcribe','translate','mediaRequest','createExport','cancelExport','readExports','importAsset','openProject']),args:z.unknown()}).parse(command.input),controller=new AbortController()
              transcriptions.set(command.id,{scope,controller});value=await service.capability(scope,command.caller,data.operation,data.args,AbortSignal.any([abort.signal,controller.signal]));break
            }
            case'readProject':value=await service.readProject(scope);break
            case'readGuide':value=await service.readGuide(scope,z.strictObject({guide:z.enum(['manual','spec'])}).parse(command.input).guide);break
            case'readFile':value=await service.readFile(scope,z.strictObject({relativePath:z.string()}).parse(command.input).relativePath);break
            case'applyEdit':{
              const data=z.strictObject({expectedRevision:z.string(),edit:z.unknown()}).parse(command.input)
              const module=z.object({validateVideoEdit:z.custom<(input:unknown)=>VideoEdit>(value=>typeof value==='function')}).parse(await import(pathToFileURL(config.domainEntry).href))
              value=await service.applyEdit(scope,data.expectedRevision,module.validateVideoEdit(data.edit));break
            }
            case'look':{
              const data=z.strictObject({args:z.array(z.string()).max(16).optional(),options:z.strictObject({count:z.number().int().min(1).max(120).optional(),offline:z.boolean().optional()}).optional()}).parse(command.input)
              value=await service.look(scope,{...(data.args?{args:data.args}:{}),...(data.options?{options:{...(data.options.count!==undefined?{count:data.options.count}:{}),...(data.options.offline!==undefined?{offline:data.options.offline}:{})}}:{})});break
            }
            case'mediaRequest':{
              const data=z.strictObject({operation:z.enum(['voice','tts','sfx','image','video']),authorityRef:z.string().min(1),requestId:z.uuid(),input:z.unknown()}).parse(command.input),controller=new AbortController()
              transcriptions.set(command.id,{scope,controller});value=await service.mediaRequest(scope,data,AbortSignal.any([abort.signal,controller.signal]));break
            }
            case'transcribe':{
              const data=z.strictObject({src:z.string().min(1).max(4096)}).parse(command.input),controller=new AbortController()
              transcriptions.set(command.id,{scope,controller})
              value=await service.transcribe(scope,data.src,AbortSignal.any([abort.signal,controller.signal]));break
            }
            case'translate':{
              const data=z.strictObject({language:z.string().min(2).max(16)}).parse(command.input),controller=new AbortController()
              transcriptions.set(command.id,{scope,controller});value=await service.translate(scope,data.language,AbortSignal.any([abort.signal,controller.signal]));break
            }
            case'createExport':{
              const data=z.record(z.string(),z.unknown()).parse(command.input)
              value=await service.createExport(scope,data as Parameters<EmbeddedVideoDomain['createExport']>[1]);break
            }
            case'cancelExport':await service.cancelExport(scope,z.strictObject({jobId:z.string()}).parse(command.input).jobId);value={cancellationRequested:true};break
            case'readExports':value=await service.readExports(scope,z.strictObject({jobId:z.string().optional()}).parse(command.input).jobId);break
          }
          if(!current(scope))throw Error('VIDEO_SCOPE_REVOKED')
        }
      }
      await io.send({type:'result',id:command.id,result:value})
    }catch(error){
      if(!abort.signal.aborted)await io.send({type:'result',id:command.id,error:error instanceof Error&&error.message.startsWith('VIDEO_')?error.message:'VIDEO_COMMAND_FAILED'})
    }finally{transcriptions.delete(command.id)}
  }
  startup=(async()=>{
    try{
      const raw=await io.next()
      if(Buffer.byteLength(JSON.stringify(raw))>65536)throw Error('VIDEO_BOOTSTRAP_INVALID')
      const bootstrap=Bootstrap.safeParse(raw)
      if(!bootstrap.success)throw Error('VIDEO_BOOTSTRAP_INVALID')
      accountGeneration=bootstrap.data.accountGeneration
      for(const binding of bootstrap.data.bindings){
        if(binding.scope.accountGeneration!==accountGeneration)throw Error('VIDEO_BOOTSTRAP_INVALID')
        bindings.set(binding.scope.sessionId,binding)
        projectControllers.set(binding.scope.sessionId,new AbortController())
      }
      abort.signal.throwIfAborted()
      const imported:unknown=await import(pathToFileURL(config.domainEntry).href)
      const module=z.object({createEmbeddedVideoDomain:z.custom<(options:EmbeddedVideoOptions)=>Promise<EmbeddedVideoDomain>>(value=>typeof value==='function')}).parse(imported)
      const initialized:unknown=await module.createEmbeddedVideoDomain({accountGeneration:bootstrap.data.accountGeneration,workspaceRoot:bootstrap.data.workspaceRoot,
        stateRoot:bootstrap.data.stateRoot,guestAuthorization:bootstrap.data.guestAuthorization,
        ...(bootstrap.data.renderRuntime?{renderRuntime:bootstrap.data.renderRuntime}:{}),staticDirectory:config.staticDirectory,signal:abort.signal,
        isCurrentScope:validBinding,resolveProject:async scope=>{if(!validBinding(scope))throw Error('VIDEO_SCOPE_REVOKED');return bindings.get(scope.sessionId)!.projectRoot},
        scopeForRoot:root=>[...bindings.values()].find(binding=>binding.projectRoot===root&&current(binding.scope))?.scope,
        projectSignalForRoot:root=>{const binding=[...bindings.values()].find(binding=>binding.projectRoot===root&&current(binding.scope));return binding?projectControllers.get(binding.scope.sessionId)?.signal:undefined},
        projectRelocated:async event=>{
          abort.signal.throwIfAborted();const id=randomUUID()
          const response=new Promise<unknown>((resolve,reject)=>{pending.set(id,{resolve,reject})})
          try{await io.send({type:'project-relocated',id,accountGeneration,event});const result=await response;abort.signal.throwIfAborted();if(!result||typeof result!=='object'||!('persisted'in result)||result.persisted!==true)throw Error('VIDEO_PATH_ADMISSION_FAILED')}
          finally{pending.delete(id)}
        },
        capabilities:{request:async(request,signal)=>{
          if(!current(request.scope))throw Error('VIDEO_SCOPE_REVOKED')
          signal.throwIfAborted()
          const id=randomUUID()
          const response=new Promise<unknown>((resolve,reject)=>{
            const cancel=():void=>{pending.delete(id);void io.send({type:'capability-cancel',id}).catch(()=>{});reject(Error('VIDEO_SCOPE_REVOKED'))}
            pending.set(id,{resolve:value=>{signal.removeEventListener('abort',cancel);resolve(value)},reject:error=>{signal.removeEventListener('abort',cancel);reject(error)}})
            signal.addEventListener('abort',cancel,{once:true})
          })
          await io.send({type:'capability',id,request})
          const value=await response
          if(request.operation!=='project-release'&&!current(request.scope))throw Error('VIDEO_SCOPE_REVOKED')
          const parsed=z.strictObject({data:z.unknown(),artifacts:z.array(z.strictObject({relativePath:z.string(),sha256:z.string(),mime:z.string()})),receiptRef:z.string().optional()}).parse(value)
          return {data:parsed.data,artifacts:parsed.artifacts,...(parsed.receiptRef?{receiptRef:parsed.receiptRef}:{})} satisfies VideoCapabilityResult
        }},
      })
      if(!isDomain(initialized))throw Error('VIDEO_DOMAIN_INVALID')
      domain=initialized;abort.signal.throwIfAborted()
      await ctx.plugin({name:'video-domain-provider',apply:provider=>{service=new CompiledVideoEditingService(provider,initialized)}})
      await ctx.plugin({name:'video-domain-lifecycle',inject:['videoEditing','appReady','appExit'],async apply(consumer){
        const origins=await consumer.videoEditing.start();abort.signal.throwIfAborted()
        for(const[name,origin]of Object.entries(origins)){const url=new URL(origin);if(url.protocol!=='http:'||url.hostname!==(name==='editorOrigin'?'127.0.0.1':'localhost')||url.origin!==origin||!url.port||Number(url.port)>65535)throw Error('VIDEO_ORIGIN_INVALID')}
        consumer.effect(()=>ready.onReady(()=>{if(!stopped)void io.send({type:'ready',...origins}).catch(()=>{void close()})}),'video.ready')
      }})
      void(async()=>{
        try{
          while(!abort.signal.aborted){const frame=await io.next();const job=handle(frame);commands.add(job);void job.finally(()=>commands.delete(job)).catch(()=>{void close()})}
        }catch{if(!stopped)void close()}
      })()
    }catch(error){
      if(abort.signal.aborted||error instanceof Error&&error.message==='VIDEO_CHANNEL_CLOSED')return
      void close();throw Error(error instanceof Error&&error.message.startsWith('VIDEO_')?error.message:'VIDEO_BOOTSTRAP_INVALID')
    }
  })()
  await startup
}
/** Profile entry; the ordinary dsh launcher owns these stdio streams. */
export function apply(ctx:Context,config:Config):Promise<void>{return mountVideoPlugin(ctx,config,process.stdin,process.stdout)}
