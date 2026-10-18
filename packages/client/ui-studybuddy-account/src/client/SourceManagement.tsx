/** Saved catalogs and source management remain inside the source editor. */
import { useEffect, useId, useState } from 'react'
import { Button, DisclosureRow, Input, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SourceSnapshot } from './source-controller.ts'
import { isSourceV3 } from './source-controller.ts'
import type { AccountFace } from './face.ts'
import type { AccountLocaleKey } from './locales.ts'
import { SourceDiagnostics } from './SourceDiagnostics.tsx'
import css from './MyAiPanel.module.css'

/**
 * Render the existing inventory, rename, delete, order and recovery controls for one source.
 * @param props - exact source identity and the current controller callbacks; closing never writes a Key.
 * @returns management details for the selected source.
 */
export function SourceManagement({ source, state, actions, t, onClose, showInventory = true }: {
  source: SourceSnapshot['sources'][number]
  state: SourceSnapshot
  actions: AccountFace['source']
  t: (key: AccountLocaleKey) => string
  onClose: () => void
  showInventory?: boolean
}) {
  const [expanded, setExpanded] = useState(false), [deleting, setDeleting] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null), inputId = useId()
  const v3 = isSourceV3(source)
  useEffect(() => { if (v3) void actions.loadDetail(source.localRef) }, [source.localRef, source.localRevision, v3,
    state.scope?.accountId, state.scope?.generation, actions.loadDetail])
  const testedModels = isSourceV3(source) ? state.readiness?.find(row => row.localRef === source.localRef &&
    row.sourceRevision === source.sourceRevision && row.state === 'ready')?.appliedModels.map(row =>
    row.exactModelId) ?? [] : [source.testedModelId]
  const index = state.models.findIndex(row => row.internalId === source.localRef)
  const move = (offset: number): void => {
    const ids = state.models.map(row => row.internalId), other = index + offset
    if (index < 0 || other < 0 || other >= ids.length) return
    const currentId = ids[index], otherId = ids[other]
    if (currentId === undefined || otherId === undefined) return
    ids[index] = otherId
    ids[other] = currentId
    void actions.reorder(ids)
  }
  return <section className={css.section}>
    <div className={css.actions}>
      <Tag>{t(source.route === 'local_direct' ? 'local' : 'registered')}</Tag>
      <Button size="sm" disabled={state.busy} onClick={() => { setRenaming(source.name) }}>{t('rename')}</Button>
      <Button size="sm" disabled={state.busy} onClick={() => { setDeleting(true) }}>{t('remove')}</Button>
      <Button size="sm" disabled={state.busy || index <= 0} onClick={() => { move(-1) }}>{t('moveUp')}</Button>
      <Button size="sm" disabled={state.busy || index < 0 || index >= state.models.length - 1} onClick={() => {
        move(1)
      }}>{t('moveDown')}</Button>
      {source.state === 'pending' && source.operationId && <Button size="sm" disabled={state.busy} onClick={() => {
        if (source.operationId) void actions.resume(source.operationId)
      }}>{t('resume')}</Button>}
    </div>
    {state.registrations.filter(row => row.localRef === source.localRef && row.state === 'pending' && row.operationId &&
      source.state !== 'pending').map(row => <div className={css.actions} key={row.operationId}>
      <span>{t('pending')}</span><Button size="sm" disabled={state.busy} onClick={() => {
        if (row.operationId) void actions.resumeLegacy(row.operationId)
      }}>{t('resume')}</Button>
    </div>)}
    {showInventory && source.inventory && <DisclosureRow icon={null} title={
      `${t('catalog')} · ${source.inventory.models.length}`} open={expanded} expandable expandOnRowClick onToggle={() =>
    { setExpanded(!expanded) }}>
      <ul className={css.inventory}>{source.inventory.models.map(model => <li key={model.exactModelId}><code>{
        model.exactModelId}</code><Tag>{t(testedModels.includes(model.exactModelId) ? 'tested' : 'unverified')}</Tag>{
        model.lifecycle && <span>{model.lifecycle}</span>}{model.shutdownDate && <time>{model.shutdownDate}</time>}</li>)}</ul>
      <p className={css.secondary}>{t('inventoryNotice')}</p>
    </DisclosureRow>}
    {v3 && <SourceDiagnostics source={source} state={state} actions={actions} t={t} />}
    <Modal open={deleting} title={t('removeConfirm')} closeLabel={t('close')} onClose={() => {
      setDeleting(false)
    }} footer={<><Button variant="outline" onClick={() => { setDeleting(false) }}>{
      t('cancel')}</Button><Button variant="primary" disabled={state.busy} onClick={() => {
      setDeleting(false)
      onClose(); void actions.remove(source.localRef)
    }}>{t('remove')}</Button></>} />
    <Modal open={renaming !== null} title={t('rename')} closeLabel={t('close')} onClose={() => {
      setRenaming(null)
    }} footer={<><Button variant="outline" onClick={() => { setRenaming(null) }}>{
      t('cancel')}</Button><Button variant="primary" disabled={state.busy || !renaming?.trim()} onClick={() => {
      const name = renaming; setRenaming(null); if (name) {
        onClose(); void actions.rename(source.localRef,
          name)
      }
    }}>{t('save')}</Button></>}>
      {renaming !== null && <label htmlFor={inputId}>{t('name')}<Input id={inputId} value={renaming} onChange={
        (event) => { setRenaming(event.target.value) }} /></label>}
    </Modal>
  </section>
}
