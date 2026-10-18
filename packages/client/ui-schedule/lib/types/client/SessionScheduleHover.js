import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Scheduled-task section of the Sidebar Session-row hover card.
 *
 * The row's own card already carries the Session title, its relative time, and
 * the trailing status line; this seat contributes the Session's active tasks
 * between them. It is mounted only while the card is open, and it projects the
 * one shared Host task catalog onto the hovered Session.
 */
import { useState } from 'react';
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatScheduleFrequency, nextRunParts, orderScheduleRecords, taskName } from "./schedule-format.js";
import { useSessionScheduleFacts, } from "./session-schedule-state.js";
import css from './SessionScheduleMark.module.css';
/** Most task rows one hover card shows before it reports the omitted remainder. */
export const SESSION_HOVER_TASK_LIMIT = 2;
/**
 * Render up to {@link SESSION_HOVER_TASK_LIMIT} overdue-first task rows.
 *
 * The reference clock is sampled once per mount: the card is a long-hover
 * preview, so its "next run" text must not drift while the pointer rests.
 * @param props.sessionId - Session this row shows.
 * @param props.useCatalog - selector hook over the shared Host task catalog.
 * @param props.t - Schedule catalog locale seat.
 * @returns the task rows plus an omission line, or nothing without an active task.
 */
export function SessionScheduleHover({ sessionId, useCatalog, t, }) {
    const facts = useSessionScheduleFacts(useCatalog, sessionId);
    const [now] = useState(() => Date.now());
    if (!facts.hasActive)
        return null;
    const ordered = orderScheduleRecords(facts.records, now);
    const shown = ordered.slice(0, SESSION_HOVER_TASK_LIMIT);
    const omitted = ordered.length - shown.length;
    return (_jsxs("div", { className: css.tasks, "data-session-schedule-tasks": "", children: [shown.map((record) => {
                const nextRun = nextRunParts(record.scheduledAt, t('time.locale'), now, t);
                return (_jsxs("div", { className: css.task, "data-session-schedule-task": "", children: [_jsx("span", { className: css.taskIcon, "aria-hidden": "true", children: _jsx(IconClockOutlineRegular, { size: 12 }) }), _jsxs("span", { className: css.taskBody, children: [_jsx("span", { className: css.taskName, children: taskName(record) }), _jsxs("span", { className: css.taskTiming, children: [`${formatScheduleFrequency(record, t)} · `, _jsx("time", { dateTime: record.scheduledAt, children: nextRun.absolute }), ' ', _jsx("span", { className: css.taskRelative, children: nextRun.relative })] })] })] }, record.id));
            }), omitted > 0 && _jsx("div", { className: css.omitted, children: t('hover.more', { count: omitted }) })] }));
}
//# sourceMappingURL=SessionScheduleHover.js.map