import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import clsx from 'clsx';
import { linesOf } from "./lines.js";
import css from '../TextPreview.module.css';
/** @param props - document contents and standard tab information. @returns source lines with navigation targets. */
export function TextBody({ content, useTabInfo }) {
    const { tab } = useTabInfo();
    const params = tab.navigation.params;
    const target = params !== undefined && 'line' in params ? params.line : undefined;
    if (content.kind !== 'text')
        return null;
    return (_jsx("div", { className: css.textDocument, "data-textpreview-plain": true, children: content.pages.map(page => (_jsx("pre", { className: css.page, "data-textpreview-page": page.offset, children: linesOf(page).map((text, index) => {
                const number = page.offset + index;
                return (_jsxs("div", { className: clsx(css.line, number === target && css.lineTarget), "data-textpreview-line": number, ...number === target ? { 'data-textpreview-target': number } : {}, children: [text, '\n'] }, number));
            }) }, page.offset))) }));
}
//# sourceMappingURL=TextBody.js.map