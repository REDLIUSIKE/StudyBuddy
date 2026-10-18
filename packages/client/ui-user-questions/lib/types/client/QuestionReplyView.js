import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useState } from 'react';
import { IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCopyOutlineRegular, Tooltip, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import { replyAnswerValues, replyClipboardText } from "./question-reply.js";
import css from './QuestionReplyView.module.css';
/**
 * Right-aligned late-reply bubble: a label naming the earlier pending
 * questions, then one question and answer pair per question. A payload the
 * Client cannot read falls back to the model-facing text.
 */
export const QuestionReplyView = memo(function QuestionReplyView({ node, t }) {
    return _jsx(QuestionReplyBubble, { data: node.data, t: t });
});
/**
 * Render one settled question reply as a compact transcript bubble.
 * @param props - Reply data and the question locale translator.
 * @returns The expandable reply bubble.
 */
export function QuestionReplyBubble({ data, t }) {
    const label = t('reply.label');
    const [open, setOpen] = useState(false);
    const toggleLabel = t(open ? 'reply.close' : 'reply.open');
    const summary = data.questions.map(question => replyAnswerValues(data, question.id)).flat().join(', ');
    const copyText = replyClipboardText(data, t);
    const [copied, setCopied] = useState(false);
    const onCopy = useCallback(() => {
        if (copied)
            return;
        void writeClipboard(copyText).then((ok) => {
            if (!ok)
                return;
            setCopied(true);
            window.setTimeout(() => { setCopied(false); }, 1000);
        });
    }, [copied, copyText]);
    return (_jsxs("div", { className: css.row, "data-question-reply": data.callId, "data-reply-outcome": data.outcome, role: "group", "aria-label": label, children: [_jsxs("div", { className: css.bubble, children: [_jsxs("button", { type: "button", className: css.toggle, "aria-expanded": open, "aria-label": `${label} · ${toggleLabel}`, onClick: () => { setOpen(value => !value); }, children: [_jsxs("span", { className: css.labelRow, children: [_jsx("span", { className: css.caret, "aria-hidden": "true", children: open ? _jsx(IconChevronDownOutlineRegular, {}) : _jsx(IconChevronRightOutlineRegular, {}) }), _jsx("span", { className: css.label, children: label })] }), !open && _jsx("span", { className: css.summary, children: summary === '' ? t('reply.skipped') : summary })] }), open && (data.questions.length === 0
                        ? _jsx("p", { className: css.text, children: data.text })
                        : (_jsx("dl", { className: css.details, children: data.questions.map((question) => {
                                const values = replyAnswerValues(data, question.id);
                                return (_jsxs("div", { children: [_jsxs("dt", { className: css.question, children: [question.header && question.header !== question.question && _jsx("span", { className: css.header, children: question.header }), _jsx("span", { className: css.questionText, children: question.question }), question.detail && _jsx("span", { className: css.detail, children: question.detail }), question.options && question.options.length > 0 && (_jsx("ul", { className: css.options, children: question.options.map(option => _jsxs("li", { children: [option.label, option.description && ` — ${option.description}`] }, option.label)) }))] }), _jsxs("dd", { className: css.answer, children: [_jsx("span", { className: css.answerLabel, children: t('reply.answerLabel') }), values.length === 0 ? t('reply.skipped') : values.join(', ')] })] }, question.id));
                            }) })))] }), _jsxs("div", { className: css.actions, children: [_jsx("span", { className: css.time, children: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(data.time) }), _jsx(Tooltip, { label: copied ? t('copied') : t('copy'), side: "bottom", children: _jsx("button", { type: "button", className: css.action, "aria-label": copied ? t('copied') : t('copy'), onClick: onCopy, children: copied ? _jsx(IconCheckOutlineRegular, {}) : _jsx(IconCopyOutlineRegular, {}) }) })] })] }));
}
//# sourceMappingURL=QuestionReplyView.js.map