import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** A single-line file path whose trailing characters remain visible in narrow toolbars. */
import { useLayoutEffect, useRef } from 'react';
import clsx from 'clsx';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import css from './PathLabel.module.css';
/**
 * Render subdued directories and a primary filename, with the complete path on hover.
 * Fitting text is left-aligned; overflow clips and fades at the left edge.
 * The fade updates on path changes and, when ResizeObserver is available, size changes.
 * @param props - File path and attributes for its outer span; callers own toolbar spacing.
 * @returns the path label.
 */
export function PathLabel({ path, className, ...attributes }) {
    const boxRef = useRef(null);
    const textRef = useRef(null);
    const { directory, name } = pathPartsOf(path);
    useLayoutEffect(() => {
        // Both spans mount unconditionally before this layout effect runs.
        const outer = boxRef.current;
        const inner = textRef.current;
        const apply = () => {
            outer.toggleAttribute('data-path-clipped', inner.offsetWidth > outer.clientWidth);
        };
        apply();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
        observer?.observe(outer);
        observer?.observe(inner);
        return () => { observer?.disconnect(); };
    }, [path]);
    return (_jsx("span", { ...attributes, ref: boxRef, className: clsx(css.path, className), title: path, "data-path-label": true, children: _jsxs("span", { ref: textRef, className: css.text, children: [directory !== '' && _jsx("span", { className: css.directory, children: directory }), _jsx("span", { className: css.name, children: name })] }) }));
}
//# sourceMappingURL=PathLabel.js.map