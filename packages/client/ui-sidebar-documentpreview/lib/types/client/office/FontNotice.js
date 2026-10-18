import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Toolbar warning and non-modal details for the current preview’s missing fonts. */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Button, IconCloseOutlineRegular, IconWarningTriangleOutlineRegular, Tooltip, useAnchoredPosition, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import common from '../TextPreview.module.css';
import css from './FontNotice.module.css';
/**
 * Show a warning while fonts are unavailable for the current preview.
 * @param props - missing font families and localized copy.
 * @returns a warning button and its anchored details, or nothing when fonts are available.
 */
export function FontNotice({ fonts, t }) {
    const [expanded, setExpanded] = useState(false);
    const open = fonts.length > 0 && expanded;
    const anchor = useRef(null);
    const panel = useRef(null);
    const id = useId();
    const position = useAnchoredPosition({ open, anchorRef: anchor, panelRef: panel, gap: 8, margin: 12 });
    useDismissOnOutsidePointer(anchor, open, () => { setExpanded(false); }, panel);
    const closeDetails = () => {
        setExpanded(false);
        anchor.current?.querySelector('button')?.focus();
    };
    const positioned = position !== null;
    useLayoutEffect(() => {
        if (!open || !positioned)
            return;
        panel.current?.focus();
    }, [open, positioned]);
    if (fonts.length === 0)
        return null;
    const label = t('viewMissingFonts', { count: fonts.length });
    return _jsxs(_Fragment, { children: [_jsx(Tooltip, { label: label, side: "bottom", delayMs: 500, disabled: open, children: _jsx("span", { ref: anchor, className: css.anchor, "data-office-font-warning": true, children: _jsx("button", { type: "button", className: clsx(common.tool, css.warning), "aria-label": label, "aria-expanded": open, "aria-controls": open ? id : undefined, "aria-haspopup": "dialog", onClick: () => { setExpanded(value => !value); }, children: _jsx(IconWarningTriangleOutlineRegular, {}) }) }) }), open && createPortal(_jsxs("div", { ref: panel, id: id, role: "dialog", "aria-labelledby": `${id}-title`, "aria-describedby": `${id}-description`, tabIndex: -1, className: css.panel, style: { ...position, visibility: position === null ? 'hidden' : undefined }, onKeyDown: (event) => { if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closeDetails();
                } }, onBlur: (event) => {
                    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)
                        && !anchor.current?.contains(event.relatedTarget))
                        setExpanded(false);
                }, children: [_jsxs("div", { className: css.panelHeader, children: [_jsx("h3", { id: `${id}-title`, children: t('missingFontsTitle') }), _jsx(Button, { size: "sm", "aria-label": t('closeDetails'), onClick: closeDetails, icon: _jsx(IconCloseOutlineRegular, {}) })] }), _jsx("p", { id: `${id}-description`, className: css.description, children: t('missingFontsDescription') }), _jsx("p", { className: css.count, children: t('missingFontsCount', { count: fonts.length }) }), _jsx("ul", { className: css.fonts, children: fonts.map(font => _jsx("li", { children: font }, font)) })] }), document.body)] });
}
//# sourceMappingURL=FontNotice.js.map