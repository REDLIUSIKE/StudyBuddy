/**
 * Intent planning: each interaction, as a pure function from the current state to
 * the operations that carry it out.
 *
 * Planners mint the ids their operations create and enforce the interaction
 * limits, but they hold no state and apply nothing. That split is what lets the
 * same intent vocabulary serve two embeddings — a `DockController` that keeps the
 * state itself, and a host store that keeps it and only needs the operations —
 * without either one reimplementing `openContent`'s identity lookup, `dropTab`'s
 * region resolution, or the floating cascade.
 *
 * A planner returning no operations means the intent changes nothing; the caller
 * records nothing and notifies nobody.
 */
import type { DockMode, DockZone, FloatRect, LayoutOp, LayoutState, PaneId, SplitId, TabId } from '../contract/types.ts';
import type { TabFactory } from './initial.ts';
/** Mints ids for the operations a planner produces: the one place a string becomes an id. */
export interface Mint {
    (prefix: 'tab'): TabId;
    (prefix: 'pane' | 'float'): PaneId;
    (prefix: 'split'): SplitId;
}
/** Where a new tab should go and what it should say. */
export interface OpenContentInput {
    /** Consistency id: with `kind`, the identity opening twice focuses instead of adding to. */
    readonly contentId: string;
    readonly title: string;
    readonly kind: string;
    /** Target pane; defaults to the active docked pane. */
    readonly paneId?: PaneId;
    /** Strip slot in the target pane; defaults to its end. */
    readonly index?: number;
    /**
     * Whether a tab already showing this (kind, contentId) is focused instead of
     * a second one being opened. Defaults to `true`.
     */
    readonly revealIfOpened?: boolean;
}
/** An intent that both acts and names the tab it settled on. */
export interface PlannedTab {
    readonly ops: readonly LayoutOp[];
    /** The tab the intent focused or created. */
    readonly tabId: TabId;
}
/**
 * First tab in one pane carrying `contentId`, in strip order.
 * @param state - current layout.
 * @param paneId - the pane to search, docked or floating.
 * @param contentId - the content identity.
 * @param kind - restrict to tabs of this kind; omit to match any kind.
 * @returns the tab, or `undefined` when that pane shows no such content.
 */
export declare function findPaneContentTab(state: LayoutState, paneId: PaneId, contentId: string, kind?: string): TabId | undefined;
/**
 * First tab carrying `contentId`, searched docked panes first, in visual order.
 * @param state - current layout.
 * @param contentId - the content identity.
 * @param kind - restrict to tabs of this kind; omit to match any kind.
 * @returns the tab, or `undefined` when nothing shows the content.
 */
export declare function findContentTab(state: LayoutState, contentId: string, kind?: string): TabId | undefined;
/**
 * The pane a new tab lands in.
 * @param state - current layout.
 * @returns the active pane when docked, else the first docked pane.
 */
export declare function activeDockPaneId(state: LayoutState): PaneId;
/**
 * Expand or collapse the docked area.
 * @param state - current layout.
 * @param expanded - whether the docked area is shown.
 * @returns the operation, or none when the value is already current.
 */
export declare function planSetExpanded(state: LayoutState, expanded: boolean): readonly LayoutOp[];
/**
 * Switch the presentation.
 * @param state - current layout.
 * @param mode - the presentation to record.
 * @returns the operation, or none when the value is already current.
 */
export declare function planSetMode(state: LayoutState, mode: DockMode): readonly LayoutOp[];
/**
 * Split a pane to its right and seed the new pane.
 * @param state - current layout.
 * @param mint - id source for the pane, split, and seeded tab.
 * @param paneId - pane to split; defaults to the active docked pane.
 * @param makePaneTab - builds the seeded tab; omit to leave the new pane empty.
 * @returns the operations, or none when the pane budget is spent.
 */
export declare function planSplitPane(state: LayoutState, mint: Mint, paneId?: PaneId, makePaneTab?: TabFactory): readonly LayoutOp[];
/**
 * Seat the embedder's seeded tab at the end of a docked pane's strip.
 * @param state - current layout.
 * @param mint - id source for the new tab.
 * @param paneId - the pane whose strip asked; must be docked.
 * @param makeTab - builds the seeded tab; omit to plan nothing.
 * @returns the operations, or none when there is nothing to seat.
 */
