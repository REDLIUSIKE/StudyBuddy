import { useEffect, useRef } from 'react'
import { Button, IconSkillOutlineRegular, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PageFace } from './index.ts'
import css from './PagePanel.module.css'
export type PagePanelProps = (PropsRuntime<'main'> | PropsRuntime<'studybuddy.my-ai.leaderboard'>) & PropsLocale<'studybuddy.pages'> & InjectFace<PageFace>
export function PagePanel({ usePage, target, desktop, attach, retry, t }: PagePanelProps) {
  const state = usePage(value => value), container = useRef<HTMLDivElement>(null)
  useEffect(() => container.current ? attach(container.current) : undefined, [attach])
  return <section className={css.panel} aria-label={t(target)}>
    {!desktop ? <p role="status">{t('desktop')}</p> : !state.scope ? <p role="status">{t('signedOut')}</p>
      : state.errorCode ? <div role="alert">{t('failed')} <Button onClick={() => { void retry() }}>{t('retry')}</Button></div>
        : state.busy ? <p role="status">{t('loading')}</p> : null}
    <div className={css.surface} ref={container} />
  </section>
}
export function SkillsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <IconSkillOutlineRegular size={size} /> }
export function AigcPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <IconSparkleRegular size={size} /> }
