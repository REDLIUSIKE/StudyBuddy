import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Native provider rows address one personal credential each; details keep the existing operations. */
import { useState } from 'react';
import { Button, Modal, ModelProviderList, ModelProviderRow, ModelProviderAddButton } from '@deepseek-ai/dsh-client-ui-primitives';
import { isSourceV3 } from "./source-controller.js";
import { ErrorNotice } from "./ErrorNotice.js";
import { SourceManagement } from "./SourceManagement.js";
import css from './MyAiPanel.module.css';
/**
 * Render personal sources with the shared native provider display.
 * @param props - exact source facts and callbacks owned by the current account.
 * @returns independent Key rows and the existing source management entry points.
 */
export function SourcesPanel({ state, actions, t, openEditor }) {
    const [inspecting, setInspecting] = useState(null);
    const inspected = state.sources.find(source => source.localRef === inspecting);
    return _jsxs("section", { className: `${css.section} ${css.sourcesPanel}`, children: [_jsx("div", { className: css.sourceActions, children: _jsx(Button, { size: "sm", disabled: state.busy, onClick: () => { void actions.load(); }, children: t('refresh') }) }), _jsx(ErrorNotice, { code: state.errorCode, t: t, retry: () => { void actions.load(); } }), state.busy && _jsx("p", { role: "status", children: t('loading') }), state.pending && _jsxs("div", { className: css.card, children: [_jsx("p", { children: t('pending') }), _jsx(Button, { variant: "outline", onClick: () => { void actions.resume(); }, children: t('resume') })] }), !state.busy && !state.errorCode && state.sources.length === 0 && _jsx("p", { className: css.empty, children: t('none') }), _jsx(ModelProviderList, { children: state.sources.map((source) => {
                    const model = state.models.find(row => row.internalId === source.localRef);
                    const pending = source.state === 'pending' || state.pending?.draft.internalId === source.localRef
                        || state.registrations.some(row => row.localRef === source.localRef && row.state === 'pending');
                    const readiness = state.readiness?.find(row => row.localRef === source.localRef && row.sourceRevision === source.sourceRevision);
                    const missingKey = !model?.apiKey.trim();
                    const status = pending ? 'pending' : source.state !== 'saved' || missingKey ? 'sourceMissing' : !isSourceV3(source) ? 'sourceSaved' :
                        readiness?.state === 'ready' ? 'builtinReady' : readiness?.state === 'pending' ? 'builtinPreparing' :
                            readiness?.state === 'failed' ? 'builtinFailed' : readiness?.state === 'unsupported' ? 'builtinUnsupported' : 'builtinUnconfirmed';
                    const indicator = missingKey ? 'failed' : pending ? 'pending' : status === 'builtinReady' ? 'ready' :
                        status === 'builtinPreparing' ? 'pending' : status === 'builtinFailed' || status === 'sourceMissing' ? 'failed' : 'unknown';
                    return _jsx(ModelProviderRow, { name: source.name, readiness: { state: indicator, label: t(missingKey ? 'credentialMissing' : status) }, status: _jsx("span", { role: "status", children: t(status) }), editLabel: t('edit'), editAccessibleLabel: t('edit') + ' ' + source.name, editDisabled: state.busy || !!state.pending, onEdit: () => {
                            if (isSourceV3(source))
                                void actions.loadDetail(source.localRef);
                            if (!model) {
                                setInspecting(source.localRef);
                                return;
                            }
                            actions.editSource(source.localRef);
                            openEditor();
                        } }, source.localRef);
                }) }), _jsx(ModelProviderAddButton, { label: t('addProvider'), disabled: state.busy || !!state.pending, onClick: () => { actions.createDraft(); openEditor(); } }), _jsx(Modal, { open: !!inspected, title: inspected?.name ?? t('details'), closeLabel: t('close'), onClose: () => { setInspecting(null); }, className: css.sourceDialog ?? '', contentClassName: css.sourceDialogContent ?? '', children: inspected && _jsx(SourceManagement, { source: inspected, state: state, actions: actions, t: t, onClose: () => { setInspecting(null); } }, inspected.localRef) })] });
}
//# sourceMappingURL=SourcesPanel.js.map