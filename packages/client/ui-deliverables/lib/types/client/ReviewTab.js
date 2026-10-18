import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The review tab: one turn's changed files behind a file selector, with the
 * selected file's turn-start and turn-end comparison drawn unified or side by
 * side, wrapped or scrolling, and controls to open the file itself.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconChevronDownOutlineRegular, IconCompareSplitOutlineRegular, IconInspectOutlineRegular, IconNowrapFillRegular, IconWrapFillRegular, Menu, PathLabel, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path';
import { changedFileUrl, changesDiffUrl, changesSummaryUrl, parseChangesReviewAddress } from "../changes.js";
import { FileDiff } from "./FileDiff.js";
import diffCss from './FileDiff.module.css';
import css from './ReviewTab.module.css';
const GROUPED = new Intl.NumberFormat('en-US');
/** The file index a navigation names, when it names one. */
function navigatedIndex(params) {
    const index = params?.index;
    return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}
/** Added and deleted line counts in the card's colors. */
function Counts({ file, t }) {
    if (file.binary === true)
        return _jsx("span", { className: css.label, children: t('changes.binary') });
    if (file.oversized === true)
        return _jsx("span", { className: css.label, children: t('changes.oversized') });
    return _jsxs(_Fragment, { children: [_jsx("span", { className: css.added, children: t('changes.added', { count: GROUPED.format(file.added) }) }), _jsx("span", { className: css.deleted, children: t('changes.deleted', { count: GROUPED.format(file.deleted) }) })] });
}
/**
 * The review type's body, registered under `sidebar.right.pane.tab` as `changes-review`.
 * @param props - composed slot props.
 * @returns the selected file's comparison behind the file selector, or the state that stands in for it.
 */