export declare function planAddTab(state: LayoutState, mint: Mint, paneId: PaneId, makeTab?: TabFactory): readonly LayoutOp[];
/**
 * Open content, or focus the tab already showing it.
 * @param state - current layout.
 * @param mint - id source for a newly opened tab.
 * @param input - identity, copy, and optional placement.
 * @returns the operations plus the tab they settle on.
 */
export declare function planOpenContent(state: LayoutState, mint: Mint, input: OpenContentInput): PlannedTab;
/**
 * Open a second, independent tab on the same content, beside the original.
 * @param state - current layout.
 * @param mint - id source for the copy.
 * @param tabId - tab to copy.
 * @returns the operations plus the new tab's id.
 */
export declare function planDuplicateTab(state: LayoutState, mint: Mint, tabId: TabId): PlannedTab;
/**
 * Put a tab at an explicit strip slot: a reorder inside its own pane, otherwise a
 * move, or a return when it currently floats.
 * @param state - current layout.
 * @param tabId - the tab being placed.
 * @param toPaneId - destination docked pane.
 * @param index - caret slot in the destination strip, counted over the chips as
 *   drawn — the dragged chip included when the destination is its own pane, so
 *   the slot just before or just after it is where it already sits.
 * @returns the operations, or none when the placement changes nothing.
 */
export declare function planPlaceTab(state: LayoutState, tabId: TabId, toPaneId: PaneId, index: number): readonly LayoutOp[];
/**
 * Resolve a tab release on a pane body: the centre moves the tab in, an edge
 * splits the pane and seats the tab in the new half. A pane's only tab released
 * on that pane's centre changes nothing; released on its edge it splits, and
 * the factory's tab backfills the pane the drag would otherwise empty — without
 * a factory that release also changes nothing, since the split would empty the
 * pane and seat the tab beside where it already was.
 * @param state - current layout.
 * @param mint - id source for a pane an edge release creates.
 * @param tabId - the dragged tab.
 * @param targetPaneId - pane under the pointer.
 * @param zone - dock region the pointer released in.
 * @param makeTab - builds the tab that backfills a pane its only tab splits away from.
 * @returns the operations, or none when the release changes nothing.
 */
export declare function planDropTab(state: LayoutState, mint: Mint, tabId: TabId, targetPaneId: PaneId, zone: DockZone, makeTab?: TabFactory): readonly LayoutOp[];
/**
 * Take a tab out into a floating panel.
 * @param state - current layout.
 * @param mint - id source for the floating pane.
 * @param tabId - tab to float.
 * @param rect - explicit rectangle; defaults to a cascade from the last panel.
 * @returns the operations plus the floating pane's id.
 */
export declare function planFloatTab(state: LayoutState, mint: Mint, tabId: TabId, rect?: FloatRect): {
    readonly ops: readonly LayoutOp[];
    readonly paneId: PaneId;
};
/**
 * Send a floating panel's tab back into the docked tree.
 * @param state - current layout.
 * @param paneId - the floating pane.
 * @param toPaneId - destination docked pane; defaults to the active one.
 * @returns the operations.
 */
export declare function planUnfloatPane(state: LayoutState, paneId: PaneId, toPaneId?: PaneId): readonly LayoutOp[];
/**
 * Record the net sizes of a divider drag, clamped to the pane minimum.
 * @param splitId - the split whose divider moved.
 * @param sizes - the fractions the drag reached.
 * @param minimum - smallest pane share; defaults to the kit's fraction.
 * @returns the resize operation.
 */
export declare function planResizeSplit(splitId: SplitId, sizes: readonly number[], minimum?: number): readonly LayoutOp[];
/**
 * Keep the docked area populated after an intent: drop every docked pane the
 * intent left empty, and when the surviving root pane is itself empty, seed it.
 *
 * A pane empties when its last tab is closed, moved out, or floated; each such
 * pane is merged away, innermost first, until none remains. The root pane cannot
 * be merged, so it is reseeded instead — with the factory's tab, or left empty
 * when the embedder supplies none. The returned operations continue the intent
 * they follow, so a caller records both as one entry.
 * @param state - the layout after the intent's own operations.
 * @param mint - id source for the reseeded tab.
 * @param makeTab - builds the tab an emptied root pane is reseeded with.
 * @returns the follow-up operations, or none when every docked pane holds a tab.
 */
export declare function planSettle(state: LayoutState, mint: Mint, makeTab?: TabFactory): readonly LayoutOp[];
//# sourceMappingURL=planner.d.ts.map