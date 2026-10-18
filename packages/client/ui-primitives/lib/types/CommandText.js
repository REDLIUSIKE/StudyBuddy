import { jsx as _jsx } from "react/jsx-runtime";
/** Selectable command text with keyboard access while horizontally overflowing. */
import { useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import css from './CommandText.module.css';
/**
 * Render command text without adding Tab stops for content that fits.
 * @param props - Text, localized scrollport name, and owner styling.
 * @returns A horizontal text scrollport, named and keyboard-focusable only when overflowing.
 */
export function CommandText({ text, label, className }) {
    const ref = useRef(null);
    const [overflow, setOverflow] = useState(false);
    useLayoutEffect(() => {
        const element = ref.current;
        /* v8 ignore next -- the span is rendered unconditionally. */
        if (element === null)
            return undefined;
        const measure = () => { setOverflow(element.scrollWidth > element.clientWidth); };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        observer?.observe(element);
        const fonts = 'fonts' in element.ownerDocument ? element.ownerDocument.fonts : undefined;
        fonts?.addEventListener('loadingdone', measure);
        return () => {
            observer?.disconnect();
            fonts?.removeEventListener('loadingdone', measure);
        };
    }, [text]);
    return (_jsx("span", { ref: ref, className: clsx(css.text, className), "data-command-text": true, tabIndex: overflow ? 0 : undefined, role: overflow ? 'group' : undefined, "aria-label": overflow ? label : undefined, children: text }));
}
//# sourceMappingURL=CommandText.js.map