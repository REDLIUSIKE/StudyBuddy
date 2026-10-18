import {randomUUID} from 'node:crypto'
import type {Session,WebContentsView,WebPreferences} from 'electron'
import type {HarnessCapabilityCallerV1 as Caller,HarnessCapabilityTargetV1 as Target} from '@studybuddy/contracts'
import type {AigcDomainRuntime} from '../aigc-domain-runtime.ts'
import type {CanvasController} from './views.ts'
interface Options {
 runtime:AigcDomainRuntime
 assert(caller:Caller):void
 directory(caller:Caller,target:Target,signal:AbortSignal):Promise<string>
 create(options:{webPreferences:WebPreferences}):WebContentsView
 session(partition:string):Session
}
interface Connection {id:string;state:{directory:string|null;canvasId:string|null;canvasRevision?:number;controllerRef?:string}}
const connections=(value:unknown):Connection[]=>{
 if(!value||typeof value!=='object'||!('connections'in value)||!Array.isArray(value.connections))throw Error('AIGC_CANVAS_STATE_INVALID')
 return value.connections as Connection[]
}
/** Loads the existing canvas app using the same account runtime and Electron engine, without taking focus. */
export class AigcCanvasControllers {
 private readonly owned=new Set<CanvasController>()
 private readonly views=new Set<WebContentsView>()
 constructor(private readonly options:Options){}
 private async read(caller:Caller,signal:AbortSignal){this.options.assert(caller);const rows=connections(await this.options.runtime.invoke(caller.scope,{operation:'state'},signal));this.options.assert(caller);return rows}
 private controller(caller:Caller,root:string,connectionId:string,controllerId:string,signal:AbortSignal,close:()=>Promise<void>,owned:boolean):CanvasController{
  const row=async()=>{const connection=(await this.read(caller,signal)).find(row=>row.id===connectionId&&row.state.directory===root&&row.state.controllerRef===controllerId);if(!connection||typeof connection.state.canvasId!=='string'||!Number.isSafeInteger(connection.state.canvasRevision))throw Error('AIGC_CANVAS_NOT_READY');return connection}
  const state=async()=>{const connection=await row();return{canvasId:connection.state.canvasId!,revision:connection.state.canvasRevision!}}
  return{id:controllerId,owned,ready:async()=>{await state()},state,command:async(name,args,taskSignal)=>{await row();const result=await this.options.runtime.invoke(caller.scope,{operation:'capability-control',connectionId,name,args,directory:root},AbortSignal.any([signal,taskSignal]));this.options.assert(caller);return result},flush:async()=>{const current=await state();await this.options.runtime.invoke(caller.scope,{operation:'capability-control',connectionId,name:'flushSave',args:{},directory:root,expected:{canvasId:current.canvasId,revision:current.revision,operationId:randomUUID()}},signal);this.options.assert(caller)},close}
 }
 async find(caller:Caller,target:Target):Promise<CanvasController|null>{
  const signal=new AbortController().signal,root=await this.options.directory(caller,target,signal),rows=(await this.read(caller,signal)).filter(row=>row.state.directory===root)
  if(rows.length>1)throw Error('AIGC_CANVAS_AMBIGUOUS')
  const row=rows[0];if(!row)return null;if(typeof row.state.controllerRef!=='string')throw Error('AIGC_CANVAS_CONTROLLER_UNAVAILABLE')
  return this.controller(caller,root,row.id,row.state.controllerRef,signal,async()=>{},false)
 }
 async create(caller:Caller,target:Target):Promise<CanvasController>{
  this.options.assert(caller)
  const lifetime=new AbortController(),signal=lifetime.signal,root=await this.options.directory(caller,target,signal),{origin}=await this.options.runtime.ensure(caller.scope),controllerId=randomUUID()
  const browserSession=this.options.session('studybuddy-capability-canvas-'+randomUUID()),view=this.options.create({webPreferences:{session:browserSession,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}}),contents=view.webContents
  // An unattached WebContentsView needs an owner throughout loading and its controller lifetime.
  this.views.add(view)
  browserSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));browserSession.setPermissionCheckHandler(()=>false);browserSession.setDevicePermissionHandler(()=>false)
  const allowed=(url:string)=>{try{this.options.assert(caller);return url==='about:blank'||url.startsWith('data:')||url.startsWith('blob:'+origin+'/')||Object.keys(this.options.runtime.requestHeaders(caller.scope,origin+'/',url)).length>0}catch{return false}}
  browserSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowed(details.url)}))
  browserSession.webRequest.onBeforeSendHeaders((details,callback)=>callback({cancel:!allowed(details.url),requestHeaders:{...Object.fromEntries(Object.entries(details.requestHeaders).filter(([name])=>!['authorization','cookie','x-studybuddy-aigc-guest'].includes(name.toLowerCase()))),...this.options.runtime.requestHeaders(caller.scope,origin+'/',details.url)}}))
  contents.setWindowOpenHandler(()=>({action:'deny'}));contents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault()});contents.setAudioMuted(true)
  let closed:Promise<void>|undefined,controller:CanvasController|undefined
  const close=()=>closed??=Promise.resolve().then(async()=>{try{lifetime.abort();if(!contents.isDestroyed())contents.close({waitForBeforeUnload:false});if(controller)this.owned.delete(controller);await browserSession.clearStorageData();await browserSession.clearCache()}finally{this.views.delete(view)}})
  const wait=async(predicate:(rows:Connection[])=>Connection|undefined)=>{
   const deadline=Date.now()+30000
   for(;;){signal.throwIfAborted();this.options.assert(caller);const row=predicate(await this.read(caller,signal));if(row)return row;if(Date.now()>deadline)throw Error('AIGC_CANVAS_READY_TIMEOUT');await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('AIGC_SCOPE_REVOKED'))},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},60);signal.addEventListener('abort',abort,{once:true})})}
  }
  try{
   await contents.loadURL(origin+'/?capabilityController='+controllerId)
   const connected=await wait(rows=>rows.find(row=>row.state.controllerRef===controllerId))
   await this.options.runtime.invoke(caller.scope,{operation:'capability-control',connectionId:connected.id,name:'openProject',args:{directory:root}},signal)
   await wait(rows=>rows.find(row=>row.id===connected.id&&row.state.directory===root&&typeof row.state.canvasId==='string'&&Number.isSafeInteger(row.state.canvasRevision)))
   controller=this.controller(caller,root,connected.id,controllerId,signal,close,true);this.owned.add(controller);return controller
  }catch(error){await close();throw error}
 }
 async close():Promise<void>{await Promise.allSettled([...this.owned].map(row=>row.close()))}
 async open(caller:Caller,target:Target,signal:AbortSignal){
  const root=await this.options.directory(caller,target,signal),deadline=Date.now()+30000
  let connection:Connection|undefined
  while(!connection){signal.throwIfAborted();const ids=new Set([...this.owned].map(row=>row.id)),rows=(await this.read(caller,signal)).filter(row=>typeof row.state.controllerRef==='string'&&!ids.has(row.state.controllerRef));if(rows.length>1)throw Error('AIGC_CANVAS_AMBIGUOUS');connection=rows[0];if(!connection){if(Date.now()>deadline)throw Error('AIGC_CANVAS_READY_TIMEOUT');await new Promise(resolve=>setTimeout(resolve,60))}}
  await this.options.runtime.invoke(caller.scope,{operation:'capability-control',connectionId:connection.id,name:'openProject',args:{directory:root}},signal);this.options.assert(caller)
 }
}
