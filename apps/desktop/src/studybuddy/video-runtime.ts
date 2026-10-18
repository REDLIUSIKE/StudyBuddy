import { createHash,randomBytes,randomUUID } from 'node:crypto'
import { mkdir,realpath } from 'node:fs/promises'
import { dirname,join,delimiter } from 'node:path'
import type { ChildProcessWithoutNullStreams,SpawnOptionsWithoutStdio } from 'node:child_process'
import type { OwnedScope } from '@studybuddy/contracts'
import { prepareVideoProfile } from './video-profile.ts'
import { assertVideoPath } from './video-path.ts'
import {parseVideoCapabilityRequest,parseVideoProjectRelocated} from './video-wire.ts'
import { terminateAigcProcess } from './aigc-process.ts'
import type { VideoLaunchResources,VideoCapabilityRequest,VideoCapabilityResult } from './video-types.ts'
import type {VideoScope} from './video-types.ts'
import {VideoPathStore} from './video-path-store.ts'
import type {VideoPathInput} from './video-path-store.ts'

interface Options {
 userDataRoot:string;isCurrent(scope:OwnedScope):boolean;resources():Promise<VideoLaunchResources>
 invoke(scope:OwnedScope,request:VideoCapabilityRequest,signal:AbortSignal):Promise<VideoCapabilityResult>
 launch(executable:string,args:readonly string[],options:SpawnOptionsWithoutStdio):ChildProcessWithoutNullStreams
 terminate?(child:ChildProcessWithoutNullStreams):Promise<void>;invalidated():void
}
interface Origins {editorOrigin:string;filmOrigin:string}
interface Running {
 scope:OwnedScope;authorization:string;controller:AbortController;pending:Promise<Origins>;origins?:Origins;child?:ChildProcessWithoutNullStreams;exited?:Promise<void>;stopped?:Promise<void>;rejectReady?:(error:Error)=>void
 commands:Map<string,{resolve(value:unknown):void;reject(error:Error):void}>;capabilities:Map<string,{controller:AbortController;task:Promise<void>}>
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const same=(a:OwnedScope,b:OwnedScope)=>a.accountId===b.accountId&&a.generation===b.generation
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const nativeMediaErrors:Readonly<Record<string,string>>={
 AIGC_REQUEST_INVALID:'VIDEO_MEDIA_INPUT_INVALID',
 AIGC_REQUEST_CONFLICT:'VIDEO_REQUEST_CONFLICT',
 AIGC_TASK_NOT_FOUND:'VIDEO_REQUEST_NOT_FOUND',
 AIGC_MODEL_UNAVAILABLE:'VIDEO_MODEL_UNAVAILABLE',
 AIGC_MEDIA_UNAVAILABLE:'VIDEO_MEDIA_REQUEST_FAILED',
}
function capabilityError(error:unknown):string{
 if(!(error instanceof Error))return'VIDEO_CAPABILITY_FAILED'
 return /^VIDEO_[A-Z_]+$/.test(error.message)?error.message:nativeMediaErrors[error.message]??'VIDEO_CAPABILITY_FAILED'
}
const origin=(value:unknown,hostname:'127.0.0.1'|'localhost'):value is string=>typeof value==='string'&&new RegExp('^http://'+hostname.replaceAll('.','\\.')+':[1-9]\\d{0,4}$').test(value)&&Number(new URL(value).port)<=65535
export function accountVideoDirectory(root:string,accountId:string):string{return join(root,'studybuddy-video','accounts',createHash('sha256').update(accountId).digest('hex'))}
/** Own the video profile and private transport for exactly one authenticated generation. */
export class VideoRuntime {
 private current:Running|undefined
 private cleanup=Promise.resolve()
 private readonly paths:VideoPathStore
 constructor(private readonly options:Options){this.paths=new VideoPathStore(scope=>accountVideoDirectory(options.userDataRoot,scope.accountId),options.isCurrent)}
 generation(scope:OwnedScope):string{return createHash('sha256').update(JSON.stringify([scope.accountId,scope.generation])).digest('hex')}
 ensure(scope:OwnedScope):Promise<Origins>{
  if(!this.options.isCurrent(scope))return Promise.reject(Error('VIDEO_SCOPE_REVOKED'))
  if(this.current&&same(this.current.scope,scope)&&!this.current.controller.signal.aborted)return this.current.pending
  const previous=this.current
  if(previous)this.cleanup=Promise.all([this.stop(previous),previous.pending.catch(()=>{})]).then(()=>{})
  const row:Running={scope:{...scope},authorization:randomBytes(32).toString('hex'),controller:new AbortController(),pending:Promise.resolve({editorOrigin:'',filmOrigin:''}),commands:new Map(),capabilities:new Map()}
  this.current=row;row.pending=this.start(row).catch(async error=>{await this.stop(row);throw error});return row.pending
 }
 private assert(row:Running):void{if(this.current!==row||row.controller.signal.aborted||!this.options.isCurrent(row.scope))throw Error('VIDEO_SCOPE_REVOKED')}
 private send(row:Running,value:unknown):void{
  this.assert(row);const bytes=JSON.stringify(value)+'\n'
  if(Buffer.byteLength(bytes)>2*1024*1024)throw Error('VIDEO_FRAME_TOO_LARGE')
  if(!row.child||row.child.exitCode!==null||row.child.signalCode!==null||row.child.stdin.destroyed)throw Error('VIDEO_CHANNEL_CLOSED')
  row.child.stdin.write(bytes)
 }
 private async start(row:Running):Promise<Origins>{
  await this.cleanup;this.assert(row)
  const resources=await this.options.resources();this.assert(row)
  const account=accountVideoDirectory(this.options.userDataRoot,row.scope.accountId),workspaceRoot=join(account,'projects'),stateRoot=join(account,'state')
  for(const path of[workspaceRoot,stateRoot]){await assertVideoPath(path);await mkdir(path,{recursive:true});await assertVideoPath(path);this.assert(row)}
  const home=await prepareVideoProfile(account,resources);this.assert(row)
  const savedPaths=await this.paths.read(row.scope),projectPaths=await this.paths.available(row.scope,'project',savedPaths.filter(value=>value.kind==='project').map(value=>value.path));this.assert(row)
  const child=this.options.launch(resources.node,[resources.entry,'--profile','studybuddy-video'],{cwd:resources.directory,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:[dirname(resources.node),...(resources.gitDirectory?[resources.gitDirectory]:[])].join(delimiter),...(resources.gitDirectory?{GIT_EXEC_PATH:resources.gitDirectory}:{}),NODE_ENV:'production',DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1'}})
  row.child=child;row.exited=new Promise(resolve=>{child.once('exit',()=>resolve());child.once('error',()=>resolve())})
  const ready=new Promise<Origins>((resolve,reject)=>{
   row.rejectReady=reject;let settled=false,buffer=Buffer.alloc(0)
   const timer=setTimeout(()=>reject(Error('VIDEO_START_TIMEOUT')),45000)
   const failed=(error:Error):void=>{clearTimeout(timer);reject(error);void this.stop(row).catch(()=>{});if(this.current===row&&!row.controller.signal.aborted)this.options.invalidated()}
   child.once('error',()=>failed(Error('VIDEO_START_FAILED')))
   child.once('exit',()=>{const unexpected=!row.controller.signal.aborted;failed(Error(unexpected?'VIDEO_SERVICE_EXITED':'VIDEO_SCOPE_REVOKED'));if(unexpected&&this.current===row)this.options.invalidated()})
   child.stdin.on('error',()=>failed(Error('VIDEO_CHANNEL_CLOSED')));child.stderr.resume()
   child.stdout.on('data',(chunk:Buffer)=>{
    buffer=Buffer.concat([buffer,chunk]);let split:number
    while((split=buffer.indexOf(10))!==-1){
     if(split>2*1024*1024){failed(Error('VIDEO_FRAME_TOO_LARGE'));return}
     const line=buffer.subarray(0,split);buffer=buffer.subarray(split+1)
     let value:unknown;try{value=JSON.parse(line.toString('utf8'))}catch{continue}
     if(!record(value))continue
     try{
      this.assert(row)
      if(value.type==='ready'){
       if(settled||!origin(value.editorOrigin,'127.0.0.1')||!origin(value.filmOrigin,'localhost')||value.editorOrigin===value.filmOrigin)throw Error('VIDEO_ORIGIN_INVALID')
       settled=true;row.origins={editorOrigin:value.editorOrigin,filmOrigin:value.filmOrigin};clearTimeout(timer);resolve(row.origins)
      }else if(value.type==='result'){
       if(typeof value.id!=='string')throw Error('VIDEO_FRAME_INVALID')
       const request=row.commands.get(value.id);if(!request)continue
       row.commands.delete(value.id)
       if(value.error!==undefined)request.reject(Error(typeof value.error==='string'&&/^VIDEO_[A-Z_]+$/.test(value.error)?value.error:'VIDEO_COMMAND_FAILED'))
       else request.resolve(value.result)
      }else if(value.type==='capability')this.relay(row,value)
      else if(value.type==='project-relocated')this.relocated(row,value)
      else if(value.type==='capability-cancel'&&typeof value.id==='string')row.capabilities.get(value.id)?.controller.abort()
     }catch{failed(Error('VIDEO_FRAME_INVALID'));return}
    }
    if(buffer.length>2*1024*1024)failed(Error('VIDEO_FRAME_TOO_LARGE'))
   })
  })
  this.send(row,{accountGeneration:this.generation(row.scope),workspaceRoot:await realpath(workspaceRoot),stateRoot:await realpath(stateRoot),guestAuthorization:row.authorization,bindings:[],renderRuntime:resources.renderRuntime})
  const origins=await ready;this.assert(row)
  for(let at=0;at<projectPaths.length;at+=128)await this.admitRunning(row,{kind:'project',accountGeneration:this.generation(row.scope),paths:projectPaths.slice(at,at+128)})
  this.assert(row);return origins
 }
 private relay(row:Running,message:Record<string,unknown>):void{
  if(typeof message.id!=='string'||!uuid.test(message.id)||!record(message.request)||!record(message.request.scope)||message.request.scope.accountGeneration!==this.generation(row.scope)||row.capabilities.has(message.id)||row.capabilities.size>=128)throw Error('VIDEO_CAPABILITY_INVALID')
  const id=message.id,controller=new AbortController(),signal=AbortSignal.any([row.controller.signal,controller.signal])
  const task=(async()=>{
   try{const result=await this.options.invoke(row.scope,parseVideoCapabilityRequest(message.request),signal);signal.throwIfAborted();this.send(row,{type:'capability-result',id,result})}
   catch(error){if(!signal.aborted)try{this.send(row,{type:'capability-result',id,error:capabilityError(error)})}catch{/* Revoked transport. */}}
   finally{row.capabilities.delete(id)}
  })()
  row.capabilities.set(id,{controller,task})
 }
 private relocated(row:Running,message:unknown):void{
  const event=parseVideoProjectRelocated(message),id=event.id
  if(event.accountGeneration!==this.generation(row.scope)||row.capabilities.has(id)||row.capabilities.size>=128)throw Error('VIDEO_PATH_ADMISSION_INVALID')
  const controller=new AbortController(),signal=AbortSignal.any([row.controller.signal,controller.signal])
  const task=(async()=>{
   try{
    const workspace=await realpath(join(accountVideoDirectory(this.options.userDataRoot,row.scope.accountId),'projects'));this.assert(row);signal.throwIfAborted()
    await this.paths.relocated(row.scope,workspace,event.event.from,event.event.to);this.assert(row);signal.throwIfAborted();this.send(row,{type:'capability-result',id,result:{persisted:true}})
   }catch(error){if(!signal.aborted)try{this.send(row,{type:'capability-result',id,error:error instanceof Error&&/^VIDEO_[A-Z_]+$/.test(error.message)?error.message:'VIDEO_PATH_ADMISSION_FAILED'})}catch{/* Revoked owner. */}}
   finally{row.capabilities.delete(id)}
  })();row.capabilities.set(id,{controller,task})
 }
 /** Register only paths returned by the native selector; persistence follows successful domain admission. */
 async admitPaths(scope:OwnedScope,input:VideoPathInput):Promise<string[]>{
  await this.ensure(scope);const row=this.current!;this.assert(row)
  if(input.kind!=='project'&&input.scope.accountGeneration!==this.generation(scope))throw Error('VIDEO_SCOPE_REVOKED')
  const paths=await this.paths.canonical(scope,input.kind,input.paths);this.assert(row)
  const admission=input.kind==='project'?{kind:input.kind,accountGeneration:this.generation(scope),paths}:{kind:input.kind,accountGeneration:this.generation(scope),paths,scope:input.scope}
  await this.admitRunning(row,admission);this.assert(row)
  await this.paths.commit(scope,input.kind,paths,input.kind==='project'?undefined:input.scope.projectId);this.assert(row)
  return paths
 }
 /** Restore asset/export selections only after the private native project binding exists. */
 async restoreProjectPaths(scope:OwnedScope,project:VideoScope):Promise<void>{
  await this.ensure(scope);const row=this.current!;this.assert(row)
  if(project.accountGeneration!==this.generation(scope))throw Error('VIDEO_SCOPE_REVOKED')
  const saved=await this.paths.read(scope);this.assert(row)
  for(const kind of ['asset','export'] as const){
   const paths=await this.paths.available(scope,kind,saved.filter(value=>value.kind===kind&&value.projectId===project.projectId).map(value=>value.path));this.assert(row)
   for(let at=0;at<paths.length;at+=128)await this.admitRunning(row,{kind,accountGeneration:this.generation(scope),paths:paths.slice(at,at+128),scope:project})
  }
  this.assert(row)
 }
 private async admitRunning(row:Running,input:Parameters<import('../../../../integrations/openfilm/packages/openfilm/studio/server/embedded/domain.mjs').EmbeddedVideoDomain['admitPaths']>[0]):Promise<void>{
  const result=await this.commandRunning(row,'admitPaths',{input});this.assert(row)
  if(!record(result)||Object.keys(result).length!==1||result.admitted!==true)throw Error('VIDEO_PATH_ADMISSION_INVALID')
 }
 async command(scope:OwnedScope,operation:string,parameters:Record<string,unknown>,signal?:AbortSignal):Promise<unknown>{
  await this.ensure(scope);return this.commandRunning(this.current!,operation,parameters,signal)
 }
 private commandRunning(row:Running,operation:string,parameters:Record<string,unknown>,signal?:AbortSignal):Promise<unknown>{
  this.assert(row);signal?.throwIfAborted()
  if(row.commands.size>=128)throw Error('VIDEO_CHANNEL_BUSY')
  const id=randomUUID()
  return new Promise((resolve,reject)=>{
   const cleanup=():void=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);row.commands.delete(id)}
   const cancel=():void=>{cleanup();try{this.send(row,{type:'cancel-command',id})}catch{/* Already revoked. */}reject(Error('VIDEO_COMMAND_CANCELLED'))}
   const timer=setTimeout(cancel,300000)
   row.commands.set(id,{resolve:value=>{cleanup();resolve(value)},reject:error=>{cleanup();reject(error)}})
   signal?.addEventListener('abort',cancel,{once:true})
   try{this.send(row,{type:'command',...parameters,id,operation})}catch(error){cleanup();reject(error)}
  })
 }
 requestHeaders(scope:OwnedScope,value:string):Readonly<Record<string,string>>{
  const row=this.current
  if(!row||!same(scope,row.scope)||row.controller.signal.aborted||!this.options.isCurrent(scope)||!row.origins||!URL.canParse(value))return{}
  const url=new URL(value)
  if(url.username||url.password)return{}
  if(url.protocol==='ws:'){
   // Studio's own event streams use WebSockets; film pages never receive editor socket authority.
   if(url.hash||!/^\/api\/(?:events|projects\/[A-Za-z0-9_-]{1,128}\/events)$/.test(url.pathname)||[...url.searchParams.keys()].some(key=>key!=='visible')||url.searchParams.getAll('visible').length>1||url.searchParams.has('visible')&&!['0','1'].includes(url.searchParams.get('visible')!))return{}
   url.protocol='http:'
   return url.origin===row.origins.editorOrigin?{'X-Studio-Key':row.authorization}:{}
  }
  return url.protocol==='http:'&&[row.origins.editorOrigin,row.origins.filmOrigin].includes(url.origin)?{'X-Studio-Key':row.authorization}:{}
 }
 /** Top-frame navigation is limited to Studio; film-origin access is for subresources only. */
 isEditorUrl(scope:OwnedScope,value:string):boolean{
  const row=this.current
  return!!row&&same(row.scope,scope)&&!!row.origins&&Object.keys(this.requestHeaders(scope,value)).length>0&&new URL(value).origin===row.origins.editorOrigin
 }
 private stop(row:Running):Promise<void>{
  row.controller.abort();delete row.origins;row.rejectReady?.(Error('VIDEO_SCOPE_REVOKED'))
  for(const request of row.commands.values())request.reject(Error('VIDEO_SCOPE_REVOKED'));row.commands.clear()
  for(const pending of row.capabilities.values())pending.controller.abort()
  return row.stopped??=(async()=>{
   const child=row.child
   if(child&&child.exitCode===null&&child.signalCode===null){
    child.stdin.end();let timer:ReturnType<typeof setTimeout>|undefined
    try{
     const exited=await Promise.race([row.exited!.then(()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),10000)})]);if(timer)clearTimeout(timer)
     if(!exited){await(this.options.terminate??terminateAigcProcess)(child);await Promise.race([row.exited,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('VIDEO_PROCESS_STOP_FAILED')),5000)})])}
    }finally{if(timer)clearTimeout(timer)}
   }
   await Promise.allSettled([...row.capabilities.values()].map(row=>row.task))
  })()
 }
 revoke():Promise<void>{
  const row=this.current;if(!row)return this.cleanup
  return this.cleanup=Promise.all([this.stop(row),row.pending.catch(()=>{})]).then(()=>{if(this.current===row)this.current=undefined})
 }
}
