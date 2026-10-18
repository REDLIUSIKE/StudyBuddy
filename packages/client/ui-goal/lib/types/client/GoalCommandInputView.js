import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { memo } from 'react';
import { projectUserText } from '@deepseek-ai/dsh-client-ui-primitives';
import { GOAL_COMMAND } from "./goal-command-input.js";
import css from './GoalCommandInputView.module.css';
/**
 * Right-aligned `/goal` input bubble without ordinary message actions. The
 * echoed line decorates its leading `/goal` token as a command chip — the run
 * this Node projects is the fact that that token was a command — and keeps
 * the objective, `/goal` mentions included, as plain text.
 */
export const GoalCommandInputView = memo(function GoalCommandInputView({ node, t, }) {
    const data = node.data;
    // Only the leading token is the executed command; the rest of the line is
    // the objective, where a further `/goal` is prose.
    const split = data.text.search(/\s/u);
    const head = split === -1 ? data.text : data.text.slice(0, split);
    const rest = split === -1 ? '' : data.text.slice(split);
    return (_jsx("div", { className: css.row, "data-command-input": "", role: "group", "aria-label": t('commandInput.aria'), children: _jsx("div", { className: css.stack, children: _jsxs("div", { className: css.bubble, children: [projectUserText(head, [], [GOAL_COMMAND], 'command'), rest !== '' && projectUserText(rest, [])] }) }) }));
});
//# sourceMappingURL=GoalCommandInputView.js.map