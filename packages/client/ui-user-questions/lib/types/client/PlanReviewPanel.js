import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Button, extractMarkdownPlainText, IconEditOutlineRegular, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PlanReviewPanel.module.css';
/**
 * Optional-prop spread for a decision button's tooltip: `title` is optional on
 * the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
 *
 * @param description - the asker's option description, when it carries one.
 * @returns The `title` prop to spread, or nothing.
 */
function tooltip(description) {
    return description === undefined ? {} : { title: description };
}
/**
 * Render plan review controls; the submitted document opens in the sidebar.
 *
 * @param props - the question domain face, the narrowed plan review, and `t`.
 * @returns The plan-review takeover for this request.
 */
export function PlanReviewPanel({ pending, review, t, renderSlot }) {
    // Foreground decisions wait for the resolved frame; accepted Remote decisions
    // hide the panel. A failed send re-enables the buttons and shows the error.
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const settle = (send, remote = false) => {
        setBusy(true);
        setError(null);
        void send()
            .then(() => {
            if (!remote)
                return;
            setBusy(false);
            void pending.dismiss().catch(() => { setError(t('status.sent')); });
        })
            .catch((cause) => {
            setBusy(false);
            setError(cause instanceof Error ? cause.message : String(cause));
        });
    };
    const decide = (label) => {
        settle(() => pending.answer({ answers: [{ id: review.id, selected: [label] }] }), pending.snapshot().channel === 'rpc');
    };
    const summary = useMemo(() => {
        const title = extractMarkdownPlainText(review.plan, { mode: 'first-line' });
        const description = extractMarkdownPlainText(review.plan, { mode: 'first-paragraph' });
        return { title, description: description === title ? '' : description };
    }, [review.plan]);
    return (_jsx("div", { className: css.frame, "data-plan-review-key": pending.key, children: _jsxs("section", { className: css.card, "aria-label": review.question, "aria-busy": busy, children: [_jsxs("div", { className: css.strip, children: [_jsx(StateDot, { state: busy ? 'ongoing' : 'warning' }), t('plan.header'), _jsx("div", { className: css.previewActions, children: renderSlot('conversation.plan-review.actions', { review, requestKey: pending.key }) })] }), _jsxs("div", { className: css.summary, children: [_jsx("h3", { className: css.title, children: summary.title }), summary.description !== '' && _jsx("p", { className: css.description, children: summary.description })] }), _jsxs("div", { className: css.footer, children: [_jsx("div", { className: css.feedback, role: "status", children: error }), _jsxs("div", { className: css.actions, children: [_jsx(Button, { variant: "outline", className: css.discuss, icon: _jsx(IconEditOutlineRegular, { size: 14 }), disabled: busy, onClick: () => { settle(() => pending.dismiss()); }, children: t('plan.discuss') }), _jsx(Button, { variant: "primary", ...tooltip(review.approve.description), disabled: busy, onClick: () => { decide(review.approve.label); }, children: t('plan.approve') })] })] })] }) }));
}
//# sourceMappingURL=PlanReviewPanel.js.map