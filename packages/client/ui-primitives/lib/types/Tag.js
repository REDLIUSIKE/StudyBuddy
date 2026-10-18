import { jsx as _jsx } from "react/jsx-runtime";
import clsx from 'clsx';
import css from './Tag.module.css';
/**
 * Render a read-only tag.
 * @param props.tone - which palette to use (default `outline`).
 * @param props.className - extra class for layout placement.
 * @param props.children - the localized label, owned by the render site.
 * @returns the tag element.
 */
export function Tag({ tone = 'outline', className, children }) {
    return _jsx("span", { className: clsx(css.tag, className), "data-tone": tone, children: children });
}
//# sourceMappingURL=Tag.js.map