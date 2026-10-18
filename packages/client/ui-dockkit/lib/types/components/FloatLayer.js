import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The floating layer: one overlay panel per floating pane, bottom-to-top in the
 * model's z order. A floating pane hosts exactly one tab; its header is the
 * strip's row holding that tab's chip, never selectable or closable from the
 * chip, and the send-back and close controls. Pressing a panel's body raises it. Its grip
 * and corner report through their gesture instead: a press released in place is
 * a click and raises the panel; a drag records the move or resize, and that
 * operation raises the panel itself, so one gesture is one intent. Raising a
 * panel that is active and on top already changes nothing and reports nothing.
 *
 * The layer owns its own drag and resize gestures, so where it mounts is not
 * part of its contract: panels are positioned in viewport coordinates and read
 * only `state` and the outward contracts. An embedder may portal it anywhere,
 * and nothing here assumes the docked tree is an ancestor or even present.
 */
import { useState } from 'react';
import clsx from 'clsx';
import { IconCloseOutlineRegular, IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { FLOAT_MIN_SIZE } from "../engine/constraints.js";
import { movedRect, resizedRect } from "../engine/geometry.js";
import { floatRect, getPane, getTab, onlyTabId } from "../engine/tree.js";
import { useGesture } from "./pointer.js";
import { TabTitle } from "./TabTitle.js";
import css from './dockkit.module.css';
/** The rectangle a gesture has reached. */
function draggedRect(drag, x, y) {
    const dx = x - drag.originX;
    const dy = y - drag.originY;
    return drag.mode === 'move'
        ? movedRect(drag.rect, dx, dy)
        : resizedRect(drag.rect, dx, dy, FLOAT_MIN_SIZE);
}
/** Whether two rectangles agree in every coordinate. */
function sameRect(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
/** Whether a floating pane is already where a raise would put it: focused and on top. */
function raised(state, paneId) {
    return state.activePaneId === paneId && state.floats.at(-1) === paneId;
}
/**
 * Shared move/resize gestures; changing layout mode never owns the content DOM.
 * @param state - committed layout and float stacking order.
 * @param intents - gesture settlements.
 * @returns the current preview and focus/gesture callbacks.
 */
export function useFloatGestures(state, intents) {
    const [preview, setPreview] = useState(undefined);
    const begin = useGesture(() => { setPreview(undefined); });
    /** Focus and raise a panel from a press or click on it, unless it is raised already. */
    const raise = (paneId) => {
        if (raised(state, paneId))
            return;
        intents.focusPane(paneId);
    };
    /** Start a move or resize from a press on the panel's grip or corner; a release that moved nothing is a click. */
    const drag = (mode, paneId, event) => {
        // The press stops here: the panel's own press-to-focus would record a focus
        // entry before the drag's, and the release below decides which one it is.
        event.stopPropagation();
        const root = document.documentElement;
        const windows = root.hasAttribute('data-windows-titlebar');
        // Desktop publishes the caption height in pixels on the root's inline style.
        const caption = windows && !root.hasAttribute('data-fullscreen')
            ? Number.parseFloat(root.style.getPropertyValue('--dsh-windows-titlebar-height')) : 0;
        const saved = floatRect(getPane(state, paneId));
        const rect = { ...saved, y: Math.max(saved.y, windows ? caption + 20 : 0) };
        const start = { mode, originX: event.clientX, originY: event.clientY, rect };
        begin(event.currentTarget, event.pointerId, {
            move: (moved) => { setPreview({ paneId, rect: draggedRect(start, moved.clientX, moved.clientY) }); },
            up: (released) => {
                const rect = draggedRect(start, released.clientX, released.clientY);
                if (sameRect(rect, start.rect))
                    raise(paneId);
                else if (mode === 'move')
                    intents.moveFloat(paneId, rect.x, rect.y);
                else
                    intents.resizeFloat(paneId, rect);
            },
        });
    };
    return { preview, raise, drag };
}
/**
 * Header-only controls, usable above either retained or visibility-mounted bodies.
 * @param props - owning pane/tab, localized labels and gesture callbacks.
 * @returns the float header without a content container.
 */
export function FloatHeader({ paneId, tab, labels, intents, renderTabTitle, canCloseTab, drag }) {
    return (_jsxs("header", { className: clsx(css.tabStrip, css.floatHeader), "data-dockkit-float-grip": paneId, onPointerDown: (event) => { drag('move', paneId, event); }, children: [_jsx("div", { className: clsx(css.tab, css.floatTitle), "data-dockkit-float-title": true, children: _jsx(TabTitle, { children: renderTabTitle?.(tab) ?? tab.title }) }), _jsx("div", { className: css.stripFill }), _jsx(Tooltip, { label: labels.dockFloat, side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": labels.dockFloat, "data-dockkit-float-dock": paneId, onPointerDown: (event) => { event.stopPropagation(); }, onClick: () => { intents.unfloatPane(paneId); }, children: _jsx(IconPanelLeftOutlineRegular, { className: css.dockGlyph }) }) }), (canCloseTab?.(tab.id) ?? true) && (_jsx(Tooltip, { label: labels.closeTab, shortcutKeys: labels.closeTabKeys, side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.iconButton, "aria-label": labels.closeTab, "data-dockkit-float-close": paneId, onPointerDown: (event) => { event.stopPropagation(); }, onClick: () => { intents.closeTab(tab.id); }, children: _jsx(IconCloseOutlineRegular, {}) }) }))] }));
}
/** Every floating panel, in z order. */
export function FloatLayer({ state, intents, labels, renderTab, renderTabTitle, canCloseTab }) {
    const { preview, raise, drag } = useFloatGestures(state, intents);
    return (_jsx(_Fragment, { children: state.floats.map((paneId, depth) => {
            const pane = getPane(state, paneId);
            const tab = getTab(state, onlyTabId(pane));
            // A panel mid-gesture draws where the pointer has taken it and on top,
            // as the operation its release records will leave it.
            const lifted = preview?.paneId === paneId ? preview.rect : undefined;
            const live = lifted ?? floatRect(pane);
            return (_jsxs("div", { className: css.float, "data-dockkit-float": paneId, tabIndex: -1, "data-dockkit-float-active": state.activePaneId === paneId || undefined, style: {
                    left: live.x,
                    top: `max(var(--dsh-dockkit-float-top, 0px), ${live.y}px)`,
                    width: live.width,
                    height: live.height,
                    zIndex: lifted === undefined ? depth + 1 : state.floats.length + 1,
                }, onPointerDown: () => { raise(paneId); }, children: [_jsx(FloatHeader, { paneId, tab, labels, intents, renderTabTitle, canCloseTab, drag }), _jsx("div", { className: css.floatBody, children: renderTab(tab) }), _jsx("div", { className: css.floatResize, "data-dockkit-float-resize": paneId, onPointerDown: (event) => { drag('resize', paneId, event); } })] }, paneId));
        }) }));
}
//# sourceMappingURL=FloatLayer.js.map