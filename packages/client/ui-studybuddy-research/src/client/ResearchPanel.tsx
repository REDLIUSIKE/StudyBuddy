/** Main panel holds geometry; the native Conversation remains under the stable shell overlay. */
import { useLayoutEffect, useRef } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ResearchPanelFace } from './index.ts'
import css from './ResearchPanel.module.css'
type Props = PropsRuntime<'main'> & PropsLocale<'studybuddy.research'> & InjectFace<ResearchPanelFace>
/** @param props - Owned guest state and geometry actions. @returns The workbench and native-column footprint. */
export function ResearchPanel({ usePage, attachGuest, attachNative, desktop, retry, t }: Props) {
  const page = usePage(state => state), left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => left.current ? attachGuest(left.current) : undefined, [attachGuest])
  useLayoutEffect(() => right.current ? attachNative(right.current) : undefined, [attachNative])
  return <section className={css.panel} aria-label={t('title')}>
    <div className={css.surface}>
      {!desktop ? <p className={css.status}>{t('desktop')}</p> : !page.scope ? <p className={css.status}>{t('signedOut')}</p>
        : page.errorCode ? <div className={css.status} role="alert">{t('failed')} <Button onClick={() => { void retry() }}>{t('retry')}</Button></div>
          : page.busy ? <p className={css.status} role="status">{t('loading')}</p> : null}
      <div ref={left} className={css.surface} style={{ height: '100%' }} />
    </div>
    <div ref={right} className={css.nativeTarget} />
  </section>
}
/** @param props - Existing sidebar icon size. @returns Research entry icon. */
export function ResearchPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m8 3 6 6-3 3-6-6 3-3Zm5 7 2 2M14 5l2-2M4 17h8M7 17v4M3 21h18" />
    <path d="M15 10a6 6 0 0 1 3 11" />
    <circle cx="15" cy="14" r="2" />
  </svg>
}
