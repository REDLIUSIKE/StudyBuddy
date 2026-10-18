import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Input: single-line text input atom (search boxes, inline forms). Multi-line
// inline edits use InlineEditor; the composer is owned by the conversation package.
import { forwardRef } from 'react';
import clsx from 'clsx';
import css from './Input.module.css';
/**
 * Render a text input with an optional leading icon.
 * @param props.icon - optional 16px leading icon node.
 * @param ref - the native input, cleared when it unmounts.
 * @returns wrapper span containing the native input; input attributes pass through.
 */
export const Input = forwardRef(function Input({ icon, className, ...rest }, ref) {
    return (_jsxs("span", { className: clsx(css.wrap, className), children: [icon != null && _jsx("span", { className: css.icon, children: icon }), _jsx("input", { ref: ref, className: css.input, ...rest })] }));
});
//# sourceMappingURL=Input.js.map