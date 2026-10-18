import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { Pill } from "./Pill.js";
import css from './SegmentedTabs.module.css';
/**
 * Render equal-width, controlled tabs with a sliding selection indicator.
 * @param props.items - non-empty ordered tabs with unique values and DOM ids.
 * @param props.value - selected value, which must belong to items.
 * @param props.onChange - selection requested by click, Left/Right, or Home/End.
 * Keyboard selection also moves focus; only the selected tab is a tab stop.
 * @param props.label - localized accessible name for the tab list.
 * @param props.className - layout placement; panels remain caller-owned.
 * @returns the tab list, without its panels.
 */
export function SegmentedTabs({ items, value, onChange, label, className }) {
    const selectedIndex = items.findIndex(item => item.value === value);
    const onKeyDown = (event, index) => {
        let next;
        switch (event.key) {
            case 'ArrowLeft':
                next = (index + items.length - 1) % items.length;
                break;
            case 'ArrowRight':
                next = (index + 1) % items.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = items.length - 1;
                break;
            default: return;
        }
        event.preventDefault();
        event.stopPropagation();
        const tablist = event.currentTarget.parentElement;
        const nextItem = items[next];
        /* v8 ignore next -- the event comes from a mounted direct child and next is bounded by non-empty items. */
        if (tablist === null || nextItem === undefined)
            return;
        tablist.querySelectorAll('[role="tab"]').item(next).focus();
        onChange(nextItem.value);
    };
    return (_jsxs("div", { role: "tablist", "aria-label": label, className: clsx(css.tabs, className), style: { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }, children: [_jsx("span", { className: css.indicator, "aria-hidden": "true", style: { width: `calc((100% - 8px) / ${items.length})`, transform: `translateX(${selectedIndex * 100}%)` } }), items.map((item, index) => (_jsx(Pill, { id: item.id, role: "tab", className: css.tab, "aria-selected": value === item.value, "aria-controls": item.panelId, tabIndex: value === item.value ? 0 : -1, onClick: () => { onChange(item.value); }, onKeyDown: (event) => { onKeyDown(event, index); }, children: item.label }, item.value)))] }));
}
//# sourceMappingURL=SegmentedTabs.js.map