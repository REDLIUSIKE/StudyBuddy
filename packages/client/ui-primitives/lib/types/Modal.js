import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { IconCloseOutlineRegular } from "./icons/index.js";
import { useModalLayer } from "./useModalLayer.js";
import css from './Modal.module.css';
import { useSurfaceVisibility } from "./surface-visibility.js";
/**
 * Render a centered, body-portaled modal over a blurred page mask.
 * @param props.open - whether the dialog is showing.
 * @param props.onClose - application close command, Escape, or mask click; while a menu is open inside the
 * dialog, Escape belongs to that menu first.
 * @param props.title - dialog heading (aria-label in every mode).
 * @param props.closeLabel - localized accessible close-button label.
 * @param props.description - optional supporting sentence under the title.
 * @param props.children - dialog body; mark its initial-focus control with
 * data-modal-autofocus instead of React autoFocus to preserve return focus.
 * @param props.footer - action row (Cancel / Create).
 * @param props.contentClassName - optional class for a scrollable content region.
 * @param props.backdropBlur - disable when the caller already blurs the page; defaults to true.
 * @param props.shortcutModal - command scope allowed by shortcut owners; unnamed
 * dialogs block application commands unless their owner allows the "other" scope.
 * @param props.headless - render children directly in the card (no default
 * header/close/body chrome); mask, card, Escape, and aria-label remain.
 * @param props.onKeyDownCapture - handle a nested dialog's keys before the document Escape listeners.
 * @returns null when closed; otherwise the overlay tree.
 */
export function Modal({ open, onClose, title, closeLabel, description, children, footer, className, contentClassName, onKeyDownCapture, headless = false, backdropBlur = true, shortcutModal, }) {
    const dialog = useRef(null);
    const visible = useSurfaceVisibility();
    useModalLayer(dialog, open && visible, onClose);
    if (!open)
        return null;
    return createPortal((_jsxs("div", { className: css.root, role: "presentation", hidden: !visible, "aria-hidden": !visible, style: visible ? undefined : { display: 'none' }, onKeyDownCapture: onKeyDownCapture, children: [_jsx("div", { className: css.mask, style: backdropBlur ? undefined : { backdropFilter: 'none' }, "aria-hidden": "true", onClick: onClose }), _jsx("div", { ref: dialog, tabIndex: -1, "data-shortcut-modal": shortcutModal, className: clsx(css.dialog, className), role: "dialog", "aria-modal": visible ? true : undefined, "aria-label": title, children: headless
                    ? children
                    : (_jsxs(_Fragment, { children: [_jsxs("div", { className: clsx(css.content, contentClassName), children: [_jsxs("div", { className: css.header, children: [_jsx("h2", { className: css.title, children: title }), _jsx("button", { type: "button", className: css.close, "aria-label": closeLabel, onClick: onClose, children: _jsx(IconCloseOutlineRegular, { size: 14 }) })] }), description !== undefined && description !== '' && (_jsx("p", { className: css.description, children: description })), children !== undefined && _jsx("div", { className: css.body, children: children })] }), footer !== undefined && _jsx("div", { className: css.footer, children: footer })] })) })] })), document.body);
}
//# sourceMappingURL=Modal.js.map