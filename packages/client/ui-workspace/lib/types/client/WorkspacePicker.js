import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, IconFolderCloseRegular, IconPlusOutlineRegular, Menu, Modal, } from '@deepseek-ai/dsh-client-ui-primitives';
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace';
import css from './WorkspacePicker.module.css';
import { CreateProject } from "./CreateProject.js";
const ADD_WORKSPACE = '::add-workspace';
const NEW_PROJECT = '::new-project';
const NO_PROJECT = '::no-project';
/**
 * Render the pick menu plus the adoption error dialog.
 * @param props - owner-controlled flow props.
 * @returns menu + dialog elements.
 */
export function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace, createProject, registerSource, onOutsideProject, useDirectoryFlow, renderDirectoryFlow, onPick, onClose, addOnly = false, onBusyChange, side = 'bottom', selectedId, }) {
    const workspaceSnapshot = useWorkspaces(state => state);
    const workspaces = workspaceSnapshot.items;
    const getAnchorRect = useCallback(() => anchorRef?.current?.getBoundingClientRect() ?? null, [anchorRef]);
    const [errorOpen, setErrorOpen] = useState(false);
    const [modalError, setModalError] = useState(null);
    const [flowOpen, setFlowOpen] = useState(false);
    const [pickingFolder, setPickingFolder] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [createEpoch, setCreateEpoch] = useState(0);
    const [query, setQuery] = useState('');
    const sourceWaiter = useRef(undefined);
    const purpose = useRef('adopt');
    const flowGeneration = useRef(0);
    const modern = createProject !== undefined && registerSource !== undefined;
    // One picking interaction at a time: while the flow is open (native chooser
    // pending, browse dialog up) or its pick is being adopted, every other
    // menu action stays disabled — a late outcome must not race a concurrent
    // selection or adoption.
    const flowBusy = flowOpen || pickingFolder || createOpen;
    useEffect(() => { onBusyChange?.(flowBusy); }, [flowBusy, onBusyChange]);
    // The occupied hole gates the picking affordance: with no composed flow the
    // entry simply is not there (the seam's documented no-flow default). The
    // framework-bound hook keeps occupancy live: flow plugins activate (and
    // HMR-reload) independently of this menu's renders.
    const flowAvailable = useDirectoryFlow(occupied => occupied);
    // An occupant that unloads mid-interaction leaves nobody to cancel: an
    // open flow over an empty hole withdraws so the menu actions come back.
    // flowOpen is a dependency because the flow can also OPEN over an already
    // empty hole (Choose again after the occupant unloaded with the error
    // dialog up) — that transition must snap back too, not just occupancy loss.
    useEffect(() => {
        if (flowOpen && !flowAvailable) {
            flowGeneration.current++;
            setFlowOpen(false);
            sourceWaiter.current?.resolve(undefined);
            sourceWaiter.current = undefined;
        }
    }, [flowOpen, flowAvailable]);
    useEffect(() => () => { flowGeneration.current++; sourceWaiter.current?.resolve(undefined); }, []);
    const addEntries = [
        ...(modern ? [{ id: NEW_PROJECT, label: t('project.new'), icon: _jsx(IconPlusOutlineRegular, { size: 16 }), disabled: flowBusy }] : []),
        ...(flowAvailable ? [{ id: ADD_WORKSPACE, label: t(modern ? 'project.openFolder' : 'menu.addWorkspace'),
                icon: _jsx(IconFolderCloseRegular, { size: 16 }), disabled: flowBusy }] : []),
    ];
    // With workspaces listed, the add action pins below the scroll region
    // (divider + always visible); otherwise it IS the menu.
    const pinAdd = !addOnly && (workspaces.length > 0 || modern);
    const items = pinAdd
        ? [
            ...(onOutsideProject === undefined ? [] : [{ id: NO_PROJECT, label: t('project.outside'), disabled: flowBusy }]),
            ...workspaces.filter(workspace => workspace.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(workspace => ({
                id: workspace.workspaceId,
                label: workspaceDisplayTitle(workspace.title, t('workspace.defaultName')),
                icon: _jsx(IconFolderCloseRegular, { size: 16 }),
                disabled: flowBusy,
            })),
        ]
        : addEntries;
    // Nothing listed and nothing to add with (a composition that mounts this
    // package without any directory-picker): an empty popover would claim a
    // choice that does not exist, so the anchor gesture shows nothing at all.
    const menuIsEmpty = items.length === 0;
    const closeModal = () => {
        setErrorOpen(false);
        setModalError(null);
    };
    /** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
    const adoptDirectory = (path, generation) => createWorkspace({ path }).then((workspace) => {
        if (generation !== flowGeneration.current)
            return;
        setFlowOpen(false);
        onPick(workspace.workspaceId);
    }).catch((reason) => {
        if (generation !== flowGeneration.current)
            return;
        setModalError(reason instanceof Error ? reason.message : String(reason));
        setFlowOpen(false);
        setErrorOpen(true);
    });
    const openDirectoryFlow = useCallback(() => {
        onClose();
        setErrorOpen(false);
        setModalError(null);
        setFlowOpen(true);
        purpose.current = 'adopt';
        flowGeneration.current++;
    }, [onClose]);
    // A menu exists to disambiguate between targets. With no workspaces listed
    // and the add action the only entry left, the anchor gesture IS that action:
    // a one-row popover would cost a click and offer nothing to choose between.
    // The owner's open request is consumed the same way selecting the entry
    // would consume it (close the popover, raise the flow). An empty list is
    // only final once the baseline lands — until then the menu stays up with its
    // loading status instead of jumping into a flow the arriving list would have
    // made unnecessary; the add-only surface lists nothing and never waits.
    const listSettled = addOnly || workspaceSnapshot.phase === 'ready';
    const addIsTheOnlyEntry = !modern && !pinAdd && listSettled && addEntries.length === 1;
    // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
    // pick still being adopted owns the surface until it settles.
    useEffect(() => {
        if (open && addIsTheOnlyEntry && !flowBusy)
            openDirectoryFlow();
    }, [open, addIsTheOnlyEntry, flowBusy, openDirectoryFlow]);
    /** Owner side of the flow conversation: adopt keeps the flow open (busy) until the Host answers. */
    const generation = flowGeneration.current;
    const flowOwner = {
        open: flowOpen,
        busy: pickingFolder,
        onPicked: (path) => {
            if (generation !== flowGeneration.current)
                return;
            if (purpose.current === 'source') {
                flowGeneration.current++;
                sourceWaiter.current?.resolve(path);
                sourceWaiter.current = undefined;
                setFlowOpen(false);
                return;
            }
            setPickingFolder(true);
            void adoptDirectory(path, generation).finally(() => { setPickingFolder(false); });
        },
        onCancel: () => {
            if (generation !== flowGeneration.current)
                return;
            flowGeneration.current++;
            setFlowOpen(false);
            sourceWaiter.current?.resolve(undefined);
            sourceWaiter.current = undefined;
        },
        onError: (message) => {
            if (generation !== flowGeneration.current)
                return;
            flowGeneration.current++;
            if (purpose.current === 'source') {
                sourceWaiter.current?.reject(new Error(message));
                sourceWaiter.current = undefined;
                setFlowOpen(false);
                return;
            }
            sourceWaiter.current?.resolve(undefined);
            sourceWaiter.current = undefined;
            setFlowOpen(false);
            setModalError(message);
            setErrorOpen(true);
        },
    };
    const handleSelect = (id) => {
        if (id === NEW_PROJECT) {
            onClose();
            setCreateEpoch(epoch => epoch + 1);
            setCreateOpen(true);
            return;
        }
        if (id === NO_PROJECT) {
            onClose();
            onOutsideProject?.();
            return;
        }
        if (id === ADD_WORKSPACE) {
            openDirectoryFlow();
            return;
        }
        onPick(id);
    };
    return (_jsxs(_Fragment, { children: [_jsx(Menu, { open: open && !addIsTheOnlyEntry && !menuIsEmpty, anchor: null, items: items, ...pinAdd ? { footer: addEntries } : {}, selectedId: selectedId === null ? NO_PROJECT : selectedId, onSelect: handleSelect, onClose: onClose, side: side, portal: true, getAnchorRect: getAnchorRect, children: modern && !addOnly && _jsx(Input, { "aria-label": t('project.search'), placeholder: t('project.search'), value: query, onChange: event => { setQuery(event.target.value); }, className: clsx(css.search), onKeyDown: event => { if (event.key === 'Home' || event.key === 'End')
                        event.stopPropagation(); } }) }), open && !addIsTheOnlyEntry && !menuIsEmpty && workspaceSnapshot.phase === 'pending' && _jsx("div", { className: css.menuStatus, role: "status", children: t('picker.loading') }), renderDirectoryFlow(flowOwner), modern && _jsx(CreateProject, { open: createOpen, t: t, canChooseFolder: flowAvailable, createProject: createProject, registerSource: registerSource, chooseFolder: () => new Promise((resolve, reject) => {
                    purpose.current = 'source';
                    flowGeneration.current++;
                    sourceWaiter.current = { resolve, reject };
                    setFlowOpen(true);
                }), onCreated: onPick, onClose: () => {
                    flowGeneration.current++;
                    sourceWaiter.current?.resolve(undefined);
                    sourceWaiter.current = undefined;
                    setFlowOpen(false);
                    setCreateOpen(false);
                } }, createEpoch), _jsx(Modal, { open: errorOpen, onClose: closeModal, closeLabel: t('close'), title: t('folderError.title'), footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", className: css.modalAction, onClick: closeModal, children: t('cancel') }), _jsx(Button, { variant: "primary", className: css.modalAction, disabled: !flowAvailable, onClick: openDirectoryFlow, children: t('folderError.retry') })] })), children: _jsx("div", { className: css.modalError, role: "alert", children: modalError }) })] }));
}
/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner).
 * @param props - empty-state slot props (owner share + injected creation callback).
 * @returns the flow element.
 */
export function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, createProject, registerSource, useDirectoryFlow, renderSlot, t, }) {
    return (_jsx(WorkspacePickFlow, { t: t, open: open, anchorRef: anchorRef, useWorkspaces: useWorkspaces, createWorkspace: createWorkspace, createProject: createProject, registerSource: registerSource, onOutsideProject: () => { onPick(null); }, useDirectoryFlow: useDirectoryFlow, renderDirectoryFlow: owner => renderSlot('conversation.hero.workspace.directoryFlow', owner), selectedId: selectedId, onPick: onPick, onClose: onClose }));
}
//# sourceMappingURL=WorkspacePicker.js.map