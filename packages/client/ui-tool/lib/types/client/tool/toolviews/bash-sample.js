import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { IconApiOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconInspectOutlineRegular, CommandText, TerminalBlock, TextShimmer, } from '@deepseek-ai/dsh-client-ui-primitives';
import { isBackgroundShellCall, isSettledPersistentShellCall, isSpilledShellCall, localizeTerminalCardModel, terminalBlockLabels, terminalCardModel, terminalFailed, } from "../models/terminal-card-model.js";
import { formatToolBody, toolRowModel } from "../models/tool-call-model.js";
import { CONVERSATION_NS as NS } from "../../locale.js";
import css from './bash-sample.module.css';
const BASH_ICON = _jsx(IconApiOutlineRegular, { size: 14 });
/** Visually hidden status for the color-only running sweep and error tone. */
function stateStatus(state, t) {
    switch (state) {
        case 'preparing': return t('row.preparing');
        case 'running': return t('bash.running');
        case 'error': return t('bash.failed');
        case 'stopped': return t('bash.stopped');
        default: return null;
    }
}
/**
 * Render expandable Bash output with an accessible lifecycle label. While the
 * call is preparing the row shows the description streamed so far and cannot expand.
 * @param props - tool call, Session sources, locale, and inspection callback.
 * @returns the Bash output row.
 */
export const BashRow = memo(function BashRow({ toolName, block, sessionId, useSessions, inspect, useDisclosure, t }) {
    const model = useMemo(() => toolRowModel(toolName, block), [toolName, block]);
    // An omitted shell workdir is the session workspace; relative values resolve
    // against it before reaching the terminal primitive.
    const cwd = useSessions(list => list.byId[sessionId]?.cwd);
    const terminalModel = useMemo(() => terminalCardModel(block, cwd), [block, cwd]);
    const terminal = useMemo(() => terminalModel === null ? null : localizeTerminalCardModel(terminalModel, t), [terminalModel, t]);
    const labels = useMemo(() => terminalBlockLabels(t), [t]);
    // A failing exit status is the terminal card's own error signal (the call
    // itself settles isError:false), surfaced through the row's error summary.
    const state = model.state === 'ok' && terminalModel !== null && terminalFailed(terminalModel)
        ? 'error'
        : model.state;
    const status = stateStatus(state, t);
    const { expanded, toggle: toggleExpand } = useDisclosure();
    const background = isBackgroundShellCall(block);
    // Background launches expose their acknowledgement without assigning the
    // job an exit status. Failures, persistent results, and spill previews also
    // keep the generic input/output presentation.
    const genericBody = terminal === null
        && (model.state === 'error' || isSettledPersistentShellCall(block) || isSpilledShellCall(block) || background)
        && (model.bodyRaw !== null || model.output !== null);
    const expandable = terminal !== null || genericBody;
    const open = expanded && expandable;
    const body = useMemo(() => open && genericBody && model.bodyRaw !== null
        ? formatToolBody(model.variant, model.bodyRaw)
        : null, [genericBody, model.bodyRaw, model.variant, open]);
    const normalSummary = terminal?.description ?? model.summary;
    const settlementLine = state === 'error'
        ? model.errorSummary ?? normalSummary
        : state === 'stopped' ? t('bash.stopped') : null;
    const running = state === 'running' || state === 'preparing';
    const toggleFromKeyboard = useCallback((event) => {
        if (!expandable || (event.key !== 'Enter' && event.key !== ' '))
            return;
        event.preventDefault();
        toggleExpand();
    }, [expandable, toggleExpand]);
    const leading = open
        ? _jsx(IconChevronUpOutlineRegular, { className: css.chevron })
        : expandable
            ? (_jsxs(_Fragment, { children: [_jsx("span", { className: css.iconIdle, children: BASH_ICON }), _jsx(IconChevronDownOutlineRegular, { className: clsx(css.chevron, css.chevronHover) })] }))
            : BASH_ICON;
    return (_jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.root, "data-sample": "bash", "data-variant": "bash", "data-state": state, "data-expandable": expandable || undefined, role: expandable ? 'button' : undefined, tabIndex: expandable ? 0 : undefined, "aria-expanded": expandable ? open : undefined, onClick: expandable ? toggleExpand : undefined, onKeyDown: expandable ? toggleFromKeyboard : undefined, children: [_jsx("span", { className: css.leading, children: leading }), status !== null && _jsx("span", { className: css.visuallyHidden, children: status }), _jsxs(TextShimmer, { active: running, children: [_jsx(TextShimmer, { className: css.title, children: t(model.titleKey) }), _jsx("span", { className: css.sep, "data-shimmer-decoration": true, "aria-hidden": true }), _jsx("span", { className: clsx(css.summary, state === 'error' && css.errorSummary, state === 'stopped' && css.stoppedSummary), children: _jsx(TextShimmer, { children: settlementLine ?? normalSummary }) })] })] }), open && (_jsxs("div", { className: css.bodyWrap, children: [terminal !== null
                        ? (_jsx(TerminalBlock, { ...terminal.card, maxLines: Infinity, labels: labels, className: css.terminal }))
                        : (_jsxs("div", { className: css.ioCard, children: [body !== null && (_jsxs("div", { className: css.ioSection, children: [_jsx("span", { className: css.ioLabel, children: t('row.input') }), background
                                            ? _jsx(CommandText, { className: css.commandInput, text: body, label: t('row.commandArguments') })
                                            : _jsx("span", { className: css.ioText, children: body })] })), body !== null && model.output !== null && (_jsx("span", { className: css.ioDivider, "aria-hidden": true })), model.output !== null && (_jsxs("div", { className: css.ioSection, children: [_jsx("span", { className: css.ioLabel, children: t('row.output') }), _jsx("span", { className: css.ioText, "data-error": state === 'error' || undefined, children: model.output })] }))] })), inspect !== undefined && (_jsxs("button", { type: "button", className: css.inspectButton, onClick: inspect, children: [_jsx(IconInspectOutlineRegular, {}), t('row.inspect')] }))] }))] }));
});
/** Registers the standalone Bash conversation-row sample. */
export const bashToolviewSample = {
    name: 'bash-toolview-sample',
    inject: ['slots'],
    apply(ctx) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'bash', locale: NS }, BashRow));
    },
};
//# sourceMappingURL=bash-sample.js.map