/**
 * A docking layout kit: a split tree of tabbed panes with invertible operations,
 * and the React components that render and drive it.
 *
 * Two layers, and the boundary between them is the point of the package. The
 * engine (`applyOp`, `Sequencer`, `DockController`) is pure TypeScript with no
 * React, no DOM, and no host concepts; replaying a recorded sequence over the
 * same initial state reproduces the same tree, because every operation carries
 * the ids it creates. The components render a layout snapshot and report settled
 * intents — one per gesture, never a drag frame — so the embedder's sequence
 * stays the single source of truth.
 *
 * Nothing host-specific lives here: rendered strings arrive as `DockLabels`, tab
 * bodies as a `TabRenderer`, and a tab's `kind` is an opaque string this kit
 * never interprets.
 *
 * @module
 */
export { applyOp, replay } from "./engine/operations.js";
export { canStepBack, canStepForward, EMPTY_HISTORY, isFocusOp, record, recordedOps, Sequencer, stepBack, stepForward, } from "./engine/sequence.js";
export { dockPaneIds, findParent, findTabPane, getNode, getPane, getSplit, getTab, topRightPaneId, } from "./engine/tree.js";
// Interaction limits and geometry.
export { canSplit, clampSizes, DOCK_EDGE_FRACTION, DOCK_ZONES, dockPaneCount, FLOAT_DEFAULT_SIZE, FLOAT_MIN_SIZE, MAX_DOCK_PANES, MIN_PANE_FRACTION, zoneAt, zoneSplit, } from "./engine/constraints.js";
export { containsPoint, dividerSizes, DRAG_THRESHOLD, floatRectAt, halvesFit, insertionIndex, movedRect, passedThreshold, resizedRect, SPLIT_MINIMUMS, zoneInRect, } from "./engine/geometry.js";
// Intent planning: the shared decisions, as pure functions.
export { activeDockPaneId, findContentTab, findPaneContentTab, planAddTab, planDropTab, planDuplicateTab, planFloatTab, planOpenContent, planPlaceTab, planResizeSplit, planSetExpanded, planSetMode, planSettle, planSplitPane, planUnfloatPane, } from "./engine/planner.js";
// The intent layer's stateful embedding, and its seeds.
export { DockController } from "./engine/controller.js";
export { createIdMinter, createInitialState } from "./engine/initial.js";
// React surface.
export { DockSurface } from "./components/DockSurface.js";
export { FloatLayer } from "./components/FloatLayer.js";
export { DockLayout } from "./components/DockSurface.js";
//# sourceMappingURL=index.js.map