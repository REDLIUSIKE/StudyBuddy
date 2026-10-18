import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDownOutlineRegular, IconUserOutlineRegular, IconUsersOutlineRegular, StateDot, Tag, Tooltip, useAnchoredPosition, useDismissOnOutsidePointer, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './TeamAction.module.css';
function statusKey(status) {
    switch (status) {
        case 'pending': return 'status.pending';
        case 'in_progress': return 'status.in_progress';
        case 'completed': return 'status.completed';
        /* v8 ignore next -- Team views omit deleted task tombstones. */
        case 'deleted': return 'status.completed';
    }
}
function memberStatusKey(status) {
    switch (status) {
        case 'running': return 'memberStatus.running';
        case 'inactive': return 'memberStatus.inactive';
        case 'provisioning': return 'memberStatus.provisioning';
        case 'failed': return 'memberStatus.failed';
    }
}
function memberDotState(status) {
    switch (status) {
        case 'running':
        case 'provisioning': return 'ongoing';
        case 'failed': return 'error';
    }
}
function taskDotState(task) {
    switch (task.status) {
        case 'pending': return task.ready ? 'idle' : 'warning';
        case 'in_progress': return 'ongoing';
        case 'completed': return 'done';
        /* v8 ignore next -- Team views omit deleted task tombstones. */
        case 'deleted': return 'idle';
    }
}
function TeamMemberRow({ member, memberCount, sessionId, useSessions, useSessionStatus, openTeammate, onError, t, }) {
    const model = useSessions(state => state.projectionsBySession[member.id]?.values.modelSelection?.next?.model);
    const running = useSessionStatus(state => state.get(member.id)?.running);
    const summaryRunning = useSessions(state => state.byId[member.id]?.running);
    const status = member.phase === 'active'
        ? (running ?? summaryRunning) === true ? 'running' : 'inactive'
        : member.phase;
    const isCurrent = member.id === sessionId;
    const highlightCurrent = isCurrent && memberCount > 1;
    const inert = isCurrent || status === 'failed' || status === 'provisioning';
    return (_jsx(Tooltip, { label: t('open'), side: "bottom", gap: 4, disabled: inert, children: _jsxs("button", { type: "button", className: highlightCurrent ? `${css.member} ${css.memberCurrent}` : css.member, disabled: inert, onClick: () => {
                try {
                    openTeammate(sessionId, member.id);
                }
                catch (reason) {
                    onError(String(reason));
                }
            }, children: [_jsx("span", { className: css.memberDot, children: status === 'inactive'
                        ? _jsx(IconUserOutlineRegular, { size: 14, className: css.inactiveIcon })
                        : _jsx(StateDot, { state: memberDotState(status) }) }), _jsxs("span", { className: css.memberText, children: [_jsxs("span", { className: css.memberName, children: [_jsx("span", { className: css.memberNameText, children: member.name }), isCurrent && _jsx(Tag, { tone: "info", className: css.currentTag, children: t('current') })] }), _jsxs("small", { children: [t(memberStatusKey(status)), model !== undefined && (_jsx("span", { className: css.memberModel, children: ` · ${t('model')}: ${model}` }))] }), member.error !== undefined && _jsx("small", { className: css.diagnostic, children: member.error })] })] }) }));
}
/** Task card with a two-line description clamp expanded from a toggle in the meta row. */
function TaskCard({ task, t }) {
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);
    const textRef = useRef(null);
    useLayoutEffect(() => {
        if (expanded)
            return;
        const paragraph = textRef.current;
        /* v8 ignore next -- the paragraph mounts in the same commit as the effect. */
        if (paragraph === null)
            return;
        const measure = () => { setClamped(paragraph.scrollHeight > paragraph.clientHeight + 1); };
        measure();
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(measure);
        observer.observe(paragraph);
        return () => { observer.disconnect(); };
    }, [task.description, expanded]);
    return (_jsxs("article", { className: css.task, children: [_jsxs("div", { className: css.taskTitle, children: [_jsx("strong", { children: task.subject }), _jsxs("span", { className: css.taskState, children: [_jsx(StateDot, { state: taskDotState(task) }), _jsx("span", { children: t(statusKey(task.status)) })] })] }), _jsx("p", { ref: textRef, className: expanded ? undefined : css.clampedDescription, children: task.description }), _jsxs("div", { className: css.meta, children: [(clamped || expanded) && (_jsxs("button", { type: "button", className: css.expandToggle, "aria-expanded": expanded, onClick: () => { setExpanded(current => !current); }, children: [t(expanded ? 'task.collapse' : 'task.expand'), _jsx(IconChevronDownOutlineRegular, { size: 12, className: expanded ? css.expandToggleOpen : undefined })] })), _jsx("span", { children: task.id }), _jsxs("span", { children: [t('owner'), ": ", task.ownerName ?? t('unowned')] }), task.status === 'pending' && _jsx("span", { children: task.ready ? t('ready') : t('blocked') }), task.blockedBy.length > 0 && _jsxs("span", { children: [t('blockedBy'), ": ", task.blockedBy.join(', ')] }), task.writeScopes.length > 0 && _jsxs("span", { children: [t('writeScopes'), ": ", task.writeScopes.join(', ')] }), task.writeScopeWarnings.map(warning => _jsx("span", { className: css.warning, children: warning }, warning))] })] }));
}
/** Render the Team roster and read-only task board. */
export function TeamAction({ sessionId, useSession, useSessions, useSessionStatus, openTeammate, t, }) {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState(null);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const triggerLabelRef = useRef(null);
    const panelRef = useRef(null);
    const position = useAnchoredPosition({
        open, anchorRef: triggerRef, panelRef, gap: 5, margin: 16,
    });
    const positioned = position !== null;
    const leadSessionId = useSession(snapshot => snapshot.subagent?.address.parentSessionId) ?? sessionId;
    const team = useSessions(state => state.projectionsBySession[leadSessionId]?.values.agentTeam);
    const opening = useSession(snapshot => snapshot.openState === 'loading');
    const listing = useSessions(state => state.phase === 'pending');
    const hoverTimer = useRef(undefined);
    const pinnedRef = useRef(false);
    const cancelHoverChange = () => {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = undefined;
    };
    useEffect(() => {
        cancelHoverChange();
        pinnedRef.current = false;
        setOpen(false);
        setError(null);
    }, [sessionId]);
    useEffect(() => cancelHoverChange, []);
    useLayoutEffect(() => {
        if (open && positioned && pinnedRef.current)
            panelRef.current?.focus();
    }, [open, positioned]);
    const changeOpen = (next) => {
        cancelHoverChange();
        if (!next)
            pinnedRef.current = false;
        setOpen(next);
    };
    const scheduleHoverOpen = () => {
        cancelHoverChange();
        if (open)
            return;
        const label = triggerLabelRef.current;
        /* v8 ignore next -- the label mounts with the trigger that received the hover. */
        if (label === null)
            return;
        // Icon-only trigger (label collapsed by the header container query):
        // hover-open would surprise on such a small target, so only click opens.
        if (getComputedStyle(label).display === 'none')
            return;
        hoverTimer.current = setTimeout(() => {
            hoverTimer.current = undefined;
            changeOpen(true);
        }, 150);
    };
    const scheduleHoverClose = () => {
        cancelHoverChange();
        if (pinnedRef.current)
            return;
        hoverTimer.current = setTimeout(() => {
            hoverTimer.current = undefined;
            changeOpen(false);
        }, 120);
    };
    useDismissOnOutsidePointer(rootRef, open, changeOpen, panelRef);
    useEffect(() => {
        if (!open)
            return;
        const dismiss = (event) => {
            if (event.key !== 'Escape')
                return;
            event.preventDefault();
            cancelHoverChange();
            pinnedRef.current = false;
            setOpen(false);
            if (panelRef.current?.contains(document.activeElement))
                triggerRef.current?.focus();
        };
        document.addEventListener('keydown', dismiss);
        return () => { document.removeEventListener('keydown', dismiss); };
    }, [open]);
    const compact = team !== undefined && team.members.length === 1 && team.tasks.length === 0;
    return (_jsxs("div", { ref: rootRef, className: css.root, "data-team-action": true, onMouseLeave: scheduleHoverClose, children: [_jsxs("button", { type: "button", ref: triggerRef, onMouseEnter: scheduleHoverOpen, className: css.trigger, "aria-label": t('trigger'), "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => {
                    cancelHoverChange();
                    pinnedRef.current = true;
                    if (!open)
                        changeOpen(true);
                    else
                        panelRef.current?.focus();
                }, children: [_jsx(IconUsersOutlineRegular, { size: 14 }), _jsx("span", { ref: triggerLabelRef, className: css.triggerLabel, children: t('trigger') })] }), open && createPortal(_jsx("div", { ref: panelRef, className: compact ? `${css.panel} ${css.panelCompact}` : css.panel, style: position ?? { visibility: 'hidden', left: 0, top: 0 }, role: "dialog", tabIndex: -1, "aria-label": t('trigger'), "data-team-panel": true, onMouseEnter: cancelHoverChange, onMouseLeave: scheduleHoverClose, children: _jsxs("div", { className: css.body, children: [error !== null && (_jsxs("div", { className: css.error, role: "alert", children: [_jsx(StateDot, { state: "error" }), error] })), team === undefined && (_jsxs("div", { className: css.notice, role: "status", children: [_jsx(StateDot, { state: opening || listing ? 'ongoing' : 'warning' }), t(opening || listing ? 'loading' : 'unavailable')] })), team !== undefined && (_jsxs(_Fragment, { children: [team.failure !== undefined && (_jsxs("div", { className: css.error, role: "alert", children: [_jsx(StateDot, { state: "error" }), t('failure', { message: team.failure })] })), _jsxs("section", { children: [_jsxs("h3", { children: [t('roster'), team.members.length > 1 && _jsx("span", { className: css.count, children: team.members.length })] }), _jsx("div", { className: css.roster, children: team.members.map(member => (_jsx(TeamMemberRow, { member: member, memberCount: team.members.length, sessionId: sessionId, useSessions: useSessions, useSessionStatus: useSessionStatus, openTeammate: openTeammate, onError: setError, t: t }, member.id))) })] }), _jsx("section", { children: team.tasks.length === 0
                                        ? _jsx("p", { className: css.emptyNotice, children: t('empty') })
                                        : (_jsxs(_Fragment, { children: [_jsxs("h3", { children: [t('tasks'), _jsx("span", { className: css.count, children: team.tasks.length })] }), _jsx("div", { className: css.tasks, children: team.tasks.map(task => _jsx(TaskCard, { task: task, t: t }, task.id)) })] })) })] }))] }) }), document.body)] }));
}
//# sourceMappingURL=TeamAction.js.map