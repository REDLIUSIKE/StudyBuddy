/** Name-first project creation; directory picking remains an optional parent-owned interaction. */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, Input, Modal, Tooltip, IconCloseOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectCreateRequest, ProjectRequestId, SourceFolderView, WorkspaceId, WorkspaceSourceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspacePickerProps } from './contract/slots.ts'
import css from './CreateProject.module.css'

/** Only local form data and parent-owned commands cross this component. */
export interface CreateProjectProps {
  readonly open: boolean
  readonly t: WorkspacePickerProps['t']
  readonly canChooseFolder: boolean
  readonly chooseFolder: () => Promise<string | undefined>
  readonly registerSource: (input: { path: string }) => Promise<SourceFolderView>
  readonly createProject: (input: ProjectCreateRequest) => Promise<WorkspaceView>
  readonly onCreated: (workspaceId: WorkspaceId) => void
  readonly onClose: () => void
}

/**
 * Render the confirmed project's name and optional source-folder form.
 * @param props - localized form copy, directory interaction and Host commands.
 * @returns the modal; closing cancels presentation, not an already committed Host operation.
 */
export function CreateProject(props: CreateProjectProps) {
  const { open, t, canChooseFolder, chooseFolder, registerSource, createProject, onCreated, onClose } = props
  const [title, setTitle] = useState('')
  const [sources, setSources] = useState<readonly SourceFolderView[]>([])
  const [primary, setPrimary] = useState<WorkspaceSourceId | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const attempt = useRef<{ fingerprint: string, requestId: ProjectRequestId } | undefined>(undefined)
  useEffect(() => {
    if (!open) generation.current++
    return () => { generation.current++ }
  }, [open])

  const close = () => { generation.current++; onClose() }
  const addFolder = async () => {
    const current = generation.current
    setBusy(true); setError(null)
    try {
      const path = await chooseFolder()
      if (path === undefined || current !== generation.current) return
      const source = await registerSource({ path })
      if (current !== generation.current) return
      setSources(existing => existing.some(item => item.sourceId === source.sourceId || item.path === source.path)
        ? existing : [...existing, source])
      setPrimary(existing => existing ?? source.sourceId)
    } catch (reason) {
      console.warn('Project source selection failed', reason)
      if (current === generation.current) setError(t('project.sourceFailed'))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  const submit = async () => {
    if (busy || title.trim() === '') return
    const input = { title: title.trim(), sourceIds: sources.map(source => source.sourceId), ...(primary === undefined ? {} : { primarySourceId: primary }) }
    const fingerprint = JSON.stringify(input)
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, requestId: crypto.randomUUID() as ProjectRequestId }
    }
    const current = generation.current
    setBusy(true); setError(null)
    try {
      const project = await createProject({ ...input, requestId: attempt.current.requestId })
      if (current !== generation.current) return
      onCreated(project.workspaceId)
      close()
    } catch (reason) {
      console.warn('Named project creation failed', reason)
      if (current === generation.current) setError(t('project.createFailed'))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  return (
    <Modal headless open={open} onClose={close} title={t('project.create')} className={clsx(css.dialog)}>
      <header className={css.header}>
        <h2 className={css.title}>{t('project.create')}</h2>
        <Button variant="ghost" aria-label={t('close')} onClick={close}><IconCloseOutlineRegular size={16} /></Button>
      </header>
      <form className={css.form} onSubmit={event => { event.preventDefault(); void submit() }}>
        <Input data-modal-autofocus value={title} onChange={event => { setTitle(event.target.value) }} disabled={busy}
          aria-label={t('project.name')} placeholder={t('project.name')} icon={<IconFolderCloseRegular size={16} />} className={clsx(css.name)} />
        <section className={css.sourceSection} aria-label={t('project.sources')}>
          <Tooltip label={t('project.automaticDirectory')}><span className={css.label}>{t('project.sources')}</span></Tooltip>
          <div className={css.sources}>
            {sources.length === 0
              ? <p className={css.hint}>{t('project.addOnComputer')}</p>
              : <ul className={css.list}>{sources.map(source => (
                <li key={source.sourceId} className={css.row}>
                  <IconFolderCloseRegular size={16} />
                  <span className={css.path}>{source.path}</span>
                  <Button variant="ghost" disabled={busy} aria-pressed={primary === source.sourceId} onClick={() => { setPrimary(source.sourceId) }}>
                    {t(primary === source.sourceId ? 'project.primary' : 'project.setPrimary')}
                  </Button>
                  <Tooltip label={t('project.removeSource')} portal>
                    <button type="button" className={css.remove} aria-label={t('project.removeSource')} disabled={busy} onClick={() => {
                      const remaining = sources.filter(item => item.sourceId !== source.sourceId)
                      setSources(remaining)
                      if (primary === source.sourceId) setPrimary(remaining[0]?.sourceId)
                    }}><IconCloseOutlineRegular size={14} /></button>
                  </Tooltip>
                </li>
              ))}</ul>}
            <Button variant="ghost" disabled={busy || !canChooseFolder} onClick={() => { void addFolder() }}>
              <IconPlusOutlineRegular size={14} />{t('project.addFolder')}
            </Button>
          </div>
        </section>
        {error !== null && <p className={css.error} role="alert">{error}</p>}
      </form>
      <footer className={css.footer}>
        <Button variant="ghost" onClick={close}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy || title.trim() === ''} onClick={() => { void submit() }}>{t('project.create')}</Button>
      </footer>
    </Modal>
  )
}
