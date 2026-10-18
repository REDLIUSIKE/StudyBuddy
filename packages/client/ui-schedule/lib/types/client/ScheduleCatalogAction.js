import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, } from 'react';
import { createPortal } from 'react-dom';
import { IconClockOutlineRegular, IconTrashOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer, } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatScheduleFrequency, nextRunParts, orderScheduleRecords, taskName, } from "./schedule-format.js";
import css from './ScheduleCatalogAction.module.css';
const SECOND_MS = 1_000;
const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };
/** Current-Session reminder catalog with durable deletion. */
export function ScheduleCatalogAction({ useSession, useCatalog, onDelete, onRetry, openTaskDetail, t, }) {
    const openState = useSession(snapshot => snapshot.openState);
    const catalogState = useCatalog(value => value);
    const { records, status, deleting } = catalogState;
    const visible = openState === 'open';
    const [open, setOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const catalogRef = useRef(null);
    const catalogPosition = useAnchoredPosition({
        open,
        anchorRef: triggerRef,
        panelRef: catalogRef,
        side: 'bottom',
        gap: 5,
        margin: 16,
    });
    useDismissOnOutsidePointer(rootRef, open, setOpen, catalogRef);
    useEffect(() => {
        if (!open)
            return;
        setNow(Date.now());
        const timer = setInterval(() => { setNow(Date.now()); }, SECOND_MS);
        return () => { clearInterval(timer); };
    }, [open]);
    useEffect(() => {
        if (visible || !open)
            return;
        setOpen(false);
    }, [visible, open]);
    const rows = useMemo(() => orderScheduleRecords(records, now), [records, now]);
    if (!visible)
        return null;
    // Show the entry only once it has something to open, or a failed read to
    // retry. An empty first read must not mount a chip that the authoritative
    // answer then removes, which reads as a flash in the header.
    if (records.length === 0 && status !== 'error')
        return null;
    // The entry is icon-only, so its accessible name is the only place the
    // reminder count reaches assistive technology. A refresh republishes
    // `loading` while retaining the rows it already lists, so the count follows
    // the known records rather than the read state: the label may go generic only
    // before the first successful read, when there is no count to name.
    const known = records.length;
    const triggerLabel = known === 0
        ? t('trigger.label')
        : t(known === 1 ? 'trigger.one' : 'trigger.other', { count: known });
    // One task has no list to choose from, so its entry opens the detail directly
    // once the read settles. A refresh republishes `loading` while retaining the
    // rows, so the entry stays expandable for that read: the popover shows the
    // loading row above the records it already lists.
    const soleTask = status === 'ready' && records.length === 1 ? records[0] : undefined;
    const expandable = soleTask === undefined || open;
    const toggleCatalog = () => {
        setNow(Date.now());
        setOpen(current => !current);
    };
    const openTask = (id) => {
        setOpen(false);
        openTaskDetail(id);
    };
    const onKeyDown = (event) => {
        if (event.key !== 'Escape' || !open)
            return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
    };
    const trigger = (_jsx("button", { ref: triggerRef, type: "button", className: css.trigger, "data-schedule-reminder-entry": "", "aria-expanded": expandable ? open : undefined, "aria-label": triggerLabel, onClick: () => {
            if (expandable) {
                toggleCatalog();
                return;
            }
            setNow(Date.now());
            openTask(soleTask.id);
        }, children: _jsx(IconClockOutlineRegular, { size: 16 }) }));
    const catalog = open
        ? createPortal((_jsxs("ul", { ref: catalogRef, className: css.menu, style: catalogPosition ?? MEASURE_STYLE, "aria-label": t('list.aria'), onKeyDown: onKeyDown, children: [status === 'loading' && _jsx("li", { className: css.row, role: "status", children: t('list.loading') }), status === 'error' && _jsxs("li", { className: css.row, children: [_jsx("span", { role: "alert", children: t('list.error') }), _jsx("button", { type: "button", onClick: () => { void onRetry(); }, children: t('list.retry') })] }), rows.map((record) => {
                    const overdue = Date.parse(record.scheduledAt) <= now;
                    // One pair per row: both halves come from this one call.
                    const nextRun = nextRunParts(record.scheduledAt, t('time.locale'), now, t);
                    return (_jsxs("li", { className: overdue ? `${css.row} ${css.rowTask} ${css.rowOverdue}` : `${css.row} ${css.rowTask}`, children: [_jsxs("span", { className: css.body, children: [_jsx("button", { type: "button", className: css.openButton, "aria-label": t('list.open', { title: taskName(record) }), onClick: () => { openTask(record.id); }, children: _jsx("span", { className: css.title, children: taskName(record) }) }), _jsx("span", { className: overdue ? `${css.metadata} ${css.metadataOverdue}` : css.metadata, children: _jsx("span", { children: formatScheduleFrequency(record, t) }) }), _jsxs("span", { className: overdue ? `${css.nextRun} ${css.metadataOverdue}` : css.nextRun, children: [_jsx("span", { children: `${t('list.nextRun')} ` }), _jsx("time", { dateTime: record.scheduledAt, children: nextRun.absolute }), _jsx("span", { className: css.nextRunRelative, children: nextRun.relative })] })] }), _jsx("button", { type: "button", className: css.deleteButton, "aria-label": t('delete.label', { title: taskName(record) }), title: t(deleting.includes(record.id) ? 'delete.pending' : 'delete.action'), disabled: deleting.includes(record.id), onClick: () => { void onDelete(record.id); }, children: _jsx(IconTrashOutlineRegular, { size: 14 }) })] }, record.id));
                })] })), document.body)
        : null;
    return (_jsxs("div", { ref: rootRef, className: css.root, onKeyDown: onKeyDown, children: [trigger, catalog] }));
}
//# sourceMappingURL=ScheduleCatalogAction.js.map