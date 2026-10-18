import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Shared file comparison for the turn-tail hover preview and Sidebar review. */
import { useMemo, useRef } from 'react';
import { Button, languageForPath, useCodeHighlighter } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './FileDiff.module.css';
/** Maximum rendered lines per comparison. */
export const MAX_RENDERED_LINES = 5000;
function highlightedSide(rows, side, highlighter) {
    const source = rows.flatMap((row) => {
        const no = row[side];
        return no === undefined ? [] : [{ no, text: row.text }];
    });
    if (source.length === 0)
        return new Map();
    const highlighted = highlighter(source.map(line => line.text).join('\n'));
    if (highlighted === undefined)
        return undefined;
    return new Map(source.map((line, index) => {
        // Shiki omits one terminal empty token row; retain an aligned empty run for that source line.
        return [line.no, highlighted[index] ?? []];
    }));
}
function hunkHighlights(hunk, highlighter) {
    const rows = hunkRows(hunk);
    return { old: highlightedSide(rows, 'old', highlighter), new: highlightedSide(rows, 'new', highlighter) };
}
function DiffText({ text, spans }) {
    return _jsx("span", { className: css.text, "data-diff-code": spans === undefined ? undefined : '', children: spans === undefined ? text : spans.map((span, index) => _jsx("span", { style: span.style, children: span.text }, index)) });
}
/**
 * Number a hunk's lines: context lines count on both sides, deletions on the
 * old side, additions on the new side.
 * @param hunk - a served hunk.
 * @returns the rows in order.
 */
export function hunkRows(hunk) {
    let oldNo = hunk.oldStart;
    let newNo = hunk.newStart;
    return hunk.lines.map((line) => {
        const text = line.slice(1);
        switch (line[0]) {
            case '+': return { kind: 'add', old: undefined, new: newNo++, text };
            case '-': return { kind: 'del', old: oldNo++, new: undefined, text };
            default: return { kind: 'context', old: oldNo++, new: newNo++, text };
        }
    });
}
/**
 * Pair a hunk's lines for the side-by-side view: each run of deletions is
 * aligned with the run of additions that follows it, row by row, and context
 * lines sit on both sides.
 * @param hunk - a served hunk.
 * @returns the rows in order.
 */
export function splitRows(hunk) {
    const rows = [];
    let dels = [];
    let adds = [];
    const flush = () => {
        for (let at = 0; at < Math.max(dels.length, adds.length); at += 1) {
            const left = dels[at];
            const right = adds[at];
            rows.push({ ...left === undefined ? {} : { left }, ...right === undefined ? {} : { right } });
        }
        dels = [];
        adds = [];
    };
    for (const row of hunkRows(hunk)) {
        if (row.kind === 'del')
            dels.push({ no: row.old, text: row.text, kind: 'del' });
        else if (row.kind === 'add')
            adds.push({ no: row.new, text: row.text, kind: 'add' });
        else {
            flush();
            rows.push({ left: { no: row.old, text: row.text, kind: 'context' }, right: { no: row.new, text: row.text, kind: 'context' } });
        }
    }
    flush();
    return rows;
}
/**
 * The hunks to draw, cut at {@link MAX_RENDERED_LINES} lines in total.
 * @param hunks - served hunks.
 * @returns the hunks with the last one shortened as needed, and whether anything was cut.
 */
export function renderedHunks(hunks) {
    let budget = MAX_RENDERED_LINES;
    const kept = [];
    for (const hunk of hunks) {
        if (budget === 0)
            return { hunks: kept, truncated: true };
        kept.push(hunk.lines.length <= budget ? hunk : { ...hunk, lines: hunk.lines.slice(0, budget) });
        budget -= Math.min(budget, hunk.lines.length);
    }
    return { hunks: kept, truncated: hunks.some((hunk, at) => kept[at] !== hunk) };
}
/** The one-line fact about a text comparison worth stating above its hunks, if any. */
function noteOf(diff) {
    if (!diff.before)
        return 'diff.created';
    if (!diff.after)
        return 'diff.deleted';
    if (diff.hunks.length === 0)
        return 'diff.unchanged';
    return undefined;
}
/**
 * Render a file comparison with the same states and highlighting in previews and review tabs.
 * Addition-only and deletion-only comparisons use one column without changing the requested layout.
 * @param props - comparison state, layout choices, retry action, and localized copy.
 * @returns the comparison or its loading, unavailable, or error state.
 */
export function FileDiff({ state, split, wrap, retry, t }) {
    if (state === undefined || state === 'loading')
        return _jsx("p", { className: css.status, role: "status", children: t('diff.loading') });
    if (state === 'missing')
        return _jsx("p", { className: css.status, children: t('diff.missing') });
    if (state === 'error') {
        return _jsxs("div", { className: css.status, children: [_jsx("span", { children: t('diff.error') }), _jsx(Button, { size: "sm", onClick: retry, children: t('presented.retry') })] });
    }
    if (state.kind === 'binary')
        return _jsx("p", { className: css.status, children: t('diff.binary') });
    if (state.kind === 'oversized')
        return _jsx("p", { className: css.status, children: t('diff.oversized') });
    const hasAdditions = state.hunks.some(hunk => hunk.lines.some(line => line.startsWith('+')));
    const hasDeletions = state.hunks.some(hunk => hunk.lines.some(line => line.startsWith('-')));
    const oneSided = hasAdditions !== hasDeletions;
    return _jsx(TextDiff, { diff: state, split: split && !oneSided, wrap: wrap, t: t });
}
/** The kind a paired row carries: a deletion or addition on either side, otherwise context. */
function splitRowKind(row) {
    return row.left?.kind === 'del' ? 'del' : row.right?.kind === 'add' ? 'add' : 'context';
}
function hunkHeader(hunk) {
    return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}
