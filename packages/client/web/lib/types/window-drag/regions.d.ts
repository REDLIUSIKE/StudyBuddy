/**
 * The window drag-region contract for the macOS desktop shell: Electron hands
 * the page's `-webkit-app-region` boxes to the native window, which hit-tests
 * them by geometry in DOM order, ignoring stacking. The property does not inherit:
 * Blink collects one box per element whose own computed value is not `none`,
 * skipping subtrees that are not visible, and the window applies them in that
 * order: `drag` adds geometry, `no-drag` removes it. The composition is therefore
 * equivalent to "the last matching box decides" — a point is draggable when the
 * last collected box containing it is `drag`.
 *
 * This module is the executable statement of that rule. Production CSS authors
 * the boxes; tests and the browser coverage scenario both decide points through
 * this module so a claim about coverage has one meaning.
 */
/**
 * One collected app-region box, in DOM order.
 *
 * Coordinates are viewport CSS pixels, the space `getBoundingClientRect`
 * reports, so collection and composition never rescale.
 */
export interface RegionRect {
    /** Left edge, viewport CSS pixels. */
    readonly x: number;
    /** Top edge, viewport CSS pixels. */
    readonly y: number;
    /** Box width in CSS pixels. */
    readonly width: number;
    /** Box height in CSS pixels. */
    readonly height: number;
    /** Whether this box declares `drag` (true) or `no-drag` (false). */
    readonly draggable: boolean;
}
/**
 * The attribute a chrome row puts on the element that owns its window drag.
 * ui-web `base.css` turns the mark into the one darwin drag rule, so the row's
 * own box is the window's draggable geometry.
 */
export declare const DRAG_MARK = "data-window-drag";
/**
 * The attribute the shell sets for one frame to make Electron recollect the
 * window's drag rects (electron#32341). While it is set, ui-web `base.css`
 * subtracts the marked box; the row marks inside it still declare drag and win in
 * document order, so the mark's only effect is that app-region values changed.
 */
export declare const RECALL_MARK = "data-window-drag-recall";
/**
 * The interactive-element selector that subtracts a control from any drag row it
 * overlaps. ui-web `base.css` declares it for the darwin platform; this constant
 * is the single source both that sheet and its contract spec compare against, so
 * the two cannot drift.
 */
export declare const INTERACTIVE_SELECTOR: string;
/**
 * Whether a box contains a viewport point. Edges belong to the box, matching
 * the half-open rectangles the window hit test uses.
 * @param rect - the collected box.
 * @param x - viewport x in CSS pixels.
 * @param y - viewport y in CSS pixels.
 * @returns true when the point lies inside the box.
 */
export declare function containsPoint(rect: RegionRect, x: number, y: number): boolean;
/**
 * Decide whether the window would drag when pressed at a point.
 * @param regions - collected boxes in DOM order.
 * @param x - viewport x in CSS pixels.
 * @param y - viewport y in CSS pixels.
 * @returns true when the last box containing the point is a drag box; false
 * when it is a no-drag box or no box contains the point.
 */
export declare function isDraggableAt(regions: readonly RegionRect[], x: number, y: number): boolean;
//# sourceMappingURL=regions.d.ts.map