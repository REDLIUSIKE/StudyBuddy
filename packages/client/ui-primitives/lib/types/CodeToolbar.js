import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Shared language, wrapping, and clipboard controls for code cards. */
import { IconCheckOutlineRegular, IconCopyOutlineRegular, IconNowrapFillRegular, IconWrapFillRegular, } from "./icons/index.js";
import { Tooltip } from "./Tooltip.js";
import { supportsHighlighting } from "./markdown/highlight.js";
import css from './CodeCard.module.css';
/**
 * Render a language label and keyboard-accessible icon actions with tooltips.
 * @param props - Localized labels, current state, and card-owned actions.
 * @returns The shared code-card header.
 */
export function CodeToolbar({ lang, title, status, labels, copyLabel, copiedLabel, copied, wrapped, onCopy, onWrap }) {
    const wrapLabel = wrapped ? labels.unwrapLabel : labels.wrapLabel;
    const clipboardLabel = copied ? copiedLabel : copyLabel;
    return (_jsxs("div", { className: css.header, "data-code-block-banner": true, children: [_jsxs("div", { className: css.heading, children: [_jsx("span", { className: css.language, children: supportsHighlighting(lang) ? lang : labels.codeLabel }), title !== undefined && _jsx("span", { className: css.title, title: title, children: title })] }), _jsxs("div", { className: css.actions, children: [status !== undefined && _jsx("span", { className: css.status, children: status }), onWrap !== undefined && _jsx(Tooltip, { label: wrapLabel, side: "top", portal: true, children: _jsx("button", { type: "button", className: css.action, "aria-label": labels.wrapLabel, "aria-pressed": wrapped, onClick: onWrap, children: wrapped ? _jsx(IconNowrapFillRegular, { size: 14 }) : _jsx(IconWrapFillRegular, { size: 14 }) }) }), onCopy !== undefined && _jsx(Tooltip, { label: clipboardLabel, side: "top", portal: true, children: _jsx("button", { type: "button", className: css.action, "aria-label": clipboardLabel, onClick: onCopy, children: copied ? _jsx(IconCheckOutlineRegular, { size: 14 }) : _jsx(IconCopyOutlineRegular, { size: 14 }) }) })] })] }));
}
//# sourceMappingURL=CodeToolbar.js.map