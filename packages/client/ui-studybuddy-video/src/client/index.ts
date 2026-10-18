import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { EmbeddedPagePresentation,observeEmbeddedSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EmbeddedPageHost,EmbeddedPageScope,EmbeddedPageSnapshot,SurfaceProjection } from '@deepseek-ai/dsh-client-ui-primitives'
import { VideoPageController,type VideoViewSnapshot } from './video-controller.ts'
import { VideoReferenceImporter } from './video-reference.ts'
import { VideoPanel,VideoPanelIcon } from './VideoPanel.tsx'
import { VideoConversations,NativeVideoConversation } from './native-conversation.tsx'
import { zh,en,type VideoLocaleKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots'{
 interface LocaleNamespaceMap{'studybuddy.video':VideoLocaleKey}
 interface SlotMap{'studybuddy.video.conversation':{kind:'single';scope:'session';owner:Record<never,never>}}
}
declare module '@deepseek-ai/dsh-api-session-controller/client'{interface SessionReferenceSourceMap{videoView:unknown}}
interface Surface extends EmbeddedPageHost<'video'>{available():Promise<boolean>;subscribeAction(listener:(value:unknown)=>void):()=>void;acknowledgeReference(id:string):Promise<void>}
interface Host{
 capabilities?:{completeOpen(id:string):Promise<unknown>}
 subscribeNavigation?(listener:(notice:unknown)=>void):()=>void
 video?:Surface
 status():Promise<{phase:string;scope?:EmbeddedPageScope|null}>
 subscribe(listener:(value:{phase:string;scope?:EmbeddedPageScope|null})=>void):()=>void
}
export interface VideoPanelFace{
 hooks:{page:HostObservable<EmbeddedPageSnapshot>}
 desktop:boolean
 attachGuest(element:HTMLElement):()=>void
 attachNative(element:HTMLElement):()=>void
 retry():Promise<void>
}
export interface VideoOverlayFace{hooks:{views:HostObservable<VideoViewSnapshot>;geometry:HostObservable<SurfaceProjection>;page:HostObservable<EmbeddedPageSnapshot>};applyReference(id:string):Promise<void>}
export const inject=['slots','locale','layout','theme','sessions','conversation','sidebarRightSurfaces']
/** Register the video page and native Conversation through reversible client effects. */
export async function apply(ctx:Context):Promise<void>{
 const host=Reflect.get(window,'studybuddy') as Host|undefined,surface=host?.video
 if(!surface||!await surface.available().catch(()=>false))return
 ctx.effect(()=>ctx.locale.register('studybuddy.video',{zh,en}))
 const t=ctx.locale.bind('studybuddy.video')
 const controller=new VideoPageController(surface,id=>ctx.sessions.retain(brandString<SessionId>(id),{source:'videoView'}))
 const presentation=new EmbeddedPagePresentation(controller.page,()=>t('title'),undefined,'cover'),importer=new VideoReferenceImporter()
 let geometry:SurfaceProjection={bounds:null,visible:false}
 const listeners=new Set<()=>void>()
 const setGeometry=(next:SurfaceProjection):void=>{geometry=next;for(const listener of [...listeners])listener()}
 const geometrySource:HostObservable<SurfaceProjection>={getSnapshot:()=>geometry,subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener)}}}
 const panel:VideoPanelFace={hooks:{page:controller.page},desktop:!!surface,attachGuest:presentation.attach,retry:controller.page.retry,
  attachNative:element=>{const stop=observeEmbeddedSurface(element,value=>setGeometry({bounds:value.bounds,visible:element.isConnected&&!!value.bounds&&value.bounds.width>0&&value.bounds.height>0}));return()=>{stop();setGeometry({bounds:null,visible:false})}}}
 const applyReference=async(id:string):Promise<void>=>{
  const view=controller.getSnapshot().views.find(row=>row.references.some(ref=>ref.id===id)),reference=view?.references.find(ref=>ref.id===id)
  if(!view||!reference||!surface)return
  try{
   const binding=await view.reference.ready
   if(!controller.active(view.reference,id))return
   const input=ctx.conversation.input.for(binding.ctx)
   if(!importer.insert({state:input.state,insert:request=>binding.ctx.bail(binding.ctx,'slash/input-insert-text',request)===true},reference)){input.notify('error',t('referenceFailed'));return}
   await surface.acknowledgeReference(id)
   controller.acknowledgeReference(id)
   if(controller.getSnapshot().views.some(row=>row.reference===view.reference&&row.selected)&&ctx.layout.panelInfo.getSnapshot().activePanelId==='studybuddy.video')input.focus()
  }catch{if(controller.active(view.reference,id))controller.page.reportFailure('VIDEO_REFERENCE_UNAVAILABLE')}
 }
 const overlay:VideoOverlayFace={hooks:{views:controller,geometry:geometrySource,page:controller.page},applyReference}
 const id=brandString<MainPanelId>('studybuddy.video')
 ctx.effect(()=>ctx.sidebarRightSurfaces.register(id,{
  getSnapshot:()=>{
   const selected=controller.getSnapshot().views.find(view=>view.selected)
   return selected?brandString<SessionId>(selected.sessionId):undefined
  },
  subscribe:listener=>controller.subscribe(listener),
 }))
 ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:id,locale:'studybuddy.video',inject:()=>panel},VideoPanel))
 ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id,order:52,label:()=>t('title'),locale:'studybuddy.video'},VideoPanelIcon))
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'studybuddy.video.sessions',locale:'studybuddy.video',children:{'studybuddy.video.conversation':{kind:'single',scope:'session'}},inject:()=>overlay},VideoConversations))
 ctx.slots.inject('studybuddy.video.conversation',()=>ctx.slots.register({name:'studybuddy.video.conversation'},NativeVideoConversation))
 ctx.effect(()=>{
  let revision=0
  const adopt=(value:{phase:string;scope?:EmbeddedPageScope|null}):void=>{
   const scope=value.phase==='authenticated'?value.scope??null:null,previous=controller.page.getSnapshot().scope
   if(previous?.accountId!==scope?.accountId||previous?.generation!==scope?.generation)importer.clear()
   controller.setScope(scope)
   if(ctx.layout.panelInfo.getSnapshot().activePanelId===id)void controller.page.acquire()
  }
  const stop=host?.subscribe(value=>{revision++;adopt(value)}),initial=revision
  void host?.status().then(value=>{if(initial===revision)adopt(value)}).catch(()=>{if(initial===revision)adopt({phase:'error'})})
  const action=surface?.subscribeAction(value=>{
   if(!controller.accept(value)||!value||typeof value!=='object'||!('kind'in value))return
   if(value.kind==='reference'&&'id'in value&&typeof value.id==='string')void applyReference(value.id)
   if(value.kind==='open-tools')ctx.layout.selectPanel(brandString<MainPanelId>('studybuddy.tools'))
  })
  const creative=host?.subscribeNavigation?.(notice=>{
   if(!notice||typeof notice!=='object'||!('target'in notice)||notice.target!=='video'||!('scope'in notice)||!('capabilityAction'in notice)||typeof notice.capabilityAction!=='string'||JSON.stringify(controller.page.getSnapshot().scope)!==JSON.stringify(notice.scope))return
   ctx.layout.selectPanel(id);void controller.page.acquire().then(()=>host.capabilities?.completeOpen(notice.capabilityAction as string)).catch(()=>controller.page.reportFailure('VIDEO_PROJECT_OPEN_FAILED'))
  })
  return()=>{stop?.();action?.();creative?.()}
 })
 ctx.on('theme/change',()=>{void controller.page.setTheme({...presentation.theme(),mode:ctx.theme.getTheme().active.colorScheme})})
 ctx.effect(()=>()=>{presentation.dispose();controller.dispose();importer.clear();listeners.clear()})
}
