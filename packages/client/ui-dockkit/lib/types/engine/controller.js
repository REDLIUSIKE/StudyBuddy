import { canSplit } from "./constraints.js";
import { createIdMinter, createInitialState } from "./initial.js";
import { activeDockPaneId as dockedActivePane, planAddTab, planDropTab, planDuplicateTab, planFloatTab, planOpenContent, planPlaceTab, planResizeSplit, planSetExpanded, planSetMode, planSplitPane, planUnfloatPane, } from "./planner.js";
import { Sequencer } from "./sequence.js";
/** One docking surface: history, interaction limits, and change notification. */
export class DockController {
    minter;
    sequencer;
    listeners = new Set();
    makePaneTab;
    snapshot;
    /** @param options - the tab factories this surface seeds panes with. */
    constructor(options = {}) {
        this.minter = createIdMinter();
        this.makePaneTab = options.makePaneTab;
        this.sequencer = new Sequencer(createInitialState(this.minter, options.makeInitialTab, options.mode));
        this.snapshot = this.buildSnapshot();
    }
    /**
     * Observe layout changes.
     * @param listener - called after every committed change.
     * @returns disposer removing the listener.
     */
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    /** Current snapshot; the same reference until the layout changes. */
    getSnapshot = () => this.snapshot;
    /** Recorded sequence, for tests and the operation readout. */
    get ops() {
        return this.sequencer.ops;
    }
    buildSnapshot() {
        const state = this.sequencer.state;
        return {
            state,
            canUndo: this.sequencer.canUndo,
            canRedo: this.sequencer.canRedo,
            canSplit: canSplit(state),
            opCount: this.sequencer.ops.length,
            cursor: this.sequencer.cursor,
        };
    }
    commit() {
        this.snapshot = this.buildSnapshot();
        for (const listener of [...this.listeners])
            listener();
    }
    get state() {
        return this.sequencer.state;
    }
    get mint() { return this.minter.next; }
    /**
     * Record a planned intent as one history entry.
     * @param ops - the planner's operations; empty plans nothing.
     * @returns whether anything was recorded.
     */
    run(ops) {
        if (ops.length === 0)
            return false;
        this.sequencer.dispatchAll(ops);
        this.commit();
        return true;
    }
    /**
     * Expand or collapse the docked area. Floating panels are unaffected.
     * @param expanded - whether the docked area is shown.
     */
    setExpanded(expanded) {
        this.run(planSetExpanded(this.state, expanded));
    }
    /** Flip the docked area between expanded and collapsed. */
    toggleExpanded() {
        this.setExpanded(!this.state.expanded);
    }
    /**
     * Switch how the docked area is presented.
     * @param mode - the presentation to record.
     */
    setMode(mode) {
        this.run(planSetMode(this.state, mode));
    }
    /**
     * Split a pane to its right and seat the embedder's pane tab in the new pane.
     * @param paneId - pane to split; defaults to the active docked pane.
     * @returns false when the docked grid is already at `MAX_DOCK_PANES`.
     */
    splitPane(paneId) {
        return this.run(planSplitPane(this.state, this.mint, paneId, this.makePaneTab));
    }
    /**
     * Seat the pane-tab factory's tab at the end of a pane's strip.
     * @param paneId - the docked pane whose strip asked.
     * @returns false when there is no factory or the pane is not docked.
     */
    addTab(paneId) {
        return this.run(planAddTab(this.state, this.mint, paneId, this.makePaneTab));
    }
    /**
     * Open content, or focus the tab already showing it.
     * @param input - consistency id, copy, and optional target pane.
     * @returns the tab now focused.
     */
    openContent(input) {
        const planned = planOpenContent(this.state, this.mint, input);
        this.run(planned.ops);
        return planned.tabId;
    }
    /**
     * Open a second, independent tab on the same content.
     * @param tabId - tab to copy.
     * @returns the new tab id.
     */
    duplicateTab(tabId) {
        const planned = planDuplicateTab(this.state, this.mint, tabId);
        this.run(planned.ops);
        return planned.tabId;
    }
    /**
     * Destroy a tab and its content state. A floating host panel goes with it.
     * @param tabId - the tab to close.
     */
    closeTab(tabId) {
        this.run([{ type: 'closeTab', tabId }]);
    }
    /**
     * Focus a tab, its pane, and raise that pane when it floats.
     * @param tabId - the tab to focus.
     */
    focusTab(tabId) {
        this.run([{ type: 'focusTab', tabId }]);
    }
    /**
     * Focus a pane, raising it when it floats.
     * @param paneId - the pane to focus.
     */
    focusPane(paneId) {
        this.run([{ type: 'focusPane', paneId }]);
    }
    /**
     * Move a tab inside its own pane.
     * @param tabId - the tab to move.
     * @param index - its position in the strip without it.
     */
    reorderTab(tabId, index) {
        this.run([{ type: 'reorderTab', tabId, index }]);
    }
    /**
     * Put a tab at an explicit slot: a reorder inside its own pane, otherwise a
     * move (or a return, when it currently floats).
     * @param tabId - the tab being placed.
     * @param toPaneId - destination docked pane.
     * @param index - caret slot in the destination strip, counting the dragged chip when the strip is its own.
     * @returns false when the placement changes nothing.
     */
    placeTab(tabId, toPaneId, index) {
        return this.run(planPlaceTab(this.state, tabId, toPaneId, index));
    }
    /**
     * Resolve a tab drop inside the docked area.
     * @param tabId - the dragged tab.
     * @param targetPaneId - pane under the pointer.
     * @param zone - dock region the pointer released in.
     * @returns false when the drop changes nothing or the grid is full.
     */
    dropTab(tabId, targetPaneId, zone) {
        return this.run(planDropTab(this.state, this.mint, tabId, targetPaneId, zone));
    }
    /**
     * Take a tab out into a floating panel.
     * @param tabId - tab to float.
     * @param rect - explicit rectangle; defaults to a cascade from the last panel.
     * @returns the new floating pane id.
     */
    floatTab(tabId, rect) {
        const planned = planFloatTab(this.state, this.mint, tabId, rect);
        this.run(planned.ops);
        return planned.paneId;
    }
    /**
     * Send a floating panel's tab back into the docked tree.
     * @param paneId - the floating pane.
     * @param toPaneId - destination docked pane; defaults to the active one.
     */
    unfloatPane(paneId, toPaneId) {
        this.run(planUnfloatPane(this.state, paneId, toPaneId));
    }
    /**
     * Record the net position of a floating-panel drag; the panel is focused and raised with it.
     * @param paneId - the floating pane.
     * @param x - its new left edge, in viewport pixels.
     * @param y - its new top edge, in viewport pixels.
     */
    moveFloat(paneId, x, y) {
        this.run([{ type: 'moveFloat', paneId, x, y }]);
    }
    /**
     * Record the net rectangle of a floating-panel resize; the panel is focused and raised with it.
     * @param paneId - the floating pane.
     * @param rect - its new rectangle.
     */
    resizeFloat(paneId, rect) {
        this.run([{ type: 'resizeFloat', paneId, rect }]);
    }
    /**
     * Record the net sizes of a divider drag, clamped to the pane minimum.
     * @param splitId - the split whose divider moved.
     * @param sizes - the fractions the drag reached.
     */
    resizeSplit(splitId, sizes) {
        this.run(planResizeSplit(splitId, sizes));
    }
    /**
     * Step back one intent, or one run of consecutive focus-only intents.
     * @returns false when there is nothing to undo.
     */
    undo() {
        if (!this.sequencer.undo())
            return false;
        this.commit();
        return true;
    }
    /**
     * Step forward over what the matching undo stepped back.
     * @returns false when there is nothing to redo.
     */
    redo() {
        if (!this.sequencer.redo())
            return false;
        this.commit();
        return true;
    }
    /**
     * The pane a new tab lands in, for an embedder that needs to name it.
     * @returns the active pane when docked, else the first docked pane.
     */
    activeDockPaneId() {
        return dockedActivePane(this.state);
    }
}
//# sourceMappingURL=controller.js.map