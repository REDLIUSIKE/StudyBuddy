import { jsx as _jsx } from "react/jsx-runtime";
/**
 * The docked surface: the split tree plus the tab and divider gestures over it.
 * This is the whole kit as far as an embedder's layout column is concerned —
 * chrome around it (a rail, a header, a collapsed state) belongs to the embedder.
 *
 * A gesture only previews until it ends, then leaves through one intent, so the
 * embedder's operation sequence stays the single source of truth. Releasing a tab
 * clear of this surface floats it; releasing inside it but on no pane is not a
 * move at all.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampSizes, FLOAT_DEFAULT_SIZE, MIN_PANE_FRACTION } from "../engine/constraints.js";
import { getSplit, topRightPaneId } from "../engine/tree.js";
import { containsPoint, dividerSizes, floatRectAt, insertionIndex, passedThreshold, zoneInRect, } from "../engine/geometry.js";
import { fitOf, measurePaneFits, paneElements, sameFits } from "./measure.js";
import { useGesture } from "./pointer.js";
import { PaneTree } from "./PaneTree.js";
import { TabLayout } from "./TabLayout.js";
import css from './dockkit.module.css';
const NO_PREVIEW = { draggingTabId: undefined, dropTarget: undefined, sizes: undefined };
/** Nothing measured yet: every pane fits until a reading says otherwise. */
const NO_FITS = new Map();
/** The default policy for the omitted callbacks: every pane offers the add control, every tab its close. */
const ALWAYS = () => true;
/**
 * Resolve where a pointer sits inside the docked surface. An edge zone is only
 * offered where the split it would make is allowed: within the pane budget and
 * with room for two halves; otherwise the release is not a move at all.
 */
