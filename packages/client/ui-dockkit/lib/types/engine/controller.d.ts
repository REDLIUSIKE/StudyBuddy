/**
 * The intent layer's stateful embedding: one controller per docking surface,
 * React-free, and itself the observable source the UI subscribes to
 * (`subscribe` + `getSnapshot`, whose reference only changes when the layout
 * does).
 *
 * Every method here is a planner call plus recording plus one notification. The
 * decisions live in `planner.ts` so an embedder holding its layout in an external
 * store shares them rather than reimplementing them; a planner that returns no
 * operations records nothing and notifies nobody.
 *
 * The controller holds no host concepts: what a seeded tab contains arrives as a
 * factory, and a tab's `kind` is an opaque string.
 */
import type { DockMode, DockZone, FloatRect, LayoutOp, LayoutState, PaneId, SplitId, TabId } from '../contract/types.ts';
import { type TabFactory } from './initial.ts';
import { type OpenContentInput } from './planner.ts';
export type { OpenContentInput } from './planner.ts';
/** Everything the rendering layer reads, in one immutable value. */
export interface DockSnapshot {
    readonly state: LayoutState;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    /** Whether the docked grid still has room for another pane. */
    readonly canSplit: boolean;
    /** Recorded operation count, redo branch included. */
    readonly opCount: number;
    /** How many recorded intents are applied. */
    readonly cursor: number;
}
/** What the embedder seeds new panes with. */
export interface DockControllerOptions {
    /** Builds the tab the starting pane holds; omit to start empty. */
    readonly makeInitialTab?: TabFactory;
    /** Builds the tab a pane created by `splitPane` holds; omit to leave it empty. */
    readonly makePaneTab?: TabFactory;
    /** Starting presentation; defaults to `push`. */
    readonly mode?: DockMode;
}
/** One docking surface: history, interaction limits, and change notification. */
export declare class DockController {
    private readonly minter;
    private readonly sequencer;
    private readonly listeners;
    private readonly makePaneTab;
    private snapshot;
    /** @param options - the tab factories this surface seeds panes with. */
    constructor(options?: DockControllerOptions);
    /**
     * Observe layout changes.
     * @param listener - called after every committed change.
     * @returns disposer removing the listener.
     */
    subscribe: (listener: () => void) => (() => void);
    /** Current snapshot; the same reference until the layout changes. */
    getSnapshot: () => DockSnapshot;
    /** Recorded sequence, for tests and the operation readout. */
    get ops(): readonly LayoutOp[];
    private buildSnapshot;
    private commit;
    private get state();
    private get mint();
    /**
     * Record a planned intent as one history entry.
     * @param ops - the planner's operations; empty plans nothing.
     * @returns whether anything was recorded.
     */
    private run;
    /**
     * Expand or collapse the docked area. Floating panels are unaffected.
     * @param expanded - whether the docked area is shown.
     */
    setExpanded(expanded: boolean): void;
    /** Flip the docked area between expanded and collapsed. */
    toggleExpanded(): void;
    /**
     * Switch how the docked area is presented.
     * @param mode - the presentation to record.
     */
    setMode(mode: DockMode): void;
    /**
     * Split a pane to its right and seat the embedder's pane tab in the new pane.
     * @param paneId - pane to split; defaults to the active docked pane.
     * @returns false when the docked grid is already at `MAX_DOCK_PANES`.
     */
    splitPane(paneId?: PaneId): boolean;
    /**
     * Seat the pane-tab factory's tab at the end of a pane's strip.
     * @param paneId - the docked pane whose strip asked.
     * @returns false when there is no factory or the pane is not docked.
     */
    addTab(paneId: PaneId): boolean;
    /**
     * Open content, or focus the tab already showing it.
     * @param input - consistency id, copy, and optional target pane.
     * @returns the tab now focused.
     */
    openContent(input: OpenContentInput): TabId;
    /**
     * Open a second, independent tab on the same content.
     * @param tabId - tab to copy.
     * @returns the new tab id.
     */
    duplicateTab(tabId: TabId): TabId;
    /**
     * Destroy a tab and its content state. A floating host panel goes with it.
     * @param tabId - the tab to close.
     */
    closeTab(tabId: TabId): void;
    /**
     * Focus a tab, its pane, and raise that pane when it floats.
     * @param tabId - the tab to focus.
     */
    focusTab(tabId: TabId): void;
    /**
     * Focus a pane, raising it when it floats.
     * @param paneId - the pane to focus.
     */
    focusPane(paneId: PaneId): void;
    /**
     * Move a tab inside its own pane.
     * @param tabId - the tab to move.
     * @param index - its position in the strip without it.
     */
    reorderTab(tabId: TabId, index: number): void;
    /**
     * Put a tab at an explicit slot: a reorder inside its own pane, otherwise a
     * move (or a return, when it currently floats).
     * @param tabId - the tab being placed.
     * @param toPaneId - destination docked pane.
     * @param index - caret slot in the destination strip, counting the dragged chip when the strip is its own.
     * @returns false when the placement changes nothing.
     */
    placeTab(tabId: TabId, toPaneId: PaneId, index: number): boolean;
    /**
     * Resolve a tab drop inside the docked area.
     * @param tabId - the dragged tab.
     * @param targetPaneId - pane under the pointer.
     * @param zone - dock region the pointer released in.
     * @returns false when the drop changes nothing or the grid is full.
     */
    dropTab(tabId: TabId, targetPaneId: PaneId, zone: DockZone): boolean;
    /**
     * Take a tab out into a floating panel.
     * @param tabId - tab to float.
     * @param rect - explicit rectangle; defaults to a cascade from the last panel.
     * @returns the new floating pane id.
     */
    floatTab(tabId: TabId, rect?: FloatRect): PaneId;
    /**
     * Send a floating panel's tab back into the docked tree.
     * @param paneId - the floating pane.
     * @param toPaneId - destination docked pane; defaults to the active one.
     */
    unfloatPane(paneId: PaneId, toPaneId?: PaneId): void;
    /**
     * Record the net position of a floating-panel drag; the panel is focused and raised with it.
     * @param paneId - the floating pane.
     * @param x - its new left edge, in viewport pixels.
     * @param y - its new top edge, in viewport pixels.
     */
    moveFloat(paneId: PaneId, x: number, y: number): void;
    /**
     * Record the net rectangle of a floating-panel resize; the panel is focused and raised with it.
     * @param paneId - the floating pane.
     * @param rect - its new rectangle.
     */
    resizeFloat(paneId: PaneId, rect: FloatRect): void;
    /**
     * Record the net sizes of a divider drag, clamped to the pane minimum.
     * @param splitId - the split whose divider moved.
     * @param sizes - the fractions the drag reached.
     */
    resizeSplit(splitId: SplitId, sizes: readonly number[]): void;
    /**
     * Step back one intent, or one run of consecutive focus-only intents.
     * @returns false when there is nothing to undo.
     */
    undo(): boolean;
    /**
     * Step forward over what the matching undo stepped back.
     * @returns false when there is nothing to redo.
     */
    redo(): boolean;
    /**
     * The pane a new tab lands in, for an embedder that needs to name it.
     * @returns the active pane when docked, else the first docked pane.
     */
    activeDockPaneId(): PaneId;
}
//# sourceMappingURL=controller.d.ts.map