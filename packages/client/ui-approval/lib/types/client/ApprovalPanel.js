import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Composer takeover for one pending approval waterfall. */
import { useEffect, useRef, useState } from 'react';
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './ApprovalPanel.module.css';
/**
 * Render one pending approval and its optional Tool-owned detail.
 * @param props - selector-matched request and standard Slot props.
 * @returns The approval composer takeover.
 */
export function ApprovalPanel(props) {
    const approval = props.matched;
    const detail = approval.callId === undefined
        ? null
        : props.renderSlot('conversation.approval.detail', { callId: approval.callId });
    const reason = approval.displayReason === undefined ? approval.reason : props.resolveReason(approval.displayReason);
    return _jsx(ApprovalFlow, { pending: approval, reason: reason, detail: detail, t: props.t }, approval.key);
}
function ApprovalFlow({ pending, reason, detail, t }) {
    const [answered, setAnswered] = useState(false);
    const waiting = useRef(false);
    const active = useRef(true);
    const composing = useRef(false);
    const compositionEnded = useRef(false);
    useEffect(() => {
        active.current = true;
        return () => { active.current = false; };
    }, []);
    const answer = (outcome) => {
        if (waiting.current || !pending.answerable)
            return;
        waiting.current = true;
        setAnswered(true);
        void pending.answer(outcome).catch(() => {
            if (!active.current || !pending.answerable)
                return;
            waiting.current = false;
            setAnswered(false);
        });
    };
    const keydown = (event) => {
        const element = event.target;
        if (event.defaultPrevented || !event.currentTarget.contains(document.activeElement)
            || element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null)
            return;
        if (event.key !== 'Enter' && event.key !== 'Escape')
            return;
        if (event.key === 'Enter' && element.closest('button, a[href], [role="button"]') !== null)
            return;
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return;
        event.preventDefault();
        event.stopPropagation();
        // oxlint-disable-next-line typescript/no-deprecated -- IME 229 covers engines without isComposing.
        if (event.repeat || composing.current || compositionEnded.current || event.nativeEvent.isComposing || event.keyCode === 229)
            return;
        answer(event.key === 'Enter' ? 'allowed-once' : 'rejected');
    };
    return (_jsx("div", { className: css.root, "data-approval-key": pending.key, "aria-busy": answered, onKeyDown: keydown, onKeyUpCapture: () => { compositionEnded.current = false; }, onCompositionStartCapture: () => { composing.current = true; }, onCompositionEndCapture: () => { composing.current = false; compositionEnded.current = true; }, children: _jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.strip, children: [_jsx(StateDot, { state: answered ? 'ongoing' : 'warning' }), t('waiting')] }), _jsxs("div", { className: css.body, "data-approval-scroll": "", tabIndex: 0, role: "group", "aria-label": t('detail.aria'), children: [_jsx("div", { className: css.headline, children: reason ?? t('escalation', { toolName: pending.toolName }) }), detail !== null && _jsx("div", { className: css.command, children: detail })] }), _jsxs("div", { className: css.actionRow, children: [_jsx(Button, { variant: "outline", className: css.reject, disabled: answered, onClick: () => { answer('rejected'); }, children: t('reject') }), _jsx(Button, { variant: "primary", disabled: answered, onClick: () => { answer('allowed-once'); }, children: t('allowOnce') })] })] }) }));
}
//# sourceMappingURL=ApprovalPanel.js.map