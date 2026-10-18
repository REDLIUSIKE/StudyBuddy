import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IconCheckOutlineRegular, IconRefreshOutlineRegular } from "./icons/index.js";
import { StateDot } from "./StateDot.js";
import css from './ConnectionIndicator.module.css';
/** Exit-transition length; keep equal to the `.leaving` transition duration in the stylesheet. */
const EXIT_MS = 150;
/**
 * Render an inline connection-recovery control. The outage and retry-attempt
 * states are one button whose static label already names the retry action;
 * clicking it requests an immediate reconnect. The indicator animates in on
 * appearance and fades out for {@link EXIT_MS} before unmounting.
 * @param props.state - visible outage, retry-attempt, or recovered state.
 * @param props.disconnectedLabel - localized outage text naming the retry action.
 * @param props.connectingLabel - localized retry text followed by the attempt dots.
 * @param props.recoveredLabel - localized recovery confirmation.
 * @param props.reconnectActionLabel - accessible label for the outage action.
 * @param props.restartActionLabel - accessible label for replacing an active attempt.
 * @param props.onReconnect - request an immediate reconnect attempt.
 * @returns the indicator, or null when no connection feedback is active.
 */
export function ConnectionIndicator({ state, disconnectedLabel, connectingLabel, recoveredLabel, reconnectActionLabel, restartActionLabel, onReconnect, }) {
    const [rendered, setRendered] = useState(state);
    const leaving = state === undefined && rendered !== undefined;
    useEffect(() => {
        if (state !== undefined) {
            setRendered(state);
            return;
        }
        if (rendered === undefined)
            return;
        const timeout = window.setTimeout(() => { setRendered(undefined); }, EXIT_MS);
        return () => { window.clearTimeout(timeout); };
    }, [state, rendered]);
    if (rendered === undefined)
        return null;
    const leavingClass = leaving ? ` ${css.leaving}` : '';
    if (rendered === 'recovered') {
        return (_jsxs("div", { className: `${css.indicator} ${css.success}${leavingClass}`, role: "status", "aria-label": recoveredLabel, children: [_jsx("span", { className: css.icon, "aria-hidden": "true", children: _jsx(IconCheckOutlineRegular, { size: 14 }) }), _jsx("span", { className: css.label, children: recoveredLabel })] }));
    }
    const connecting = rendered === 'connecting';
    return (_jsxs("button", { type: "button", className: `${css.indicator} ${css.warning}${leavingClass}`, "data-phase": rendered, "aria-label": connecting ? restartActionLabel : reconnectActionLabel, onClick: onReconnect, children: [_jsx("span", { className: css.icon, "aria-hidden": "true", children: connecting
                    ? _jsx(StateDot, { state: "ongoing" })
                    : _jsx(IconRefreshOutlineRegular, { size: 14 }) }), _jsx("span", { className: css.label, children: connecting
                    ? (_jsxs(_Fragment, { children: [connectingLabel, _jsxs("span", { className: css.dots, "aria-hidden": "true", children: [_jsx("span", { children: "." }), _jsx("span", { className: css.secondDot, children: "." }), _jsx("span", { className: css.thirdDot, children: "." })] })] }))
                    : disconnectedLabel })] }));
}
//# sourceMappingURL=ConnectionIndicator.js.map