import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import css from './StateDot.module.css';
import { IconCheckOutlineRegular } from "./icons/index.js";
/**
 * Pin the loader's CSS animations to document time zero. A CSS animation starts
 * when its element is inserted and restarts when the element is moved or shown
 * again, so loaders started at different moments rotate out of phase; one shared
 * start time keeps every visible loader in step. Mount pins the first start; the
 * element's own `animationstart` listener pins each restart.
 * @param element - the mounted loader, or null on unmount.
 */
function syncSpinner(element) {
    if (element === null)
        return;
    pinSpinner(element);
    element.addEventListener('animationstart', () => { pinSpinner(element); });
}
/**
 * Set every CSS animation in the loader's subtree to start at document time zero.
 * @param element - the mounted loader.
 */
function pinSpinner(element) {
    // jsdom (the unit lane) implements no Web Animations despite lib.dom's
    // non-optional typing; the optional call leaves that lane unsynced.
    const spinner = element;
    for (const animation of spinner.getAnimations?.({ subtree: true }) ?? [])
        animation.startTime = 0;
}
/**
 * Render a state dot.
 * @param props.state - which of `done`, `warning`, `ongoing`, `error`, or `idle` to show.
 * @param props.size - outer diameter in px; defaults to 14 for ongoing and 10 for solid states.
 * @param props.className - extra class for layout placement.
 * @param props.appearance - compact dot by default; step uses a filled check or hollow pending circle.
 * @returns the dot element (aria-hidden; pair with text for accessibility).
 */
export function StateDot({ state, size, className, appearance = 'dot' }) {
    const edge = size ?? (state === 'ongoing' ? 14 : 10);
    if (state === 'ongoing') {
        return (_jsx("svg", { ref: syncSpinner, className: clsx(css.spinner, className), "data-state": "ongoing", width: edge, height: edge, viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsxs("g", { className: css.spinnerMotion, children: [_jsx("circle", { className: css.spinnerTrack, cx: "12", cy: "12", r: "9.5" }), _jsx("circle", { className: css.spinnerArc, cx: "12", cy: "12", r: "9.5" })] }) }));
    }
    return (_jsx("span", { className: clsx(appearance === 'step' ? css.step : css.dot, className), "data-state": state, style: { width: edge, height: edge }, "aria-hidden": "true", children: appearance === 'step' && state === 'done' && _jsx(IconCheckOutlineRegular, { size: edge - 2 }) }));
}
//# sourceMappingURL=StateDot.js.map