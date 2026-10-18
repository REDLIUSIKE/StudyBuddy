/**
 * Interaction limits and dock geometry. The model itself is unbounded; these
 * are the V1 rules the interaction layer enforces before it dispatches, kept
 * pure so they can be asserted without a browser.
 */
import type { DockZone, LayoutState, SplitAxis, SplitDirection } from '../contract/types.ts';
/** V1 caps the docked grid at four panes; floating panes do not count. */
export declare const MAX_DOCK_PANES = 4;
/** Smallest fraction a divider drag may leave a pane, as a share of its split. */
export declare const MIN_PANE_FRACTION = 0.12;
/** Size a tab takes when it first floats, in CSS pixels. */
export declare const FLOAT_DEFAULT_SIZE: {
    readonly width: 380;
    readonly height: 300;
};
/** Smallest size a floating panel may be resized to, in CSS pixels. */
export declare const FLOAT_MIN_SIZE: {
    readonly width: 220;
    readonly height: 140;
};
/** Fraction of a pane's width or height that counts as its dock edge. */
export declare const DOCK_EDGE_FRACTION = 0.25;
/**
 * Number of docked panes.
 * @param state - current layout.
 * @returns how many panes the docked tree holds; floating panes do not count.
 */
export declare function dockPaneCount(state: LayoutState): number;
/**
 * Whether another docked pane is allowed.
 * @param state - current layout.
 * @returns whether the docked tree is under `MAX_DOCK_PANES`.
 */
export declare function canSplit(state: LayoutState): boolean;
/** The five dock regions a tab can be dropped on. */
export declare const DOCK_ZONES: readonly DockZone[];
/**
 * Which dock region a pointer sits in.
 * @param x - pointer x as a fraction of pane width.
 * @param y - pointer y as a fraction of pane height.
 * @param edge - edge band width as a fraction; defaults to `DOCK_EDGE_FRACTION`.
 * @returns the closest edge when the pointer is inside its band, else `'center'`.
 */
export declare function zoneAt(x: number, y: number, edge?: number): DockZone;
/**
 * How a dock region splits the pane it targets.
 * @param zone - the region the pointer released in.
 * @returns the split's axis and direction, or `undefined` for `'center'`, which moves the tab into the pane instead.
 */
export declare function zoneSplit(zone: DockZone): {
    axis: SplitAxis;
    direction: SplitDirection;
} | undefined;
/**
 * Clamp divider sizes so no pane falls under `MIN_PANE_FRACTION`.
 * @param sizes - candidate fractions from the drag preview.
 * @param minimum - smallest allowed share; defaults to the kit's pane fraction.
 * @returns fractions summing to 1 with every entry at or above the minimum.
 */
export declare function clampSizes(sizes: readonly number[], minimum?: number): number[];
//# sourceMappingURL=constraints.d.ts.map