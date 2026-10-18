import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, FileText, LoaderCircle, Pencil, Plus, RefreshCw, Search, Upload, X } from 'lucide-react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PromptController, PromptRecord } from './controller.ts'
import type { createPromptViewStore, PromptDraft, PromptFeedbackKind } from './view-store.ts'
import type { PromptLocaleKey } from './locales.ts'
import css from './PromptPanel.module.css'

type Translate = (key: PromptLocaleKey) => string
export interface PromptFace {
  hooks: { prompts: PromptController; globalPanel: HostObservable<string | null> }
  toggle(): void; close(): void; add(): void; edit(row: PromptRecord): void; copy(body: string): void
  save(draft: PromptDraft): Promise<void>; publish(row: PromptRecord): void
  loadMine(): void; loadSquare(query: string, page?: number): void
}
export type PromptPanelProps = PropsRuntime<'rightbar.global'> & PropsStore<ReturnType<typeof createPromptViewStore>> & PropsLocale<'studybuddy.prompts'> & InjectFace<PromptFace>
export type PromptEntryProps = PropsRuntime<'sidebar.header.action'> & PropsLocale<'studybuddy.prompts'> & InjectFace<PromptFace>

export function PromptEntry({ useGlobalPanel, toggle, t }: PromptEntryProps) {
  const open = useGlobalPanel(key => key === 'studybuddy.prompts')
  return <Tooltip label={t('title')} side="bottom" delayMs={400}>
    <button type="button" className={css.entry} aria-label={t('title')} aria-expanded={open} data-active={open || undefined} onClick={toggle}><FileText size={17} /></button>
  </Tooltip>
}

export function PromptCard({ row, busy, copy, edit, publish, t }: { row: PromptRecord; busy: boolean; copy(body: string): void; edit(): void; publish(): void; t: Translate }) {
  return <article className={css.card} data-prompt-id={row.id}>
    <button type="button" className={css.copy} aria-label={row.title} onClick={() => { copy(row.body) }}>
      <h3>{row.title}</h3><p>{row.body}</p>
    </button>
    {row.owned && <div className={css.cardActions}>
      <Tooltip label={t('edit')} side="bottom"><button type="button" aria-label={t('edit')} onClick={edit} disabled={busy}><Pencil size={14} /></button></Tooltip>
      <Tooltip label={busy ? t('publishing') : t('upload')} side="bottom"><button type="button" aria-label={t('upload')} onClick={publish} disabled={busy}>{busy ? <LoaderCircle size={14} className={css.spin} /> : <Upload size={14} />}</button></Tooltip>
    </div>}
  </article>
}

export function PromptFeedback({ feedback, t }: { feedback: PromptFeedbackKind | null; t: Translate }) {
  if (!feedback) return null
  return <div className={css.feedback} role={feedback === 'copyError' ? 'alert' : 'status'}>
    {feedback === 'copyError' ? <X size={18} /> : <Check size={18} />}
    <span><strong>{t(feedback)}</strong>{feedback === 'copied' && <small>{t('copiedHint')}</small>}</span>
  </div>
}

function errorKey(code: string): PromptLocaleKey {
  if (code === 'AUTH_REQUIRED') return 'error.auth'
  if (code === 'NETWORK_UNAVAILABLE') return 'error.network'
  if (code === 'PROMPT_REVISION_CONFLICT' || code === 'PROMPT_REQUEST_CONFLICT') return 'error.conflict'
  if (code === 'PROMPT_LIBRARY_FULL') return 'error.full'
  return 'error.request'
}

