/**
 * Pure tree helpers over `LayoutState`. Every reader throws on a dangling id
 * (the operation vocabulary is closed, so a miss is a caller defect), and every
 * writer returns a new state that keeps untouched nodes at their old identity.
 */
import type { FloatRect, LayoutNode, LayoutState, NodeId, PaneId, PaneNode, SplitNode, TabId, TabRecord } from '../contract/types.ts';
/**
 * Reject an unhandled discriminant at the end of a closed switch.
 * @param value - the discriminant the switch did not handle.
 * @param what - the union being switched on, for the message.
 * @returns never; it throws.
 */
export declare function assertNever(value: never, what: string): never;
/**
 * Read any node.
 * @param state - current layout.
 * @param id - the node.
 * @returns the split or pane.
 * @throws when `id` is not in the tree.
 */
export declare function getNode(state: LayoutState, id: NodeId): LayoutNode;
/**
 * Read a pane.
 * @param state - current layout.
 * @param id - the pane.
 * @returns the pane node.
 * @throws when `id` is missing or names a split.
 */
export declare function getPane(state: LayoutState, id: NodeId): PaneNode;
/**
 * Read a split.
 * @param state - current layout.
 * @param id - the split.
 * @returns the split node.
 * @throws when `id` is missing or names a pane.
 */
export declare function getSplit(state: LayoutState, id: NodeId): SplitNode;
/**
 * Read a tab record.
 * @param state - current layout.
 * @param id - the tab.
 * @returns the record.
 * @throws when `id` is not open.
 */
export declare function getTab(state: LayoutState, id: TabId): TabRecord;
/**
 * A floating pane's rectangle.
 * @param pane - the pane.
 * @returns its viewport rectangle.
 * @throws when `pane` is docked.
 */
export declare function floatRect(pane: PaneNode): FloatRect;
/**
 * A floating pane's position in the z order.
 * @param state - current layout.
 * @param id - the floating pane.
 * @returns its index in `floats`, bottom first.
 * @throws when `id` is not listed in `floats`.
 */
export declare function floatIndex(state: LayoutState, id: PaneId): number;
/**
 * The one tab a pane holds.
 * @param pane - the pane.
 * @returns its tab's id.
 * @throws when `pane` holds any other number of tabs.
 */
export declare function onlyTabId(pane: PaneNode): TabId;
/**
 * The split holding a node.
 * @param state - current layout.
 * @param id - the node.
 * @returns its parent split, or `undefined` for the docked root and floating panes.
 */
export declare function findParent(state: LayoutState, id: NodeId): SplitNode | undefined;
/**
 * The pane holding a tab.
 * @param state - current layout.
 * @param tabId - the tab.
 * @returns the pane whose strip lists it.
 * @throws when no pane lists it.
 */
export declare function findTabPane(state: LayoutState, tabId: TabId): PaneNode;
/**
 * Docked pane ids in visual order (depth-first through the split tree).
 * @param state - current layout.
 * @returns every docked pane's id; floating panes are absent.
 */
export declare function dockPaneIds(state: LayoutState): PaneId[];
/**
 * Scale `sizes` so they sum to 1. Input that already sums to 1 is copied
 * unchanged, so restoring recorded sizes never drifts.
 * @param sizes - fractions or any positive weights.
 * @returns the fractions, summing to 1.
 * @throws when the input cannot be normalized.
 */
export declare function normalizeSizes(sizes: readonly number[]): number[];
/**
 * `Object.entries` keeping the record's own key type: the keys were written from
 * ids, so reading them back as ids is exact.
 * @param record - an id-keyed record.
 * @returns its entries with typed keys.
 */
export declare function entriesOf<K extends string, V>(record: Readonly<Record<K, V>>): readonly (readonly [K, V])[];
/**
 * `Object.keys` keeping the record's own key type; see {@link entriesOf}.
 * @param record - an id-keyed record.
 * @returns its keys, typed.
 */
export declare function keysOf<K extends string>(record: Readonly<Record<K, unknown>>): readonly K[];
/**
 * Replace or delete nodes.
 * @param state - current layout.
 * @param updates - nodes by id; a `null` update deletes that id.
 * @returns the layout with those nodes replaced; untouched nodes keep their identity.
 */
export declare function withNodes(state: LayoutState, updates: Readonly<Record<NodeId, LayoutNode | null>>): LayoutState;
/**
 * Replace or delete tab records.
 * @param state - current layout.
 * @param updates - records by id; a `null` update deletes that id.
 * @returns the layout with those records replaced; untouched records keep their identity.
 */
export declare function withTabs(state: LayoutState, updates: Readonly<Record<TabId, TabRecord | null>>): LayoutState;
/**
 * Insert a value into a list.
 * @param items - the list.
 * @param index - the slot, clamped to the list's bounds.
 * @param value - what to insert.
 * @returns a new list with the value at the slot.
 */
export declare function insertAt<T>(items: readonly T[], index: number, value: T): T[];
/**
 * Remove one entry from a list.
 * @param items - the list.
 * @param index - the entry to drop.
 * @returns a new list without it.
 */
export declare function removeAt<T>(items: readonly T[], index: number): T[];
/**
 * Which tab a pane focuses after one leaves it.
 * @param tabs - the strip before the removal.
 * @param removedIndex - the leaving tab's slot.
 * @returns the previous neighbour when one exists, otherwise the next, otherwise `undefined`.
 */
export declare function neighbourTabId(tabs: readonly TabId[], removedIndex: number): TabId | undefined;
/**
 * Copy a pane with a new tab list.
 * @param pane - the pane.
 * @param tabs - its new strip.
 * @param activeTabId - the active tab, which the caller keeps consistent with `tabs`.
 * @returns the copied pane.
 */
export declare function paneWithTabs(pane: PaneNode, tabs: readonly TabId[], activeTabId: TabId | undefined): PaneNode;
/**
 * Swap a node for another in its parent's slot, or make the replacement the docked root.
 * @param state - current layout.
 * @param targetId - the node to swap out.
 * @param replacementId - the node taking its slot.
 * @returns the layout with the slot rewritten.
 * @throws when `targetId` is neither rooted nor parented.
 */
export declare function replaceInParent(state: LayoutState, targetId: NodeId, replacementId: NodeId): LayoutState;
/**
 * The first docked pane in visual order: the docked root, or the first leaf
 * under it. Focus falls back here when the focused pane is removed, and a new
 * tab lands here when the focused pane floats.
 * @param state - current layout.
 * @returns the first docked pane's id.
 */
export declare function firstDockPaneId(state: LayoutState): PaneId;
/**
 * The docked pane in the top-right corner: from the root, the last child of
 * every row split and the first child of every column split. Its tab strip is
 * where an embedder's surface-wide controls sit, so they read as the surface's
 * own top-right corner however the tree is divided.
 * @param state - current layout.
 * @returns the top-right docked pane's id.
 */
export declare function topRightPaneId(state: LayoutState): PaneId;
//# sourceMappingURL=tree.d.ts.map