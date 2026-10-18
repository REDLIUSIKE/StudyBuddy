import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * GoalBar: the goal indicator docked above the message composer (input dock
 * strip). A present goal shows a goal glyph, a phase label, the truncated
 * objective, and icon actions — resume when active-disarmed or paused, edit
 * (inline form in the same strip), and clear. Goal creation lives on the
 * `/goal` command, not here: loading (undefined), no goal (null), and complete
 * goals render nothing. Durable state arrives as the projected whole snapshot;
 * process-local activation arrives through the injected activation hook.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheckOutlineRegular, IconCloseOutlineRegular, IconEditOutlineRegular, IconGoalOutlineRegular, IconPauseOutlineRegular, IconPlayOutlineRegular, IconTrashOutlineRegular, InlineEditor, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './GoalBar.module.css';
/** Strip label keys per visible phase; complete goals render nothing. */
const PHASE_LABELS = {
    active: 'phase.active',
    paused: 'phase.paused',
    blocked: 'phase.blocked',
};
/** Strip label for an active goal using its process-local activation. */
function activeLabel(activation, t) {
    if (activation === 'disarmed')
        return t('phase.active.disarmed');
    return t(PHASE_LABELS.active);
}
export function GoalBar({ goal, activation, onEdit, onPause, onResume, onClear, t }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [clearedGoalId, setClearedGoalId] = useState(null);
    const pendingRef = useRef(false);
    // A new goal identity (cleared/completed/replaced externally) invalidates the local edit
    // state: without the reset a surviving draft's Enter would write over the NEW goal.
    const goalId = goal?.id;
    useEffect(() => {
        setEditing(false);
        setActionError(null);
        setClearedGoalId(null);
    }, [goalId]);
    // React state disables the controls on the next render; the ref closes the
    // same-render window so rapid clicks cannot submit the same CAS twice.
    const runAction = useCallback(async (action) => {
        if (pendingRef.current)
            return undefined;
        pendingRef.current = true;
        setPending(true);
        setActionError(null);
        const result = await action();
        pendingRef.current = false;
        setPending(false);
        if (!result.ok)
            setActionError(`${result.error.message} (${result.error.code})`);
        return result;
    }, []);
    const handleEdit = useCallback(async () => {
        const trimmed = draft.trim();
        if (trimmed === '')
            return;
        const result = await runAction(() => onEdit(trimmed));
        if (result?.ok)
            setEditing(false);
    }, [draft, onEdit, runAction]);
    const handleClear = useCallback(async (clearedId) => {
        const result = await runAction(onClear);
        if (result?.ok)
            setClearedGoalId(clearedId);
    }, [onClear, runAction]);
    // Loading, absent, and complete goals have no strip at all.
    if (goal === undefined || goal === null || goal.phase === 'complete' || goal.id === clearedGoalId)
        return null;
    if (editing) {
        return (_jsx("div", { className: css.dock, "data-goal-bar": true, children: _jsxs("div", { className: `${css.bar} ${css.editBar}`, children: [_jsx(InlineEditor, { value: draft, label: t('objective.aria'), onChange: setDraft, onSave: () => { void handleEdit(); }, onCancel: () => { setEditing(false); } }), actionError !== null && _jsx("span", { className: css.error, role: "alert", children: actionError }), _jsxs("div", { className: css.actions, children: [_jsx(Tooltip, { portal: true, label: t('action.save'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconBtn, onClick: () => { void handleEdit(); }, disabled: pending || draft.trim() === '', "aria-label": t('action.save'), children: _jsx(IconCheckOutlineRegular, { size: 14 }) }) }), _jsx(Tooltip, { portal: true, label: t('action.cancel'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconBtn, onClick: () => { setEditing(false); }, disabled: pending, "aria-label": t('action.cancel'), children: _jsx(IconCloseOutlineRegular, { size: 14 }) }) })] })] }) }));
    }
    const title = goal.phase === 'blocked' ? goal.blockedReason?.message : undefined;
    const label = goal.phase === 'active' ? activeLabel(activation, t) : t(PHASE_LABELS[goal.phase]);
    const showResume = goal.phase === 'paused'
        || (goal.phase === 'active' && activation === 'disarmed');
    return (_jsx("div", { className: css.dock, "data-goal-bar": true, children: _jsxs("div", { className: css.bar, title: title, children: [_jsx("span", { className: css.goalGlyph, children: _jsx(IconGoalOutlineRegular, { size: 14 }) }), _jsx("span", { className: css.label, children: label }), _jsx("span", { className: css.objective, children: goal.objective }), actionError !== null && _jsx("span", { className: css.error, role: "alert", children: actionError }), _jsxs("div", { className: css.actions, children: [goal.phase === 'active' && activation === 'armed' && (_jsx(Tooltip, { portal: true, label: t('action.pause'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconBtn, disabled: pending, onClick: () => { void runAction(onPause); }, "aria-label": t('action.pause'), children: _jsx(IconPauseOutlineRegular, { size: 14 }) }) })), showResume && (_jsx(Tooltip, { portal: true, label: t('action.resume'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconBtn, disabled: pending, onClick: () => { void runAction(onResume); }, "aria-label": t('action.resume'), children: _jsx(IconPlayOutlineRegular, { size: 14 }) }) })), _jsx(Tooltip, { portal: true, label: t('action.edit'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconBtn, disabled: pending, onClick: () => { setDraft(goal.objective); setEditing(true); }, "aria-label": t('action.edit'), children: _jsx(IconEditOutlineRegular, { size: 14 }) }) }), _jsx(Tooltip, { portal: true, label: t('action.clear'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconBtn, disabled: pending, onClick: () => { void handleClear(goal.id); }, "aria-label": t('action.clear'), children: _jsx(IconTrashOutlineRegular, { size: 14 }) }) })] })] }) }));
}
/** Dock adapter: overlays process-local activation on the durable goal projection. */
export function GoalDock({ useProjection, useGoalActivation, onEdit, onPause, onResume, onClear, t, }) {
    const projection = useProjection('goal');
    const goal = projection === undefined || projection === null ? projection : projection.goal;
    const goalId = goal?.id;
    const revision = goal?.revision;
    const activation = useGoalActivation(next => (next.id === goalId && next.revision === revision ? next.activation : undefined));
    return (_jsx(GoalBar, { goal: goal, ...activation === undefined ? {} : { activation }, onEdit: onEdit, onPause: onPause, onResume: onResume, onClear: onClear, t: t }));
}
//# sourceMappingURL=GoalBar.js.map