export function PromptPanel({ useStore, usePrompts, actions, close, add, edit, copy, save, publish, loadMine, loadSquare, t }: PromptPanelProps) {
  const view = useStore(state => state), state = usePrompts(value => value)
  const [invalid, setInvalid] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (view.tab !== 'square' || !view.reveal || !scroll.current) return
    const card = scroll.current.querySelector<HTMLElement>('[data-prompt-id="' + view.reveal + '"]')
    if (card) scroll.current.scrollTop = card.offsetTop - scroll.current.offsetTop
  }, [view.tab, view.reveal, state.publicItems])
  useEffect(() => {
    setInvalid(false)
  }, [view.editor?.id, state.scope])
  useEffect(() => {
    if (view.tab !== 'square') return
    const timer = setTimeout(() => { loadSquare(view.query, 1) }, 200)
    return () => { clearTimeout(timer) }
  }, [view.tab, view.query, loadSquare])
  const query = view.query.toLocaleLowerCase()
  const rows = (view.tab === 'mine' ? state.items : state.publicItems).filter(row => (row.title + '\n' + row.body).toLocaleLowerCase().includes(query))
  const loading = state.busy.some(key => key === 'mine' || key.startsWith('square:'))
  const saveBusy = state.busy.includes('save')
  return <section className={css.panel} aria-label={t('title')} data-prompt-manager>
    <header className={css.header}><h2>{t('title')}</h2><button type="button" className={css.icon} aria-label={t('close')} onClick={close}><X size={18} /></button></header>
    <div className={css.tabs} role="tablist" aria-label={t('title')}>
      {(['mine', 'square'] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={view.tab === tab} onClick={() => { actions.selectTab(tab) }}>{t(tab)}</button>)}
    </div>
    <p className={css.hint}>{t('hint')}</p>
    <div className={css.search}><Search size={15} /><input aria-label={t('search')} placeholder={t('search')} maxLength={200} value={view.query} onChange={event => { actions.query(event.target.value) }} /><button type="button" className={css.icon} aria-label={t('refresh')} disabled={loading} onClick={() => { if (view.tab === 'mine') loadMine(); else loadSquare(view.query, 1) }}><RefreshCw size={14} /></button></div>
    {state.error && <div className={css.error} role="alert"><span>{t(errorKey(state.error))}</span>{(state.failureKind === 'mine' || state.failureKind === 'square') && <button type="button" onClick={() => { if (state.failureKind === 'mine') loadMine(); else loadSquare(view.query, 1) }}>{t('retry')}</button>}</div>}
    <div className={css.scroll} ref={scroll}>
      {view.editor ? <form className={css.editor} onSubmit={event => {
        event.preventDefault()
        if (!view.editor?.title.trim() || !view.editor.body.trim()) { setInvalid(true); return }
        void save(view.editor).catch(() => {})
      }}>
        <label>{t('formTitle')}<input autoFocus maxLength={120} placeholder={t('titlePlaceholder')} value={view.editor.title} onChange={event => { actions.updateDraft('title', event.target.value) }} /></label>
        <label>{t('formBody')}<textarea placeholder={t('bodyPlaceholder')} value={view.editor.body} onChange={event => { actions.updateDraft('body', event.target.value) }} /></label>
        {invalid && <p role="alert" className={css.error}>{t('required')}</p>}
        <div className={css.formActions}><button type="button" disabled={saveBusy} onClick={() => { actions.edit(null) }}>{t('cancel')}</button><button className={css.primary} disabled={saveBusy} type="submit">{t(saveBusy ? 'saving' : 'save')}</button></div>
      </form> : <>
        <div className={css.grid}>
          {view.tab === 'mine' && <button type="button" className={css.add} onClick={add}><span><Plus size={21} /></span><strong>{t('add')}</strong><small>{t('addHint')}</small></button>}
          {rows.map(row => <PromptCard key={row.id} row={row} busy={state.busy.includes('publish:' + row.sourceId)} copy={copy} edit={() => { edit(row) }} publish={() => { publish(row) }} t={t} />)}
        </div>
        {loading && <p className={css.empty} role="status">{t('loading')}</p>}
        {!loading && rows.length === 0 && <div className={css.empty}><FileText size={27} /><strong>{t(view.query ? 'noResults' : view.tab === 'mine' ? 'emptyMine' : 'emptySquare')}</strong>{!view.query && <p>{t(view.tab === 'mine' ? 'emptyMineHint' : 'emptySquareHint')}</p>}</div>}
        {view.tab === 'square' && state.hasMore && <button className={css.more} type="button" disabled={loading || state.squareQuery !== view.query} onClick={() => { loadSquare(view.query, state.squarePage + 1) }}>{t('more')}</button>}
      </>}
    </div>
    <PromptFeedback feedback={view.feedback} t={t} />
  </section>
}
