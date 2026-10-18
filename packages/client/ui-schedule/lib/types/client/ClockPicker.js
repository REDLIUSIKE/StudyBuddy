import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Three-column clock picker for one staged Run time value.
 *
 * The picker owns only the panel: the row renders the read-only trigger that
 * shows the value, and its Escape guard closes the panel and hands focus back.
 */
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { secondPrecision } from "./task-timing.js";
import { PickerPopover } from "./PickerPopover.js";
import css from './ClockPicker.module.css';
/** Padded two-digit clock values from zero through `count - 1`. */
function padded(count) {
    return Array.from({ length: count }, (_value, index) => String(index).padStart(2, '0'));
}
/** The picker's columns in display order, each with the label row copy names it by. */
const COLUMNS = [
    { label: 'timing.hour', options: padded(24) },
    { label: 'timing.minute', options: padded(60) },
    { label: 'timing.second', options: padded(60) },
];
/** A whole-second clock, the only text a pick composes onto. */
const CLOCK_SECONDS = /^\d{2}:\d{2}:\d{2}$/;
/**
 * The `HH:MM:SS` clock a pick composes onto.
 *
 * A value that states no clock at all starts from midnight, so the first pick
 * still submits one complete clock rather than leaving a row empty.
 * @param value - staged clock text.
 * @returns its whole-second clock, or midnight when it states none.
 */
function clockBase(value) {
    const seconds = secondPrecision(value);
    return CLOCK_SECONDS.test(seconds) ? seconds : '00:00:00';
}
/** The picker's columns in display order, by position. */
const COLUMN_INDICES = [0, 1, 2];
/**
 * Index of one column's option for one clock.
 * @param clock - whole-second clock text.
 * @param column - column index in display order.
 * @returns that column's option index, or the first option for a value the column does not list.
 */
function columnIndex(clock, column) {
    const options = COLUMNS[column].options;
    const start = column === 0 ? 0 : column * 3;
    return Math.max(0, options.indexOf(clock.slice(start, start + 2)));
}
/**
 * Render the clock panel: hours, minutes, and optionally seconds, one scrolling column each.
 * @param props - open state, the trigger, the staged clock, the pick and close callbacks, the seconds-column switch, and row copy.
 * @returns the anchored panel while open, and nothing while closed.
 */
export function ClockPicker({ open, anchorRef, value, onPick, onClose, seconds = true, t }) {
    const columns = seconds ? COLUMNS : COLUMNS.slice(0, 2);
    const refs = useRef(new Map());
    const valueRef = useRef(value);
    valueRef.current = value;
    const base = clockBase(value);
    const picked = [base.slice(0, 2), base.slice(3, 5), base.slice(6, 8)];
    // Each column keeps one focusable entry: the row its own value occupies, so
    // the keyboard reaches minutes and seconds, and each column's arrows walk
    // from the value it shows. The live cursor adds the row the keyboard moved
    // onto while it stays inside that column.
    const columnIndices = COLUMN_INDICES.map(column => columnIndex(base, column));
    const [cursor, setCursor] = useState({ column: 0, index: columnIndex(base, 0) });
    // Opening starts on the clock the row shows, with every column scrolled to
    // that value: the first arrow key then walks from the current time in the
    // column the keyboard enters rather than from midnight.
    useEffect(() => {
        if (!open)
            return;
        setCursor({ column: 0, index: columnIndex(clockBase(valueRef.current), 0) });
        for (const column of COLUMN_INDICES) {
            refs.current.get(`${column}:${columnIndex(clockBase(valueRef.current), column)}`)
                ?.scrollIntoView({ block: 'nearest' });
        }
    }, [open]);
    // The cursor owns the keyboard: a pick, an arrow, or the open itself moves the
    // highlight and takes focus with it, so the panel keeps the keyboard until it
    // closes.
    useEffect(() => {
        if (!open)
            return;
        refs.current.get(`${cursor.column}:${cursor.index}`)?.focus();
    }, [open, cursor]);
    /**
     * Stage one option and move the cursor onto it.
     * @param column - column index the option belongs to.
     * @param option - padded option text.
     * @param index - option index inside that column.
     */
    const pick = (column, option, index) => {
        setCursor({ column, index });
        const next = [...picked];
        next[column] = option;
        onPick(next.join(':'));
    };
    /**
     * Move inside one column, move between columns, or stage the option the
     * keyboard is on.
     * @param event - keydown from that option.
     * @param column - column index the option belongs to.
     * @param index - option index inside that column.
     * @param option - padded option text.
     * @param count - number of options in the column.
     */
    const onOptionKeyDown = (event, column, index, option, count) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            pick(column, option, index);
            return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const next = columns[column + (event.key === 'ArrowRight' ? 1 : -1)];
            if (next === undefined)
                return;
            // Columns hold different counts, so the row carried across stays inside
            // the target column.
            const target = columns.indexOf(next);
            setCursor({ column: target, index: Math.min(index, next.options.length - 1) });
            return;
        }
        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setCursor({ column, index: event.key === 'Home' ? 0 : count - 1 });
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
            return;
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setCursor({ column, index: Math.min(Math.max(index + step, 0), count - 1) });
    };
    return _jsx(PickerPopover, { open: open, anchorRef: anchorRef, label: t('timing.time'), className: css.clock, onClose: onClose, children: columns.map((column, at) => (_jsx("div", { role: "listbox", "aria-label": t(column.label), className: css.column, children: column.options.map((option, index) => (_jsx("div", { ref: (element) => {
                    const key = `${at}:${index}`;
                    if (element === null)
                        refs.current.delete(key);
                    else
                        refs.current.set(key, element);
                }, role: "option", "aria-selected": option === picked[at], tabIndex: (cursor.column === at ? cursor.index : columnIndices[at]) === index ? 0 : -1, className: clsx(css.option, option === picked[at] && css.selected), onClick: () => { pick(at, option, index); }, onKeyDown: (event) => { onOptionKeyDown(event, at, index, option, column.options.length); }, children: option }, option))) }, column.label))) });
}
//# sourceMappingURL=ClockPicker.js.map