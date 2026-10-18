import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Sidebar Session-row clock mark: one Session's active scheduled-task
 * indicator, seated in the row's leading 16px cell before the title.
 *
 * The row offers that cell to this seat only while its own primary state is
 * idle, so an approval request, a new message, or live activity keeps the
 * row's state dot in the same cell and never mounts the mark. The mark
 * projects the one shared Host task catalog onto this Session; it activates,
 * retains, and unarchives nothing, and it never reads a Session log.
 */
import { IconClockOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { useSessionScheduleFacts, } from "./session-schedule-state.js";
import css from './SessionScheduleMark.module.css';
/**
 * Render the clock mark while this Session's active tasks are non-empty.
 * @param props.sessionId - Session this row shows.
 * @param props.useCatalog - selector hook over the shared Host task catalog.
 * @param props.t - Schedule catalog locale seat.
 * @returns the mark, or nothing while the read is unresolved, failed, ended, or empty.
 */
export function SessionScheduleMark({ sessionId, useCatalog, t, }) {
    const facts = useSessionScheduleFacts(useCatalog, sessionId);
    if (!facts.hasActive)
        return null;
    return (_jsxs("span", { className: css.mark, "data-session-schedule-mark": "", 
        // A press on the mark must not activate the Session through the row's
        // own click target; the row keeps every other cell as its activation area.
        onClick: (event) => { event.stopPropagation(); }, children: [_jsx(IconClockOutlineRegular, { size: 14 }), _jsx("span", { className: css.visuallyHidden, children: t('mark.aria', { count: facts.records.length }) })] }));
}
//# sourceMappingURL=SessionScheduleMark.js.map