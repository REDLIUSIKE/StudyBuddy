import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './LoadingIndicator.module.css';
/**
 * @param props - localized status label and compact inline placement for additional pages.
 * @returns a centered document loading status or an accessible inline spinner.
 */
export function LoadingIndicator({ label, inline = false }) {
    return _jsxs("span", { className: clsx(css.loading, inline && css.inline), role: "status", "aria-label": label, "data-document-loading": true, children: [_jsx(StateDot, { state: "ongoing", size: inline ? 14 : 28 }), !inline && _jsx("span", { children: label })] });
}
//# sourceMappingURL=LoadingIndicator.js.map