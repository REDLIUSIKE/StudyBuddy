import { useLayoutEffect,useRef } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace,PropsLocale,PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { VideoPanelFace } from './index.ts'
import css from './VideoPanel.module.css'
type Props=PropsRuntime<'main'>&PropsLocale<'studybuddy.video'>&InjectFace<VideoPanelFace>
/** Existing Studio stays in its isolated guest beside the native Conversation. */
export function VideoPanel({usePage,attachGuest,attachNative,desktop,retry,t}:Props){
 const page=usePage(value=>value),left=useRef<HTMLDivElement>(null),right=useRef<HTMLDivElement>(null)
 useLayoutEffect(()=>left.current?attachGuest(left.current):undefined,[attachGuest])
 useLayoutEffect(()=>right.current?attachNative(right.current):undefined,[attachNative])
 return <section className={css.panel} aria-label={t('title')}>
  <div className={css.surface}>
   {!desktop?<p className={css.status}>{t('desktop')}</p>:!page.scope?<p className={css.status}>{t('signedOut')}</p>:page.errorCode?<div className={css.status} role="alert">{t('failed')} <Button onClick={()=>{void retry()}}>{t('retry')}</Button></div>:page.busy?<p className={css.status} role="status">{t('loading')}</p>:null}
   <div ref={left} className={css.surface} style={{height:'100%'}}/>
  </div>
  <div ref={right} className={css.nativeTarget}/>
 </section>
}
export function VideoPanelIcon({size}:PropsRuntime<'sidebar.panellist'>){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.4 7.8 12 12M8.4 16.2 21 3M14 10l7-7"/></svg>
}
