import { randomUUID } from 'node:crypto'
import { mkdir,writeFile,stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserWindow,IpcMain,IpcMainInvokeEvent,Session,WebContents,OpenDialogOptions,OpenDialogReturnValue } from 'electron'
import type { StudyBuddyAuth } from './services.ts'
import { StudyBuddyEmbeddedGuests } from './embedded-guests.ts'
import { VideoRuntime } from './video-runtime.ts'
import { VideoBridge } from './video-bridge.ts'
import { VIDEO_IPC } from './video-types.ts'
import { assertVideoPath } from './video-path.ts'
import { sanitizeVideoReference } from './video-reference.ts'
import { videoReferenceImagePlan,materializeVideoReferenceImage,type VideoPixelImage } from './video-reference-image.ts'
import { VIDEO_VIEWER_SNAPSHOT_SCRIPT } from './video-viewer-snapshot.ts'
import { settleCleanup } from '../settle-cleanup.ts'
import {VideoNativeFiles} from './video-path-store.ts'
interface Options {auth:Pick<StudyBuddyAuth,'scope'|'withSession'>;runtime:VideoRuntime;bridge:VideoBridge;preload:string;fromPartition(partition:string):Session;prepared:boolean;imageFromBytes(bytes:Uint8Array):VideoPixelImage;showOpenDialog(owner:WebContents,options:OpenDialogOptions):Promise<OpenDialogReturnValue>}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
/** Studio lives in an isolated guest; native Session identity and references stay in Main. */
export class StudyBuddyVideo {
 private readonly guests:StudyBuddyEmbeddedGuests
 private readonly selected=new Map<number,{projectId:string;sessionId:string;projectEpoch:number}>()
 private readonly revisions=new Map<number,number>()
 private readonly requestedProjects=new Map<number,string|null>()
 private readonly references=new Set<string>()
 constructor(private readonly options:Options){
  const allowed=(value:string):boolean=>{const scope=options.auth.scope();return!!scope&&Object.keys(options.runtime.requestHeaders(scope,value)).length>0}
  this.guests=new StudyBuddyEmbeddedGuests(options.auth,()=>Promise.reject(Error('VIDEO_PUBLIC_EXCHANGE_DENIED')),partition=>options.fromPartition(partition),undefined,(owner,lease)=>{if(!owner.isDestroyed())owner.send(VIDEO_IPC.invalid,lease)},{
   target:'video',preload:options.preload,
   navigationAllowed:value=>{const scope=options.auth.scope();return!!scope&&options.runtime.isEditorUrl(scope,value)},
   validateEntry:value=>{if(typeof value!=='string'||!allowed(value))throw Error('VIDEO_ENTRY_INVALID');return value},
   issue:async({scope})=>{
    const origins=await options.runtime.ensure(scope)
    return{entryUrl:origins.editorOrigin+'/',requestAllowed:value=>{
     if(!URL.canParse(value))return false;const url=new URL(value)
     return['about:','data:'].includes(url.protocol)||url.protocol==='blob:'&&[origins.editorOrigin,origins.filmOrigin].includes(url.origin)||allowed(value)
    },requestHeaders:value=>options.runtime.requestHeaders(scope,value)}
   },
  })
 }
 recognizes(owner:WebContents,src:string,partition?:string):boolean{return this.guests.recognizes(owner,src,partition)}
 bind(window:BrowserWindow,attach:(guest:WebContents,id:string)=>()=>void,reserved:(src:string,partition?:string)=>boolean):void{this.guests.bind(window,attach,reserved)}
 async revoke():Promise<void>{this.selected.clear();this.revisions.clear();this.requestedProjects.clear();this.references.clear();await settleCleanup([this.guests.revoke(true),this.options.runtime.revoke(),this.options.bridge.revoke()])}
 register(ipc:IpcMain,assertOwner:(event:IpcMainInvokeEvent)=>void,assertShellOwner:(event:IpcMainInvokeEvent)=>void):void{
  const result=async(run:()=>Promise<unknown>)=>{try{return{ok:true,data:await run()}}catch(error){return{ok:false,error:{code:error instanceof Error&&/^VIDEO_[A-Z_]+$/.test(error.message)?error.message:'VIDEO_ACTION_FAILED'}}}}
  const owner=(event:IpcMainInvokeEvent,run:()=>Promise<unknown>)=>result(async()=>{assertOwner(event);return run()})
  ipc.handle(VIDEO_IPC.available,event=>result(async()=>{assertShellOwner(event);return this.options.prepared}))
  ipc.handle(VIDEO_IPC.acquire,event=>owner(event,()=>this.guests.acquire(event.sender)))
  ipc.handle(VIDEO_IPC.release,(event,lease:unknown)=>owner(event,()=>this.guests.release(event.sender,lease)))
  ipc.handle(VIDEO_IPC.theme,(event,lease:unknown,theme:unknown)=>owner(event,()=>this.guests.setTheme(event.sender,lease,theme)))
  ipc.handle(VIDEO_IPC.visible,(event,lease:unknown,visible:unknown)=>owner(event,async()=>{if(typeof lease!=='string'||typeof visible!=='boolean')throw Error('VIDEO_ACTION_INVALID');await this.guests.setVisible(event.sender,lease,visible)}))
  ipc.handle(VIDEO_IPC.acknowledgeReference,(event,id:unknown)=>owner(event,async()=>{if(typeof id!=='string'||!this.references.delete(id))throw Error('VIDEO_REFERENCE_UNAVAILABLE')}))
  ipc.handle(VIDEO_IPC.guestAction,(event,action:unknown)=>result(async()=>{
   const guest=this.guests.checkedGuest(event),scope=guest.lease.scope
   // Only the editor top frame may act; a generated film has no native authority.
   const origins=await this.options.runtime.ensure(scope)
   if(new URL(event.senderFrame!.url).origin!==origins.editorOrigin||!object(action)||typeof action.kind!=='string'||JSON.stringify(action).length>65536)throw Error('VIDEO_ACTION_INVALID')
   if(action.kind==='pick-paths'||action.kind==='drop-paths'){
    const purpose=action.kind==='pick-paths'&&object(action.input)?action.input.purpose:action.purpose
    if(!['project','asset','export'].includes(String(purpose))||Object.keys(action).some(key=>!(action.kind==='pick-paths'?['kind','input','projectId','projectEpoch']:['kind','purpose','paths','projectId','projectEpoch']).includes(key)))throw Error('VIDEO_ACTION_INVALID')
    const selected=this.selected.get(event.sender.id)
    if(purpose!=='project'&&(!selected||selected.projectId!==action.projectId||selected.projectEpoch!==action.projectEpoch))throw Error('VIDEO_PROJECT_NOT_SELECTED')
    const check=():void=>{this.guests.checkedGuest(event);if(purpose!=='project'&&this.selected.get(event.sender.id)!==selected)throw Error('VIDEO_SCOPE_REVOKED')}
    const binding=purpose==='project'?null:await this.options.bridge.bind(scope,selected!.projectId);check()
    const picker=new VideoNativeFiles({show:options=>{check();const owner=event.sender.hostWebContents;if(!owner||owner.isDestroyed())throw Error('VIDEO_SCOPE_REVOKED');return this.options.showOpenDialog(owner,options)},admit:(owner,input)=>this.options.runtime.admitPaths(owner,input)})
    return action.kind==='pick-paths'?picker.pick(scope,binding?.scope??null,action.input,check):picker.dropped(scope,binding?.scope??null,purpose,action.paths,check)
   }
   const notify=(value:Record<string,unknown>):void=>{this.guests.checkedGuest(event);const host=event.sender.hostWebContents;if(!host||host.isDestroyed())throw Error('VIDEO_SCOPE_REVOKED');host.send(VIDEO_IPC.action,{lease:guest.lease.lease,scope,revision:this.revisions.get(event.sender.id)??0,...value})}
   if(action.kind==='open-tools'){notify({kind:'open-tools'});return null}
   if(action.kind==='project'){
    if(!Number.isSafeInteger(action.projectEpoch)||Number(action.projectEpoch)<1)throw Error('VIDEO_ACTION_INVALID')
    if(action.projectId!==null&&(typeof action.projectId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(action.projectId)))throw Error('VIDEO_ACTION_INVALID')
    const previous=this.requestedProjects.get(event.sender.id);this.requestedProjects.set(event.sender.id,action.projectId)
    const revision=(this.revisions.get(event.sender.id)??0)+1;this.revisions.set(event.sender.id,revision)
    this.selected.delete(event.sender.id);notify({kind:'library',...(action.projectId===null&&previous?{closedProjectId:previous}:{})})
    if(previous&&previous!==action.projectId){
     try{await(action.projectId===null?this.options.bridge.closeProject(scope,previous):this.options.bridge.releaseView(scope,previous))}
     catch(error){if(this.revisions.get(event.sender.id)===revision)this.requestedProjects.set(event.sender.id,previous);throw error}
     this.guests.checkedGuest(event)
    }
    if(this.revisions.get(event.sender.id)!==revision)return null
    if(action.projectId===null)return null
    if(typeof action.projectId!=='string')throw Error('VIDEO_ACTION_INVALID')
    const binding=await this.options.bridge.bind(scope,action.projectId);this.guests.checkedGuest(event)
    if(this.revisions.get(event.sender.id)!==revision)return null
    const selected={projectId:binding.scope.projectId,sessionId:binding.scope.sessionId,projectEpoch:Number(action.projectEpoch)};this.selected.set(event.sender.id,selected);notify({kind:'project',...selected});return null
   }
   const selected=this.selected.get(event.sender.id)
   if(!selected)throw Error('VIDEO_PROJECT_NOT_SELECTED')
   if(action.kind==='models'){
    if(Object.keys(action).some(key=>!['kind','projectId','projectEpoch'].includes(key)))throw Error('VIDEO_ACTION_INVALID')
    if(action.projectId!==selected.projectId||action.projectEpoch!==selected.projectEpoch)throw Error('VIDEO_SCOPE_REVOKED')
    const check=():void=>{this.guests.checkedGuest(event);if(this.selected.get(event.sender.id)!==selected)throw Error('VIDEO_SCOPE_REVOKED')}
    const binding=await this.options.bridge.bind(scope,selected.projectId);check()
    const result=await this.options.bridge.capability({scope:binding.scope,requestId:randomUUID(),operation:'catalog',input:{}},AbortSignal.timeout(30000));check()
    if(!Array.isArray(result.data))throw Error('VIDEO_NATIVE_CATALOG_INVALID')
    return result.data.map(value=>{
     if(!object(value)||!['image','video','tts','sfx','asr'].includes(String(value.operation))||typeof value.modelId!=='string'||!value.modelId||typeof value.label!=='string')throw Error('VIDEO_NATIVE_CATALOG_INVALID')
     return{operation:value.operation,modelId:value.modelId,label:value.label}
    })
   }
   if(action.kind==='selection'){
    if(!object(action.selection)||action.selection.projectId!==selected.projectId||!Array.isArray(action.selection.refs)||action.selection.refs.length>128||typeof action.selection.time!=='number'||!Number.isFinite(action.selection.time)||action.selection.time<0)throw Error('VIDEO_ACTION_INVALID')
    const refs=action.selection.refs.map(ref=>sanitizeVideoReference(ref).data)
    this.options.bridge.selection(scope,selected.projectId,{time:action.selection.time,refs});return null
   }
   if(action.kind!=='reference')throw Error('VIDEO_ACTION_INVALID')
   if(action.projectId!==selected.projectId||action.projectEpoch!==selected.projectEpoch)throw Error('VIDEO_SCOPE_REVOKED')
   const reference=sanitizeVideoReference(action.reference),binding=await this.options.bridge.bind(scope,selected.projectId)
   const current=():boolean=>{try{this.guests.checkedGuest(event);return this.selected.get(event.sender.id)===selected}catch{return false}}
   const check=():void=>{if(!current())throw Error('VIDEO_SCOPE_REVOKED')}
   check()
   const root=binding.projectRoot
   for(const path of reference.files){const file=join(root,path);await assertVideoPath(file);if(!(await stat(file)).isFile())throw Error('VIDEO_REFERENCE_UNAVAILABLE');check()}
   const imagePlan=videoReferenceImagePlan(action.reference,selected.projectId,origins.editorOrigin,action.viewer)
   const png=imagePlan?await materializeVideoReferenceImage(imagePlan,{current,
    snapshot:()=>event.sender.executeJavaScript(VIDEO_VIEWER_SNAPSHOT_SCRIPT),capture:rect=>event.sender.capturePage(rect),decode:bytes=>this.options.imageFromBytes(bytes),
    fetch:url=>fetch(url,{headers:this.options.runtime.requestHeaders(scope,url),redirect:'error',signal:AbortSignal.timeout(30000)})}):null
   check()
   const id=randomUUID(),folder=join(root,'.film','studybuddy-references');await assertVideoPath(folder);await mkdir(folder,{recursive:true});await assertVideoPath(folder)
   check()
   const imageFile=png?join(folder,id+'.png'):null
   if(imageFile)await writeFile(imageFile,png!,{flag:'wx'})
   check()
   const file=join(folder,id+'.json');await writeFile(file,JSON.stringify({projectId:selected.projectId,...reference.data},null,2)+'\n',{flag:'wx'})
   this.guests.checkedGuest(event);if(this.selected.get(event.sender.id)!==selected)throw Error('VIDEO_SCOPE_REVOKED')
   this.references.add(id);notify({kind:'reference',...selected,id,text:reference.text,files:[file,...(imageFile?[imageFile]:[]),...reference.files.map(path=>join(root,path))]});return{id}
  }))
 }
}
