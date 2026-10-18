import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatScheduleFrequency, taskName } from "./schedule-format.js";
import { scheduleCreateCardModel } from "./schedule-create-card.js";
import css from './ScheduleCreateCard.module.css';
/**
 * Render one `schedule_create` call as the created task's card.
 *
 * A settled result yields the task's title, its localized frequency, and the
 * button that opens that task's right-Sidebar detail. A running call, a failed
 * creation, or a replayed result with no complete task renders its title and
 * raw result text with no open action, so the card never presents an identity
 * it does not have.
 * @param props - the settled card payload, injected task navigation, and copy.
 * @returns the created task's transcript card.
 */
export function ScheduleCreateCard({ block, toolName, openTaskDetail, t, currentTask }) {
    const model = scheduleCreateCardModel(block, toolName);
    const task = currentTask ?? model.task;
    const deleted = currentTask === null;
    const title = currentTask === undefined || currentTask === null ? model.title : taskName(currentTask);
    const openable = task !== undefined && !deleted;
    return (_jsxs("div", { className: css.card, "data-tool": "schedule_create", children: [openable
                ? (_jsx("button", { type: "button", className: css.cardOpen, "aria-label": t('card.openLabel', { title }), onClick: () => { openTaskDetail(task.id); } }))
                : null, _jsxs("div", { className: css.row, children: [_jsx("span", { className: css.leading, children: _jsx(IconClockOutlineRegular, { size: 18 }) }), _jsxs("span", { className: css.body, children: [_jsx("span", { className: css.title, children: title }), task !== undefined
                                ? _jsx("span", { className: css.frequency, children: deleted ? t('card.deleted') : formatScheduleFrequency(task, t) })
                                : null] }), openable
                        ? (_jsx(Button, { variant: "outline", size: "sm", className: css.openButton, onClick: () => { openTaskDetail(task.id); }, children: t('card.open') }))
                        : null] }), task === undefined && model.output !== null ? _jsx("pre", { className: css.fallback, children: model.output }) : null] }));
}
//# sourceMappingURL=ScheduleCreateCard.js.map