import { useEffect, useRef } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import Wrench from 'lucide-react/dist/esm/icons/wrench.mjs'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolFace } from './index.ts'
import css from './ToolCenterPanel.module.css'
export type ToolCenterPanelProps = (PropsRuntime<'main'> | PropsRuntime<'settings.section'>) & PropsLocale<'studybuddy.tools'> & InjectFace<ToolFace>
export function ToolCenterPanel({ useTools, desktop, attach, retry, t, laboratory }: ToolCenterPanelProps) {
  const state = useTools(value => value),
    container = useRef<HTMLDivElement>(null)
  useEffect(() => (container.current ? attach(container.current) : undefined), [attach])
  return (
    <section className={css.panel} aria-label={t(laboratory?'labsPanel':'panel')}>
      {!desktop ? (
        <p role="status">{t(laboratory?'labsDesktop':'desktop')}</p>
      ) : !state.scope ? (
        <p role="status">{t('signedOut')}</p>
      ) : state.errorCode ? (
        <div role="alert">
          {t(laboratory?'labsFailed':'failed')}{' '}
          <Button
            onClick={() => {
              void retry()
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : state.busy ? (
        <p role="status">{t(laboratory?'labsLoading':'loading')}</p>
      ) : null}
      <div className={css.surface} ref={container} />
    </section>
  )
}
export function ToolsPanelIcon({ size }: Pick<PropsRuntime<'sidebar.panellist'>, 'size'>) {
  return <Wrench size={size} strokeWidth={1.5} aria-hidden="true" />
}
export function LabsPanelIcon({size}:PropsRuntime<'sidebar.panellist'>){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6l-5.6 9.3A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.6-2.7L14 9V3M7.2 14h9.6"/></svg>
}
