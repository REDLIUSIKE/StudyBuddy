import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Floating controls shared by every zoomable document renderer. */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Button, IconChevronDownOutlineRegular, IconPlusOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { MAX_FIXED_ZOOM, MIN_FIXED_ZOOM, ZOOM_OPTIONS, ZOOM_STEP } from "./types.js";
import css from './ZoomControls.module.css';
function steppedZoom(zoom, direction) {
    const step = direction === -1 ? Math.ceil(zoom / ZOOM_STEP) - 1 : Math.floor(zoom / ZOOM_STEP) + 1;
    return Math.min(MAX_FIXED_ZOOM, Math.max(MIN_FIXED_ZOOM, step * ZOOM_STEP));
}
/**
 * Present fit-width, fixed presets, and incremental controls.
 * @param props - current resolved zoom, preference mode, labels, and callbacks.
 * @returns a localized zoom toolbar.
 */
export const ZoomControls = forwardRef(function ZoomControls({ zoom, fitWidth, labels, visible, onZoom, onFitWidth, onActiveChange }, ref) {
    const [displayZoom, setDisplayZoom] = useState(zoom);
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    useImperativeHandle(ref, () => ({ showZoom: setDisplayZoom }), []);
    useEffect(() => { onActiveChange(open || hovered || focused); }, [focused, hovered, onActiveChange, open]);
    const items = [
        { id: 'fit-width', label: labels.fitWidth },
        { type: 'separator', id: 'fit-scale' },
        ...ZOOM_OPTIONS.map(value => ({ id: String(value), label: labels.value(value * 100) })),
    ];
    const selectedId = fitWidth ? 'fit-width'
        : ZOOM_OPTIONS.includes(displayZoom) ? String(displayZoom) : undefined;
    return _jsxs("div", { className: `${css.panel} ${visible ? css.visible : ''}`, role: "toolbar", "aria-label": labels.controls, "data-document-zoom-controls": true, "data-document-zoom-visible": visible || undefined, onPointerEnter: () => { setHovered(true); }, onPointerLeave: () => { setHovered(false); }, onFocusCapture: () => { setFocused(true); }, onBlurCapture: () => { setFocused(false); }, children: [_jsx(Tooltip, { label: labels.out, side: "top", children: _jsx("span", { className: css.controlAnchor, children: _jsx(Button, { size: "sm", className: css.zoomButton, "aria-label": labels.out, disabled: displayZoom <= MIN_FIXED_ZOOM, onMouseDown: (event) => { event.preventDefault(); }, onClick: () => { onZoom(steppedZoom(displayZoom, -1)); }, children: _jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": "true", children: _jsx("path", { d: "M2 8h12", fill: "none", stroke: "currentColor", strokeWidth: "1.5" }) }) }) }) }), _jsx(Menu, { open: open, side: "top", align: "start", portal: true, compact: true, listClassName: css.zoomMenu, anchor: _jsxs(Button, { size: "sm", className: css.percent, "aria-label": labels.menu, "aria-expanded": open, onMouseDown: (event) => { event.preventDefault(); }, onClick: () => { setOpen(value => !value); }, children: [_jsx("span", { children: labels.value(Math.round(displayZoom * 100)) }), _jsx(IconChevronDownOutlineRegular, { size: 12 })] }), items: items, selectedId: selectedId, onClose: () => { setOpen(false); }, onSelect: (selected) => {
                    setOpen(false);
                    if (selected === 'fit-width')
                        onFitWidth();
                    else
                        onZoom(Number(selected));
                } }), _jsx(Tooltip, { label: labels.into, side: "top", children: _jsx("span", { className: css.controlAnchor, children: _jsx(Button, { size: "sm", className: css.zoomButton, "aria-label": labels.into, disabled: displayZoom >= MAX_FIXED_ZOOM, onMouseDown: (event) => { event.preventDefault(); }, onClick: () => { onZoom(steppedZoom(displayZoom, 1)); }, children: _jsx(IconPlusOutlineRegular, { size: 14 }) }) }) })] });
});
//# sourceMappingURL=ZoomControls.js.map