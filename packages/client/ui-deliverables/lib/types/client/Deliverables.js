import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** The changed-files card, shown only while the Host serves the turn's summary, and explicitly declared files for a closing turn. */
import { useEffect, useState } from 'react';
import { Button, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChangedFiles } from "./ChangedFiles.js";
import { changesForClosing, presentedForClosing } from "./turn-deliverables.js";
import { changesSummaryUrl } from "../changes.js";
import { presentedFileUrl } from "../presented.js";
import { PresentedFileCard } from "./PresentedFileCard.js";
import css from './Deliverables.module.css';
const COLLAPSED_PRESENTED_COUNT = 4;
/**
 * Claim turns with a change announcement or declared files.
 * @param owner - closing turn.
 * @returns matched announcement and deliveries, or null for a turn with neither.
 */
export function selectDeliverables(owner) {
    const changes = changesForClosing(owner);
    const presented = presentedForClosing(owner);
    return changes === null && presented.length === 0 ? null : { changes, presented };
}
/**
 * Contribute file deliveries alongside other completed-Turn artifacts.
 * @param props - closing Turn, file actions, and localized copy.
 * @returns file rows, or null when the Turn declares none.
 */
export function DeliverablesTail(props) {
    const matched = selectDeliverables(props);
    return matched === null ? null : _jsx(Deliverables, { ...props, matched: matched });
}
/**
 * Render the changed-files card, once the Host has served the announced
 * summary and it lists a file, and shared native opening controls for declared
 * files. A summary the Host no longer serves leaves no card.
 * @param props - matched announcement and files, workspace opener, and localized copy.
 * @returns the closing turn's file rows.
 */
export function Deliverables({ matched, openFile, t, sessionId, useSessions, openPresented, openChangesReview, usePresentedOpen, usePresentedHost, useChangesDiff, loadChangesDiff, useChangesSummary, reloadPresentedHost, loadChangesSummary, useShowCodeDiff, renderSlot, }) {
    const [expanded, setExpanded] = useState(false);
    const showCodeDiff = useShowCodeDiff(value => value);
    const cwd = useSessions(state => state.byId[sessionId]?.cwd);
    const states = usePresentedOpen(value => value);
    const host = usePresentedHost(value => value);
    const announced = showCodeDiff ? matched.changes : null;
    const summary = useChangesSummary(value => announced === null ? undefined : value[changesSummaryUrl(sessionId, announced.seq)]);
    useEffect(() => {
        if (announced !== null && summary === undefined)
            void loadChangesSummary(sessionId, announced.seq);
    }, [announced, summary, sessionId, loadChangesSummary]);
    const changes = announced !== null && typeof summary === 'object' && summary.files.length > 0
        ? { seq: announced.seq, ...summary }
        : null;
    const collapsible = matched.presented.length > COLLAPSED_PRESENTED_COUNT;
    const presented = collapsible && !expanded
        ? matched.presented.slice(0, COLLAPSED_PRESENTED_COUNT)
        : matched.presented;
    useEffect(() => {
        if (host === null)
            void reloadPresentedHost();
    }, [host, reloadPresentedHost]);
    return _jsxs(_Fragment, { children: [changes !== null && _jsx(ChangedFiles, { changes: changes, cwd: cwd, t: t, sessionId: sessionId, useChangesDiff: useChangesDiff, loadChangesDiff: loadChangesDiff, openReview: (index) => { openChangesReview({ sessionId, seq: changes.seq, turn: changes.turn }, index); } }), matched.presented.length > 0 && _jsxs("div", { className: css.root, "data-after-changes": changes !== null || undefined, children: [host === 'error' && _jsxs("div", { className: css.hostStatus, children: [_jsx("span", { children: t('presented.hostError') }), _jsx(Button, { size: "sm", onClick: () => { void reloadPresentedHost(); }, children: t('presented.retry') })] }), host !== null && host !== 'error' && !host.available && _jsx("span", { className: css.hostStatus, children: t('presented.unavailable') }), _jsx("div", { className: css.presented, "data-presented-files-row": true, "data-single": matched.presented.length === 1 ? true : undefined, children: presented.map(file => _jsx(PresentedFileCard, { file: file, cwd: cwd, phase: states[presentedFileUrl(sessionId, file.seq, file.index)], host: host === 'error' ? null : host, t: t, onPreview: () => { openFile(file.path); }, actions: renderSlot('deliverables.file.actions', {
                                actionUrl: presentedFileUrl(sessionId, file.seq, file.index),
                                available: host !== null && host !== 'error' && host.available,
                                pending: states[presentedFileUrl(sessionId, file.seq, file.index)] === 'opening'
                                    || states[presentedFileUrl(sessionId, file.seq, file.index)] === 'revealing',
                                onAction: (action, application) => openPresented(sessionId, file.seq, file.index, action, application),
                            }) }, `${file.seq}:${file.index}`)) }), collapsible && _jsxs("button", { type: "button", className: css.toggle, "aria-expanded": expanded, "aria-label": t(expanded ? 'presented.collapseAria' : 'presented.expandAria', { count: matched.presented.length }), onClick: () => { setExpanded(value => !value); }, children: [_jsx("span", { children: t(expanded ? 'presented.collapse' : 'presented.all', { count: matched.presented.length }) }), expanded ? _jsx(IconChevronUpOutlineRegular, {}) : _jsx(IconChevronDownOutlineRegular, {})] })] })] });
}
//# sourceMappingURL=Deliverables.js.map