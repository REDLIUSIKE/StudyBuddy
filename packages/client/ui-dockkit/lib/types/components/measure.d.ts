/**
 * DOM side of the room rule: read each docked pane's rectangles after a commit
 * and ask `halvesFit` whether a split would leave two working halves. Pixels
 * live here and in `geometry.ts`; the engine's planners never see them.
 */
import type { PaneId } from '../contract/types.ts';
import type { HalvesFit } from '../engine/geometry.ts';
/**
 * Every docked pane element under `root`, in document order, with the pane id
 * each carries.
 * @param root - the docked surface's element.
 * @returns pane ids paired with their elements.
 */
export declare function paneElements(root: HTMLElement): readonly (readonly [PaneId, HTMLElement])[];
/**
 * Measure every docked pane under `root`.
 * @param root - the docked surface's element.
 * @param splitHiddenWhenBlocked - whether the embedder hides blocked split
 * controls (`hideSplitWhenBlocked`); the room rule then leaves the control's
 * footprint out of each strip's fixed part, so the reading cannot flip with
 * the control's visibility (see `PaneMeasure.splitControlWidth`).
 * @returns each pane's fit, keyed by pane id.
 */
export declare function measurePaneFits(root: HTMLElement, splitHiddenWhenBlocked?: boolean): ReadonlyMap<PaneId, HalvesFit>;
/**
 * One pane's latest reading. A pane the map does not name has not been
 * measured and fits: the rule only blocks on a positive reading.
 * @param fits - the latest measurement.
 * @param paneId - the pane asked about.
 * @returns whether each split axis leaves two working halves.
 */
export declare function fitOf(fits: ReadonlyMap<PaneId, HalvesFit>, paneId: PaneId): HalvesFit;
/**
 * Whether two measurements agree, so a re-measure that changed nothing re-renders nothing.
 * @param a - one measurement.
 * @param b - the other.
 * @returns whether both name the same panes with the same readings.
 */
export declare function sameFits(a: ReadonlyMap<PaneId, HalvesFit>, b: ReadonlyMap<PaneId, HalvesFit>): boolean;
//# sourceMappingURL=measure.d.ts.map