import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Button: token-styled button atom. Variants map to the --dsw-alias-button-*
// fill families; no framework imports, all behavior via props.
import { forwardRef } from 'react';
import clsx from 'clsx';
import css from './Button.module.css';
/**
 * Render a button.
 * @param props.variant - visual family (default 'ghost').
 * @param props.size - 'md' 36px control with 12px corners or 'sm' 28px control with 8px corners.
 * @param props.icon - optional leading 16px icon node.
 * @param ref - native button for focus management and overlay anchors.
 * @returns the button element; native button attributes pass through.
 */
export const Button = forwardRef(function Button({ variant = 'ghost', size = 'md', icon, className, children, ...rest }, ref) {
    return (_jsxs("button", { ref: ref, type: "button", className: clsx(css.button, css[variant], css[size], className), ...rest, children: [icon != null && _jsx("span", { className: css.icon, children: icon }), children] }));
});
//# sourceMappingURL=Button.js.map