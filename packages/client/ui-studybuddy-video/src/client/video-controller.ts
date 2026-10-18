import { EmbeddedPageController } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EmbeddedPageHost,EmbeddedPageScope } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
export interface VideoReference {id:string;text:string;files:readonly string[]}
export interface VideoView {projectId:string;sessionId:string;reference:SessionReference;selected:boolean;references:readonly VideoReference[]}
export interface VideoViewSnapshot {views:readonly VideoView[];errorCode:string|null}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(value)
/** Native project references survive panel changes, while an account change releases every old view. */
export class VideoPageController {
 readonly page:EmbeddedPageController<'video'>
 private readonly views=new Map<string,VideoView>()
 private readonly listeners=new Set<()=>void>()
 private snapshot:VideoViewSnapshot={views:[],errorCode:null}
 private revision=0
 constructor(host:EmbeddedPageHost<'video'>|undefined,private readonly retain:(id:string)=>SessionReference){this.page=new EmbeddedPageController('video',host)}
 getSnapshot=():VideoViewSnapshot=>this.snapshot
 subscribe=(listener:()=>void):(()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private publish(errorCode:string|null=null):void{
  this.snapshot={views:[...this.views.values()],errorCode}
  for(const listener of [...this.listeners])listener()
 }
 setScope(scope:EmbeddedPageScope|null):void{
  const previous=this.page.getSnapshot().scope
  if(previous?.accountId!==scope?.accountId||previous?.generation!==scope?.generation){
   for(const view of this.views.values())view.reference.release()
   this.views.clear();this.revision=0;this.publish()
  }
  this.page.setScope(scope)
 }
 accept(value:unknown):boolean{
  if(!object(value)||!object(value.scope))return false
  const page=this.page.getSnapshot()
  if(!page.scope||page.scope.accountId!==value.scope.accountId||page.scope.generation!==value.scope.generation||!page.lease||page.lease.lease!==value.lease||
    !Number.isSafeInteger(value.revision)||Number(value.revision)<this.revision)return false
  if(value.kind==='library'){
   if(value.closedProjectId!==undefined&&!identifier(value.closedProjectId))return false
   this.revision=Number(value.revision)
   for(const[key,view]of this.views){
    if(view.projectId===value.closedProjectId){view.reference.release();this.views.delete(key)}
    else this.views.set(key,{...view,selected:false})
   }
   this.publish();return true
  }
  if(value.kind==='open-tools'){this.revision=Number(value.revision);return true}
  if(!identifier(value.projectId)||!identifier(value.sessionId))return false
  if(value.kind==='reference'){
   const view=this.views.get(value.sessionId)
   if(!view||view.projectId!==value.projectId||!identifier(value.id)||typeof value.text!=='string'||value.text.length>32768||
     !Array.isArray(value.files)||value.files.some(path=>typeof path!=='string'||path.length>4096||path.includes('\0')))return false
   this.revision=Number(value.revision)
   if(!view.references.some(ref=>ref.id===value.id))this.views.set(view.sessionId,{...view,references:[...view.references,{id:value.id,text:value.text,files:value.files}]})
   this.publish();return true
  }
  if(value.kind!=='project')return false
  const existing=this.views.get(value.sessionId)
  if(existing&&existing.projectId!==value.projectId)return false
  this.revision=Number(value.revision)
  for(const[key,view]of this.views)this.views.set(key,{...view,selected:key===value.sessionId})
  if(!existing)this.views.set(value.sessionId,{projectId:value.projectId,sessionId:value.sessionId,reference:this.retain(value.sessionId),selected:true,references:[]})
  this.publish();return true
 }
 acknowledgeReference(id:string):void{
  for(const[key,view]of this.views)this.views.set(key,{...view,references:view.references.filter(ref=>ref.id!==id)})
  this.publish()
 }
 active(reference:SessionReference,id?:string):boolean{return [...this.views.values()].some(view=>view.reference===reference&&(id===undefined||view.references.some(ref=>ref.id===id)))}
 dispose():void{this.setScope(null);this.page.dispose();this.listeners.clear()}
}
