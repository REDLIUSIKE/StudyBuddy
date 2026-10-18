import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Persistent transcript cards and pending-review sidebar navigation. */
import { useEffect } from 'react';
import { FileTypeIcon, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PlanPreview.module.css';
/**
 * Render the completed Turn's submitted plans in invocation order.
 * @param props - Logged plan, localized copy, and Session-bound navigation.
 * @returns keyboard-accessible plan cards, or null for a Turn without plans.
 */
export function PlanCards({ turn, usePlans, openPlan, t }) {
    const plans = usePlans(String(turn.turn));
    if (plans === undefined || plans.length === 0)
        return null;
    return (_jsx("div", { className: css.cards, "data-plan-artifacts": true, children: plans.map(plan => _jsxs("button", { type: "button", className: css.card, "data-plan-card": plan.callId, "aria-label": t('preview.openNamed', { title: plan.title }), onClick: () => { openPlan(plan.callId); }, children: [_jsx("span", { className: css.cardIcon, children: _jsx(FileTypeIcon, { kind: "markdown", size: 20 }) }), _jsxs("span", { className: css.cardDetails, children: [_jsx("span", { className: css.cardTitle, children: plan.title }), _jsx("span", { className: css.cardDescription, children: t('preview.document') })] }), _jsx("span", { className: css.cardOpen, children: t('preview.action') })] }, plan.callId)) }));
}
/**
 * Open each pending plan automatically and retain a manual opener without answering it.
 *
 * The automatic open waits for a Session on screen. `ctx.sidebarRight` names
 * the Session before the commit that brings its Conversation back renders, so
 * a review that arrived while the Conversation was off screen opens from the
 * effect of the commit that mounts it.
 * @param props - Review identity, Session store, localized copy, and navigation.
 * @returns an opener for either logged or temporary plan text.
 */
export function PlanReviewOpen({ review, requestKey, openReview, useSidebarMounted, t, useStore, actions }) {
    const identity = review.callId === undefined ? `review:${requestKey}` : `call:${review.callId}`;
    const opened = useStore(state => state.opened[identity] === true);
    const mounted = useSidebarMounted(session => session !== undefined);
    useEffect(() => {
        if (opened || !mounted)
            return;
        openReview(review, requestKey);
        actions.markOpened(identity);
    }, [identity, opened, mounted, openReview, review, requestKey, actions]);
    return _jsxs("button", { type: "button", className: css.reviewLink, title: t('preview.open'), "aria-label": t('preview.open'), onClick: () => { openReview(review, requestKey); }, children: [t('preview.full'), _jsx(IconChevronRightOutlineRegular, { size: 14 })] });
}
//# sourceMappingURL=PlanCard.js.map