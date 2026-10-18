import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Font-size preference row: title + role description + stepper pill (centered value; hover
 * reveals the up/down arrow column anchored to the pill's right edge) + a px
 * unit label after the pill. The text row is registered into the General
 * section item slot; the code and terminal rows render inside the font
 * settings group. The displayed value follows the persisted setting, never the
 * click echo.
 */
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { FONT_SIZE_SPECS } from "../theme-settings.js";
import css from './FontSizeRow.module.css';
/**
 * Render the font-size row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function FontSizeRow({ t, role, setFontSize, useStore, expander }) {
    const fontSize = useStore(s => s.fontSizes[role]);
    const { min, max } = FONT_SIZE_SPECS[role];
    return (_jsxs("div", { className: css.row, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.title, children: t(`fontSize.${role}.title`) }), _jsx("div", { className: css.desc, children: t(`fontSize.${role}.description`) })] }), _jsxs("div", { className: css.control, children: [_jsxs("div", { className: css.stepper, children: [_jsx("span", { className: css.value, children: fontSize }), _jsxs("span", { className: css.arrows, children: [_jsx("button", { type: "button", className: css.arrow, "aria-label": t(`fontSize.${role}.increase`), disabled: fontSize >= max, onClick: () => { setFontSize(fontSize + 1); }, children: _jsx(IconChevronUpOutlineRegular, { size: 9 }) }), _jsx("button", { type: "button", className: css.arrow, "aria-label": t(`fontSize.${role}.decrease`), disabled: fontSize <= min, onClick: () => { setFontSize(fontSize - 1); }, children: _jsx(IconChevronDownOutlineRegular, { size: 9 }) })] })] }), _jsx("span", { className: css.unit, children: t('fontSize.unit') }), expander !== undefined && (_jsx("button", { type: "button", className: css.expander, "aria-label": t('fontSize.more'), title: t('fontSize.more'), "aria-expanded": expander.open, "aria-controls": expander.controls, onClick: expander.onToggle, children: _jsx(IconChevronDownOutlineRegular, { size: 12 }) }))] })] }));
}
//# sourceMappingURL=FontSizeRow.js.map