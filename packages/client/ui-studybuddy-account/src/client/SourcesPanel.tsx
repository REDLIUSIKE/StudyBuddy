/** Native provider rows address one personal credential each; details keep the existing operations. */
import { useState } from 'react'
import { Button, Modal, ModelProviderList, ModelProviderRow, ModelProviderAddButton } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SourceSnapshot } from './source-controller.ts'
import { isSourceV3 } from './source-controller.ts'
import type { AccountFace } from './face.ts'
import type { AccountLocaleKey } from './locales.ts'
import { ErrorNotice } from './ErrorNotice.tsx'
import { SourceManagement } from './SourceManagement.tsx'
import css from './MyAiPanel.module.css'

/**
 * Render personal sources with the shared native provider display.
 * @param props - exact source facts and callbacks owned by the current account.
 * @returns independent Key rows and the existing source management entry points.
 */
export function SourcesPanel({ state, actions, t, openEditor }: {
  state: SourceSnapshot
  actions: AccountFace['source']
  t: (key: AccountLocaleKey) => string
  openEditor: () => void
}) {
  const [inspecting, setInspecting] = useState<string | null>(null)
  const inspected = state.sources.find(source => source.localRef === inspecting)
  return <section className={`${css.section} ${css.sourcesPanel}`}>
    <div className={css.sourceActions}>
      <Button size="sm" disabled={state.busy} onClick={() => { void actions.load() }}>{t('refresh')}</Button>
    </div>
    <ErrorNotice code={state.errorCode} t={t} retry={() => { void actions.load() }} />
    {state.busy && <p role="status">{t('loading')}</p>}
    {state.pending && <div className={css.card}>
      <p>{t('pending')}</p><Button variant="outline" onClick={() => { void actions.resume() }}>{t('resume')}</Button>
    </div>}
    {!state.busy && !state.errorCode && state.sources.length === 0 && <p className={css.empty}>{t('none')}</p>}
    <ModelProviderList>{state.sources.map((source) => {
      const model = state.models.find(row => row.internalId === source.localRef)
      const pending = source.state === 'pending' || state.pending?.draft.internalId === source.localRef
        || state.registrations.some(row => row.localRef === source.localRef && row.state === 'pending')
      const readiness = state.readiness?.find(row => row.localRef === source.localRef && row.sourceRevision === source.sourceRevision)
      const missingKey = !model?.apiKey.trim()
      const status = pending ? 'pending' : source.state !== 'saved' || missingKey ? 'sourceMissing' : !isSourceV3(source) ? 'sourceSaved' :
        readiness?.state === 'ready' ? 'builtinReady' : readiness?.state === 'pending' ? 'builtinPreparing' :
          readiness?.state === 'failed' ? 'builtinFailed' : readiness?.state === 'unsupported' ? 'builtinUnsupported' : 'builtinUnconfirmed'
      const indicator = missingKey ? 'failed' : pending ? 'pending' : status === 'builtinReady' ? 'ready' :
        status === 'builtinPreparing' ? 'pending' : status === 'builtinFailed' || status === 'sourceMissing' ? 'failed' : 'unknown'
      return <ModelProviderRow key={source.localRef} name={source.name}
        readiness={{ state: indicator, label: t(missingKey ? 'credentialMissing' : status) }}
        status={<span role="status">{t(status)}</span>} editLabel={t('edit')} editAccessibleLabel={t('edit') + ' ' + source.name}
        editDisabled={state.busy || !!state.pending} onEdit={() => {
          if (isSourceV3(source)) void actions.loadDetail(source.localRef)
          if (!model) { setInspecting(source.localRef); return }
          actions.editSource(source.localRef); openEditor()
        }} />
    })}</ModelProviderList>
    <ModelProviderAddButton label={t('addProvider')} disabled={state.busy || !!state.pending}
      onClick={() => { actions.createDraft(); openEditor() }} />
    <Modal open={!!inspected} title={inspected?.name ?? t('details')} closeLabel={t('close')}
      onClose={() => { setInspecting(null) }} className={css.sourceDialog ?? ''} contentClassName={css.sourceDialogContent ?? ''}>
      {inspected && <SourceManagement key={inspected.localRef} source={inspected} state={state} actions={actions}
        t={t} onClose={() => { setInspecting(null) }} />}
    </Modal>
  </section>
}
