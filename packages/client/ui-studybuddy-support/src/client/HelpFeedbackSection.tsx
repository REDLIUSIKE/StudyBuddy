/** Compact support presentation within the existing Settings shell. */
import { useEffect } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import type { SupportInjected } from './index.ts'
import type { createSupportViewStore } from './view-store.ts'
import css from './HelpFeedbackSection.module.css'
type Props = PropsRuntime<'settings.section'> & PropsLocale<'studybuddy.support'> &
  PropsStore<ReturnType<typeof createSupportViewStore>> & InjectFace<SupportInjected>
export function HelpFeedbackSection({ useSupport, useStore, actions, preview, uploadLogs, submitIssue, selectScreenshots,
  copyReference, checkUpdates, t }: Props) {
  const state = useSupport(value => value), draft = useStore(value => value)
  useEffect(() => { void preview(draft.range) }, [draft.range, preview])
  const operation = state.operation, confirmedLog = operation.state !== 'idle' && 'log' in operation ? operation.log : undefined
  const issue = operation.state === 'available' && operation.flow === 'issue' ? operation.issue : undefined
  const code = state.errorCode ?? (operation.state === 'failed' || operation.state === 'submission_unconfirmed' ? operation.error.code : null)
  const failureKey = code === 'AUTH_REQUIRED' ? 'login' : code === 'LOG_UPLOAD_OFFLINE' ? 'offline' : code === 'LOG_UPLOAD_TIMEOUT' ? 'timeout'
    : code === 'LOG_UPLOAD_REJECTED' ? 'rejected' : code === 'LOG_UPLOAD_RATE_LIMITED' ? 'rate' : code === 'LOG_ARCHIVE_EMPTY' ? 'empty'
      : code === 'SUPPORT_COPY_FAILED' ? 'copyFailed' : 'failed'
  const unknown = state.issueUnconfirmed
  return <section className={css.section} aria-label={t('nav')}>
    <header className={css.header}><div><h2>{t('heading')}</h2><p>{t('intro')}</p></div>
      <Button variant="outline" size="sm" onClick={() => { void checkUpdates() }}>{t('updates')}</Button></header>
    {!state.available ? <p role="status">{t('unavailable')}</p> : !state.scope ? <p role="status">{t('login')}</p> : <>
      <div className={css.tabs} role="group" aria-label={t('nav')}>
        <Button variant={draft.mode === 'logs' ? 'primary' : 'ghost'} disabled={state.busy}
          onClick={() => { actions.setMode('logs') }}>{t('logs')}</Button>
        <Button variant={draft.mode === 'issue' ? 'primary' : 'ghost'} disabled={state.busy}
          onClick={() => { actions.setMode('issue') }}>{t('issue')}</Button></div>
      {draft.mode === 'issue' && <div className={css.form}>
        <label>{t('title')}<Input value={draft.title} maxLength={80} disabled={state.busy} placeholder={t('titleHint')}
          onChange={(event) => { actions.setTitle(event.target.value) }} /></label>
        <label>{t('description')}<textarea value={draft.description} maxLength={2000} rows={4} disabled={state.busy}
          placeholder={t('descriptionHint')} onChange={(event) => { actions.setDescription(event.target.value) }} /></label>
        <div><Button variant="outline" size="sm" disabled={state.busy} onClick={() => { void selectScreenshots() }}>{t('screenshots')}</Button>
          <p className={css.muted}>{t('screenshotHint')}</p>{state.screenshots.map(row => <span className={css.file} key={row.selectionId}>{row.name}</span>)}</div>
      </div>}
      <div className={css.range}><span>{t('range')}</span><select value={draft.range} disabled={state.busy}
        aria-label={t('range')} onChange={(event) => { const value = event.target.value
          if (value === 'last_24_hours' || value === 'last_3_days' || value === 'all_30_days') actions.setRange(value) }}>
        <option value="last_24_hours">{t('day')}</option><option value="last_3_days">{t('days')}</option>
        <option value="all_30_days">{t('month')}</option></select>
      <Button size="sm" disabled={state.busy || state.previewBusy} onClick={() => { void preview(draft.range) }}>{t('preview')}</Button></div>
      {state.previewBusy ? <p role="status" className={css.muted}>{t('previewBusy')}</p> : state.preview && <div className={css.preview}>
        <p>{t('summary').replace('{files}', String(state.preview.fileCount)).replace('{events}', String(state.preview.eventCount))
          .replace('{bytes}', String(Math.ceil(Number(state.preview.compressedBytes) / 1024)))}</p>
        <details><summary>{t('sources')}</summary><div className={css.sources}>{state.preview.sources.map(row =>
          <span key={row.source}>{t(row.source)} · {t(row.state === 'present' ? 'present' : row.state === 'failed' ? 'sourceFailed' : 'missing')}</span>)}</div></details></div>}
      <div className={css.notice}><p>{t('keyNotice')}</p><small>{t('privacy')}</small></div>
      <Button variant="primary" disabled={state.busy || unknown || draft.mode === 'issue' && (!draft.title.trim() || !draft.description.trim())}
        onClick={() => { if (draft.mode === 'logs') void uploadLogs(draft.range)
        else void submitIssue({ title: draft.title.trim(), description: draft.description.trim(), range: draft.range }) }}>
        {state.busy ? t(operation.state === 'running' ? operation.phase : 'preparing') : t(draft.mode === 'logs' ? 'upload' : 'submit')}</Button>
      {unknown ? <p role="alert">{t('unconfirmed')}</p> : code ? <p role="alert">{t(failureKey)} <code>{code}</code></p>
        : operation.state === 'available' ? <p role="status">{t(issue ? 'submitted' : 'uploaded')}</p> : null}
      {operation.state === 'failed' && <p className={css.muted}>{t('failedPhase')} · {t(operation.phase === 'preparing'
        ? 'phasePrepare' : operation.phase === 'uploading' ? 'phaseUpload' : 'phaseSubmit')}</p>}
      {operation.state !== 'idle' && <p className={css.muted}>{t('request')} · <code>{operation.state === 'failed'
        || operation.state === 'submission_unconfirmed' ? operation.error.operationId ?? operation.requestId : operation.requestId}</code></p>}
      {confirmedLog && <div className={css.reference}><code>{confirmedLog.publicCode}</code><Button size="sm"
        onClick={() => { void copyReference(confirmedLog.publicCode) }}>{t(state.copied === confirmedLog.publicCode ? 'copied' : 'copy')}</Button></div>}
      {issue && <div className={css.reference}><code>{issue.publicCode}</code><Button size="sm"
        onClick={() => { void copyReference(issue.publicCode) }}>{t(state.copied === issue.publicCode ? 'copied' : 'copy')}</Button></div>}
    </>}
    {state.update && <p role="status" className={css.muted}>{state.update}</p>}
    <footer className={css.customerService} aria-label={t('customerService')}>
      <div>{t('customerServiceQqLabel')}<span className={css.customerServiceQq}>{t('customerServiceQq')}</span></div>
      <p className={css.muted}>{t('customerServiceHours')}</p>
    </footer>
  </section>
}
