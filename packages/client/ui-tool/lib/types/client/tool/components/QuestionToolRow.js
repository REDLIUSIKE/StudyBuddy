import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Question-owned summary action and transcript disclosure. */
import { DisclosureRow, IconInspectOutlineRegular, IconQuestionOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatToolBody } from "../models/tool-call-model.js";
import { AskQuestionCard } from "./AskQuestionCard.js";
import css from './ToolRow.module.css';
import questionCss from './QuestionToolRow.module.css';
/**
 * Render a question with its answer-panel entry point.
 * @param props - Question transcript, panel action, and disclosure state.
 * @returns The question's summary and optional expanded record.
 */
export function QuestionToolRow({ useDisclosure, t, summary, bodyRaw, output, askQuestion, state, inspect, openPanel, panelLabel, }) {
    const { expanded, toggle } = useDisclosure();
    const expandable = bodyRaw != null || output != null || askQuestion != null;
    const open = expanded && expandable;
    return (_jsxs("div", { className: css.root, "data-variant": "others", "data-tool": "ask_user_question", "data-state": state, children: [state === 'running' && _jsx("span", { className: css.visuallyHidden, children: t('row.running') }), _jsx(DisclosureRow, { rowClassName: css.row, leadingClassName: css.leading, titleClassName: css.title, chevronClassName: css.chevron, icon: _jsx(IconQuestionOutlineRegular, {}), title: t('ask.rowTitle'), running: state === 'running', open: open, expandable: expandable, keepContentWhenOpen: true, onToggle: toggle, collapsedContent: _jsxs(_Fragment, { children: [summary !== '' && _jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "aria-hidden": true }), _jsx("span", { className: css.summary, children: _jsx(TextShimmer, { active: state === 'running', children: summary }) })] }), _jsxs("button", { type: "button", className: questionCss.panelButton, onClick: (event) => { event.stopPropagation(); if (!openPanel())
                                toggle(); }, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ')
                                event.stopPropagation(); }, children: [_jsx(IconQuestionOutlineRegular, {}), panelLabel] })] }), children: open && _jsxs("div", { className: css.bodyWrap, children: [askQuestion != null ? _jsx(AskQuestionCard, { card: askQuestion }) : _jsxs("div", { className: css.ioCard, children: [bodyRaw != null && _jsxs("div", { className: css.ioSection, children: [_jsx("span", { className: css.ioLabel, children: t('row.input') }), _jsx("span", { className: css.ioText, children: formatToolBody('others', bodyRaw) })] }), bodyRaw != null && output != null && _jsx("span", { className: css.ioDivider, "aria-hidden": true }), output != null && _jsxs("div", { className: css.ioSection, children: [_jsx("span", { className: css.ioLabel, children: t('row.output') }), _jsx("span", { className: css.ioText, children: output })] })] }), inspect !== undefined && _jsxs("button", { type: "button", className: css.inspectButton, onClick: inspect, children: [_jsx(IconInspectOutlineRegular, {}), t('row.inspect')] })] }) })] }));
}
//# sourceMappingURL=QuestionToolRow.js.map