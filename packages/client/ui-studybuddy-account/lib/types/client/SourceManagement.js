import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Saved catalogs and source management remain inside the source editor. */
import { useEffect, useId, useState } from 'react';
import { Button, DisclosureRow, Input, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { isSourceV3 } from "./source-controller.js";
import { SourceDiagnostics } from "./SourceDiagnostics.js";
import css from './MyAiPanel.module.css';
/**
 * Render the existing inventory, rename, delete, order and recovery controls for one source.
 * @param props - exact source identity and the current controller callbacks; closing never writes a Key.
 * @returns management details for the selected source.
 */
export function SourceManagement({ source, state, actions, t, onClose, showInventory = true }) {
    const [expanded, setExpanded] = useState(false), [deleting, setDeleting] = useState(false);
    const [renaming, setRenaming] = useState(null), inputId = useId();
    const v3 = isSourceV3(source);
    useEffect(() => { if (v3)
        void actions.loadDetail(source.localRef); }, [source.localRef, source.localRevision, v3,
        state.scope?.accountId, state.scope?.generation, actions.loadDetail]);
    const testedModels = isSourceV3(source) ? state.readiness?.find(row => row.localRef === source.localRef &&
        row.sourceRevision === source.sourceRevision && row.state === 'ready')?.appliedModels.map(row => row.exactModelId) ?? [] : [source.testedModelId];
    const index = state.models.findIndex(row => row.internalId === source.localRef);
    const move = (offset) => {
        const ids = state.models.map(row => row.internalId), other = index + offset;
        if (index < 0 || other < 0 || other >= ids.length)
            return;
        const currentId = ids[index], otherId = ids[other];
        if (currentId === undefined || otherId === undefined)
            return;
        ids[index] = otherId;
        ids[other] = currentId;
        void actions.reorder(ids);
    };
    return _jsxs("section", { className: css.section, children: [_jsxs("div", { className: css.actions, children: [_jsx(Tag, { children: t(source.route === 'local_direct' ? 'local' : 'registered') }), _jsx(Button, { size: "sm", disabled: state.busy, onClick: () => { setRenaming(source.name); }, children: t('rename') }), _jsx(Button, { size: "sm", disabled: state.busy, onClick: () => { setDeleting(true); }, children: t('remove') }), _jsx(Button, { size: "sm", disabled: state.busy || index <= 0, onClick: () => { move(-1); }, children: t('moveUp') }), _jsx(Button, { size: "sm", disabled: state.busy || index < 0 || index >= state.models.length - 1, onClick: () => {
                            move(1);
                        }, children: t('moveDown') }), source.state === 'pending' && source.operationId && _jsx(Button, { size: "sm", disabled: state.busy, onClick: () => {
                            if (source.operationId)
                                void actions.resume(source.operationId);
                        }, children: t('resume') })] }), state.registrations.filter(row => row.localRef === source.localRef && row.state === 'pending' && row.operationId &&
                source.state !== 'pending').map(row => _jsxs("div", { className: css.actions, children: [_jsx("span", { children: t('pending') }), _jsx(Button, { size: "sm", disabled: state.busy, onClick: () => {
                            if (row.operationId)
                                void actions.resumeLegacy(row.operationId);
                        }, children: t('resume') })] }, row.operationId)), showInventory && source.inventory && _jsxs(DisclosureRow, { icon: null, title: `${t('catalog')} · ${source.inventory.models.length}`, open: expanded, expandable: true, expandOnRowClick: true, onToggle: () => { setExpanded(!expanded); }, children: [_jsx("ul", { className: css.inventory, children: source.inventory.models.map(model => _jsxs("li", { children: [_jsx("code", { children: model.exactModelId }), _jsx(Tag, { children: t(testedModels.includes(model.exactModelId) ? 'tested' : 'unverified') }), model.lifecycle && _jsx("span", { children: model.lifecycle }), model.shutdownDate && _jsx("time", { children: model.shutdownDate })] }, model.exactModelId)) }), _jsx("p", { className: css.secondary, children: t('inventoryNotice') })] }), v3 && _jsx(SourceDiagnostics, { source: source, state: state, actions: actions, t: t }), _jsx(Modal, { open: deleting, title: t('removeConfirm'), closeLabel: t('close'), onClose: () => {
                    setDeleting(false);
                }, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setDeleting(false); }, children: t('cancel') }), _jsx(Button, { variant: "primary", disabled: state.busy, onClick: () => {
                                setDeleting(false);
                                onClose();
                                void actions.remove(source.localRef);
                            }, children: t('remove') })] }) }), _jsx(Modal, { open: renaming !== null, title: t('rename'), closeLabel: t('close'), onClose: () => {
                    setRenaming(null);
                }, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setRenaming(null); }, children: t('cancel') }), _jsx(Button, { variant: "primary", disabled: state.busy || !renaming?.trim(), onClick: () => {
                                const name = renaming;
                                setRenaming(null);
                                if (name) {
                                    onClose();
                                    void actions.rename(source.localRef, name);
                                }
                            }, children: t('save') })] }), children: renaming !== null && _jsxs("label", { htmlFor: inputId, children: [t('name'), _jsx(Input, { id: inputId, value: renaming, onChange: (event) => { setRenaming(event.target.value); } })] }) })] });
}
//# sourceMappingURL=SourceManagement.js.map