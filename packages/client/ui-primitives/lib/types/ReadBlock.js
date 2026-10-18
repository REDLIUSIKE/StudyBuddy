import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { FoldToggle } from "./FoldToggle.js";
import { writeClipboard } from "./clipboard.js";
import { CodeToolbar } from "./CodeToolbar.js";
import cardCss from './CodeCard.module.css';
import { grammarLoadCount, highlightLines, subscribeGrammarLoaded, } from "./markdown/highlight.js";
import { useViewportHighlighting } from "./markdown/useViewportHighlighting.js";
import css from './ReadBlock.module.css';
/**
 * Content lines shown before the height cap collapses the middle. Matches
 * TerminalBlock's default so a long read and a long command output cut at the
 * same place in the same flow.
 */
export const DEFAULT_READ_MAX_LINES = 16;
function renderSpans(spans) {
    return spans.map((span, index) => _jsx("span", { style: span.style, children: span.text }, index));
}
/**
 * Render a read tool result as a line-numbered, optionally syntax-highlighted
 * file view.
 * @param props - see {@link ReadBlockProps}.
 * @returns the read block element.
 */
export function ReadBlock({ label, labels, lines, totalLines, lang, maxLines = DEFAULT_READ_MAX_LINES, className, }) {
    const rootRef = useRef(null);
    const highlighting = useViewportHighlighting(rootRef, lang);
    // Whole-window highlighting preserves multiline grammar context; copy uses
    // the same text without gutter or banner chrome.
    const raw = useMemo(() => lines.map(line => line.text).join('\n'), [lines]);
    // Re-render when a lazy grammar finishes loading, so a read card that showed
    // plain text while its language's grammar imported picks up highlighting. The
    // snapshot value is opaque; only its change across renders drives the memo.
    const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
    const highlighted = useMemo(() => highlighting ? highlightLines(raw, lang) : undefined, [highlighting, raw, lang, loaded]);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [wrapped, setWrapped] = useState(false);
    const onCopy = useCallback(() => {
        if (copied)
            return;
        void writeClipboard(raw).then((ok) => {
            if (!ok)
                return;
            setCopied(true);
            window.setTimeout(() => { setCopied(false); }, 1000);
        });
    }, [copied, raw]);
    const onToggle = useCallback(() => { setExpanded(value => !value); }, []);
    const hidden = lines.length - maxLines;
    const capped = hidden > 0 && !expanded;
    const headLines = Math.ceil(maxLines / 2);
    const tailLines = maxLines - headLines;
    // A read is a window when its returned lines are fewer than the file's total;
    // the note states that so a reader is not misled that the file ends here.
    const windowed = lines.length < totalLines;
    const rows = (slice) => slice.map(([line, spans]) => (_jsxs("div", { className: css.line, children: [_jsx("span", { className: css.gutter, "aria-hidden": true, children: line.number }), _jsx("span", { className: css.content, children: spans === undefined ? line.text : renderSpans(spans) })] }, line.number)));
    const gutterDigits = lines.reduce((digits, line) => Math.max(digits, String(line.number).length), 3);
    const gutterStyle = { '--dsl-read-gutter': `${gutterDigits}ch` };
    const paired = lines.map((line, index) => [line, highlighted?.[index]]);
    return (_jsxs("div", { ref: rootRef, className: clsx(cardCss.card, css.block, className), "data-read": "", "data-code-wrap": wrapped, style: gutterStyle, children: [_jsx(CodeToolbar, { lang: lang, title: label, status: windowed ? labels.window(lines.length, totalLines) : undefined, labels: labels, copyLabel: labels.copy, copiedLabel: labels.copied, copied: copied, wrapped: wrapped, 
                // Empty files must not replace the clipboard with empty text.
                onCopy: lines.length > 0 ? onCopy : undefined, onWrap: () => { setWrapped(value => !value); } }), _jsxs("div", { className: cardCss.body, children: [rows(capped ? paired.slice(0, headLines) : paired), hidden > 0 && (_jsx(FoldToggle, { className: css.expand, expanded: expanded, hidden: hidden, labels: labels, onToggle: onToggle })), capped && rows(paired.slice(paired.length - tailLines))] })] }));
}
//# sourceMappingURL=ReadBlock.js.map