/**
 * The side-by-side view without wrapping: two columns that clip their long
 * lines and scroll together on both axes, so a long line on one side never
 * runs under the other and both sides show the same rows and columns of text.
 * Every line is one fixed-height row, which keeps the sides aligned.
 * The columns suppress elastic overscroll while retaining native in-range scrolling.
 */
function SplitColumns({ hunks, highlights }) {
    const paired = useMemo(() => hunks.map(hunk => ({ header: hunkHeader(hunk), rows: splitRows(hunk) })), [hunks]);
    const columns = useRef({ left: null, right: null });
    const offsets = useRef({ left: { scrollLeft: 0, scrollTop: 0 }, right: { scrollLeft: 0, scrollTop: 0 } });
    const follow = (side) => (event) => {
        const peer = side === 'left' ? 'right' : 'left';
        const other = columns.current[peer];
        /* v8 ignore next -- Both column refs are attached before browser scroll events can run. */
        if (other === null)
            return;
        for (const axis of ['scrollLeft', 'scrollTop']) {
            const value = event.currentTarget[axis];
            if (offsets.current[side][axis] === value)
                continue;
            offsets.current[side][axis] = value;
            other[axis] = value;
            // Record the browser-clamped offset so its scroll event cannot pull the source back.
            offsets.current[peer][axis] = other[axis];
        }
    };
    return (_jsx("div", { className: css.columns, children: ['left', 'right'].map(side => (_jsx("div", { className: css.column, "data-diff-side": side, ref: (element) => { columns.current[side] = element; }, onScroll: follow(side), children: paired.map((hunk, position) => (_jsxs("section", { className: css.hunk, children: [_jsx("div", { className: css.hunkHeader, "data-diff-hunk-header": true, children: hunk.header }), hunk.rows.map((row, at) => {
                        const cell = row[side];
                        const spans = cell === undefined ? undefined : highlights[position]?.[side === 'left' ? 'old' : 'new']?.get(cell.no);
                        return (_jsxs("div", { className: `${css.sideLine} ${cell === undefined ? css.empty : css[cell.kind]}`, "data-diff-line": splitRowKind(row), children: [_jsx("span", { className: css.number, children: cell?.no ?? '' }), _jsx(DiffText, { text: cell?.text ?? '', spans: spans })] }, at));
                    })] }, position))) }, side))) }));
}
/** The hunks of a text comparison with their line numbers, unified or side by side. */
function TextDiff({ diff, split, wrap, t }) {
    const note = noteOf(diff);
    const { hunks, truncated } = useMemo(() => renderedHunks(diff.hunks), [diff.hunks]);
    const highlighter = useCodeHighlighter(languageForPath(diff.path));
    const highlights = useMemo(() => hunks.map(hunk => hunkHighlights(hunk, highlighter)), [hunks, highlighter]);
    return (_jsxs("div", { className: css.body, "data-review-view": split ? 'split' : 'unified', "data-review-wrap": wrap || undefined, children: [note !== undefined && _jsx("p", { className: css.note, "data-diff-note": hunks.length === 0 ? 'empty' : 'metadata', children: t(note) }), diff.coarse && _jsx("p", { className: css.note, "data-diff-coarse": true, children: t('diff.coarse') }), truncated && _jsx("p", { className: css.note, "data-diff-truncated": true, children: t('diff.truncated', { count: String(MAX_RENDERED_LINES) }) }), split && !wrap ? _jsx(SplitColumns, { hunks: hunks, highlights: highlights }) : hunks.map((hunk, position) => {
                const highlighted = highlights[position];
                return _jsxs("section", { className: css.hunk, children: [_jsx("div", { className: css.hunkHeader, "data-diff-hunk-header": true, children: hunkHeader(hunk) }), split ? splitRows(hunk).map((row, at) => (_jsxs("div", { className: css.splitLine, "data-diff-line": splitRowKind(row), children: [_jsxs("span", { className: `${css.cell} ${row.left === undefined ? css.empty : css[row.left.kind]}`, children: [_jsx("span", { className: css.number, children: row.left?.no ?? '' }), _jsx(DiffText, { text: row.left?.text ?? '', spans: row.left === undefined ? undefined : highlighted?.old?.get(row.left.no) })] }), _jsxs("span", { className: `${css.cell} ${row.right === undefined ? css.empty : css[row.right.kind]}`, children: [_jsx("span", { className: css.number, children: row.right?.no ?? '' }), _jsx(DiffText, { text: row.right?.text ?? '', spans: row.right === undefined ? undefined : highlighted?.new?.get(row.right.no) })] })] }, at))) : hunkRows(hunk).map((row, at) => (_jsxs("div", { className: `${css.line} ${css[row.kind]}`, "data-diff-line": row.kind, children: [_jsx("span", { className: css.number, children: row.old ?? '' }), _jsx("span", { className: css.number, children: row.new ?? '' }), _jsx("span", { className: css.sign, children: row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' ' }), _jsx(DiffText, { text: row.text, spans: row.kind === 'add' ? highlighted?.new?.get(row.new) : highlighted?.old?.get(row.old) })] }, at)))] }, position);
            })] }));
}
//# sourceMappingURL=FileDiff.js.map