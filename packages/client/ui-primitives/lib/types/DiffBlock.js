import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { structuredPatch } from 'diff';
import { FoldToggle } from "./FoldToggle.js";
import { writeClipboard } from "./clipboard.js";
import { CodeToolbar } from "./CodeToolbar.js";
import { languageForPath } from "./code-highlighting.js";
import cardCss from './CodeCard.module.css';
import css from './DiffBlock.module.css';
/** Output lines shown before the height cap collapses the middle. */
export const DEFAULT_DIFF_MAX_LINES = 16;
/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a row kind is forged */
function assertNever(value) {
    throw new Error(`unreachable diff row kind: ${String(value)}`);
}
/** The dim class per row kind (path/gap chrome vs the diff's own +/- colors). */
const ROW_CLASS = {
    path: css.path,
    del: css.del,
    add: css.add,
    context: css.context,
    gap: css.gap,
};
/** Bound synchronous edit-graph search; one replacement consumes two edits. */
const MAX_DIFF_EDIT_LENGTH = 256;
/** Derive exact local patches or a whole-fragment replacement when search exceeds the limit. */
function localHunks(diff) {
    const oldLines = contentLines(diff.oldText ?? '');
    const newLines = contentLines(diff.newText);
    const normalize = (lines) => lines.map(line => `${line}\n`).join('');
    return structuredPatch('', '', normalize(oldLines), normalize(newLines), undefined, undefined, { context: 3, maxEditLength: MAX_DIFF_EDIT_LENGTH })?.hunks
        ?? [{ lines: [...oldLines.map(line => `-${line}`), ...newLines.map(line => `+${line}`)] }];
}
/**
 * Count displayed additions and deletions. Exact patches exclude shared context;
 * comparisons exceeding the edit limit count both complete fragments as replaced.
 * Text follows {@link contentLines}'s terminator rule.
 * @param diffs - the hunks to count.
 * @returns the +/- totals for tool summaries.
 */
export function diffTotals(diffs) {
    let added = 0;
    let removed = 0;
    for (const diff of diffs) {
        for (const hunk of localHunks(diff)) {
            for (const line of hunk.lines) {
                if (line.startsWith('+'))
                    added++;
                if (line.startsWith('-'))
                    removed++;
            }
        }
    }
    return { added, removed };
}
/**
 * Flatten local patches into rows.
 * A path header opens each new file. A `⋯` gap separates consecutive same-file
 * fragments and distant patches within a fragment.
 * @param diffs - the hunks to render.
 * @returns the body rows.
 */
function buildRows(diffs) {
    const rows = [];
    let prevPath;
    for (const diff of diffs) {
        if (diff.path !== prevPath)
            rows.push({ kind: 'path', text: diff.path });
        else
            rows.push({ kind: 'gap', text: '⋯' });
        prevPath = diff.path;
        for (const [index, hunk] of localHunks(diff).entries()) {
            if (index > 0)
                rows.push({ kind: 'gap', text: '⋯' });
            for (const line of hunk.lines) {
                const kind = line.startsWith('-') ? 'del' : line.startsWith('+') ? 'add' : 'context';
                rows.push({ kind, text: line.slice(1) });
            }
        }
    }
    return rows;
}
/**
 * Split a side's text into its content lines. Empty text is zero lines (a full
 * deletion's `newText` or a create's absent `oldText` side draws nothing), and a
 * single trailing newline is a line terminator rather than an extra empty line —
 * the same terminator rule TerminalBlock applies to command output. An interior
 * blank line (a genuine `\n\n`) survives.
 * @param text - the removed or added side's text.
 * @returns the content lines, without the terminating newline.
 */
function contentLines(text) {
    if (text === '')
        return [];
    const body = text.endsWith('\n') ? text.slice(0, -1) : text;
    return body.split('\n');
}
/**
 * Copy the full local diff, including folded rows: removed/added lines have
 * `- `/`+ ` prefixes, context has two spaces, and paths and gaps stay verbatim.
 * @param rows - the flattened body rows.
 * @returns the diff as plain text.
 */
function copyText(rows) {
    return rows.map((row) => {
        switch (row.kind) {
            case 'del': return `- ${row.text}`;
            case 'add': return `+ ${row.text}`;
            case 'context': return `  ${row.text}`;
            case 'path': return row.text;
            case 'gap': return row.text;
            /* v8 ignore next -- closed-union backstop; only reached if a row kind is forged */
            default: return assertNever(row.kind);
        }
    }).join('\n');
}
/**
 * Render a file mutation as an inline diff surface.
 * @param props - see {@link DiffBlockProps}.
 * @returns the diff block element.
 */
export function DiffBlock({ diffs, labels, maxLines = DEFAULT_DIFF_MAX_LINES, className }) {
    const rows = useMemo(() => buildRows(diffs), [diffs]);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [wrapped, setWrapped] = useState(false);
    const firstLanguage = diffs[0] === undefined ? undefined : languageForPath(diffs[0].path);
    const language = diffs.every(diff => languageForPath(diff.path) === firstLanguage) ? firstLanguage : undefined;
    const onCopy = useCallback(() => {
        if (copied)
            return;
        void writeClipboard(copyText(rows)).then((ok) => {
            if (!ok)
                return;
            setCopied(true);
            window.setTimeout(() => { setCopied(false); }, 1000);
        });
    }, [copied, rows]);
    const onToggle = useCallback(() => { setExpanded(value => !value); }, []);
    if (rows.length === 0)
        return null;
    const hidden = rows.length - maxLines;
    const capped = hidden > 0 && !expanded;
    // Same split arithmetic as TerminalBlock and the TUI transcript's collapsed
    // card, so a body's head and tail slices agree across the front ends.
    const headLines = Math.ceil(maxLines / 2);
    const tailLines = maxLines - headLines;
    const head = capped ? rows.slice(0, headLines) : rows;
    const tail = capped ? rows.slice(rows.length - tailLines) : [];
    return (_jsxs("div", { className: clsx(cardCss.card, css.block, className), "data-diff": "", "data-code-wrap": wrapped, children: [_jsx(CodeToolbar, { lang: language, labels: labels, copyLabel: labels.copy, copiedLabel: labels.copied, copied: copied, wrapped: wrapped, onCopy: onCopy, onWrap: () => { setWrapped(value => !value); } }), _jsxs("div", { className: css.body, children: [head.map((row, index) => (_jsx("div", { className: clsx(css.line, ROW_CLASS[row.kind]), children: row.text }, index))), hidden > 0 && (_jsx(FoldToggle, { className: css.expand, expanded: expanded, hidden: hidden, labels: labels, onToggle: onToggle })), tail.map((row, index) => (_jsx("div", { className: clsx(css.line, ROW_CLASS[row.kind]), children: row.text }, index)))] })] }));
}
//# sourceMappingURL=DiffBlock.js.map