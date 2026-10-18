import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { taskName } from "./schedule-format.js";
import { useTaskTabTarget } from "./task-tab-target.js";
import css from './TaskManagerPage.module.css';
/**
 * Render the clock glyph and the named task's stored title as the chip text.
 * @param props - tab information, the Host task catalog, the tab bindings, and localized copy.
 * @returns the clock glyph followed by the task's stored title, or the detail label without a catalog row.
 */
export function ScheduleTaskTabTitle({ sessionId, useTabInfo, useCatalog, taskBindings, t }) {
    const { tab } = useTabInfo();
    const { params } = useTaskTabTarget(sessionId, tab, taskBindings);
    const records = useCatalog(snapshot => snapshot.records);
    const record = params === undefined ? undefined : records.find(item => item.id === params.id);
    return (_jsxs(_Fragment, { children: [_jsx(IconClockOutlineRegular, { size: 16, className: css.tabTitleIcon }), record === undefined ? t('detail.label') : taskName(record)] }));
}
//# sourceMappingURL=ScheduleTaskTabTitle.js.map