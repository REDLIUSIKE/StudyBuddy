/** Settings and My AI share the same account-scoped source and validation controller. */
import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountFace } from './face.ts'
import { SourcesPanel } from './SourcesPanel.tsx'
import { SourceEditor } from './SourceEditor.tsx'
import css from './MyAiPanel.module.css'

export type ModelsSettingsProps = InjectFace<AccountFace> & PropsLocale<'studybuddy.account'>

/** Keep the existing Models navigation entry while using the actual chat source authority. */
export function ModelsSettings({ t, useAccount, useSource, source, activate }: ModelsSettingsProps) {
  const account = useAccount(state => state), sources = useSource(state => state)
  const [editorOpen, setEditorOpen] = useState(false)
  useEffect(() => { activate('sources') }, [activate, account.scope?.accountId, account.scope?.generation])
  const identity = account.scope ? account.scope.accountId + ':' + account.scope.generation : 'signed-out'
  return <div className={css.modelSettings} data-studybuddy-model-settings>
    <h2>{t('modelSettings')}</h2>
    {!account.scope ? <p>{t('authenticationRequired')}</p> : <>
      <SourcesPanel key={identity} state={sources} actions={source} t={t} openEditor={() => setEditorOpen(true)} />
      <SourceEditor key={identity + ':editor'} state={editorOpen ? sources : { ...sources, draft: null }}
        actions={source} t={t} onClose={() => { source.clearDraft(); setEditorOpen(false) }} />
    </>}
  </div>
}
