/**
 * Workspace pick/add flow. WorkspacePickFlow is the reusable core (menu +
 * path error dialog) consumed directly by WorkspaceBrowser (same package) and
 * wrapped by WorkspacePicker for the conversation empty-state slot
 * registration. Directory picking itself lives in the composed flow package's
 * slot occupant (see the contract module doc): this core only opens the flow,
 * adopts an existing path, and owns the error surface. The modern flow also
 * creates a named project with optional source folders; legacy compositions
 * that omit the project commands keep their existing directory-only path.
 */
import type { ReactNode, RefObject } from 'react'
import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Input, IconFolderCloseRegular, IconPlusOutlineRegular, Menu, Modal, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceId, WorkspaceSnapshot, WorkspaceView, ProjectCreateRequest, SourceFolderView,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { DirectoryFlowOwnerProps, WorkspacePickerProps } from './contract/slots.ts'
import css from './WorkspacePicker.module.css'
import { CreateProject } from './CreateProject.tsx'

const ADD_WORKSPACE = '::add-workspace'
const NEW_PROJECT = '::new-project'
const NO_PROJECT = '::no-project'

/** Core flow props: the owner supplies popover control and pick semantics. */
export interface WorkspacePickFlowProps {
  /** The standard locale seat, forwarded by whichever slot entry hosts the flow. */
  t: WorkspacePickerProps['t']
  /** Popover visibility (anchor button toggle state, owner-local). */
  open: boolean
  /** The anchor button element — the popover's placement anchor. */
  anchorRef?: RefObject<HTMLElement | null> | undefined
  /** Selector hook over the workspace list (framework standard hook). */
  useWorkspaces: <S>(selector: (state: WorkspaceSnapshot) => S) => S
  /** Adopt a picked host directory as a real Workspace. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
  /** Name-first project creation when the composed Host serves it. */
  createProject?: (input: ProjectCreateRequest) => Promise<WorkspaceView>
  /** Canonicalize a source without creating a visible project. */
  registerSource?: (input: { path: string }) => Promise<SourceFolderView>
  /** Explicitly choose an ordinary chat; absent on sidebar add-only flows. */
  onOutsideProject?: () => void
  /** Bound occupancy selector hook for this surface's directory-flow hole (empty leaves the surface with no add action). */
  useDirectoryFlow: SnapshotSelectorHook<boolean>
  /** Render this surface's directory-flow hole with the owner conversation (the entry's narrowed renderSlot). */
  renderDirectoryFlow: (owner: DirectoryFlowOwnerProps) => ReactNode
  /** A real Workspace was picked or created. */
  onPick: (workspaceId: WorkspaceId) => void
  /** Close the popover (outside click / Escape / post-pick). */
  onClose: () => void
  /** Report the picking interaction and adoption occupancy. */
  onBusyChange?: (busy: boolean) => void
  /** Only offer the add action, hide existing workspaces. */
  addOnly?: boolean
  /** Menu opening direction relative to the anchor. */
  side?: 'bottom' | 'top' | 'right'
  /** Currently active workspace (trailing check in the picker list). */
  selectedId?: WorkspaceId | null | undefined
}

/**
 * Render the pick menu plus the adoption error dialog.
 * @param props - owner-controlled flow props.
 * @returns menu + dialog elements.
 */
