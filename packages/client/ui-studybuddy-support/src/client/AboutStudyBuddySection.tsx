/** Static product information within the existing Settings shell. */
import { useState } from 'react'
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { COMMUNITY_QQ_GROUP, integratedProjects, referenceProjects } from './about-projects.ts'
import css from './AboutStudyBuddySection.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<'studybuddy.support'>

export function AboutStudyBuddySection({ t }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const copyContact = async (): Promise<void> => {
    setCopyState('copying')
    setCopyState(await writeClipboard(COMMUNITY_QQ_GROUP) ? 'copied' : 'failed')
  }

  return <section className={css.section} aria-label={t('aboutNav')}>
    <header className={css.header}>
      <h2>{t('aboutNav')}</h2>
      <p>{t('aboutIntro')}</p>
    </header>

    <section className={css.panel} aria-labelledby="studybuddy-about-create">
      <h3 id="studybuddy-about-create">{t('aboutCoCreate')}</h3>
      <p>{t('aboutInvitation')}</p>
      <div className={css.contact}>
        <span className={css.qq}>{t('aboutQqLabel')} <strong>{COMMUNITY_QQ_GROUP}</strong></span>
        <Button variant="outline" size="sm" disabled={copyState === 'copying'} onClick={() => { void copyContact() }}>
          {t(copyState === 'copied' ? 'copied' : 'aboutCopyQq')}
        </Button>
      </div>
      <p className={css.muted}>{t('aboutOpenSource')}</p>
      {copyState === 'failed' && <p className={css.muted} role="status">{t('aboutCopyFailed')}</p>}
      {copyState === 'copied' && <span className={css.srOnly} role="status">{t('aboutQqCopied')}</span>}
    </section>

    <section className={css.group} aria-labelledby="studybuddy-about-projects">
      <h3 id="studybuddy-about-projects">{t('aboutProjects')}</h3>
      <p className={css.muted}>{t('aboutThanks')}</p>
      <ul className={css.projects}>
        {integratedProjects.map(project => <li key={project.url}>
          <div className={css.projectHeading}>
            <a href={project.url} target="_blank" rel="noopener noreferrer">{project.name}</a>
            <span className={css.license}>{project.license}</span>
          </div>
        </li>)}
      </ul>
    </section>

    <section className={css.group} aria-labelledby="studybuddy-about-references">
      <h3 id="studybuddy-about-references">{t('aboutReferences')}</h3>
      <ul className={css.projects}>
        {referenceProjects.map(project => <li key={project.url}>
          <div className={css.projectHeading}>
            <a href={project.url} target="_blank" rel="noopener noreferrer">{project.name}</a>
            <span className={css.license}>{project.license}</span>
          </div>
        </li>)}
      </ul>
    </section>
  </section>
}
