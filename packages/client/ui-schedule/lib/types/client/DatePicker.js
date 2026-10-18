import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Month calendar for one staged one-shot date.
 *
 * The picker owns only the panel: the row renders the read-only trigger, whose
 * text exposes the date as `YYYY/MM/DD` while the draft it stages keeps the ISO
 * text this panel writes back and the Host receives. The row's Escape guard
 * closes the panel and hands focus back.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { PickerPopover } from "./PickerPopover.js";
import css from './DatePicker.module.css';
/** ISO calendar date, the only text this row stores. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Weekday column headings, Monday first as the weekly choice orders them. */
const WEEKDAY_KEYS = [
    'frequency.weekday.1', 'frequency.weekday.2', 'frequency.weekday.3', 'frequency.weekday.4',
    'frequency.weekday.5', 'frequency.weekday.6', 'frequency.weekday.7',
];
/** Arrow key to the number of days it moves the focused cell. */
const STEP_BY_KEY = {
    ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
};
/**
 * The month and day one stored date opens on.
 * @param date - staged ISO date text.
 * @returns its own year, month, and day, or today when it is not an ISO calendar date.
 */
function viewOf(date) {
    const match = ISO_DATE.exec(date);
    if (match === null) {
        const today = new Date();
        return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    }
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}
/** Zero-padded two-digit field. */
function pad(value) {
    return String(value).padStart(2, '0');
}
/**
 * Last day of one month.
 * @param view - year and zero-based month.
 * @returns that month's length in days.
 */
function daysIn(view) {
    return new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
}
/**
 * The same day in another month, clamped to that month's length.
 * @param view - current month and day.
 * @param step - months to move, negative for earlier.
 * @returns the moved view.
 */
function shiftMonth(view, step) {
    const months = view.year * 12 + view.month + step;
    const moved = { year: Math.floor(months / 12), month: months % 12 };
    return { ...moved, day: Math.min(view.day, daysIn(moved)) };
}
/**
 * ISO text of one day in a shown month.
 * @param view - shown year and month.
 * @param day - day of that month.
 * @returns `YYYY-MM-DD`.
 */
function isoOf(view, day) {
    return `${view.year}-${pad(view.month + 1)}-${pad(day)}`;
}
/**
 * Render the month panel: one localized heading row over weeks of day cells.
 * @param props - open state, the trigger, the staged date, the pick and close callbacks, and row copy.
 * @returns the anchored panel while open, and nothing while closed.
 */
export function DatePicker({ open, anchorRef, value, onPick, onClose, t }) {
    const refs = useRef(new Map());
    const valueRef = useRef(value);
    valueRef.current = value;
    const [view, setView] = useState(() => viewOf(value));
    const today = new Date();
    const todayIso = isoOf({ year: today.getFullYear(), month: today.getMonth() }, today.getDate());
    // Opening returns to the stored day, so the grid starts where the row does.
    useEffect(() => {
        if (!open)
            return;
        setView(viewOf(valueRef.current));
    }, [open]);
    // The focused day owns the keyboard, and a pick leaves it on that day.
    useEffect(() => {
        if (!open)
            return;
        refs.current.get(String(view.day))?.focus();
    }, [open, view]);
    /**
     * Stage one day of the shown month and leave the keyboard on it.
     * @param day - day of the shown month.
     */
    const pick = (day) => {
        setView(current => ({ ...current, day }));
        onPick(isoOf(view, day));
    };
    /**
     * Move the focused cell inside the month, or stage the day it is on.
     * @param event - keydown from that cell.
     * @param day - day of the shown month the cell holds.
     */
    const onCellKeyDown = (event, day) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            pick(day);
            return;
        }
        const step = STEP_BY_KEY[event.key] ?? 0;
        if (step === 0)
            return;
        event.preventDefault();
        const last = daysIn(view);
        setView(current => ({ ...current, day: Math.min(Math.max(day + step, 1), last) }));
    };
    const first = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
    const offset = (first + 6) % 7;
    const total = daysIn(view);
    const cellCount = Math.ceil((offset + total) / 7) * 7;
    const weeks = Array.from({ length: cellCount / 7 }, (_value, week) => week);
    const monthTitle = new Intl.DateTimeFormat(t('time.locale'), {
        month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(Date.UTC(view.year, view.month, 1));
    return _jsxs(PickerPopover, { open: open, anchorRef: anchorRef, label: t('timing.date'), className: css.calendar, onClose: onClose, children: [_jsxs("div", { className: css.head, children: [_jsx("button", { type: "button", className: css.nav, "aria-label": t('timing.prevMonth'), onClick: () => { setView(current => shiftMonth(current, -1)); }, children: _jsx(IconChevronLeftOutlineRegular, {}) }), _jsx("span", { className: css.title, "aria-live": "polite", children: monthTitle }), _jsx("button", { type: "button", className: css.nav, "aria-label": t('timing.nextMonth'), onClick: () => { setView(current => shiftMonth(current, 1)); }, children: _jsx(IconChevronRightOutlineRegular, {}) })] }), _jsxs("div", { className: css.grid, role: "grid", "aria-label": monthTitle, children: [_jsx("div", { role: "row", className: css.week, children: WEEKDAY_KEYS.map(key => (_jsx("div", { role: "columnheader", className: css.weekday, children: t(key) }, key))) }), weeks.map(week => (_jsx("div", { role: "row", className: css.week, children: Array.from({ length: 7 }, (_value, column) => week * 7 + column - offset + 1).map(day => (day < 1 || day > total
                            ? _jsx("div", { role: "gridcell", "aria-hidden": "true", className: css.blank }, day)
                            : _jsx("div", { ref: (element) => {
                                    if (element === null)
                                        refs.current.delete(String(day));
                                    else
                                        refs.current.set(String(day), element);
                                }, role: "gridcell", "aria-selected": isoOf(view, day) === value, "aria-current": isoOf(view, day) === todayIso ? 'date' : undefined, tabIndex: day === view.day ? 0 : -1, className: clsx(css.cell, isoOf(view, day) === value && css.selected), onClick: () => { pick(day); }, onKeyDown: (event) => { onCellKeyDown(event, day); }, children: day }, day))) }, week)))] })] });
}
//# sourceMappingURL=DatePicker.js.map