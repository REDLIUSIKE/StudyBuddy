import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Turn changes use a compact single-file card or a header with a folded file list. */
import { useEffect, useId, useRef, useState } from 'react';
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path';
import { FileTypeIcon, HoverCard, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { changesDiffUrl } from "../changes.js";
import { FileDiff } from "./FileDiff.js";
import diffCss from './FileDiff.module.css';
import { basename } from "./turn-deliverables.js";
import css from './ChangedFiles.module.css';
/** Rows shown before the fold; the design's summary height for a closing message. */
const COLLAPSED_ROWS = 4;
const GROUPED = new Intl.NumberFormat('en-US');
/** Added and deleted line counts in the card's colors. */
function Counts({ added, deleted, t }) {
    return _jsxs(_Fragment, { children: [_jsx("span", { className: css.added, children: t('changes.added', { count: GROUPED.format(added) }) }), _jsx("span", { className: css.deleted, children: t('changes.deleted', { count: GROUPED.format(deleted) }) })] });
}
/**
 * Render one turn's changed files. The header opens the turn's review in the
 * right Sidebar on its first file. A single file uses only the header; it and
 * multi-file rows preview their comparison after a 500ms hover.
 * @param props - the recorded summary, the review opener, and localized copy.
 * @returns the card.
 */
export function ChangedFiles({ changes, cwd, openReview, t, sessionId, useChangesDiff, loadChangesDiff }) {
    const cardRef = useRef(null);
    const pathDescriptionId = useId();
    const [expanded, setExpanded] = useState(false);
    const singleFile = changes.total === 1 ? changes.files[0] : undefined;
    const foldable = changes.files.length > COLLAPSED_ROWS;
    const rows = foldable && !expanded ? changes.files.slice(0, COLLAPSED_ROWS) : changes.files;
    const header = _jsxs("button", { type: "button", className: css.header, "aria-label": singleFile === undefined ? t('changes.openReview') : t('changes.viewDiff', { name: singleFile.display }), "aria-describedby": singleFile === undefined ? undefined : pathDescriptionId, onClick: () => { openReview(0); }, children: [_jsx("span", { className: css.tile, children: singleFile === undefined ? _jsx(FileTypeIcon, { kind: "code", size: 20 }) : _jsx(FileTypeIcon, { path: singleFile.path, size: 20 }) }), _jsxs("span", { className: css.titles, children: [_jsx("span", { className: css.title, children: singleFile === undefined
                            ? t('changes.title', { count: String(changes.total) })
                            : t('changes.singleTitle', { name: basename(singleFile.path) }) }), _jsxs("span", { className: css.stat, children: [_jsx("span", { className: css.statCounts, children: singleFile?.binary === true ? t('changes.binary')
                                    : singleFile?.oversized === true ? t('changes.oversized')
                                        : _jsx(Counts, { t: t, added: changes.added, deleted: changes.deleted }) }), _jsx("span", { className: css.previewHint, children: t('presented.preview') })] })] })] });
    return _jsxs("div", { ref: cardRef, className: css.card, "data-changed-files": true, "data-single": singleFile !== undefined || undefined, children: [singleFile === undefined ? header : _jsxs(_Fragment, { children: [_jsx(HoverCard, { variant: "preview", widthAnchorRef: cardRef, openDelayMs: 500, anchor: header, content: _jsx(ChangedFilePreview, { sessionId: sessionId, seq: changes.seq, index: 0, display: resolveWorkspacePath(cwd, singleFile.path), useChangesDiff: useChangesDiff, loadChangesDiff: loadChangesDiff, t: t }) }), _jsx("span", { id: pathDescriptionId, hidden: true, children: resolveWorkspacePath(cwd, singleFile.path) })] }), singleFile === undefined && _jsx("ul", { className: css.list, children: rows.map((file, index) => (_jsxs("li", { children: [_jsx(HoverCard, { variant: "preview", widthAnchorRef: cardRef, openDelayMs: 500, content: _jsx(ChangedFilePreview, { sessionId: sessionId, seq: changes.seq, index: index, display: resolveWorkspacePath(cwd, file.path), useChangesDiff: useChangesDiff, loadChangesDiff: loadChangesDiff, t: t }), anchor: _jsxs("button", { type: "button", className: css.row, "aria-label": t('changes.viewDiff', { name: file.display }), "aria-describedby": `${pathDescriptionId}-${index}`, onClick: () => { openReview(index); }, children: [_jsx("span", { className: css.path, children: file.display }), _jsx("span", { className: css.counts, children: file.binary === true ? t('changes.binary')
                                            : file.oversized === true ? t('changes.oversized')
                                                : _jsx(Counts, { t: t, added: file.added, deleted: file.deleted }) })] }) }), _jsx("span", { id: `${pathDescriptionId}-${index}`, hidden: true, children: resolveWorkspacePath(cwd, file.path) })] }, file.display))) }), foldable && _jsxs("button", { type: "button", className: css.toggle, "aria-expanded": expanded, "aria-label": t(expanded ? 'changes.collapseAria' : 'changes.expandAria', { count: String(changes.files.length) }), onClick: () => { setExpanded(value => !value); }, children: [_jsx("span", { children: t(expanded ? 'changes.collapse' : 'changes.all', { count: String(changes.files.length) }) }), expanded ? _jsx(IconChevronUpOutlineRegular, {}) : _jsx(IconChevronDownOutlineRegular, {})] })] });
}
/** Mounted only while its hover card is open, so passing over a row does not read a comparison. */
function ChangedFilePreview({ sessionId, seq, index, display, useChangesDiff, loadChangesDiff, t }) {
    const state = useChangesDiff(value => value[changesDiffUrl(sessionId, seq, index)]);
    useEffect(() => {
        if (state === undefined)
            void loadChangesDiff(sessionId, seq, index);
    }, [state, sessionId, seq, index, loadChangesDiff]);
    return _jsxs("div", { className: `${diffCss.root} ${css.preview}`, "data-changes-hover-preview": true, children: [_jsx("div", { className: diffCss.header, children: _jsx("span", { className: css.previewPath, "data-changes-preview-path": true, children: display }) }), _jsx(FileDiff, { state: state, split: false, wrap: false, t: t, retry: () => { void loadChangesDiff(sessionId, seq, index); } })] });
}
//# sourceMappingURL=ChangedFiles.js.map