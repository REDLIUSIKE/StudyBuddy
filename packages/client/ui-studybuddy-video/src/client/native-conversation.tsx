import type { InjectFace,PropsLocale,PropsRenderFactories,PropsRenderSlots,PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { Button,SurfaceVisibilityProvider } from '@deepseek-ai/dsh-client-ui-primitives'
import type { VideoOverlayFace } from './index.ts'
import css from './VideoPanel.module.css'
type Props=PropsRuntime<'shell.overlay'>&PropsRenderSlots<'studybuddy.video.conversation'>&PropsLocale<'studybuddy.video'>&InjectFace<VideoOverlayFace>
/** Retain each project's real SessionProvider and conceal input when its page is hidden. */
export function VideoConversations({useViews,useGeometry,usePage,usePanelInfo,SessionProvider,renderSlot,applyReference,t}:Props){
 const {views}=useViews(value=>value),geometry=useGeometry(value=>value),page=usePage(value=>value)
 const active=usePanelInfo(value=>value.activePanelId==='studybuddy.video')
 const rect=geometry.bounds,shown=active&&geometry.visible&&!!rect&&!!page.lease&&!page.errorCode
 return <div className={css.nativeOverlay} hidden={!shown} aria-hidden={!shown} style={rect?{left:rect.x,top:rect.y,width:rect.width,height:rect.height}:undefined}>
  {!views.some(view=>view.selected)?<p className={css.empty}>{t('empty')}</p>:null}
  {views.map(view=><div key={view.sessionId} className={css.conversation} hidden={!view.selected}>
   {view.references.map(reference=><div className={css.reference} key={reference.id}><span title={reference.text}>{reference.text}</span><Button onClick={()=>{void applyReference(reference.id)}}>{t('applyReference')}</Button></div>)}
   <SurfaceVisibilityProvider visible={shown&&view.selected}><SessionProvider session={view.reference}>{renderSlot('studybuddy.video.conversation',{})}</SessionProvider></SurfaceVisibilityProvider>
  </div>)}
 </div>
}
export function NativeVideoConversation({renderFactorySlot,useSession}:PropsRuntime<'studybuddy.video.conversation'>&PropsRenderFactories){
 const opened=useSession(session=>session.openState==='open')
 return <div className={css.nativeBody}>{renderFactorySlot('conversation.content',{variant:'embedded',phase:opened?'active':'settling',hero:false})}</div>
}
