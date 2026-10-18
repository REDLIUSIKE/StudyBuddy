import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Locally resizable raw-data panel; pointer capture owns the drag lifetime. */
import { useId, useRef, useState } from 'react';
import css from './inspector.module.css';
function clampPercent(value) { return Math.max(15, Math.min(80, value)); }
/**
 * Resize the raw-data area from its upper edge while keeping the table visible.
 * @param props - Complete raw text, localized labels, and close callback.
 * @returns Detail text with a pointer- and keyboard-operated horizontal separator.
 */
export function InspectorDetails({ text, failed, children, close, t }) {
    const id = useId();
    const panel = useRef(null);
    const drag = useRef(null);
    const [percent, setPercent] = useState(40);
    const resize = (event) => {
        const current = drag.current;
        if (current === null || current.pointerId !== event.pointerId)
            return;
        setPercent(clampPercent((current.height + current.y - event.clientY) / current.available * 100));
    };
    const stop = (event) => {
        if (drag.current?.pointerId !== event.pointerId)
            return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
    };
    return _jsxs("div", { ref: panel, id: id, className: css.details, style: { flexBasis: `${percent}%` }, children: [_jsx("div", { role: "separator", tabIndex: 0, "aria-orientation": "horizontal", "aria-controls": id, "aria-label": t('table.resizeDetails'), "aria-valuemin": 15, "aria-valuemax": 80, "aria-valuenow": Math.round(percent), className: css.detailsResize, onPointerDown: (event) => {
                    if (event.button !== 0 || drag.current !== null)
                        return;
                    const element = panel.current;
                    const available = element?.parentElement?.getBoundingClientRect().height ?? 0;
                    if (element === null || available === 0)
                        return;
                    event.preventDefault();
                    drag.current = { pointerId: event.pointerId, y: event.clientY, height: element.getBoundingClientRect().height, available };
                    event.currentTarget.setPointerCapture(event.pointerId);
                }, onPointerMove: resize, onPointerUp: (event) => { resize(event); stop(event); }, onPointerCancel: stop, onLostPointerCapture: () => { drag.current = null; }, onKeyDown: (event) => {
                    switch (event.key) {
                        case 'ArrowUp':
                            setPercent(value => clampPercent(value + 5));
                            break;
                        case 'ArrowDown':
                            setPercent(value => clampPercent(value - 5));
                            break;
                        case 'Home':
                            setPercent(15);
                            break;
                        case 'End':
                            setPercent(80);
                            break;
                        default: return;
                    }
                    event.preventDefault();
                } }), _jsxs("div", { className: css.toolbar, children: [_jsx("span", { children: t('table.raw') }), _jsx("button", { type: "button", onClick: close, children: t('table.close') })] }), children === undefined ? _jsx("pre", { role: failed ? 'alert' : undefined, children: text })
                : _jsx("div", { className: css.objectDetails, children: children })] });
}
//# sourceMappingURL=InspectorDetails.js.map