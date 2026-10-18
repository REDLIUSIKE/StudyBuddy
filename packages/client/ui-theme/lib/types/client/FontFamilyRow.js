import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Font-family preference row rendered inside the font settings group, once
 * per font role: title + role description + a text field holding the
 * comma-separated family list. Blur or Enter normalizes and commits the list;
 * an empty field restores the built-in stack. The field shows the persisted
 * list and resets whenever that list changes.
 */
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { normalizeFontFamily } from "../theme-settings.js";
import rowCss from './FontSizeRow.module.css';
import css from './FontFamilyRow.module.css';
/**
 * Render one font-family row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function FontFamilyRow({ t, role, setFontFamily, useStore }) {
    const value = useStore(s => s.fontFamilies[role]);
    const title = t(`fontFamily.${role}.title`);
    const commit = (input) => {
        input.value = normalizeFontFamily(input.value);
        setFontFamily(input.value);
    };
    return (_jsxs("div", { className: rowCss.row, children: [_jsxs("div", { className: rowCss.rowText, children: [_jsx("div", { className: rowCss.title, children: title }), _jsx("div", { className: rowCss.desc, children: t(`fontFamily.${role}.description`) })] }), _jsx(Input, { className: css.field, defaultValue: value, placeholder: t('fontFamily.placeholder'), "aria-label": title, spellCheck: false, autoComplete: "off", onBlur: (event) => { commit(event.currentTarget); }, maxLength: 200, onKeyDown: (event) => {
                    // oxlint-disable-next-line typescript/no-deprecated -- Some IMEs report composition only through keyCode 229.
                    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                        return;
                    if (event.key === 'Enter')
                        event.currentTarget.blur();
                } }, value)] }));
}
//# sourceMappingURL=FontFamilyRow.js.map