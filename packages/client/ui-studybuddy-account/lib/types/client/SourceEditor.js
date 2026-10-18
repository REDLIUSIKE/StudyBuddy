import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** One-click verified source saving, independent of later tool connection. */
import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, Modal, DisclosureRow, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { ErrorNotice } from "./ErrorNotice.js";
import { SourceManagement } from "./SourceManagement.js";
import css from './MyAiPanel.module.css';
export function SourceEditor({ state, actions, t, onClose }) {
    const [reveal, setReveal] = useState(false), [advanced, setAdvanced] = useState(false), [probeModel, setProbeModel] = useState(''), [prompt, setPrompt] = useState(''), [clipboardFailed, setClipboardFailed] = useState(false), id = useId();
    const draft = state.draft, check = state.checkResult;
    const source = state.sources.find(row => row.localRef === draft?.internalId);
    const active = useRef(true), current = useRef(state);
    current.current = state;
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    useEffect(() => { if (!draft) {
        setReveal(false);
        setClipboardFailed(false);
    } }, [draft === null]);
    const update = (patch) => { actions.editDraft(patch); };
    const isV3 = draft?.schemaVersion === 3;
    const nativeCandidates = state.admittedModels ?? [];
    const catalogModels = state.nativeCatalog && Date.parse(state.nativeCatalog.expiresAt) > Date.now() ? state.nativeCatalog.models : [];
    const manualModels = [...new Map([...catalogModels, ...nativeCandidates].map(model => [model.providerId + '|' + model.exactModelId + '|' + model.protocol, model])).values()];
    const selectable = manualModels.filter(model => draft?.sourcePresetId ? model.providerId === draft.sourcePresetId :
        nativeCandidates.includes(model) || state.nativeCatalog?.transports.some(transport => transport.providerId === model.providerId && transport.protocol === model.protocol &&
            (transport.baseUrl === draft?.advanced?.baseUrl || transport.baseUrl === draft?.advanced?.anthropicUrl)));
    const selectedValue = isV3 && draft.probeSelection ? draft.probeSelection.exactModelId + '|' + draft.probeSelection.protocol : '';
    const selectedAvailable = !isV3 || selectable.some(model => model.exactModelId === draft.probeSelection?.exactModelId &&
        model.protocol === draft.probeSelection?.protocol);
    const clipboard = async (paste) => {
        const captured = current.current;
        const owned = () => active.current && captured.draft === current.current.draft
            && captured.scope?.accountId === current.current.scope?.accountId
            && captured.scope?.generation === current.current.scope?.generation;
        setClipboardFailed(false);
        try {
            if (paste) {
                const apiKey = await navigator.clipboard.readText();
                if (owned() && !current.current.busy && !current.current.pending)
                    update({ apiKey });
            }
            else
                await navigator.clipboard.writeText(captured.draft?.apiKey ?? '');
        }
        catch {
            if (owned())
                setClipboardFailed(true);
        }
    };
    const endpoint = (key, value) => {
        update({ advanced: { baseUrl: draft?.advanced?.baseUrl ?? '', anthropicUrl: draft?.advanced?.anthropicUrl ?? null, modelsUrl: draft?.advanced?.modelsUrl ?? null, protocol: draft?.advanced?.protocol ?? null, [key]: key === 'baseUrl' ? value : value || null } });
    };
    const probe = () => {
        const probeDraft = current.current.draft, configuration = probeDraft?.advanced;
        if (!probeDraft || !configuration?.protocol)
            return;
        void actions.probe({
            schemaVersion: 1, internalId: probeDraft.internalId, expectedLocalRevision: probeDraft.expectedLocalRevision,
            name: probeDraft.name, baseUrl: configuration.baseUrl, anthropicUrl: configuration.anthropicUrl,
            apiKey: probeDraft.apiKey, modelId: probeModel.trim(), protocols: [configuration.protocol],
        }, prompt || undefined);
    };
    return _jsx(Modal, { open: draft !== null, onClose: onClose, title: t(draft?.internalId ? 'edit' : 'addSource'), closeLabel: t('close'), className: css.sourceDialog ?? '', contentClassName: css.sourceDialogContent ?? '', footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", disabled: state.busy, onClick: onClose, children: t('cancel') }), state.pending ? _jsx(Button, { variant: "primary", disabled: state.busy, onClick: () => { void actions.resume(); }, children: t('resume') }) :
                    _jsx(Button, { variant: "primary", disabled: state.busy || !draft?.name.trim() || !draft.apiKey.trim() ||
                            !(draft.sourcePresetId || draft.advanced?.baseUrl) || !selectedAvailable, onClick: () => {
                            void actions.detectAndSave();
                        }, children: t(isV3 ? (state.busy ? 'savingAndValidating' : 'saveAndValidate') :
                            (state.busy ? 'detectingAndSaving' : 'detectAndSave')) })] }), children: draft && _jsxs("div", { className: css.form, children: [source && _jsx(SourceManagement, { source: source, state: state, actions: actions, t: t, onClose: onClose, showInventory: !check?.inventory }, source.localRef), _jsx("label", { htmlFor: id + 'name', children: t('name') }), _jsx(Input, { id: id + 'name', value: draft.name, disabled: !!state.pending, onChange: (event) => { update({ name: event.target.value }); } }), _jsx("label", { htmlFor: id + 'key', children: t('key') }), _jsx(Input, { id: id + 'key', type: reveal ? 'text' :
                        'password', autoComplete: "off", spellCheck: false, value: draft.apiKey, disabled: state.busy ||
                        !!state.pending, onChange: (event) => { update({ apiKey: event.target.value }); } }), _jsxs("div", { className: css.actions, children: [_jsx(Button, { size: "sm", "aria-pressed": reveal, onClick: () => { setReveal(!reveal); }, children: t(reveal ? 'hide' : 'reveal') }), _jsx(Button, { size: "sm", onClick: () => { void clipboard(false); }, children: t('copy') }), _jsx(Button, { size: "sm", disabled: state.busy || !!state.pending, onClick: () => { void clipboard(true); }, children: t('paste') })] }), clipboardFailed && _jsx("p", { role: "alert", children: t('clipboardFailed') }), _jsx("label", { htmlFor: id + 'preset', children: t('preset') }), _jsxs("select", { id: id + 'preset', className: css.select, value: draft.sourcePresetId ?? '', disabled: state.busy ||
                        !!state.pending, onChange: (event) => {
                        update({
                            sourcePresetId: event.target.value || null, advanced: null, ...(isV3 ? {
                                probeSelection: null,
                            } : {}),
                        });
                    }, children: [_jsx("option", { value: "", children: t('customSource') }), (isV3 ? ['deepseek', 'kimi', 'hunyuan', 'zhipu', 'minimax', 'mimo',
                            'openai', 'anthropic'] : ['deepseek', 'kimi', 'openai', 'anthropic']).map(preset => _jsx("option", { value: preset, children: preset }, preset))] }), isV3 && _jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "outline", disabled: state.busy || !!state.pending || !draft.apiKey.trim() ||
                                !(draft.sourcePresetId || draft.advanced?.baseUrl), onClick: () => { void actions.check(); }, children: t('discoverModels') }), _jsx("p", { className: css.secondary, children: t('discoveryNotice') }), _jsx("label", { htmlFor: id + 'manual-model', children: t('validationModel') }), _jsxs("select", { id: id + 'manual-model', className: css.select, value: selectedValue, disabled: state.busy ||
                                !!state.pending, onChange: (event) => {
                                const selected = selectable.find(model => model.exactModelId + '|' + model.protocol === event.target.value);
                                update({ probeSelection: selected ? { exactModelId: selected.exactModelId, protocol: selected.protocol } : null });
                            }, children: [_jsx("option", { value: "", children: t('chooseExactModel') }), selectable.map(model => _jsxs("option", { value: model.exactModelId + '|' + model.protocol, children: [model.displayName, " \u00B7 ", model.exactModelId, " \u00B7 ", model.protocol] }, model.exactModelId + '|' + model.protocol))] }), !selectable.length && _jsx("p", { className: css.secondary, role: state.catalogBusy ? 'status' : undefined, children: t(state.catalogBusy ? 'loading' : 'noAdmittedModels') })] }), _jsx("p", { className: css.secondary, children: t(isV3 ? 'builtinValidationCostNotice' : 'probeCostNotice') }), _jsx(DisclosureRow, { icon: null, title: t('advanced'), open: advanced, expandable: true, expandOnRowClick: true, onToggle: () => {
                        setAdvanced(!advanced);
                    }, children: _jsxs("div", { className: css.form, children: [['baseUrl', 'anthropicUrl', 'modelsUrl'].map(key => _jsxs("label", { children: [t(key), _jsx(Input, { value: draft.advanced?.[key] ?? '', disabled: state.busy || !!state.pending, onChange: (event) => {
                                            endpoint(key, event.target.value);
                                        } })] }, key)), _jsxs("label", { children: [t('protocol'), _jsxs("select", { className: css.select, disabled: state.busy || !!state.pending, value: draft.advanced?.protocol ?? '', onChange: (event) => {
                                            update({
                                                advanced: {
                                                    baseUrl: draft.advanced?.baseUrl ?? '',
                                                    anthropicUrl: draft.advanced?.anthropicUrl ?? null, modelsUrl: draft.advanced?.modelsUrl ?? null, protocol: event.target.value === '' ? null : event.target.value,
                                                },
                                            });
                                        }, children: [_jsx("option", { value: "", children: t('automatic') }), ['openai_responses', 'openai_chat_completions',
                                                'anthropic_messages'].map(protocol => _jsx("option", { value: protocol, children: protocol }, protocol))] })] }), _jsx(Button, { size: "sm", variant: "outline", disabled: state.busy || !draft.advanced?.baseUrl, onClick: () => {
                                    if (draft.advanced)
                                        void actions.ping(draft.advanced.baseUrl, draft.advanced.anthropicUrl);
                                }, children: t('ping') })] }) }), (check?.ping ?? state.ping) && _jsxs("p", { className: css.secondary, children: [(check?.ping ?? state.ping)?.success ? t('connected') :
                            t('connectionFailed'), " \u00B7 ", (check?.ping ?? state.ping)?.latencyMs, " ", t('milliseconds')] }), check?.probe && _jsxs("p", { children: [check.probe.protocol, " \u00B7 ", check.probe.returnedModel ?? t('unknown'), " \u00B7 ", check.probe.latencyMs, " ", t('milliseconds')] }), check?.inventory && _jsxs(DisclosureRow, { icon: null, title: `${t('catalog')} · ${check.inventory.models.length}`, open: true, expandable: false, onToggle: () => { }, children: [_jsx("ul", { className: css.inventory, children: check.inventory.models.map(model => _jsxs("li", { children: [_jsx("code", { children: model.exactModelId }), _jsx(Tag, { children: t(check.probe?.success &&
                                            check.probe.returnedModel === model.exactModelId ? 'tested' : 'unverified') }), model.lifecycle && _jsx("span", { children: model.lifecycle }), model.shutdownDate && _jsx("time", { children: model.shutdownDate })] }, model.exactModelId)) }), _jsx("p", { className: css.secondary, children: t('inventoryNotice') })] }), !isV3 && draft.advanced?.baseUrl && _jsxs("div", { className: css.form, children: [_jsxs("label", { children: [t('model'), _jsx(Input, { value: probeModel.trim(), disabled: state.busy, onChange: (event) => {
                                        setProbeModel(event.target.value);
                                    } })] }), _jsxs("label", { children: [t('prompt'), _jsx(Input, { value: prompt, disabled: state.busy, onChange: (event) => { setPrompt(event.target.value); } })] }), _jsx("p", { className: css.secondary, children: t('manualProbeCostNotice') }), _jsx(Button, { size: "sm", variant: "outline", disabled: state.busy || !probeModel.trim() ||
                                !draft.advanced.protocol, onClick: probe, children: t('probe') }), !draft.advanced.protocol && _jsx("p", { className: css.secondary, children: t('selectProtocol') }), state.probe?.probes.map(result => _jsxs("p", { children: [result.protocol, " \u00B7 ", result.returnedModel ?? t('unknown'), " \u00B7 ", result.success ? t('tested') : t('connectionFailed'), " \u00B7 ", result.latencyMs, " ", t('milliseconds')] }, result.protocol))] }), _jsx(ErrorNotice, { code: state.errorCode, t: t }), state.pending && _jsx("p", { role: "status", children: t('pending') })] }) });
}
//# sourceMappingURL=SourceEditor.js.map