export function WorkspacePickFlow({
  t,
  open,
  anchorRef,
  useWorkspaces,
  createWorkspace,
  createProject,
  registerSource,
  onOutsideProject,
  useDirectoryFlow,
  renderDirectoryFlow,
  onPick,
  onClose,
  addOnly = false,
  onBusyChange,
  side = 'bottom',
  selectedId,
}: WorkspacePickFlowProps) {
  const workspaceSnapshot = useWorkspaces(state => state)
  const workspaces = workspaceSnapshot.items
  const getAnchorRect = useCallback(
    () => anchorRef?.current?.getBoundingClientRect() ?? null,
    [anchorRef],
  )
  const [errorOpen, setErrorOpen] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createEpoch, setCreateEpoch] = useState(0)
  const [query, setQuery] = useState('')
  const sourceWaiter = useRef<{ resolve: (path: string | undefined) => void, reject: (error: Error) => void } | undefined>(undefined)
  const purpose = useRef<'adopt' | 'source'>('adopt')
  const flowGeneration = useRef(0)
  const modern = createProject !== undefined && registerSource !== undefined
  // One picking interaction at a time: while the flow is open (native chooser
  // pending, browse dialog up) or its pick is being adopted, every other
  // menu action stays disabled — a late outcome must not race a concurrent
  // selection or adoption.
  const flowBusy = flowOpen || pickingFolder || createOpen
  useEffect(() => { onBusyChange?.(flowBusy) }, [flowBusy, onBusyChange])

  // The occupied hole gates the picking affordance: with no composed flow the
  // entry simply is not there (the seam's documented no-flow default). The
  // framework-bound hook keeps occupancy live: flow plugins activate (and
  // HMR-reload) independently of this menu's renders.
  const flowAvailable = useDirectoryFlow(occupied => occupied)
  // An occupant that unloads mid-interaction leaves nobody to cancel: an
  // open flow over an empty hole withdraws so the menu actions come back.
  // flowOpen is a dependency because the flow can also OPEN over an already
  // empty hole (Choose again after the occupant unloaded with the error
  // dialog up) — that transition must snap back too, not just occupancy loss.
  useEffect(() => {
    if (flowOpen && !flowAvailable) {
      flowGeneration.current++
      setFlowOpen(false)
      sourceWaiter.current?.resolve(undefined)
      sourceWaiter.current = undefined
    }
  }, [flowOpen, flowAvailable])
  useEffect(() => () => { flowGeneration.current++; sourceWaiter.current?.resolve(undefined) }, [])
  const addEntries: MenuEntry[] = [
    ...(modern ? [{ id: NEW_PROJECT, label: t('project.new'), icon: <IconPlusOutlineRegular size={16} />, disabled: flowBusy }] : []),
    ...(flowAvailable ? [{ id: ADD_WORKSPACE, label: t(modern ? 'project.openFolder' : 'menu.addWorkspace'),
      icon: <IconFolderCloseRegular size={16} />, disabled: flowBusy }] : []),
  ]
  // With workspaces listed, the add action pins below the scroll region
  // (divider + always visible); otherwise it IS the menu.
  const pinAdd = !addOnly && (workspaces.length > 0 || modern)
  const items: MenuEntry[] = pinAdd
    ? [
      ...(onOutsideProject === undefined ? [] : [{ id: NO_PROJECT, label: t('project.outside'), disabled: flowBusy }]),
      ...workspaces.filter(workspace => workspace.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(workspace => ({
      id: workspace.workspaceId,
      label: workspaceDisplayTitle(workspace.title, t('workspace.defaultName')),
      icon: <IconFolderCloseRegular size={16} />,
      disabled: flowBusy,
      })),
    ]
    : addEntries
  // Nothing listed and nothing to add with (a composition that mounts this
  // package without any directory-picker): an empty popover would claim a
  // choice that does not exist, so the anchor gesture shows nothing at all.
  const menuIsEmpty = items.length === 0

  const closeModal = (): void => {
    setErrorOpen(false)
    setModalError(null)
  }

  /** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
  const adoptDirectory = (path: string, generation: number): Promise<void> =>
    createWorkspace({ path }).then((workspace) => {
      if (generation !== flowGeneration.current) return
      setFlowOpen(false)
      onPick(workspace.workspaceId)
    }).catch((reason: unknown) => {
      if (generation !== flowGeneration.current) return
      setModalError(reason instanceof Error ? reason.message : String(reason))
      setFlowOpen(false)
      setErrorOpen(true)
    })

  const openDirectoryFlow = useCallback((): void => {
    onClose()
    setErrorOpen(false)
    setModalError(null)
    setFlowOpen(true)
    purpose.current = 'adopt'
    flowGeneration.current++
  }, [onClose])

  // A menu exists to disambiguate between targets. With no workspaces listed
  // and the add action the only entry left, the anchor gesture IS that action:
  // a one-row popover would cost a click and offer nothing to choose between.
  // The owner's open request is consumed the same way selecting the entry
  // would consume it (close the popover, raise the flow). An empty list is
  // only final once the baseline lands — until then the menu stays up with its
  // loading status instead of jumping into a flow the arriving list would have
  // made unnecessary; the add-only surface lists nothing and never waits.
  const listSettled = addOnly || workspaceSnapshot.phase === 'ready'
  const addIsTheOnlyEntry = !modern && !pinAdd && listSettled && addEntries.length === 1
  // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
  // pick still being adopted owns the surface until it settles.
  useEffect(() => {
    if (open && addIsTheOnlyEntry && !flowBusy) openDirectoryFlow()
  }, [open, addIsTheOnlyEntry, flowBusy, openDirectoryFlow])

  /** Owner side of the flow conversation: adopt keeps the flow open (busy) until the Host answers. */
  const generation = flowGeneration.current
  const flowOwner: DirectoryFlowOwnerProps = {
    open: flowOpen,
    busy: pickingFolder,
    onPicked: (path) => {
      if (generation !== flowGeneration.current) return
      if (purpose.current === 'source') {
        flowGeneration.current++
        sourceWaiter.current?.resolve(path)
        sourceWaiter.current = undefined
        setFlowOpen(false)
        return
      }
      setPickingFolder(true)
      void adoptDirectory(path, generation).finally(() => { setPickingFolder(false) })
    },
    onCancel: () => {
      if (generation !== flowGeneration.current) return
      flowGeneration.current++
      setFlowOpen(false)
      sourceWaiter.current?.resolve(undefined)
      sourceWaiter.current = undefined
    },
    onError: (message) => {
      if (generation !== flowGeneration.current) return
      flowGeneration.current++
      if (purpose.current === 'source') {
        sourceWaiter.current?.reject(new Error(message))
        sourceWaiter.current = undefined
        setFlowOpen(false)
        return
      }
      sourceWaiter.current?.resolve(undefined)
      sourceWaiter.current = undefined
      setFlowOpen(false)
      setModalError(message)
      setErrorOpen(true)
    },
  }

  const handleSelect = (id: string): void => {
    if (id === NEW_PROJECT) {
      onClose()
      setCreateEpoch(epoch => epoch + 1)
      setCreateOpen(true)
      return
    }
    if (id === NO_PROJECT) {
      onClose()
      onOutsideProject?.()
      return
    }
    if (id === ADD_WORKSPACE) {
      openDirectoryFlow()
      return
    }
    onPick(id as WorkspaceId)
  }

  return (
    <>
      <Menu
        open={open && !addIsTheOnlyEntry && !menuIsEmpty}
        anchor={null}
        items={items}
        {...pinAdd ? { footer: addEntries } : {}}
        selectedId={selectedId === null ? NO_PROJECT : selectedId}
        onSelect={handleSelect}
        onClose={onClose}
        side={side}
        portal
        getAnchorRect={getAnchorRect}
      >
        {modern && !addOnly && <Input aria-label={t('project.search')} placeholder={t('project.search')}
          value={query} onChange={event => { setQuery(event.target.value) }} className={clsx(css.search)}
          onKeyDown={event => { if (event.key === 'Home' || event.key === 'End') event.stopPropagation() }} />}
      </Menu>
      {open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === 'pending' && <div className={css.menuStatus} role="status">{t('picker.loading')}</div>}
      {renderDirectoryFlow(flowOwner)}
      {modern && <CreateProject key={createEpoch} open={createOpen} t={t} canChooseFolder={flowAvailable}
        createProject={createProject} registerSource={registerSource} chooseFolder={() => new Promise((resolve, reject) => {
          purpose.current = 'source'
          flowGeneration.current++
          sourceWaiter.current = { resolve, reject }
          setFlowOpen(true)
        })} onCreated={onPick} onClose={() => {
          flowGeneration.current++
          sourceWaiter.current?.resolve(undefined)
          sourceWaiter.current = undefined
          setFlowOpen(false)
          setCreateOpen(false)
        }} />}
      <Modal
        open={errorOpen}
        onClose={closeModal}
        closeLabel={t('close')}
        title={t('folderError.title')}
        footer={(
          <>
            <Button variant="outline" className={css.modalAction} onClick={closeModal}>{t('cancel')}</Button>
            {/* Retrying needs an occupant to serve the flow; without one the
              * button would open a flow nobody can answer or cancel. */}
            <Button variant="primary" className={css.modalAction} disabled={!flowAvailable} onClick={openDirectoryFlow}>{t('folderError.retry')}</Button>
          </>
        )}
      >
        <div className={css.modalError} role="alert">{modalError}</div>
      </Modal>
    </>
  )
}

/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner).
 * @param props - empty-state slot props (owner share + injected creation callback).
 * @returns the flow element.
 */
export function WorkspacePicker({
  open,
  anchorRef,
  useWorkspaces,
  selectedId,
  onPick,
  onClose,
  createWorkspace,
  createProject,
  registerSource,
  useDirectoryFlow,
  renderSlot,
  t,
}: WorkspacePickerProps) {
  return (
    <WorkspacePickFlow
      t={t}
      open={open}
      anchorRef={anchorRef}
      useWorkspaces={useWorkspaces}
      createWorkspace={createWorkspace}
      createProject={createProject}
      registerSource={registerSource}
      onOutsideProject={() => { onPick(null) }}
      useDirectoryFlow={useDirectoryFlow}
      renderDirectoryFlow={owner => renderSlot('conversation.hero.workspace.directoryFlow', owner)}
      selectedId={selectedId}
      onPick={onPick}
      onClose={onClose}
    />
  )
}
