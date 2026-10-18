import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Cross-session retained reminders with local search and selection. */
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button, IconClockOutlineRegular, IconCloseOutlineRegular, IconPlusOutlineRegular, IconSearchOutlineRegular, Input, } from '@deepseek-ai/dsh-client-ui-primitives';
import { CatalogFeedback } from "./CatalogFeedback.js";
import { TaskDetail, useTaskDetail } from "./TaskDetail.js";
import { useRelativeClock } from "./relative-clock.js";
import { formatScheduleFrequency, nextRunParts, taskName, zoneLabel } from "./schedule-format.js";
import css from './TaskManagerPage.module.css';
/**
 * Render retained tasks with authoritative deletion and timing-only edits.
 * @param props - framework catalog snapshot, localized copy, and action callbacks.
 * @returns the searchable task list beside the selected task's detail.
 */
export function TaskManagerPage(props) {
    const { useCatalog, onNewTask, onRetry, t } = props;
    const catalog = useCatalog(snapshot => snapshot);
    const { records, status } = catalog;
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedId, setSelectedId] = useState(null);
    // The rows state how long remains, so they read the shared ticking clock
    // rather than a value sampled at mount: a catalog refresh can move the target
    // this text describes.
    const now = useRelativeClock();
    const detail = useTaskDetail(props, catalog, selectedId ?? undefined);
    const { record: catalogRecord, task: selected, id: detailId, confirmId, setConfirmId, setTab } = detail;
    const rowRef = useRef(null);
    const headingRef = useRef(null);
    const confirming = records.find(record => record.id === confirmId);
    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return records.filter(record => ((statusFilter === 'all' || record.status === statusFilter)
            && (record.prompt.toLowerCase().includes(query)
                || record.sessionId.toLowerCase().includes(query)
                || taskName(record).toLowerCase().includes(query)))).toSorted((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
    }, [records, search, statusFilter]);
    // An inactive-only filter is its own empty state: no task is inactive, rather than no task matched.
    const emptyTitle = statusFilter === 'inactive' && search.trim() === ''
        ? 'list.emptyInactive'
        : records.length === 0 ? 'list.empty' : 'list.noMatches';
    // The list's frequency line omits a rule zone equal to the host's and otherwise
    // names it, the same way the detail's Repeat row does.
    const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const frequencyZone = { system: systemZone, label: zone => zoneLabel(zone, t) };
    const frequency = (record) => formatScheduleFrequency(record, t, frequencyZone);
    useEffect(() => {
        // The detail focuses its own panel; with nothing selected, focus returns
        // to the row that opened it, or to the page heading once that row is gone.
        if (selectedId !== null)
            return;
        if (rowRef.current !== null) {
            const target = rowRef.current.isConnected ? rowRef.current : headingRef.current;
            target?.focus();
            rowRef.current = null;
        }
    }, [selectedId]);
    useEffect(() => {
        if (status !== 'ready')
            return;
        if (selectedId !== null && selected === undefined)
            setSelectedId(null);
        if (confirmId !== null && confirming === undefined)
            setConfirmId(null);
    }, [status, selectedId, selected, confirmId, confirming]);
    const closeDetails = () => {
        setSelectedId(null);
    };
    return (_jsxs("section", { className: clsx(css.page, selected !== undefined && css.hasDetails), "aria-label": t('title'), "data-testid": "task-manager-page", onKeyDown: (event) => {
            // A dropdown that closed on this Escape has already consumed the key: the
            // Menu primitive closes from the document capture phase and calls
            // preventDefault there, before React dispatches this handler.
            if (event.key !== 'Escape' || event.defaultPrevented || confirmId !== null || selectedId === null)
                return;
            event.preventDefault();
            event.stopPropagation();
            closeDetails();
        }, children: [_jsx("div", { className: css.listPane, children: _jsx("div", { className: css.pageScroll, children: _jsxs("div", { className: css.pageContent, children: [_jsxs("div", { className: css.pageHeading, children: [_jsx("h1", { ref: headingRef, tabIndex: -1, children: t('title') }), _jsx("div", { className: css.creationActions, children: _jsx(Button, { variant: "primary", size: "sm", className: css.newButton, icon: _jsx(IconPlusOutlineRegular, { size: 13 }), onClick: onNewTask, children: t('new.action') }) })] }), _jsx("div", { className: css.filters, children: _jsx("div", { className: css.filterTabs, role: "group", "aria-label": t('statusFilter.label'), children: ['all', 'active', 'inactive'].map(value => (_jsx("button", { type: "button", className: clsx(css.filterTab, statusFilter === value && css.filterTabActive), "aria-pressed": statusFilter === value, onClick: () => { setStatusFilter(value); }, children: t(value === 'all' ? 'statusFilter.all' : `status.${value}`) }, value))) }) }), _jsxs("div", { className: css.searchField, children: [_jsx(Input, { type: "search", icon: _jsx(IconSearchOutlineRegular, {}), "aria-label": t('search.label'), placeholder: t('search.placeholder'), value: search, onChange: (event) => { setSearch(event.target.value); } }), search !== '' && _jsx(Button, { size: "sm", className: css.searchClear, "aria-label": t('search.clear'), onClick: () => { setSearch(''); }, children: _jsx(IconCloseOutlineRegular, {}) })] }), _jsxs("div", { className: css.list, children: [selected === undefined && _jsx(CatalogFeedback, { status: status, populated: rows.length > 0, onRetry: onRetry, t: t }), status === 'ready' && rows.length === 0 && _jsxs("div", { className: css.empty, role: "status", children: [_jsx(IconClockOutlineRegular, { size: 24, className: css.emptyGlyph }), _jsx("h2", { children: t(emptyTitle) }), _jsx(Button, { variant: "outline", className: css.emptyAction, onClick: onNewTask, children: t('empty.action') })] }), _jsx("ul", { className: css.listRows, "aria-label": t('list.label'), "aria-busy": status === 'loading', children: rows.map((record) => {
                                            // One pair per row: the same absolute stamp and distance reach
                                            // both halves, from one formatting call.
                                            const nextRun = nextRunParts(record.scheduledAt, t('time.locale'), now, t);
                                            return (_jsx("li", { children: _jsxs(Button, { className: clsx(css.row, selectedId === record.id && css.selectedRow, record.status === 'inactive' && css.endedRow), "aria-label": taskName(record), "aria-describedby": `${detailId}-metadata-${record.id}`, "aria-expanded": selectedId === record.id, "aria-controls": selectedId === record.id ? detailId : undefined, onClick: (event) => {
                                                        rowRef.current = event.currentTarget;
                                                        setSelectedId(record.id);
                                                        setTab('rule');
                                                    }, children: [_jsx(IconClockOutlineRegular, { className: css.rowGlyph }), _jsxs("span", { className: css.rowContent, children: [_jsx("span", { className: css.rowTitle, children: taskName(record) }), _jsxs("span", { className: css.rowSummary, id: `${detailId}-metadata-${record.id}`, children: [record.status === 'inactive'
                                                                            && _jsx("span", { className: css.metadata, children: t('status.inactive') }), _jsx("span", { className: css.metadata, children: frequency(record) }), record.status === 'active' && _jsxs("span", { className: css.metadata, children: [t('list.nextPrefix'), _jsx("time", { dateTime: record.scheduledAt, children: nextRun.absolute }), ' ', _jsx("span", { className: css.nextRunRelative, children: nextRun.relative })] })] })] })] }) }, record.id));
                                        }) })] })] }) }) }), selected !== undefined && _jsx(TaskDetail, { ...detail.props, task: selected, authoritative: catalogRecord !== undefined, onDeleted: closeDetails, onClose: closeDetails })] }));
}
//# sourceMappingURL=TaskManagerPage.js.map