function hitTest(root, x, y, canSplit, fits, dropZones) {
    for (const [paneId, pane] of paneElements(root)) {
        const rect = pane.getBoundingClientRect();
        if (!containsPoint(rect, x, y))
            continue;
        const strip = pane.querySelector('[data-dockkit-strip]');
        if (strip !== null && containsPoint(strip.getBoundingClientRect(), x, y)) {
            const tabs = [...strip.querySelectorAll('[data-dockkit-tab]')];
            return { kind: 'strip', paneId, index: insertionIndex(tabs.map(tab => tab.getBoundingClientRect()), x) };
        }
        const zone = dropZones === 'horizontal'
            ? canSplit && fitOf(fits, paneId).row
                ? x < rect.x + rect.width / 2 ? 'left' : 'right'
                : 'center'
            : zoneInRect(rect, x, y);
        if (zone !== 'center') {
            const fit = fitOf(fits, paneId);
            const room = zone === 'left' || zone === 'right' ? fit.row : fit.column;
            if (!canSplit || !room)
                return undefined;
        }
        return { kind: 'zone', paneId, zone };
    }
    return undefined;
}
/** Fractions a divider drag has reached, clamped to the pane minimum. */
function draggedSizes(drag, x, y, minimum) {
    const moved = (drag.axis === 'row' ? x : y) - drag.origin;
    const delta = drag.extent > 0 ? moved / drag.extent : 0;
    return clampSizes(dividerSizes(drag.sizes, drag.index, delta), minimum);
}
/** Fractions closer than this are the same split: renormalizing recorded sizes moves them by no more. */
const SIZE_TOLERANCE = 1e-9;
/** Whether two fraction lists describe the same split. */
function sameSizes(a, b) {
    return a.length === b.length && a.every((size, index) => {
        const other = b[index];
        return other !== undefined && Math.abs(size - other) < SIZE_TOLERANCE;
    });
}
/** The split tree and the gestures over it. */
function Surface({ state, canSplit, canAddTab, canCloseTab, intents, labels, renderTab, renderTabTitle, renderTabMenuItems, chrome, onRoom, draw, dropZones = 'edges', minPaneFraction = MIN_PANE_FRACTION, hideSplitWhenBlocked = false, }) {
    const surface = useRef(null);
    const [preview, setPreview] = useState(NO_PREVIEW);
    const [fits, setFits] = useState(NO_FITS);
    const begin = useGesture(() => { setPreview(NO_PREVIEW); });
    /** Run `use` on the surface element, which every commit and every press inside it has mounted. */
    const withSurface = useCallback((use) => {
        const root = surface.current;
        /* v8 ignore next -- ref-null guard: the surface div renders unconditionally. */
        if (root === null)
            return;
        use(root);
    }, []);
    // The room rule reads pixels, which the layout state does not carry: measure
    // after every commit (a split, a divider drag, a closed tab all move panes)
    // and whenever the surface itself is resized (the embedder's column dragged
    // wider or narrower). A reading that changed nothing renders nothing.
    const remeasure = useCallback(() => {
        withSurface((root) => {
            const next = measurePaneFits(root, hideSplitWhenBlocked);
            setFits(current => sameFits(current, next) ? current : next);
        });
    }, [withSurface, hideSplitWhenBlocked]);
    useLayoutEffect(() => { remeasure(); });
    useEffect(() => { onRoom?.(fits); }, [fits, onRoom]);
    useEffect(() => {
        const root = surface.current;
        if (root === null || typeof ResizeObserver === 'undefined')
            return undefined;
        const observer = new ResizeObserver(() => { remeasure(); });
        observer.observe(root);
        return () => { observer.disconnect(); };
    }, [remeasure]);
    /** Why a pane cannot split right now: the budget first, then its own width. */
    const splitBlock = (paneId) => {
        if (!canSplit)
            return 'budget';
        return fitOf(fits, paneId).row ? undefined : 'width';
    };
    const callbacks = {
        onFocusTab: intents.focusTab.bind(intents),
        onFocusPane: intents.focusPane.bind(intents),
        onSplitPane: intents.splitPane.bind(intents),
        onAddTab: intents.addTab.bind(intents),
        onCloseTab: intents.closeTab.bind(intents),
        // A press is not yet a drag: the chip lifts, and the drop preview follows,
        // once the pointer has travelled the threshold. A release before that is a
        // click and reports nothing here.
        onTabPressed: (tabId, event) => {
            withSurface((root) => {
                const startX = event.clientX;
                const startY = event.clientY;
                let dragging = false;
                begin(event.currentTarget, event.pointerId, {
                    move: (moved) => {
                        if (!dragging) {
                            if (!passedThreshold(startX, startY, moved.clientX, moved.clientY))
                                return;
                            dragging = true;
                        }
                        setPreview({
                            ...NO_PREVIEW,
                            draggingTabId: tabId,
                            dropTarget: hitTest(root, moved.clientX, moved.clientY, canSplit, fits, dropZones),
                        });
                    },
                    up: (released) => {
                        if (!dragging)
                            return;
                        const target = hitTest(root, released.clientX, released.clientY, canSplit, fits, dropZones);
                        if (target === undefined) {
                            if (containsPoint(root.getBoundingClientRect(), released.clientX, released.clientY))
                                return;
                            intents.floatTab(tabId, floatRectAt(released.clientX, released.clientY, FLOAT_DEFAULT_SIZE));
                            return;
                        }
                        if (target.kind === 'strip')
                            intents.placeTab(tabId, target.paneId, target.index);
                        else
                            intents.dropTab(tabId, target.paneId, target.zone);
                    },
                });
            });
        },
        onDividerPressed: (splitId, index, event) => {
            const container = event.currentTarget.parentElement;
            /* v8 ignore next -- a divider is rendered as a child of its split's element. */
            if (container === null)
                return;
            const split = getSplit(state, splitId);
            const box = container.getBoundingClientRect();
            const drag = {
                splitId,
                index,
                axis: split.axis,
                origin: split.axis === 'row' ? event.clientX : event.clientY,
                extent: split.axis === 'row' ? box.width : box.height,
                sizes: split.sizes,
            };
            // A release that left the fractions where they were — a click on the
            // divider, a drag returned to its start, or one pushed further into the
            // clamp — is not a resize and reports nothing.
            begin(event.currentTarget, event.pointerId, {
                move: (moved) => {
                    setPreview({ ...NO_PREVIEW, sizes: { splitId, sizes: draggedSizes(drag, moved.clientX, moved.clientY, minPaneFraction) } });
                },
                up: (released) => {
                    const sizes = draggedSizes(drag, released.clientX, released.clientY, minPaneFraction);
                    if (sameSizes(sizes, drag.sizes))
                        return;
                    intents.resizeSplit(splitId, sizes);
                },
            });
        },
        splitBlock,
        hideSplitWhenBlocked,
        canAddTab: canAddTab ?? ALWAYS,
        canCloseTab: canCloseTab ?? ALWAYS,
        dropTarget: preview.dropTarget,
        horizontalDrops: dropZones === 'horizontal',
        draggingTabId: preview.draggingTabId,
        labels,
        renderTab,
        renderTabTitle,
        renderTabMenuItems,
        chromePaneId: topRightPaneId(state),
        chrome,
    };
    return (_jsx("div", { className: css.surface, ref: surface, "data-dockkit-surface": true, "data-dockkit-drop-zones": dropZones, children: draw(callbacks, preview.sizes) }));
}
/** Recursive docked layout; floating content is rendered separately by FloatLayer. */
export function DockSurface(props) {
    return _jsx(Surface, { ...props, draw: (callbacks, preview) => _jsx(PaneTree, { state: props.state, nodeId: props.state.rootId, callbacks: callbacks, preview: preview }) });
}
/**
 * Render one pane or two horizontal panes, and their floats, in one stable content tree.
 * @param props - layout, gestures and lazy body-retention policy.
 * @returns the layout; the containing ancestors must not clip or establish a fixed-position containing block.
 */
export function DockLayout(props) {
    return _jsx(Surface, { ...props, draw: (callbacks, preview) => _jsx(TabLayout, { ...props, callbacks: callbacks, preview: preview }) });
}
//# sourceMappingURL=DockSurface.js.map