import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Font settings registered into the General section item slot: the text
 * font-size row, whose disclosure button expands a region holding the font
 * row for each role and the code and terminal size rows. The region starts
 * collapsed on every mount.
 */
import { useId, useState } from 'react';
import { FontFamilyRow } from "./FontFamilyRow.js";
import { FontSizeRow } from "./FontSizeRow.js";
import css from './FontSettingsGroup.module.css';
/**
 * Render the text font-size row and its expandable font settings.
 * @param props - composed slot props.
 * @returns the text size row and, when expanded, the font rows.
 */
export function FontSettingsGroup({ setFontFamily, setFontSize, ...shared }) {
    const [open, setOpen] = useState(false);
    const regionId = useId();
    const family = (role) => (_jsx(FontFamilyRow, { ...shared, role: role, setFontFamily: (value) => { setFontFamily(role, value); } }));
    const size = (role, expander) => (_jsx(FontSizeRow, { ...shared, role: role, expander: expander, setFontSize: (px) => { setFontSize(role, px); } }));
    return (_jsxs("div", { className: css.group, children: [size('text', { open, controls: regionId, onToggle: () => { setOpen(value => !value); } }), open && (_jsxs("div", { id: regionId, children: [family('text'), family('code'), size('code'), family('terminal'), size('terminal')] }))] }));
}
//# sourceMappingURL=FontSettingsGroup.js.map