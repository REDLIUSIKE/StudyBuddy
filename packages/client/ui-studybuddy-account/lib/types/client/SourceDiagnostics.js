import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Cached source facts and explicit, protected diagnostic actions. */
import { useId, useState } from 'react';
import { Button, DisclosureRow, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { isSourceV3 } from "./source-controller.js";
import css from './MyAiPanel.module.css';
/** Render only owned cached facts; model calls and balance refreshes require a click. */
export function SourceDiagnostics({ source, state, actions, t }) {
    const [expanded, setExpanded] = useState(false), [selected, setSelected] = useState(''), [prompt, setPrompt] = useState(''), id = useId();
    const detail = state.details?.[source.localRef];
    const readiness = detail?.readiness ?? state.readiness?.find(row => row.localRef === source.localRef &&
        row.sourceRevision === source.sourceRevision);
    const balance = detail?.balance?.balance;
    const references = readiness?.state === 'ready' ? readiness.appliedModels : readiness?.hostApplied?.applied ?? [];
    const selection = references.find(ref => ref.routeId + '|' + ref.exactModelId + '|' + ref.protocol === selected);
    const operationId = readiness?.operationId ?? source.operationId;
    const availableOperation = operationId !== null && operationId !== undefined && operationId === source.operationId;
    const time = (seconds) => seconds === null ||
        seconds === undefined ? t('unknown') : new Date(seconds * 1000).toLocaleString();
    const milliseconds = (value) => value === null ? t('unknown') : value + ' ' + t('milliseconds');
    return _jsxs("div", { className: css.form, children: [readiness?.state !== 'ready' && availableOperation && _jsxs(_Fragment, { children: [_jsxs("div", { className: css.actions, children: [_jsx(Button, { size: "sm", disabled: state.busy, onClick: () => {
                                    if (operationId)
                                        void actions.resumeBuiltin(operationId);
                                }, children: t('continuePreparation') }), _jsx(Button, { size: "sm", variant: "outline", disabled: state.busy || readiness?.state === 'unsupported' ||
                                    !isSourceV3(source) || !source.probeSelection, onClick: () => { if (operationId)
                                    void actions.validateBuiltin(operationId); }, children: t('validateModel') })] }), _jsx("p", { className: css.secondary, children: t('builtinValidationCostNotice') })] }), _jsx(DisclosureRow, { icon: null, title: t('sourceDiagnostics'), open: expanded, expandable: true, expandOnRowClick: true, onToggle: () => { setExpanded(!expanded); }, children: _jsxs("div", { className: css.form, children: [_jsx(Button, { size: "sm", variant: "outline", disabled: state.busy, onClick: () => {
                                void actions.refreshBalance(source.localRef);
                            }, children: t('refreshSourceBalance') }), _jsx("p", { className: css.secondary, children: t('sourceBalanceNotice') }), balance ? _jsxs(_Fragment, { children: [_jsx("p", { children: t(balance.state === 'success' ? 'available' : balance.state === 'stale' ? 'stale' :
                                        balance.state === 'unsupported' ? 'unavailable' : 'error') }), balance.currencies.map(row => _jsxs("div", { children: [_jsxs("p", { children: [row.currency, " \u00B7 ", t('available'), ": ", row.available] }), _jsxs("p", { children: [t('balanceCash'), ": ", row.cash ?? t('unknown'), " \u00B7 ", t('balanceGrant'), ": ", row.grant ?? t('unknown')] })] }, row.currency)), _jsxs("p", { children: [t('checkedAt'), ": ", time(balance.checkedAt), " \u00B7 ", t('lastSuccess'), ": ", time(balance.lastSuccessAt)] }), _jsx("a", { href: balance.officialUrl, target: "_blank", rel: "noreferrer", children: t('officialBilling') })] }) : _jsx("p", { children: t('unknown') }), _jsx("label", { htmlFor: id + 'model', children: t('diagnosticModel') }), _jsxs("select", { id: id + 'model', className: css.select, value: selected, disabled: state.busy, onChange: (event) => {
                                setSelected(event.target.value);
                            }, children: [_jsx("option", { value: "", children: t('chooseExactModel') }), references.map(ref => _jsxs("option", { value: ref.routeId + '|' + ref.exactModelId + '|' + ref.protocol, children: [ref.exactModelId, " \u00B7 ", ref.protocol] }, ref.routeId + '|' + ref.exactModelId + '|' + ref.protocol))] }), _jsx("label", { htmlFor: id + 'prompt', children: t('prompt') }), _jsx(Input, { id: id + 'prompt', maxLength: 512, value: prompt, disabled: state.busy, onChange: (event) => { setPrompt(event.target.value); } }), _jsx("p", { className: css.secondary, children: t('builtinDiagnosticCostNotice') }), _jsx(Button, { size: "sm", variant: "outline", disabled: state.busy || !selection || !availableOperation || !prompt.trim(), onClick: () => {
                                if (operationId && selection)
                                    void actions.diagnostic(operationId, selection, prompt.trim());
                            }, children: t('runDiagnostic') }), (detail?.lastDiagnostics ?? []).map(result => _jsxs("div", { className: css.card, children: [_jsxs("p", { children: [result.selection.exactModelId, " \u00B7 ", result.selection.protocol, " \u00B7 ", t(('status_' + result.outcome))] }), _jsxs("p", { children: [t('actualReturnedModel'), ": ", result.returnedModel ?? t('unknown')] }), _jsxs("p", { children: [t('responseId'), ": ", result.providerResponseId ?? t('unknown')] }), _jsxs("p", { children: [t('firstVisibleText'), ": ", _jsx("span", { children: milliseconds(result.firstVisibleTextMs) }), " \u00B7 ", t('terminalLatency'), ": ", _jsx("span", { children: milliseconds(result.dispatchToTerminalMs) })] }), _jsxs("p", { children: [t('requestThroughput'), ": ", result.usageOrigin === 'provider_terminal' && result.usage !== null &&
                                            result.dispatchToTerminalMs !== null && result.dispatchToTerminalMs > 0
                                            ? (result.usage.outputTokens * 1000 / result.dispatchToTerminalMs).toFixed(2) + ' ' + t('tokensPerSecond') : t('unknown')] }), result.usageOrigin === 'provider_terminal' && result.usage ? _jsxs(_Fragment, { children: [_jsx("p", { children: t('trustedUsage') }), _jsxs("p", { children: [t('input'), ": ", result.usage.inputTokens, " \u00B7 ", t('output'), ": ", result.usage.outputTokens] }), _jsxs("p", { children: [t('cacheRead'), ": ", result.usage.cacheReadTokens ?? t('unknown'), " \u00B7 ", t('cacheWrite'), ": ", result.usage.cacheWriteTokens ?? t('unknown'), " \u00B7 ", t('reasoning'), ": ", result.usage.reasoningTokens ?? t('unknown')] })] }) : _jsx("p", { children: t('unknownUsage') }), result.errorCode && _jsx("code", { children: result.errorCode })] }, result.clientRequestId))] }) })] });
}
//# sourceMappingURL=SourceDiagnostics.js.map