import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Text activity animation shared by a row and its nested text fragments. */
import { createContext, memo, useContext } from 'react';
import clsx from 'clsx';
import css from './TextShimmer.module.css';
const DecorativeCopy = createContext(undefined);
function TextContent({ children, className }) {
    const decorative = useContext(DecorativeCopy);
    const generated = decorative === true && typeof children === 'string';
    return (_jsx("span", { className: clsx(css.text, className), "data-shimmer-text": generated ? children : undefined, children: generated ? null : children }));
}
/**
 * Render text with one shared highlight while retaining selectable, accessible content.
 * Nested instances inherit the outer animation. Keep icons outside; mark decorative
 * separators with data-shimmer-decoration so their background follows the highlight.
 * Active children also render in an inert, clipped decoration; supply only presentation.
 * @param props - localized text, running state, and owner styling.
 * @returns retained text and its optional decorative highlight.
 */
export const TextShimmer = memo(function TextShimmer({ children, active = false, className, contentClassName }) {
    const decorative = useContext(DecorativeCopy);
    if (decorative !== undefined)
        return _jsx(TextContent, { className: className, children: children });
    const content = typeof children === 'string' ? _jsx(TextContent, { children: children }) : children;
    return (_jsxs("span", { className: clsx(css.root, className), "data-shimmer": active || undefined, children: [_jsx(DecorativeCopy.Provider, { value: false, children: _jsx("span", { className: clsx(css.content, contentClassName), children: content }) }), active && (_jsx("span", { className: css.decoration, "aria-hidden": "true", inert: '', children: _jsx("span", { className: css.sweep, children: _jsx(DecorativeCopy.Provider, { value: true, children: _jsx("span", { className: clsx(css.content, css.highlight, contentClassName), children: content }) }) }) }))] }));
});
//# sourceMappingURL=TextShimmer.js.map