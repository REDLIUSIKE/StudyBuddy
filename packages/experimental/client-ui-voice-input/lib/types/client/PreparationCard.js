import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Provider-owned preparation steps and persisted recognition preferences. */
import { useEffect, useState } from 'react';
import { Button, DisclosureRow, IconChevronDownOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { MicrophonePicker } from "./MicrophonePicker.js";
import css from './VoiceInput.module.css';
function preparationTone(state) {
    if (state.phase === 'ready' || state.phase === 'standby')
        return 'done';
    if (state.phase === 'failed')
        return 'error';
    if (state.phase === 'unprepared' || state.phase === 'cancelled')
        return 'idle';
    return 'ongoing';
}
function byteText(state, t) {
    return state.totalBytes === undefined ? t('downloadUnknown', { completed: (state.completedBytes / 1_000_000).toFixed(1) })
        : t('downloadBytes', { completed: (state.completedBytes / 1_000_000).toFixed(1),
            total: (state.totalBytes / 1_000_000).toFixed(1), percent: String(Math.floor(state.completedBytes / state.totalBytes * 100)) });
}
function DownloadProgress({ state, t }) {
    return state.phase === 'downloading' && state.totalBytes !== undefined
        ? _jsx("progress", { className: css.progress, "aria-label": t('downloadProgress'), value: state.completedBytes, max: state.totalBytes }) : null;
}
function PreparationFailure({ state, t }) {
    const failure = state.download;
    if (!failure)
        return _jsx("p", { className: css.preparationError, role: "alert", children: t('preparationFailed', { message: state.message }) });
    return _jsxs("div", { className: css.downloadFailure, role: "alert", children: [_jsx("p", { className: css.preparationError, children: t(`download.${failure.reason}`, { resource: failure.resource, status: String(failure.status) }) }), _jsx("p", { children: t(`downloadAdvice.${failure.reason}`) }), _jsx("small", { className: css.metric, children: t('downloadSource', { source: failure.source }) }), failure.code && _jsx("small", { className: css.metric, children: t('downloadCode', { code: failure.code }) })] });
}
/** Render a collapsed current-step summary or all Host-owned preparation steps. */
export function PreparationCard({ provider, connected, prepare, cancelPreparation, t }) {
    const state = provider.preparation;
    const [expanded, setExpanded] = useState(false), [now, setNow] = useState(Date.now), [error, setError] = useState('');
    const [source, setSource] = useState(''), [submitting, setSubmitting] = useState(false);
    const sources = provider.downloadSources ?? [];
    const [firstSource = ''] = sources;
    const selectedSource = sources.includes(source) ? source : sources.length === 1 ? firstSource : '';
    const canPrepare = ['unprepared', 'cancelled', 'failed'].includes(state.phase);
    const current = state.steps?.find(step => step.status === 'running' || step.status === 'failed' || step.status === 'cancelled');
    const preparing = preparationTone(state) === 'ongoing';
    const startedAt = current?.startedAt ?? ('startedAt' in state ? state.startedAt : undefined);
    useEffect(() => {
        if (!preparing || startedAt === undefined)
            return;
        const timer = setInterval(() => { setNow(Date.now()); }, 1000);
        return () => { clearInterval(timer); };
    }, [preparing, startedAt]);
    const run = async (action) => {
        setError('');
        setSubmitting(true);
        try {
            await action();
        }
        catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        }
        finally {
            setSubmitting(false);
        }
    };
    const metric = state.phase === 'downloading' ? byteText(state, t)
        : preparing && startedAt !== undefined ? t('elapsed', { seconds: String(Math.max(0, Math.floor((now - startedAt) / 1000))) }) : '';
    const summary = !connected ? t('reconnecting') : preparing && current ? t(`step.${current.kind}`, { name: provider.name })
        : state.phase === 'downloading' ? t('short.downloading')
            : state.phase === 'failed' ? t('short.failed')
                : state.phase === 'ready' && provider.location === 'cloud' ? t('cloudReady')
                    : t(`preparation.${state.phase}`, { name: provider.name });
    return _jsxs("section", { className: css.preparation, "data-speech-provider": provider.id, children: [_jsx("strong", { children: provider.name }), state.phase === 'unprepared' && provider.location === 'host-local' && provider.setupEstimate && _jsxs("div", { className: css.setupEstimate, children: [_jsx("p", { children: t('setup.local') }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: t('setup.disk') }), _jsx("dd", { children: t('setup.diskValue', {
                                            gb: String(provider.setupEstimate.recommendedDiskBytes / 1_000_000_000),
                                        }) })] }), _jsxs("div", { children: [_jsx("dt", { children: t('setup.memory') }), _jsx("dd", { children: t('setup.memoryValue', {
                                            gb: String(provider.setupEstimate.expectedMemoryBytes / 1_000_000_000),
                                        }) })] }), _jsxs("div", { children: [_jsx("dt", { children: t('setup.time') }), _jsx("dd", { children: t('setup.timeValue', {
                                            min: String(provider.setupEstimate.minimumMinutes), max: String(provider.setupEstimate.maximumMinutes),
                                        }) })] })] }), _jsx("small", { children: t('setup.estimateNote') })] }), _jsx(DisclosureRow, { icon: _jsx(StateDot, { state: preparationTone(state), size: 16, appearance: "step" }), title: expanded ? t('preparationSteps') : summary, open: expanded, expandable: (state.steps?.length ?? 0) > 0, expandOnRowClick: true, previewChevron: false, onToggle: () => { setExpanded(value => !value); }, rowClassName: css.summaryRow, titleClassName: css.summaryTitle, collapsedContent: _jsxs(_Fragment, { children: [_jsx("span", { className: css.metric, role: "status", children: metric }), state.steps && _jsx(IconChevronDownOutlineRegular, {})] }), children: _jsx("ol", { className: css.steps, children: state.steps?.map(step => _jsxs("li", { "data-step": step.kind, "data-step-state": step.status, "aria-label": `${t(`step.${step.kind}`, { name: provider.name })} · ${t(`stepStatus.${step.status}`)}`, children: [_jsx(StateDot, { appearance: "step", size: 16, state: step.status === 'complete' ? 'done' : step.status === 'running' ? 'ongoing'
                                    : step.status === 'failed' ? 'error' : 'idle' }), _jsxs("div", { className: css.stepBody, children: [_jsx("span", { children: t(`step.${step.kind}`, { name: provider.name }) }), step.status === 'running' && _jsxs("div", { className: css.stepProgress, children: [_jsx("span", { className: css.metric, role: "status", children: metric }), _jsx(DownloadProgress, { state: state, t: t }), state.phase === 'downloading' && _jsx("small", { children: state.resource })] })] })] }, step.kind)) }) }), !expanded && _jsx(DownloadProgress, { state: state, t: t }), state.phase === 'failed' && _jsx(PreparationFailure, { state: state, t: t }), canPrepare && sources.length > 0 && _jsxs("div", { className: css.sourceChoice, children: [_jsxs("label", { children: [t('sourceChoice'), _jsxs("select", { "aria-label": t('sourceChoice'), value: selectedSource, disabled: !connected || submitting || sources.length === 1, onChange: (event) => { setSource(event.target.value); }, children: [sources.length > 1 && _jsx("option", { value: "", children: t('sourceAuto') }), sources.map(origin => _jsx("option", { value: origin, children: origin === 'https://huggingface.co' ? t('sourceHuggingFace')
                                            : origin === 'https://hf-mirror.com' ? t('sourceMirror') : origin }, origin))] })] }), _jsx("small", { className: css.metric, children: t(selectedSource === '' ? 'sourceAutoHelp' : 'sourceManualHelp') })] }), _jsxs("div", { className: css.preparationActions, children: [canPrepare && _jsx(Button, { variant: "outline", size: "sm", disabled: !connected || submitting, onClick: () => { void run(() => selectedSource === '' ? prepare(provider.id) : prepare(provider.id, { downloadSource: selectedSource })); }, children: t(state.phase === 'unprepared' ? 'prepare' : 'retryPrepare') }), preparing && state.phase !== 'waking' && _jsx(Button, { variant: "ghost", size: "sm", disabled: !connected || submitting || state.phase === 'cancelling', onClick: () => { void run(() => cancelPreparation(provider.id)); }, children: t('cancelPrepare') })] }), error && _jsx("p", { className: css.preparationError, role: "alert", children: t('failed', { message: error }) })] });
}
/** Recognition preferences and preparation cards shared by plugin details and Settings. */
export function VoicePreparation({ useSpeechReadiness, ...props }) {
    const readiness = useSpeechReadiness(value => value), catalog = readiness.catalog;
    const [saving, setSaving] = useState(false), [error, setError] = useState('');
    const configure = async (patch) => {
        setSaving(true);
        setError('');
        try {
            await props.configure(patch);
        }
        catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        }
        finally {
            setSaving(false);
        }
    };
    const selected = catalog?.providers.find(provider => provider.id === catalog.selection.providerId);
    const languageNames = {
        auto: props.t('auto'), zh: props.t('zh'), en: props.t('en'), yue: props.t('yue'), ja: props.t('ja'), ko: props.t('ko'),
    };
    return _jsxs("div", { children: [catalog && _jsxs("div", { className: css.preferences, children: [_jsx(MicrophonePicker, { ...props }), _jsxs("label", { children: [props.t('provider'), _jsx("select", { value: catalog.selection.providerId, disabled: !readiness.connected || saving, onChange: (event) => { void configure({ providerId: event.target.value }); }, children: catalog.providers.map(provider => _jsx("option", { value: provider.id, children: provider.name }, provider.id)) })] }), _jsxs("label", { children: [props.t('language'), _jsx("select", { value: catalog.selection.language, disabled: !readiness.connected || saving, onChange: (event) => { void configure({ language: event.target.value }); }, children: selected?.languages.map(language => _jsx("option", { value: language, children: languageNames[language] ?? language }, language)) })] }), _jsx("p", { children: props.t(selected?.location === 'cloud' ? 'cloud' : 'local') }), error && _jsx("p", { role: "alert", children: props.t('failed', { message: error }) })] }), catalog?.providers.map(provider => _jsx(PreparationCard, { provider: provider, connected: readiness.connected, ...props }, provider.id)), !catalog && _jsx("p", { role: "status", children: props.t('loading') }), readiness.error && _jsx("p", { role: "alert", children: props.t('failed', { message: readiness.error }) })] });
}
//# sourceMappingURL=PreparationCard.js.map