export function ReviewTab({ useTabInfo, sessionId, useSessions, useStore, actions, useChangesSummary, useChangesDiff, usePresentedOpen, usePresentedHost, loadChangesSummary, loadChangesDiff, reloadPresentedHost, openChanged, t, renderSlot, }) {
    const { tab } = useTabInfo();
    const { navigation, signal } = tab;
    const coordinates = useMemo(() => parseChangesReviewAddress(tab.contentId), [tab.contentId]);
    if (coordinates === undefined)
        throw new Error(`ui-deliverables: not a review address "${tab.contentId}"`);
    const { seq } = coordinates;
    const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd);
    const summary = useChangesSummary(value => value[changesSummaryUrl(sessionId, seq)]);
    const state = useStore(store => store.byTab[tab.id]);
    const host = usePresentedHost(value => value);
    // Every navigation to this tab applies its file index once; the first one seeds the tab's choices.
    useEffect(() => {
        if (state?.navigated === navigation.revision)
            return;
        actions.navigated(tab.id, navigation.revision, navigatedIndex(navigation.params) ?? state?.index ?? 0);
    }, [state, navigation.revision, navigation.params, actions, tab.id]);
    useEffect(() => {
        const forget = () => { actions.forget(tab.id); };
        signal.addEventListener('abort', forget, { once: true });
        return () => { signal.removeEventListener('abort', forget); };
    }, [signal, actions, tab.id]);
    useEffect(() => {
        if (summary === undefined)
            void loadChangesSummary(sessionId, seq);
    }, [summary, sessionId, seq, loadChangesSummary]);
    useEffect(() => {
        if (host === null)
            void reloadPresentedHost();
    }, [host, reloadPresentedHost]);
    const files = typeof summary === 'object' ? summary.files : [];
    // A navigated index the summary does not list falls back to the first file.
    const index = state !== undefined && files[state.index] !== undefined ? state.index : 0;
    const file = files[index];
    const diffState = useChangesDiff(value => file === undefined ? undefined : value[changesDiffUrl(sessionId, seq, index)]);
    useEffect(() => {
        if (file !== undefined && diffState === undefined)
            void loadChangesDiff(sessionId, seq, index);
    }, [file, diffState, sessionId, seq, index, loadChangesDiff]);
    const phase = usePresentedOpen(value => file === undefined ? undefined : value[changedFileUrl(sessionId, seq, index)]);
    const [menuOpen, setMenuOpen] = useState(false);
    const split = state?.split === true;
    const wrap = state?.wrap === true;
    const native = host !== null && host !== 'error' && host.available && phase !== 'nativeUnavailable';
    const summaryState = summary === undefined || summary === 'loading' ? 'loading' : summary === 'missing' ? 'missing' : 'ready';
    return (_jsxs("div", { className: `${diffCss.root} ${css.root}`, "data-changes-review": true, "data-review-state": summaryState, children: [_jsxs("div", { className: diffCss.header, children: [file === undefined
                        ? _jsx("span", { className: css.selectorLabel, children: t('review.title', { turn: String(coordinates.turn) }) })
                        : _jsx(Menu, { className: css.selector, open: menuOpen, autoFocus: true, portal: true, align: "start", dense: true, onClose: () => { setMenuOpen(false); }, anchor: _jsxs("button", { type: "button", className: css.selectorButton, "aria-haspopup": "menu", "aria-expanded": menuOpen, "aria-label": t('review.selectFile'), title: file.display, "data-review-file": file.path, onClick: () => { setMenuOpen(value => !value); }, children: [_jsx(PathLabel, { path: file.display }), _jsx(IconChevronDownOutlineRegular, { size: 12 })] }), items: files.map((entry, at) => ({ id: String(at), label: _jsxs("span", { className: css.item, children: [_jsx("span", { className: css.itemPath, children: entry.display }), _jsx("span", { className: css.itemCounts, children: _jsx(Counts, { file: entry, t: t }) })] }) })), selectedId: String(index), onSelect: (id) => { actions.selected(tab.id, Number(id)); setMenuOpen(false); } }), file !== undefined && _jsx("span", { className: css.counts, children: _jsx(Counts, { file: file, t: t }) }), _jsxs("span", { className: css.tools, children: [_jsx(Tooltip, { label: t(split ? 'review.unified' : 'review.split'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-pressed": split, "aria-label": t('review.splitAria'), "data-review-tool": "split", onClick: () => { actions.toggledSplit(tab.id); }, children: _jsx(IconCompareSplitOutlineRegular, { className: css.compareIcon }) }) }), _jsx(Tooltip, { label: t(wrap ? 'review.nowrap' : 'review.wrap'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-pressed": wrap, "aria-label": t('review.wrapAria'), "data-review-tool": "wrap", onClick: () => { actions.toggledWrap(tab.id); }, children: wrap ? _jsx(IconNowrapFillRegular, {}) : _jsx(IconWrapFillRegular, {}) }) }), file !== undefined && _jsx(Tooltip, { label: t('review.openFile'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('review.openFileAria', { name: file.display }), "data-review-tool": "open-file", onClick: () => { tab.actions.openResource(fileAddressFor(sessionId, cwd, file.path)); }, children: _jsx(IconInspectOutlineRegular, {}) }) }), file !== undefined && renderSlot('deliverables.review.file.actions', {
                                actionUrl: changedFileUrl(sessionId, seq, index), available: native,
                                pending: phase === 'opening' || phase === 'revealing',
                                onAction: (action, application) => openChanged(sessionId, seq, index, action, application),
                            })] })] }), summaryState === 'loading' && _jsx("p", { className: diffCss.status, role: "status", children: t('diff.loading') }), summaryState === 'missing' && _jsx("p", { className: diffCss.status, children: t('diff.missing') }), file !== undefined && _jsx(FileDiff, { state: diffState, split: split, wrap: wrap, t: t, retry: () => { void loadChangesDiff(sessionId, seq, index); } })] }));
}
//# sourceMappingURL=ReviewTab.js.map