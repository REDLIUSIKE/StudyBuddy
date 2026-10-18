import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { ReferenceIconRegular } from "./ReferenceIcon.js";
import css from './user-text.module.css';
import markdownCss from './markdown/MarkdownText.module.css';
/** The wire form a session chip serializes to; label is the display text. */
const SESSION_WIRE_RE = /@\[([^\]\n]+)\]\(dsh-session:[^)\s]+\)/gu;
/** Sentence punctuation a bare `@name` token may carry without being part of the reference. */
const TRAILING_PUNCTUATION_RE = /[.,;:!?，。；：！？]+$/u;
/**
 * Split one sent text into inline plain runs and reference chips.
 * @param text - the logged model text of the message or queue row.
 * @param sessionLabels - exact session mention labels associated by an adjacent recall.
 * @param slashNames - names a `/name` token may decorate as: the skills the
 * host loaded for this message, or the command a command bubble echoes
 * (unsent queue rows pass none).
 * @param slashKind - the chip kind those tokens render as.
 * @param references - optional file and skill preview actions; session and command tokens stay labels.
 * @returns inline nodes covering the whole text.
 */
export function projectUserText(text, sessionLabels, slashNames = [], slashKind = 'skill', references) {
    const ranges = [];
    SESSION_WIRE_RE.lastIndex = 0;
    let wire;
    while ((wire = SESSION_WIRE_RE.exec(text)) !== null) {
        ranges.push({
            start: wire.index,
            end: wire.index + wire[0].length,
            label: wire[0],
            kind: 'session',
            display: wire[1], // non-optional capture in SESSION_WIRE_RE
        });
    }
    for (const rawLabel of [...new Set(sessionLabels)].sort((a, b) => b.length - a.length)) {
        const label = `@${rawLabel}`;
        let start = text.indexOf(label);
        while (start >= 0) {
            ranges.push({ start, end: start + label.length, label, kind: 'session' });
            start = text.indexOf(label, start + label.length);
        }
    }
    // A `/` token ends at whitespace or the text end like the host skill
    // gesture; only `@` tokens shed sentence punctuation below.
    const re = /(^|\s)(\/[\w-]+(?=\s|$)|@"[^"\n]+"|@[^\s]+)/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
        const tokenStart = m.index + m[1].length; // (^|\s) captures '' at line start
        const rawLabel = m[2]; // non-optional alternation capture
        const label = rawLabel.startsWith('@"')
            ? rawLabel
            : rawLabel.replace(TRAILING_PUNCTUATION_RE, '');
        if (label.length <= 1)
            continue;
        if (label.startsWith('/') && !slashNames.includes(label.slice(1)))
            continue;
        ranges.push({ start: tokenStart, end: tokenStart + label.length, label, kind: 'plain' });
    }
    const rankOf = (range) => range.kind === 'session' ? 0 : 1;
    ranges.sort((a, b) => a.start - b.start || rankOf(a) - rankOf(b) || b.end - a.end);
    const parts = [];
    let cursor = 0;
    const pushPlain = (from, to) => {
        parts.push(_jsx("span", { className: css.plainRun, children: text.slice(from, to) }, `t${from}`));
    };
    for (const range of ranges) {
        if (range.start < cursor)
            continue;
        const { start: tokenStart, end, label, kind } = range;
        if (tokenStart > cursor)
            pushPlain(cursor, tokenStart);
        const referenceKind = kind === 'session'
            ? 'session'
            : label.startsWith('@')
                ? label.replace(/^@"|"$/gu, '').endsWith('/') ? 'folder' : 'file'
                : undefined;
        const displayLabel = range.display
            ?? (referenceKind === undefined
                ? label
                : referenceKind === 'session'
                    ? label.slice(1)
                    : label.slice(1).replace(/^"|"$/gu, '').split(/[\\/]/u).filter(Boolean).at(-1) ?? label.slice(1));
        const contents = _jsxs(_Fragment, { children: [referenceKind !== undefined && (_jsx(ReferenceIconRegular, { kind: referenceKind, size: 16, className: css.refIcon })), displayLabel] });
        const open = references === undefined ? undefined
            : referenceKind === 'file'
                ? () => { references.openFile(label.slice(1).replace(/^"|"$/gu, '')); }
                : referenceKind === undefined && slashKind === 'skill'
                    ? () => { references.openSkill(label.slice(1)); }
                    : undefined;
        const className = clsx(css.refChip, referenceKind === undefined && css.slashChip);
        parts.push(open === undefined
            ? _jsx("span", { className: className, "data-ref-chip": referenceKind ?? slashKind, title: label, children: contents }, tokenStart)
            : _jsx("button", { type: "button", className: clsx(className, markdownCss.fileMention), "data-ref-chip": referenceKind ?? slashKind, title: label, onClick: (event) => {
                    if (event.detail > 1 || (event.detail !== 0 && event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false))
                        return;
                    open();
                }, children: contents }, tokenStart));
        cursor = end;
    }
    if (parts.length === 0)
        return _jsx("span", { className: css.plainRun, children: text });
    if (cursor < text.length)
        pushPlain(cursor, text.length);
    return _jsx(_Fragment, { children: parts });
}
//# sourceMappingURL=user-text.js.map