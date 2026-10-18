import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Children, Fragment as Fragment$1, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { IconCloseFillRegular, IconCloseOutlineRegular, IconPanelLeftOutlineRegular, IconPlusOutlineRegular, MenuSurface, Tooltip, focusWithoutRing, modalSelector, observeComposition } from "@deepseek-ai/dsh-client-ui-primitives";
import { createPortal } from "react-dom";
import css from "./components/dockkit.module.css";
//#region lib/types/engine/tree.js
/**
* Reject an unhandled discriminant at the end of a closed switch.
* @param value - the discriminant the switch did not handle.
* @param what - the union being switched on, for the message.
* @returns never; it throws.
*/
function assertNever(value, what) {
	throw new Error(`${what}: unhandled ${JSON.stringify(value)}`);
}
/**
* Read any node.
* @param state - current layout.
* @param id - the node.
* @returns the split or pane.
* @throws when `id` is not in the tree.
*/
function getNode(state, id) {
	const node = state.nodes[id];
	if (node === void 0) throw new Error(`layout: unknown node ${id}`);
	return node;
}
/**
* Read a pane.
* @param state - current layout.
* @param id - the pane.
* @returns the pane node.
* @throws when `id` is missing or names a split.
*/
function getPane(state, id) {
	const node = getNode(state, id);
	if (node.kind !== "pane") throw new Error(`layout: ${id} is not a pane`);
	return node;
}
/**
* Read a split.
* @param state - current layout.
* @param id - the split.
* @returns the split node.
* @throws when `id` is missing or names a pane.
*/
function getSplit(state, id) {
	const node = getNode(state, id);
	if (node.kind !== "split") throw new Error(`layout: ${id} is not a split`);
	return node;
}
/**
* Read a tab record.
* @param state - current layout.
* @param id - the tab.
* @returns the record.
* @throws when `id` is not open.
*/
function getTab(state, id) {
	const tab = state.tabs[id];
	if (tab === void 0) throw new Error(`layout: unknown tab ${id}`);
	return tab;
}
/**
* A floating pane's rectangle.
* @param pane - the pane.
* @returns its viewport rectangle.
* @throws when `pane` is docked.
*/
function floatRect(pane) {
	if (pane.host !== "float" || pane.rect === void 0) throw new Error(`layout: ${pane.id} is not floating`);
	return pane.rect;
}
/**
* A floating pane's position in the z order.
* @param state - current layout.
* @param id - the floating pane.
* @returns its index in `floats`, bottom first.
* @throws when `id` is not listed in `floats`.
*/
function floatIndex(state, id) {
	const index = state.floats.indexOf(id);
	if (index < 0) throw new Error(`layout: floating pane ${id} is not in the z order`);
	return index;
}
/**
* The one tab a pane holds.
* @param pane - the pane.
* @returns its tab's id.
* @throws when `pane` holds any other number of tabs.
*/
function onlyTabId(pane) {
	const tabId = pane.tabs[0];
	if (tabId === void 0 || pane.tabs.length !== 1) throw new Error(`layout: ${pane.id} does not hold exactly one tab`);
	return tabId;
}
/**
* The split holding a node.
* @param state - current layout.
* @param id - the node.
* @returns its parent split, or `undefined` for the docked root and floating panes.
*/
function findParent(state, id) {
	for (const node of Object.values(state.nodes)) if (node.kind === "split" && node.children.includes(id)) return node;
}
/**
* The pane holding a tab.
* @param state - current layout.
* @param tabId - the tab.
* @returns the pane whose strip lists it.
* @throws when no pane lists it.
*/
function findTabPane(state, tabId) {
	for (const node of Object.values(state.nodes)) if (node.kind === "pane" && node.tabs.includes(tabId)) return node;
	throw new Error(`layout: tab ${tabId} has no pane`);
}
/**
* Docked pane ids in visual order (depth-first through the split tree).
* @param state - current layout.
* @returns every docked pane's id; floating panes are absent.
*/
function dockPaneIds(state) {
	const out = [];
	const walk = (id) => {
		const node = getNode(state, id);
		if (node.kind === "pane") {
			out.push(node.id);
			return;
		}
		for (const child of node.children) walk(child);
	};
	walk(state.rootId);
	return out;
}
/**
* Scale `sizes` so they sum to 1. Input that already sums to 1 is copied
* unchanged, so restoring recorded sizes never drifts.
* @param sizes - fractions or any positive weights.
* @returns the fractions, summing to 1.
* @throws when the input cannot be normalized.
*/
function normalizeSizes(sizes) {
	const total = sizes.reduce((sum, size) => sum + size, 0);
	if (!(total > 0)) throw new Error("layout: sizes must sum above zero");
	if (Math.abs(total - 1) < 1e-12) return [...sizes];
	return sizes.map((size) => size / total);
}
/**
* `Object.entries` keeping the record's own key type: the keys were written from
* ids, so reading them back as ids is exact.
* @param record - an id-keyed record.
* @returns its entries with typed keys.
*/
function entriesOf(record) {
	return Object.entries(record);
}
/**
* `Object.keys` keeping the record's own key type; see {@link entriesOf}.
* @param record - an id-keyed record.
* @returns its keys, typed.
*/
function keysOf(record) {
	return Object.keys(record);
}
/**
* Replace or delete nodes.
* @param state - current layout.
* @param updates - nodes by id; a `null` update deletes that id.
* @returns the layout with those nodes replaced; untouched nodes keep their identity.
*/
function withNodes(state, updates) {
	const nodes = {};
	for (const [id, node] of entriesOf(state.nodes)) if (!(id in updates)) nodes[id] = node;
	for (const [id, node] of entriesOf(updates)) if (node !== null) nodes[id] = node;
	return {
		...state,
		nodes
	};
}
/**
* Replace or delete tab records.
* @param state - current layout.
* @param updates - records by id; a `null` update deletes that id.
* @returns the layout with those records replaced; untouched records keep their identity.
*/
function withTabs(state, updates) {
	const tabs = {};
	for (const [id, tab] of entriesOf(state.tabs)) if (!(id in updates)) tabs[id] = tab;
	for (const [id, tab] of entriesOf(updates)) if (tab !== null) tabs[id] = tab;
	return {
		...state,
		tabs
	};
}
/**
* Insert a value into a list.
* @param items - the list.
* @param index - the slot, clamped to the list's bounds.
* @param value - what to insert.
* @returns a new list with the value at the slot.
*/
function insertAt(items, index, value) {
	const at = Math.max(0, Math.min(index, items.length));
	return [
		...items.slice(0, at),
		value,
		...items.slice(at)
	];
}
/**
* Remove one entry from a list.
* @param items - the list.
* @param index - the entry to drop.
* @returns a new list without it.
*/
function removeAt(items, index) {
	return [...items.slice(0, index), ...items.slice(index + 1)];
}
/**
* Which tab a pane focuses after one leaves it.
* @param tabs - the strip before the removal.
* @param removedIndex - the leaving tab's slot.
* @returns the previous neighbour when one exists, otherwise the next, otherwise `undefined`.
*/
function neighbourTabId(tabs, removedIndex) {
	const remaining = removeAt(tabs, removedIndex);
	if (remaining.length === 0) return void 0;
	return remaining[Math.max(0, removedIndex - 1)];
}
/**
* Copy a pane with a new tab list.
* @param pane - the pane.
* @param tabs - its new strip.
* @param activeTabId - the active tab, which the caller keeps consistent with `tabs`.
* @returns the copied pane.
*/
function paneWithTabs(pane, tabs, activeTabId) {
	return {
		...pane,
		tabs,
		activeTabId
	};
}
/**
* Swap a node for another in its parent's slot, or make the replacement the docked root.
* @param state - current layout.
* @param targetId - the node to swap out.
* @param replacementId - the node taking its slot.
* @returns the layout with the slot rewritten.
* @throws when `targetId` is neither rooted nor parented.
*/
function replaceInParent(state, targetId, replacementId) {
	const parent = findParent(state, targetId);
	if (parent === void 0) {
		if (state.rootId !== targetId) throw new Error(`layout: ${targetId} is neither rooted nor parented`);
		return {
			...state,
			rootId: replacementId
		};
	}
	const children = parent.children.map((child) => child === targetId ? replacementId : child);
	return withNodes(state, { [parent.id]: {
		...parent,
		children
	} });
}
/** Walk from the docked root to a pane, taking the child `choose` names at every split. */
function descend(state, choose) {
	let node = getNode(state, state.rootId);
	while (node.kind === "split") {
		const next = choose(node);
		/* v8 ignore next -- a split holds at least two children, so every choice names one. */
		if (next === void 0) throw new Error(`layout: split ${node.id} has no children`);
		node = getNode(state, next);
	}
	return node.id;
}
/**
* The first docked pane in visual order: the docked root, or the first leaf
* under it. Focus falls back here when the focused pane is removed, and a new
* tab lands here when the focused pane floats.
* @param state - current layout.
* @returns the first docked pane's id.
*/
function firstDockPaneId(state) {
	return descend(state, (split) => split.children[0]);
}
/**
* The docked pane in the top-right corner: from the root, the last child of
* every row split and the first child of every column split. Its tab strip is
* where an embedder's surface-wide controls sit, so they read as the surface's
* own top-right corner however the tree is divided.
* @param state - current layout.
* @returns the top-right docked pane's id.
*/
function topRightPaneId(state) {
	return descend(state, (split) => split.axis === "row" ? split.children.at(-1) : split.children[0]);
}
//#endregion
//#region lib/types/engine/operations.js
/** Capture the focus facts of `paneIds` plus global focus, as the operation that restores them. */
function focusSnapshot(state, paneIds) {
	const paneActiveTabs = {};
	for (const id of paneIds) paneActiveTabs[id] = getPane(state, id).activeTabId;
	return {
		type: "restoreFocus",
		activePaneId: state.activePaneId,
		floats: state.floats,
		paneActiveTabs
	};
}
/** Move `paneId` to the top of the floating z order. */
function raise(floats, paneId) {
	return [...floats.filter((id) => id !== paneId), paneId];
}
/** Keep `activePaneId` on a live pane after `state` lost the focused one. */
function reseatFocus(state, removedPaneId) {
	if (state.activePaneId !== removedPaneId) return state;
	return {
		...state,
		activePaneId: firstDockPaneId(state)
	};
}
/** A fresh empty docked pane. */
function emptyDockPane(id) {
	return {
		kind: "pane",
		id,
		host: "dock",
		tabs: [],
		activeTabId: void 0,
		rect: void 0
	};
}
/** Reject an id that a creating operation expects to be free. */
function assertFreeNode(state, id) {
	if (state.nodes[id] !== void 0) throw new Error(`layout: node ${id} already exists`);
}
/** Reject a tab id that an opening operation expects to be free. */
function assertFreeTab(state, id) {
	if (state.tabs[id] !== void 0) throw new Error(`layout: tab ${id} already exists`);
}
/** Give `paneId` an empty sibling along `axis`. */
function applySplit(state, op) {
	if (getPane(state, op.paneId).host !== "dock") throw new Error("layout: split requires a docked pane");
	assertFreeNode(state, op.newPaneId);
	const newPane = emptyDockPane(op.newPaneId);
	const parent = findParent(state, op.paneId);
	if (parent !== void 0 && parent.axis === op.axis) {
		const index = parent.children.indexOf(op.paneId);
		const at = op.direction === "after" ? index + 1 : index;
		const children = insertAt(parent.children, at, op.newPaneId);
		const sizes = parent.sizes.flatMap((size, i) => i === index ? [size / 2, size / 2] : [size]);
		return {
			state: withNodes(state, {
				[op.newPaneId]: newPane,
				[parent.id]: {
					...parent,
					children,
					sizes
				}
			}),
			inverse: [{
				type: "merge",
				paneId: op.newPaneId
			}, {
				type: "resize",
				splitId: parent.id,
				sizes: parent.sizes
			}]
		};
	}
	assertFreeNode(state, op.newSplitId);
	const rehomed = replaceInParent(state, op.paneId, op.newSplitId);
	const children = op.direction === "after" ? [op.paneId, op.newPaneId] : [op.newPaneId, op.paneId];
	return {
		state: withNodes(rehomed, {
			[op.newPaneId]: newPane,
			[op.newSplitId]: {
				kind: "split",
				id: op.newSplitId,
				axis: op.axis,
				children,
				sizes: [.5, .5]
			}
		}),
		inverse: [{
			type: "merge",
			paneId: op.newPaneId
		}]
	};
}
/** Drop an empty pane; a two-child split collapses into its surviving child. */
function applyMerge(state, op) {
	const pane = getPane(state, op.paneId);
	if (pane.tabs.length > 0) throw new Error("layout: merge requires an empty pane");
	const focus = focusSnapshot(state, []);
	if (pane.host === "float") {
		const index = floatIndex(state, op.paneId);
		return {
			state: reseatFocus(withNodes({
				...state,
				floats: removeAt(state.floats, index)
			}, { [op.paneId]: null }), op.paneId),
			inverse: [{
				type: "insertPane",
				pane,
				tabs: [],
				attach: {
					mode: "float",
					index
				}
			}, focus]
		};
	}
	const parent = findParent(state, op.paneId);
	if (parent === void 0) throw new Error("layout: the docked root pane cannot be merged");
	const index = parent.children.indexOf(op.paneId);
	if (parent.children.length > 2) {
		const children = removeAt(parent.children, index);
		const sizes = normalizeSizes(removeAt(parent.sizes, index));
		return {
			state: reseatFocus(withNodes(state, {
				[op.paneId]: null,
				[parent.id]: {
					...parent,
					children,
					sizes
				}
			}), op.paneId),
			inverse: [{
				type: "insertPane",
				pane,
				tabs: [],
				attach: {
					mode: "child",
					parentId: parent.id,
					index,
					sizes: parent.sizes
				}
			}, focus]
		};
	}
	const siblingId = parent.children[1 - index];
	/* v8 ignore next -- a split holds at least two children, so one survives the merged pane. */
	if (siblingId === void 0) throw new Error("layout: merge found a split without a sibling");
	return {
		state: reseatFocus(withNodes(replaceInParent(state, parent.id, siblingId), {
			[op.paneId]: null,
			[parent.id]: null
		}), op.paneId),
		inverse: [{
			type: "insertPane",
			pane,
			tabs: [],
			attach: {
				mode: "wrap",
				targetId: siblingId,
				split: parent
			}
		}, focus]
	};
}
/** Add a new tab to a docked pane and focus it. */
function applyOpenTab(state, op) {
	const pane = getPane(state, op.paneId);
	if (pane.host !== "dock") throw new Error("layout: openTab requires a docked pane");
	assertFreeTab(state, op.tab.id);
	const focus = focusSnapshot(state, [pane.id]);
	return {
		state: {
			...withNodes(withTabs(state, { [op.tab.id]: op.tab }), { [pane.id]: paneWithTabs(pane, insertAt(pane.tabs, op.index, op.tab.id), op.tab.id) }),
			activePaneId: pane.id
		},
		inverse: [{
			type: "closeTab",
			tabId: op.tab.id
		}, focus]
	};
}
/** Put one tab record back where it was, without stealing focus. */
function applyInsertTab(state, op) {
	const pane = getPane(state, op.paneId);
	if (pane.host !== "dock") throw new Error("layout: insertTab requires a docked pane");
	assertFreeTab(state, op.tab.id);
	const focus = focusSnapshot(state, [pane.id]);
	const tabs = insertAt(pane.tabs, op.index, op.tab.id);
	return {
		state: withNodes(withTabs(state, { [op.tab.id]: op.tab }), { [pane.id]: paneWithTabs(pane, tabs, pane.activeTabId ?? op.tab.id) }),
		inverse: [{
			type: "closeTab",
			tabId: op.tab.id
		}, focus]
	};
}
/** Destroy a tab and its content state; a floating host pane goes with its only tab. */
function applyCloseTab(state, op) {
	const tab = getTab(state, op.tabId);
	const pane = findTabPane(state, op.tabId);
	const index = pane.tabs.indexOf(op.tabId);
	const focus = focusSnapshot(state, [pane.id]);
	if (pane.host === "float") {
		const index = floatIndex(state, pane.id);
		return {
			state: reseatFocus(withTabs(withNodes({
				...state,
				floats: removeAt(state.floats, index)
			}, { [pane.id]: null }), { [op.tabId]: null }), pane.id),
			inverse: [{
				type: "insertPane",
				pane,
				tabs: [tab],
				attach: {
					mode: "float",
					index
				}
			}, focus]
		};
	}
	const activeTabId = pane.activeTabId === op.tabId ? neighbourTabId(pane.tabs, index) : pane.activeTabId;
	return {
		state: withTabs(withNodes(state, { [pane.id]: paneWithTabs(pane, removeAt(pane.tabs, index), activeTabId) }), { [op.tabId]: null }),
		inverse: [{
			type: "insertTab",
			paneId: pane.id,
			tab,
			index
		}, focus]
	};
}
/**
* Put a pane back, with the tab records it owned. A docked pane returns empty
* (its tabs return through `insertTab`, as `closeTab` records them); a floating
* pane returns with its one tab, or empty.
*/
function applyInsertPane(state, op) {
	assertFreeNode(state, op.pane.id);
	if (op.pane.tabs.length !== op.tabs.length) throw new Error("layout: insertPane tab records do not match the pane");
	if (op.pane.host === "dock" && op.tabs.length > 0) throw new Error("layout: insertPane returns a docked pane empty");
	const tabUpdates = {};
	for (const tab of op.tabs) {
		assertFreeTab(state, tab.id);
		tabUpdates[tab.id] = tab;
	}
	const restoredTab = op.tabs[0];
	const inverse = restoredTab === void 0 ? [{
		type: "merge",
		paneId: op.pane.id
	}] : [{
		type: "closeTab",
		tabId: restoredTab.id
	}, focusSnapshot(state, [])];
	const attach = op.attach;
	switch (attach.mode) {
		case "child": {
			const parent = getSplit(state, attach.parentId);
			const children = insertAt(parent.children, attach.index, op.pane.id);
			if (attach.sizes.length !== children.length) throw new Error("layout: insertPane sizes do not match the split");
			inverse.push({
				type: "resize",
				splitId: parent.id,
				sizes: parent.sizes
			});
			return {
				state: withNodes(withTabs(state, tabUpdates), {
					[op.pane.id]: op.pane,
					[parent.id]: {
						...parent,
						children,
						sizes: attach.sizes
					}
				}),
				inverse
			};
		}
		case "wrap":
			if (!attach.split.children.includes(op.pane.id)) throw new Error("layout: insertPane wrap split does not list the pane");
			return {
				state: withNodes(withTabs(replaceInParent(state, attach.targetId, attach.split.id), tabUpdates), {
					[op.pane.id]: op.pane,
					[attach.split.id]: attach.split
				}),
				inverse
			};
		case "float": {
			if (op.pane.host !== "float") throw new Error("layout: float attachment requires a floating pane");
			const floats = insertAt(state.floats, attach.index, op.pane.id);
			return {
				state: withNodes(withTabs({
					...state,
					floats
				}, tabUpdates), { [op.pane.id]: op.pane }),
				inverse
			};
		}
		/* v8 ignore next 2 -- closed-union backstop; the compiler rejects a new attachment mode here. */
		default: return assertNever(attach, "layout: insertPane attachment");
	}
}
/** Move a tab to a different docked pane and focus it there. */
function applyMoveTab(state, op) {
	const from = findTabPane(state, op.tabId);
	if (from.host !== "dock") throw new Error("layout: moveTab source must be docked; use unfloat");
	const to = getPane(state, op.toPaneId);
	if (to.host !== "dock") throw new Error("layout: moveTab target must be docked");
	if (to.id === from.id) throw new Error("layout: moveTab across one pane; use reorderTab");
	const index = from.tabs.indexOf(op.tabId);
	const focus = focusSnapshot(state, [from.id, to.id]);
	const activeTabId = from.activeTabId === op.tabId ? neighbourTabId(from.tabs, index) : from.activeTabId;
	return {
		state: {
			...withNodes(state, {
				[from.id]: paneWithTabs(from, removeAt(from.tabs, index), activeTabId),
				[to.id]: paneWithTabs(to, insertAt(to.tabs, op.index, op.tabId), op.tabId)
			}),
			activePaneId: to.id
		},
		inverse: [{
			type: "moveTab",
			tabId: op.tabId,
			toPaneId: from.id,
			index
		}, focus]
	};
}
/** Move a tab within its own pane. */
function applyReorderTab(state, op) {
	const pane = findTabPane(state, op.tabId);
	const from = pane.tabs.indexOf(op.tabId);
	const tabs = insertAt(removeAt(pane.tabs, from), op.index, op.tabId);
	return {
		state: withNodes(state, { [pane.id]: {
			...pane,
			tabs
		} }),
		inverse: [{
			type: "reorderTab",
			tabId: op.tabId,
			index: from
		}]
	};
}
/** Focus a tab, its pane, and raise that pane when floating. */
function applyFocusTab(state, op) {
	const pane = findTabPane(state, op.tabId);
	const focus = focusSnapshot(state, [pane.id]);
	const focused = withNodes(state, { [pane.id]: {
		...pane,
		activeTabId: op.tabId
	} });
	const floats = pane.host === "float" ? raise(focused.floats, pane.id) : focused.floats;
	return {
		state: {
			...focused,
			activePaneId: pane.id,
			floats
		},
		inverse: [focus]
	};
}
/** Focus a pane and raise it when floating. */
function applyFocusPane(state, op) {
	const pane = getPane(state, op.paneId);
	const focus = focusSnapshot(state, []);
	const floats = pane.host === "float" ? raise(state.floats, pane.id) : state.floats;
	return {
		state: {
			...state,
			activePaneId: pane.id,
			floats
		},
		inverse: [focus]
	};
}
/** Record the net result of a divider drag. */
function applyResize(state, op) {
	const split = getSplit(state, op.splitId);
	if (op.sizes.length !== split.children.length) throw new Error("layout: resize sizes do not match the split");
	if (op.sizes.some((size) => !(size > 0))) throw new Error("layout: resize sizes must all be above zero");
	return {
		state: withNodes(state, { [split.id]: {
			...split,
			sizes: normalizeSizes(op.sizes)
		} }),
		inverse: [{
			type: "resize",
			splitId: split.id,
			sizes: split.sizes
		}]
	};
}
/** Take a tab out of the docked tree into a new floating pane on top. */
function applyFloat(state, op) {
	getTab(state, op.tabId);
	const from = findTabPane(state, op.tabId);
	if (from.host !== "dock") throw new Error("layout: float requires a docked tab");
	assertFreeNode(state, op.newPaneId);
	const index = from.tabs.indexOf(op.tabId);
	const focus = focusSnapshot(state, [from.id]);
	const activeTabId = from.activeTabId === op.tabId ? neighbourTabId(from.tabs, index) : from.activeTabId;
	const floated = withNodes(state, {
		[from.id]: paneWithTabs(from, removeAt(from.tabs, index), activeTabId),
		[op.newPaneId]: {
			kind: "pane",
			id: op.newPaneId,
			host: "float",
			tabs: [op.tabId],
			activeTabId: op.tabId,
			rect: op.rect
		}
	});
	return {
		state: {
			...floated,
			floats: [...floated.floats, op.newPaneId],
			activePaneId: op.newPaneId
		},
		inverse: [{
			type: "unfloat",
			paneId: op.newPaneId,
			toPaneId: from.id,
			index
		}, focus]
	};
}
/** Return a floating pane's only tab to a docked pane and destroy the floating pane. */
function applyUnfloat(state, op) {
	const pane = getPane(state, op.paneId);
	const rect = floatRect(pane);
	const tabId = onlyTabId(pane);
	const to = getPane(state, op.toPaneId);
	if (to.host !== "dock") throw new Error("layout: unfloat target must be docked");
	const focus = focusSnapshot(state, [to.id]);
	return {
		state: {
			...withNodes({
				...state,
				floats: removeAt(state.floats, floatIndex(state, op.paneId))
			}, {
				[op.paneId]: null,
				[to.id]: paneWithTabs(to, insertAt(to.tabs, op.index, tabId), tabId)
			}),
			activePaneId: to.id
		},
		inverse: [{
			type: "float",
			tabId,
			newPaneId: op.paneId,
			rect
		}, focus]
	};
}
/** Give a floating pane a new rectangle, focus it, and raise it: the one operation a drag of it records. */
function reshapeFloat(state, pane, rect) {
	const reshaped = withNodes(state, { [pane.id]: {
		...pane,
		rect
	} });
	return {
		...reshaped,
		activePaneId: pane.id,
		floats: raise(reshaped.floats, pane.id)
	};
}
/** Record the net result of dragging a floating pane, which also focuses and raises it. */
function applyMoveFloat(state, op) {
	const pane = getPane(state, op.paneId);
	const rect = floatRect(pane);
	return {
		state: reshapeFloat(state, pane, {
			...rect,
			x: op.x,
			y: op.y
		}),
		inverse: [{
			type: "moveFloat",
			paneId: op.paneId,
			x: rect.x,
			y: rect.y
		}, focusSnapshot(state, [])]
	};
}
/** Record the net result of resizing a floating pane, which also focuses and raises it. */
function applyResizeFloat(state, op) {
	const pane = getPane(state, op.paneId);
	const rect = floatRect(pane);
	if (!(op.rect.width > 0) || !(op.rect.height > 0)) throw new Error("layout: float size must be above zero");
	return {
		state: reshapeFloat(state, pane, op.rect),
		inverse: [{
			type: "resizeFloat",
			paneId: op.paneId,
			rect
		}, focusSnapshot(state, [])]
	};
}
/** Restore focus facts a previous operation displaced. */
function applyRestoreFocus(state, op) {
	const inverse = focusSnapshot(state, keysOf(op.paneActiveTabs));
	for (const paneId of op.floats) if (getPane(state, paneId).host !== "float") throw new Error(`layout: restoreFocus lists docked pane ${paneId} as floating`);
	let next = state;
	for (const [paneId, activeTabId] of entriesOf(op.paneActiveTabs)) {
		const pane = getPane(next, paneId);
		next = withNodes(next, { [paneId]: {
			...pane,
			activeTabId
		} });
	}
	getPane(next, op.activePaneId);
	return {
		state: {
			...next,
			activePaneId: op.activePaneId,
			floats: op.floats
		},
		inverse: [inverse]
	};
}
/**
* Apply one operation.
* @param state - state the operation reads; never mutated.
* @param op - the operation, carrying every id it creates.
* @returns the next state and the operations that undo it, applied in order.
* @throws when the operation addresses missing nodes or breaks a model rule.
*/
function applyOp(state, op) {
	switch (op.type) {
		case "split": return applySplit(state, op);
		case "merge": return applyMerge(state, op);
		case "openTab": return applyOpenTab(state, op);
		case "insertTab": return applyInsertTab(state, op);
		case "closeTab": return applyCloseTab(state, op);
		case "insertPane": return applyInsertPane(state, op);
		case "moveTab": return applyMoveTab(state, op);
		case "reorderTab": return applyReorderTab(state, op);
		case "focusTab": return applyFocusTab(state, op);
		case "focusPane": return applyFocusPane(state, op);
		case "resize": return applyResize(state, op);
		case "float": return applyFloat(state, op);
		case "unfloat": return applyUnfloat(state, op);
		case "moveFloat": return applyMoveFloat(state, op);
		case "resizeFloat": return applyResizeFloat(state, op);
		case "setExpanded": return {
			state: {
				...state,
				expanded: op.expanded
			},
			inverse: [{
				type: "setExpanded",
				expanded: state.expanded
			}]
		};
		case "setMode": return {
			state: {
				...state,
				mode: op.mode
			},
			inverse: [{
				type: "setMode",
				mode: state.mode
			}]
		};
		case "restoreFocus": return applyRestoreFocus(state, op);
		/* v8 ignore next -- closed-union backstop; the compiler rejects a new operation type here. */
		default: return assertNever(op, "layout: operation");
	}
}
/**
* Fold operations forward, discarding inverses.
* @param state - starting state.
* @param ops - operations in recorded order.
* @returns the state after every operation.
*/
function replay(state, ops) {
	return ops.reduce((current, op) => applyOp(current, op).state, state);
}
//#endregion
//#region lib/types/engine/sequence.js
/** A sequence that has recorded nothing. */
const EMPTY_HISTORY = {
	entries: [],
	cursor: 0
};
/** Operation kinds that only move focus. */
const FOCUS_OP_TYPES = new Set([
	"focusTab",
	"focusPane",
	"restoreFocus"
]);
/**
* Whether an operation only moves focus, and so merges into its neighbours' undo step.
* @param op - the operation.
* @returns whether its type is a `FocusOpType`.
*/
function isFocusOp(op) {
	return FOCUS_OP_TYPES.has(op.type);
}
/** Whether the entry at `index` only moves focus. */
function isFocusEntry(history, index) {
	const entry = history.entries[index];
	return entry !== void 0 && entry.ops.every(isFocusOp);
}
/**
* Whether a step back exists.
* @param history - the sequence so far.
* @returns whether any entry is applied.
*/
function canStepBack(history) {
	return history.cursor > 0;
}
/**
* Whether a step forward exists.
* @param history - the sequence so far.
* @returns whether a redo branch remains.
*/
function canStepForward(history) {
	return history.cursor < history.entries.length;
}
/**
* The operations a sequence has recorded, redo branch included.
* @param history - the sequence so far.
* @returns every entry's operations, in recorded order.
*/
function recordedOps(history) {
	return history.entries.flatMap((entry) => entry.ops);
}
/**
* Apply one intent's operations and record them as one entry, dropping any redo
* branch first. An intent with no operations records nothing.
* @param history - the sequence so far.
* @param state - the state the operations apply to.
* @param ops - the intent's operations, in application order.
* @returns the extended history and the state after the operations.
* @throws when an operation is invalid against the state it reaches; nothing is
*   recorded.
*/
function record(history, state, ops) {
	if (ops.length === 0) return {
		history,
		state
	};
	let next = state;
	const inverse = [];
	for (const op of ops) {
		const result = applyOp(next, op);
		next = result.state;
		inverse.unshift(...result.inverse);
	}
	return {
		history: {
			entries: [...history.cursor === history.entries.length ? history.entries : history.entries.slice(0, history.cursor), {
				ops,
				inverse
			}],
			cursor: history.cursor + 1
		},
		state: next
	};
}
/**
* Step back one intent, or one whole run of consecutive focus-only intents.
* @param history - the sequence so far.
* @param state - the current state.
* @returns the stepped-back pair, or `undefined` when nothing can be undone.
*/
function stepBack(history, state) {
	if (!canStepBack(history)) return void 0;
	let count = 1;
	if (isFocusEntry(history, history.cursor - 1)) while (isFocusEntry(history, history.cursor - 1 - count)) count += 1;
	let next = state;
	for (const entry of history.entries.slice(history.cursor - count, history.cursor).reverse()) for (const op of entry.inverse) next = applyOp(next, op).state;
	return {
		history: {
			entries: history.entries,
			cursor: history.cursor - count
		},
		state: next
	};
}
/**
* Step forward over the intents the matching step back undid.
* @param history - the sequence so far.
* @param state - the current state.
* @returns the stepped-forward pair, or `undefined` when nothing can be redone.
*/
function stepForward(history, state) {
	if (!canStepForward(history)) return void 0;
	let count = 1;
	if (isFocusEntry(history, history.cursor)) while (isFocusEntry(history, history.cursor + count)) count += 1;
	let next = state;
	for (const entry of history.entries.slice(history.cursor, history.cursor + count)) for (const op of entry.ops) next = applyOp(next, op).state;
	return {
		history: {
			entries: history.entries,
			cursor: history.cursor + count
		},
		state: next
	};
}
/** Layout state plus its history cursor, held here instead of by the embedder. */
var Sequencer = class {
	current;
	recorded = EMPTY_HISTORY;
	/** @param initial - state the sequence replays from; never mutated. */
	constructor(initial) {
		this.current = initial;
	}
	/** Current state. */
	get state() {
		return this.current;
	}
	/** The recorded sequence as plain data. */
	get history() {
		return this.recorded;
	}
	/** The whole recorded sequence, including a redo branch that is not applied. */
	get ops() {
		return recordedOps(this.recorded);
	}
	/** How many recorded operations are currently applied. */
	get cursor() {
		return this.recorded.cursor;
	}
	/** Whether a step back exists. */
	get canUndo() {
		return canStepBack(this.recorded);
	}
	/** Whether a step forward exists. */
	get canRedo() {
		return canStepForward(this.recorded);
	}
	/**
	* Apply and record one operation as its own entry, dropping any redo branch first.
	* @param op - the operation to record.
	* @returns the state after it.
	* @throws when the operation is invalid against the current state; the
	*   sequence is left untouched.
	*/
	dispatch(op) {
		return this.dispatchAll([op]);
	}
	/**
	* Apply and record one intent's operations as one entry, dropping any redo
	* branch first.
	* @param ops - the intent's operations; none records nothing.
	* @returns the state after them.
	* @throws when an operation is invalid; the sequence is left untouched.
	*/
	dispatchAll(ops) {
		const stepped = record(this.recorded, this.current, ops);
		this.recorded = stepped.history;
		this.current = stepped.state;
		return this.current;
	}
	/**
	* Step back one intent, or one whole run of consecutive focus-only intents.
	* @returns false when there is nothing to undo.
	*/
	undo() {
		const stepped = stepBack(this.recorded, this.current);
		if (stepped === void 0) return false;
		this.recorded = stepped.history;
		this.current = stepped.state;
		return true;
	}
	/**
	* Step forward over the intents the matching undo stepped back.
	* @returns false when there is nothing to redo.
	*/
	redo() {
		const stepped = stepForward(this.recorded, this.current);
		if (stepped === void 0) return false;
		this.recorded = stepped.history;
		this.current = stepped.state;
		return true;
	}
};
//#endregion
//#region lib/types/engine/constraints.js
/** V1 caps the docked grid at four panes; floating panes do not count. */
const MAX_DOCK_PANES = 4;
/** Smallest fraction a divider drag may leave a pane, as a share of its split. */
const MIN_PANE_FRACTION = .12;
/** Size a tab takes when it first floats, in CSS pixels. */
const FLOAT_DEFAULT_SIZE = {
	width: 380,
	height: 300
};
/** Smallest size a floating panel may be resized to, in CSS pixels. */
const FLOAT_MIN_SIZE = {
	width: 220,
	height: 140
};
/** Fraction of a pane's width or height that counts as its dock edge. */
const DOCK_EDGE_FRACTION = .25;
/**
* Number of docked panes.
* @param state - current layout.
* @returns how many panes the docked tree holds; floating panes do not count.
*/
function dockPaneCount(state) {
	return dockPaneIds(state).length;
}
/**
* Whether another docked pane is allowed.
* @param state - current layout.
* @returns whether the docked tree is under `MAX_DOCK_PANES`.
*/
function canSplit(state) {
	return dockPaneCount(state) < 4;
}
/** The five dock regions a tab can be dropped on. */
const DOCK_ZONES = [
	"center",
	"top",
	"right",
	"bottom",
	"left"
];
/**
* Which dock region a pointer sits in.
* @param x - pointer x as a fraction of pane width.
* @param y - pointer y as a fraction of pane height.
* @param edge - edge band width as a fraction; defaults to `DOCK_EDGE_FRACTION`.
* @returns the closest edge when the pointer is inside its band, else `'center'`.
*/
function zoneAt(x, y, edge = DOCK_EDGE_FRACTION) {
	let zone = "left";
	let distance = x;
	if (1 - x < distance) {
		zone = "right";
		distance = 1 - x;
	}
	if (y < distance) {
		zone = "top";
		distance = y;
	}
	if (1 - y < distance) {
		zone = "bottom";
		distance = 1 - y;
	}
	return distance < edge ? zone : "center";
}
/**
* How a dock region splits the pane it targets.
* @param zone - the region the pointer released in.
* @returns the split's axis and direction, or `undefined` for `'center'`, which moves the tab into the pane instead.
*/
function zoneSplit(zone) {
	switch (zone) {
		case "center": return;
		case "left": return {
			axis: "row",
			direction: "before"
		};
		case "right": return {
			axis: "row",
			direction: "after"
		};
		case "top": return {
			axis: "column",
			direction: "before"
		};
		case "bottom": return {
			axis: "column",
			direction: "after"
		};
		/* v8 ignore next -- closed-union backstop; the compiler rejects a new zone here. */
		default: return assertNever(zone, "layout: dock zone");
	}
}
/**
* Clamp divider sizes so no pane falls under `MIN_PANE_FRACTION`.
* @param sizes - candidate fractions from the drag preview.
* @param minimum - smallest allowed share; defaults to the kit's pane fraction.
* @returns fractions summing to 1 with every entry at or above the minimum.
*/
function clampSizes(sizes, minimum = MIN_PANE_FRACTION) {
	if (sizes.length === 0) return [];
	const floor = Math.min(minimum, 1 / sizes.length);
	const positive = sizes.map((size) => size > 0 ? size : 0);
	const total = positive.reduce((sum, size) => sum + size, 0);
	let shares = total > 0 ? positive.map((size) => size / total) : positive.map(() => 1 / sizes.length);
	const pinned = /* @__PURE__ */ new Set();
	for (;;) {
		const under = shares.flatMap((share, index) => !pinned.has(index) && share < floor ? [index] : []);
		if (under.length === 0) return shares;
		for (const index of under) pinned.add(index);
		const remainder = 1 - pinned.size * floor;
		const freeTotal = shares.reduce((sum, share, index) => pinned.has(index) ? sum : sum + share, 0);
		shares = shares.map((share, index) => pinned.has(index) ? floor : share / freeTotal * remainder);
	}
}
//#endregion
//#region lib/types/engine/geometry.js
/**
* Whether a point is inside a rectangle, edges included.
* @param rect - the rectangle.
* @param x - point x in the same coordinates.
* @param y - point y in the same coordinates.
* @returns whether the point lies on or inside the rectangle.
*/
function containsPoint(rect, x, y) {
	return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
/**
* Dock region a point falls in, relative to one pane's rectangle.
* @param rect - the pane's measured box.
* @param x - pointer x in the same coordinates.
* @param y - pointer y in the same coordinates.
* @param edge - edge band as a fraction; defaults to the model's value.
* @returns the region; `'center'` when the point is not in an edge band.
*/
function zoneInRect(rect, x, y, edge = DOCK_EDGE_FRACTION) {
	if (!(rect.width > 0) || !(rect.height > 0)) return "center";
	return zoneAt((x - rect.x) / rect.width, (y - rect.y) / rect.height, edge);
}
/**
* Slot a tab would take in a strip, by comparing the pointer with each tab's midpoint.
* @param tabRects - the strip's tab boxes in strip order.
* @param x - pointer x.
* @returns the insertion index, from 0 to `tabRects.length`.
*/
function insertionIndex(tabRects, x) {
	let index = 0;
	for (const rect of tabRects) {
		if (x < rect.x + rect.width / 2) break;
		index += 1;
	}
	return index;
}
/**
* The minimums where no computed style can be read, mirroring
* `dockkit.module.css`: `.splitRow > .divider` takes no layout width (its
* hairline is painted over the seam); `.tab` is 80px of content plus
* 10px + 10px of padding (content-box), 100px; 12px above and below one 13px
* secondary line at 1.6 line-height — the inset a body draws for itself, as
* `.empty` does — is 45px, held to 48px.
*/
const SPLIT_MINIMUMS = {
	divider: 0,
	chip: 100,
	body: 48
};
/**
* The room rule. After an equal split each half must hold what cannot shrink:
* horizontally the strip's fixed part — its width minus the chip box, the
* fill, and `splitControlWidth`, which is the padding, the gaps, and every
* control a half would still draw — plus one chip at its minimum; vertically
* the strip plus a minimum body. The
* borders are what the pane's box exceeds the strip's by. An unmeasured pane
* (no layout, as under jsdom) fits: the rule only blocks on a positive reading.
* @param measure - the pane's rectangles.
* @param minimums - the pixel minimums; defaults to the stylesheet's.
* @returns whether a row and a column split each leave two working halves.
*/
function halvesFit(measure, minimums = SPLIT_MINIMUMS) {
	const { pane, strip } = measure;
	if (!(pane.width > 0) || !(pane.height > 0) || !(strip.width > 0)) return {
		row: true,
		column: true
	};
	const borders = Math.max(0, pane.width - strip.width);
	const fixed = Math.max(0, strip.width - measure.chipsWidth - measure.fillWidth - (measure.splitControlWidth ?? 0));
	const halfWidth = (pane.width - minimums.divider) / 2 - borders;
	const halfHeight = (pane.height - minimums.divider) / 2 - borders;
	return {
		row: halfWidth >= fixed + minimums.chip,
		column: halfHeight >= strip.height + minimums.body
	};
}
/** How far a pointer must travel before a press becomes a drag, in pixels. */
const DRAG_THRESHOLD = 4;
/**
* Whether a press has travelled far enough to be a drag.
* @param startX - press x.
* @param startY - press y.
* @param x - current pointer x.
* @param y - current pointer y.
* @returns whether either axis moved at least `DRAG_THRESHOLD`.
*/
function passedThreshold(startX, startY, x, y) {
	return Math.abs(x - startX) >= 4 || Math.abs(y - startY) >= 4;
}
/**
* Split fractions after a divider drag.
* @param sizes - the split's current fractions.
* @param index - divider position: the boundary between `index` and `index + 1`.
* @param delta - pointer travel along the split axis, as a fraction of the split's extent.
* @returns new fractions; the two neighbours absorb the whole change.
*/
function dividerSizes(sizes, index, delta) {
	const before = sizes[index];
	const after = sizes[index + 1];
	if (before === void 0 || after === void 0) return [...sizes];
	const next = [...sizes];
	next[index] = before + delta;
	next[index + 1] = after - delta;
	return next;
}
/**
* A floating panel's rectangle after a drag.
* @param rect - the rectangle the gesture started from.
* @param dx - pointer travel on x.
* @param dy - pointer travel on y.
* @returns the moved rectangle; the size is unchanged.
*/
function movedRect(rect, dx, dy) {
	return {
		...rect,
		x: rect.x + dx,
		y: rect.y + dy
	};
}
/**
* A floating panel's rectangle after a bottom-right resize.
* @param rect - the rectangle the gesture started from.
* @param dx - pointer travel on x.
* @param dy - pointer travel on y.
* @param min - smallest size the panel may take.
* @returns the resized rectangle; the origin is unchanged.
*/
function resizedRect(rect, dx, dy, min) {
	return {
		...rect,
		width: Math.max(min.width, rect.width + dx),
		height: Math.max(min.height, rect.height + dy)
	};
}
/**
* Where a panel should appear when a tab is dropped outside the docked area.
* @param x - drop point x.
* @param y - drop point y.
* @param size - the panel's size.
* @returns a rectangle whose header sits under the drop point.
*/
function floatRectAt(x, y, size) {
	return {
		x: Math.max(0, x - GRAB_OFFSET.x),
		y: Math.max(0, y - GRAB_OFFSET.y),
		...size
	};
}
/** How far the new panel's origin sits above and left of the drop point. */
const GRAB_OFFSET = {
	x: 60,
	y: 14
};
//#endregion
//#region lib/types/engine/planner.js
/** Distance each newly floated panel steps down and right from the last. */
const FLOAT_CASCADE_STEP = 24;
/** Where the first floating panel appears, in viewport pixels. */
const FLOAT_ORIGIN = {
	x: 160,
	y: 120
};
/** No operations: the intent is a no-op against this state. */
const NOTHING = [];
/**
* First tab in one pane carrying `contentId`, in strip order.
* @param state - current layout.
* @param paneId - the pane to search, docked or floating.
* @param contentId - the content identity.
* @param kind - restrict to tabs of this kind; omit to match any kind.
* @returns the tab, or `undefined` when that pane shows no such content.
*/
function findPaneContentTab(state, paneId, contentId, kind) {
	for (const tabId of getPane(state, paneId).tabs) {
		const tab = state.tabs[tabId];
		if (tab?.contentId === contentId && (kind === void 0 || tab.kind === kind)) return tabId;
	}
}
/**
* First tab carrying `contentId`, searched docked panes first, in visual order.
* @param state - current layout.
* @param contentId - the content identity.
* @param kind - restrict to tabs of this kind; omit to match any kind.
* @returns the tab, or `undefined` when nothing shows the content.
*/
function findContentTab(state, contentId, kind) {
	for (const paneId of [...dockPaneIds(state), ...state.floats]) {
		const found = findPaneContentTab(state, paneId, contentId, kind);
		if (found !== void 0) return found;
	}
}
/**
* The pane a new tab lands in.
* @param state - current layout.
* @returns the active pane when docked, else the first docked pane.
*/
function activeDockPaneId(state) {
	const active = getPane(state, state.activePaneId);
	return active.host === "dock" ? active.id : firstDockPaneId(state);
}
/** Send a tab into a docked pane, choosing the operation its current host needs. */
function tabInto(source, tabId, toPaneId, index) {
	return source.host === "float" ? {
		type: "unfloat",
		paneId: source.id,
		toPaneId,
		index
	} : {
		type: "moveTab",
		tabId,
		toPaneId,
		index
	};
}
/**
* Expand or collapse the docked area.
* @param state - current layout.
* @param expanded - whether the docked area is shown.
* @returns the operation, or none when the value is already current.
*/
function planSetExpanded(state, expanded) {
	return state.expanded === expanded ? NOTHING : [{
		type: "setExpanded",
		expanded
	}];
}
/**
* Switch the presentation.
* @param state - current layout.
* @param mode - the presentation to record.
* @returns the operation, or none when the value is already current.
*/
function planSetMode(state, mode) {
	return state.mode === mode ? NOTHING : [{
		type: "setMode",
		mode
	}];
}
/**
* Split a pane to its right and seed the new pane.
* @param state - current layout.
* @param mint - id source for the pane, split, and seeded tab.
* @param paneId - pane to split; defaults to the active docked pane.
* @param makePaneTab - builds the seeded tab; omit to leave the new pane empty.
* @returns the operations, or none when the pane budget is spent.
*/
function planSplitPane(state, mint, paneId, makePaneTab) {
	if (!canSplit(state)) return NOTHING;
	const target = paneId ?? activeDockPaneId(state);
	if (getPane(state, target).host !== "dock") return NOTHING;
	const newPaneId = mint("pane");
	const ops = [{
		type: "split",
		paneId: target,
		axis: "row",
		direction: "after",
		newPaneId,
		newSplitId: mint("split")
	}];
	const seed = makePaneTab?.(mint("tab"));
	if (seed !== void 0) ops.push({
		type: "openTab",
		paneId: newPaneId,
		tab: seed,
		index: 0
	});
	return ops;
}
/**
* Seat the embedder's seeded tab at the end of a docked pane's strip.
* @param state - current layout.
* @param mint - id source for the new tab.
* @param paneId - the pane whose strip asked; must be docked.
* @param makeTab - builds the seeded tab; omit to plan nothing.
* @returns the operations, or none when there is nothing to seat.
*/
function planAddTab(state, mint, paneId, makeTab) {
	if (makeTab === void 0) return NOTHING;
	const pane = getPane(state, paneId);
	if (pane.host !== "dock") return NOTHING;
	return [{
		type: "openTab",
		paneId,
		tab: makeTab(mint("tab")),
		index: pane.tabs.length
	}];
}
/**
* Open content, or focus the tab already showing it.
* @param state - current layout.
* @param mint - id source for a newly opened tab.
* @param input - identity, copy, and optional placement.
* @returns the operations plus the tab they settle on.
*/
function planOpenContent(state, mint, input) {
	const existing = input.revealIfOpened === false ? void 0 : findContentTab(state, input.contentId, input.kind);
	if (existing !== void 0) return {
		ops: [{
			type: "focusTab",
			tabId: existing
		}],
		tabId: existing
	};
	const paneId = input.paneId ?? activeDockPaneId(state);
	const tab = {
		id: mint("tab"),
		kind: input.kind,
		contentId: input.contentId,
		title: input.title
	};
	return {
		ops: [{
			type: "openTab",
			paneId,
			tab,
			index: input.index ?? getPane(state, paneId).tabs.length
		}],
		tabId: tab.id
	};
}
/**
* Open a second, independent tab on the same content, beside the original.
* @param state - current layout.
* @param mint - id source for the copy.
* @param tabId - tab to copy.
* @returns the operations plus the new tab's id.
*/
function planDuplicateTab(state, mint, tabId) {
	const source = getTab(state, tabId);
	const pane = findTabPane(state, tabId);
	const host = pane.host === "dock" ? pane.id : activeDockPaneId(state);
	const index = pane.host === "dock" ? pane.tabs.indexOf(tabId) + 1 : getPane(state, host).tabs.length;
	const tab = {
		...source,
		id: mint("tab")
	};
	return {
		ops: [{
			type: "openTab",
			paneId: host,
			tab,
			index
		}],
		tabId: tab.id
	};
}
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
function planPlaceTab(state, tabId, toPaneId, index) {
	const source = findTabPane(state, tabId);
	if (getPane(state, toPaneId).host !== "dock") return NOTHING;
	if (source.id === toPaneId) {
		const from = source.tabs.indexOf(tabId);
		const to = index > from ? index - 1 : index;
		return to === from ? NOTHING : [{
			type: "reorderTab",
			tabId,
			index: to
		}];
	}
	return [tabInto(source, tabId, toPaneId, index)];
}
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
function planDropTab(state, mint, tabId, targetPaneId, zone, makeTab) {
	const source = findTabPane(state, tabId);
	const target = getPane(state, targetPaneId);
	if (target.host !== "dock") return NOTHING;
	const split = zoneSplit(zone);
	if (split === void 0) {
		if (source.id === targetPaneId) return NOTHING;
		return [tabInto(source, tabId, targetPaneId, target.tabs.length)];
	}
	const vacates = source.id === targetPaneId && source.tabs.length === 1;
	if (vacates && makeTab === void 0) return NOTHING;
	if (!canSplit(state)) return NOTHING;
	const newPaneId = mint("pane");
	const ops = [{
		type: "split",
		paneId: targetPaneId,
		axis: split.axis,
		direction: split.direction,
		newPaneId,
		newSplitId: mint("split")
	}];
	if (vacates && makeTab !== void 0) ops.push({
		type: "openTab",
		paneId: targetPaneId,
		tab: makeTab(mint("tab")),
		index: source.tabs.length
	});
	ops.push(tabInto(source, tabId, newPaneId, 0));
	return ops;
}
/**
* Take a tab out into a floating panel.
* @param state - current layout.
* @param mint - id source for the floating pane.
* @param tabId - tab to float.
* @param rect - explicit rectangle; defaults to a cascade from the last panel.
* @returns the operations plus the floating pane's id.
*/
function planFloatTab(state, mint, tabId, rect) {
	const step = state.floats.length * FLOAT_CASCADE_STEP;
	const newPaneId = mint("float");
	return {
		ops: [{
			type: "float",
			tabId,
			newPaneId,
			rect: rect ?? {
				x: FLOAT_ORIGIN.x + step,
				y: FLOAT_ORIGIN.y + step,
				width: FLOAT_DEFAULT_SIZE.width,
				height: FLOAT_DEFAULT_SIZE.height
			}
		}],
		paneId: newPaneId
	};
}
/**
* Send a floating panel's tab back into the docked tree.
* @param state - current layout.
* @param paneId - the floating pane.
* @param toPaneId - destination docked pane; defaults to the active one.
* @returns the operations.
*/
function planUnfloatPane(state, paneId, toPaneId) {
	const destination = toPaneId ?? activeDockPaneId(state);
	return [{
		type: "unfloat",
		paneId,
		toPaneId: destination,
		index: getPane(state, destination).tabs.length
	}];
}
/**
* Record the net sizes of a divider drag, clamped to the pane minimum.
* @param splitId - the split whose divider moved.
* @param sizes - the fractions the drag reached.
* @param minimum - smallest pane share; defaults to the kit's fraction.
* @returns the resize operation.
*/
function planResizeSplit(splitId, sizes, minimum) {
	return [{
		type: "resize",
		splitId,
		sizes: clampSizes(sizes, minimum)
	}];
}
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
function planSettle(state, mint, makeTab) {
	const ops = [];
	let current = state;
	for (;;) {
		const emptied = dockPaneIds(current).find((id) => id !== current.rootId && getPane(current, id).tabs.length === 0);
		if (emptied === void 0) break;
		const merge = {
			type: "merge",
			paneId: emptied
		};
		ops.push(merge);
		current = applyOp(current, merge).state;
	}
	const root = getNode(current, current.rootId);
	if (root.kind === "pane" && root.tabs.length === 0 && makeTab !== void 0) ops.push({
		type: "openTab",
		paneId: root.id,
		tab: makeTab(mint("tab")),
		index: 0
	});
	return ops;
}
//#endregion
//#region lib/types/engine/initial.js
/**
* Create an id source.
* @param seed - number the first id counts from; defaults to 0.
* @returns a minter producing `<prefix><n>` ids.
*/
function createIdMinter(seed = 0) {
	let counter = seed;
	const next = ((prefix) => {
		counter += 1;
		return `${prefix}${counter}`;
	});
	return { next };
}
/**
* The state a surface starts in: collapsed, one docked pane, and whatever tab
* `makeInitialTab` supplies.
*
* The first tab belongs to the initial state rather than to an operation, so
* expanding and collapsing never accumulates copies of it.
* @param minter - id source this surface's sequence will keep using.
* @param makeInitialTab - builds the starting tab; omit for an empty pane.
* @param mode - starting presentation; the embedder's product default.
* @returns the collapsed single-pane starting state.
*/
function createInitialState(minter, makeInitialTab, mode = "push") {
	const paneId = minter.next("pane");
	const initial = makeInitialTab?.(minter.next("tab"));
	return {
		nodes: { [paneId]: {
			kind: "pane",
			id: paneId,
			host: "dock",
			tabs: initial === void 0 ? [] : [initial.id],
			activeTabId: initial?.id,
			rect: void 0
		} },
		tabs: initial === void 0 ? {} : { [initial.id]: initial },
		rootId: paneId,
		floats: [],
		activePaneId: paneId,
		expanded: false,
		mode
	};
}
//#endregion
//#region lib/types/engine/controller.js
/** One docking surface: history, interaction limits, and change notification. */
var DockController = class {
	minter;
	sequencer;
	listeners = /* @__PURE__ */ new Set();
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
		return () => {
			this.listeners.delete(listener);
		};
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
			cursor: this.sequencer.cursor
		};
	}
	commit() {
		this.snapshot = this.buildSnapshot();
		for (const listener of [...this.listeners]) listener();
	}
	get state() {
		return this.sequencer.state;
	}
	get mint() {
		return this.minter.next;
	}
	/**
	* Record a planned intent as one history entry.
	* @param ops - the planner's operations; empty plans nothing.
	* @returns whether anything was recorded.
	*/
	run(ops) {
		if (ops.length === 0) return false;
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
		this.run([{
			type: "closeTab",
			tabId
		}]);
	}
	/**
	* Focus a tab, its pane, and raise that pane when it floats.
	* @param tabId - the tab to focus.
	*/
	focusTab(tabId) {
		this.run([{
			type: "focusTab",
			tabId
		}]);
	}
	/**
	* Focus a pane, raising it when it floats.
	* @param paneId - the pane to focus.
	*/
	focusPane(paneId) {
		this.run([{
			type: "focusPane",
			paneId
		}]);
	}
	/**
	* Move a tab inside its own pane.
	* @param tabId - the tab to move.
	* @param index - its position in the strip without it.
	*/
	reorderTab(tabId, index) {
		this.run([{
			type: "reorderTab",
			tabId,
			index
		}]);
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
		this.run([{
			type: "moveFloat",
			paneId,
			x,
			y
		}]);
	}
	/**
	* Record the net rectangle of a floating-panel resize; the panel is focused and raised with it.
	* @param paneId - the floating pane.
	* @param rect - its new rectangle.
	*/
	resizeFloat(paneId, rect) {
		this.run([{
			type: "resizeFloat",
			paneId,
			rect
		}]);
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
		if (!this.sequencer.undo()) return false;
		this.commit();
		return true;
	}
	/**
	* Step forward over what the matching undo stepped back.
	* @returns false when there is nothing to redo.
	*/
	redo() {
		if (!this.sequencer.redo()) return false;
		this.commit();
		return true;
	}
	/**
	* The pane a new tab lands in, for an embedder that needs to name it.
	* @returns the active pane when docked, else the first docked pane.
	*/
	activeDockPaneId() {
		return activeDockPaneId(this.state);
	}
};
//#endregion
//#region lib/types/components/measure.js
const NO_RECT = {
	x: 0,
	y: 0,
	width: 0,
	height: 0
};
/** What an unmeasured pane is taken to be: fitting, until a reading says otherwise. */
const UNMEASURED = {
	row: true,
	column: true
};
function rectOf(element) {
	return element === null ? NO_RECT : element.getBoundingClientRect();
}
function px(value) {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}
/**
* Every docked pane element under `root`, in document order, with the pane id
* each carries.
* @param root - the docked surface's element.
* @returns pane ids paired with their elements.
*/
function paneElements(root) {
	const panes = [];
	for (const pane of root.querySelectorAll("[data-dockkit-pane]")) {
		const paneId = pane.dataset.dockkitPane;
		/* v8 ignore next -- the selector admits only elements carrying the attribute. */
		if (paneId === void 0) continue;
		panes.push([paneId, pane]);
	}
	return panes;
}
/**
* One chip's minimum footprint from a rendered chip's computed style; the
* stylesheet fallback where none is rendered or styles are not applied.
*/
function chipMinimum(root) {
	const chip = root.querySelector("[data-dockkit-tab]");
	if (chip === null) return SPLIT_MINIMUMS.chip;
	const style = getComputedStyle(chip);
	const min = px(style.minWidth);
	if (min <= 0) return SPLIT_MINIMUMS.chip;
	if (style.boxSizing === "border-box") return min;
	return min + px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth);
}
/** A rendered divider's thickness, or the stylesheet fallback before the first split. */
function dividerSize(root) {
	const divider = root.querySelector("[data-dockkit-divider]");
	if (divider === null) return SPLIT_MINIMUMS.divider;
	const { width, height } = divider.getBoundingClientRect();
	const thickness = Math.min(width, height);
	return thickness > 0 ? thickness : SPLIT_MINIMUMS.divider;
}
/**
* The rendered split control's footprint in the strip's fixed part: its box
* plus the strip's own gap, both of which the strip sheds when the control
* hides. 0 while the control is hidden or unmeasured.
*/
function splitControlFootprint(pane) {
	const control = pane.querySelector("[data-dockkit-split-button]");
	if (control === null) return 0;
	const width = control.getBoundingClientRect().width;
	if (!(width > 0)) return 0;
	const strip = pane.querySelector("[data-dockkit-strip]");
	/* v8 ignore next -- the control only renders inside a strip. */
	return width + (strip === null ? 0 : px(getComputedStyle(strip).columnGap));
}
/**
* Measure every docked pane under `root`.
* @param root - the docked surface's element.
* @param splitHiddenWhenBlocked - whether the embedder hides blocked split
* controls (`hideSplitWhenBlocked`); the room rule then leaves the control's
* footprint out of each strip's fixed part, so the reading cannot flip with
* the control's visibility (see `PaneMeasure.splitControlWidth`).
* @returns each pane's fit, keyed by pane id.
*/
function measurePaneFits(root, splitHiddenWhenBlocked = false) {
	const minimums = {
		divider: dividerSize(root),
		chip: chipMinimum(root),
		body: SPLIT_MINIMUMS.body
	};
	const fits = /* @__PURE__ */ new Map();
	for (const [paneId, pane] of paneElements(root)) fits.set(paneId, halvesFit({
		pane: rectOf(pane),
		strip: rectOf(pane.querySelector("[data-dockkit-strip]")),
		chipsWidth: rectOf(pane.querySelector("[data-dockkit-strip-tabs]")).width,
		fillWidth: rectOf(pane.querySelector("[data-dockkit-strip-fill]")).width,
		splitControlWidth: splitHiddenWhenBlocked ? splitControlFootprint(pane) : 0
	}, minimums));
	return fits;
}
/**
* One pane's latest reading. A pane the map does not name has not been
* measured and fits: the rule only blocks on a positive reading.
* @param fits - the latest measurement.
* @param paneId - the pane asked about.
* @returns whether each split axis leaves two working halves.
*/
function fitOf(fits, paneId) {
	return fits.get(paneId) ?? UNMEASURED;
}
/**
* Whether two measurements agree, so a re-measure that changed nothing re-renders nothing.
* @param a - one measurement.
* @param b - the other.
* @returns whether both name the same panes with the same readings.
*/
function sameFits(a, b) {
	if (a.size !== b.size) return false;
	for (const [paneId, fit] of a) {
		const other = b.get(paneId);
		if (other === void 0 || other.row !== fit.row || other.column !== fit.column) return false;
	}
	return true;
}
//#endregion
//#region lib/types/components/pointer.js
/**
* Pointer ownership shared by the docking surface and the float layer.
*
* Capture is hardening, not the mechanism: the window listeners carry the
* gesture either way. Capture is what stops a scroll container the pointer
* crosses from claiming it, which Chromium reports as a cancelled pointer and
* an abandoned drag. Environments without the API (jsdom) simply go unhardened.
*/
/**
* Take ownership of the pointer for the rest of the gesture.
* @param element - the element the gesture started on.
* @param pointerId - the pointer to capture.
*/
function capturePointer(element, pointerId) {
	if (typeof element.setPointerCapture !== "function") return;
	element.setPointerCapture(pointerId);
}
/**
* Capture the pointer, then follow it on the window until release or cancel.
* Only that pointer's events count: a second finger or a pen beside the mouse
* neither moves nor ends the gesture. The listeners remove themselves before
* `up` or `cancel` runs; the returned callback ends the gesture early, for an
* unmount or a superseding press.
* @param element - the element the gesture started on.
* @param pointerId - the pointer to capture and follow.
* @param followers - listeners for move, release, and cancel.
* @returns detach callback removing the three listeners.
*/
function followPointer(element, pointerId, followers) {
	capturePointer(element, pointerId);
	const controller = new AbortController();
	const { signal } = controller;
	element.dataset.dockkitPointer = String(pointerId);
	signal.addEventListener("abort", () => {
		if (element.dataset.dockkitPointer === String(pointerId)) delete element.dataset.dockkitPointer;
	}, { once: true });
	const own = (event) => event.pointerId === pointerId;
	window.addEventListener("pointermove", (event) => {
		if (own(event)) followers.move(event);
	}, { signal });
	window.addEventListener("pointerup", (event) => {
		if (!own(event)) return;
		controller.abort();
		followers.up(event);
	}, { signal });
	window.addEventListener("pointercancel", (event) => {
		if (!own(event)) return;
		controller.abort();
		followers.cancel();
	}, { signal });
	return () => {
		controller.abort();
	};
}
/**
* One pointer gesture at a time for a component. A gesture ends on release, on
* cancel, or when a new press supersedes it; `reset` runs at each of those ends
* so the component clears its preview. Unmounting mid-gesture removes the
* listeners without resetting anything.
* @param reset - clears the component's gesture preview.
* @returns the gesture starter, called from a pointer-down handler.
*/
function useGesture(reset) {
	const inFlight = useRef(void 0);
	useEffect(() => () => {
		inFlight.current?.stop();
	}, []);
	return (element, pointerId, followers) => {
		inFlight.current?.end();
		const settle = () => {
			inFlight.current = void 0;
			reset();
		};
		const stop = followPointer(element, pointerId, {
			move: followers.move,
			up: (event) => {
				settle();
				followers.up(event);
			},
			cancel: settle
		});
		inFlight.current = {
			stop,
			end: () => {
				stop();
				settle();
			}
		};
	};
}
//#endregion
//#region lib/types/components/TabMenu.js
/**
* The per-tab context menu, opened by a secondary press on the chip. It carries
* the close gesture and whatever the embedder appends; the copy and float
* gestures have no menu item — copying is an embedder API, floating is a drag
* released clear of the surface. A menu that would hold no item at all renders
* no popup, so a secondary press on a chip with nothing to offer shows nothing.
* Presentational — it renders what its props supply and dismisses itself on
* outside presses or an unmodified Escape, returning menu focus to its tab.
*
* It renders in a portal, positioned against the control that opened it. The tab
* strip clips its overflow on purpose (so it never becomes a scroll container
* that claims a drag), and a menu drawn inside the strip would be clipped with
* it; a portal puts it above every clipping ancestor. React still bubbles the
* portal's synthetic events through the strip, which is why the press guards
* below remain necessary.
*/
/** Gap between the opening control and the menu, and the viewport margin kept clear. */
const MENU_GAP = 4;
/** Where the menu sits, or `undefined` before the first measurement. */
function placeMenu(anchor, menu) {
	const rect = anchor.getBoundingClientRect();
	const width = menu.offsetWidth;
	const left = rect.left + width + MENU_GAP > window.innerWidth ? Math.max(MENU_GAP, rect.right - width) : rect.left;
	return {
		top: rect.bottom + MENU_GAP,
		left
	};
}
/** The actions menu body, anchored to the control that opened it. */
function TabMenu({ labels, anchor, onClose, onDismiss, extras }) {
	const self = useRef(null);
	const [position, setPosition] = useState(void 0);
	const hasItems = onClose !== void 0 || Children.toArray(extras).some((item) => item !== "");
	useLayoutEffect(() => {
		if (self.current === null) return;
		setPosition(placeMenu(anchor, self.current));
	}, [anchor, hasItems]);
	useEffect(() => {
		const menu = self.current;
		/* v8 ignore next -- the ref is attached by effect time: the menu renders unconditionally. */
		if (menu === null) return void 0;
		const document = menu.ownerDocument;
		const composition = observeComposition(document);
		const onKeyDown = (event) => {
			if (composition.guards(event) || event.defaultPrevented || event.key !== "Escape" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
			if ([...document.querySelectorAll(modalSelector)].at(-1) !== menu) return;
			event.preventDefault();
			if (event.repeat) return;
			const restoreFocus = menu.contains(document.activeElement);
			onDismiss();
			if (restoreFocus) focusWithoutRing(anchor);
		};
		document.addEventListener("keydown", onKeyDown, true);
		const onPointerDown = (event) => {
			if (event.target instanceof Node && menu.contains(event.target)) return;
			onDismiss();
		};
		window.addEventListener("pointerdown", onPointerDown, true);
		return () => {
			composition.dispose();
			document.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("pointerdown", onPointerDown, true);
		};
	}, [
		anchor,
		onDismiss,
		hasItems
	]);
	if (!hasItems) return null;
	return createPortal(jsxs(MenuSurface, {
		className: css.menu,
		ref: self,
		role: "menu",
		"data-dockkit-tab-menu": true,
		style: position ?? {
			visibility: "hidden",
			top: 0,
			left: 0
		},
		onPointerDown: (event) => {
			event.stopPropagation();
		},
		onClick: (event) => {
			event.stopPropagation();
		},
		children: [onClose !== void 0 && jsx("button", {
			type: "button",
			role: "menuitem",
			className: css.menuItem,
			"data-dockkit-menu-close": true,
			onClick: onClose,
			children: labels.closeTab
		}), extras]
	}), document.body);
}
//#endregion
//#region lib/types/components/TabTitle.js
/**
* A chip's title: one line, clipped at the chip's inset, never ellipsized.
* While the text is wider than its box the span carries
* `data-dockkit-tab-clipped`, and the stylesheet fades the text out at the
* clipped edge in place of an ellipsis. Written to the DOM directly rather
* than through state: a reading changes nothing that renders, only how the
* stylesheet paints it. Re-read after every commit (the text may have
* changed) and whenever the span's box resizes (the chip shrank or grew).
*/
/** Set or clear the span's `data-dockkit-tab-clipped` from its current geometry. */
function markClipped(element) {
	if (element.scrollWidth > element.clientWidth + 1) element.dataset.dockkitTabClipped = "";
	else delete element.dataset.dockkitTabClipped;
}
/** The title span of a strip chip or a floating panel's header chip. */
function TabTitle({ children }) {
	const span = useRef(null);
	useLayoutEffect(() => {
		/* v8 ignore next -- the span is rendered unconditionally. */
		if (span.current !== null) markClipped(span.current);
	});
	useLayoutEffect(() => {
		const element = span.current;
		/* v8 ignore next -- the span is rendered unconditionally. */
		if (element === null || typeof ResizeObserver === "undefined") return void 0;
		const observer = new ResizeObserver(() => {
			markClipped(element);
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, []);
	return jsx("span", {
		ref: span,
		className: css.tabTitle,
		"data-dockkit-tab-title": true,
		children
	});
}
//#endregion
//#region lib/types/components/TabPanel.js
/**
* One pane: its tab strip (drag source, drop target, split control) and the
* active tab's body with the dock preview overlay. Presentational; every gesture
* leaves through `PaneCallbacks`, and the body itself comes from `renderTab`.
*
* A chip is a capsule carrying one control, its close, shown over its right
* end while the chip is active, hovered, or focused; the context menu
* (secondary press) carries the same close plus whatever the embedder appends.
* Both close routes draw only while the embedder's `canCloseTab` allows, and
* a pane's lone chip whose close is withheld draws quiet — no capsule, no
* hover fill — since there is nothing to select against and nothing to do to
* it.
* Between neighbouring chips sits a slot: a fixed-width box drawing a
* hairline, blank beside the active chip, and the drop caret when a drag
* targets that index, so a caret never widens the row; the two end slots
* exist only while targeted. The chips sit in their own box, the strip's one
* shrinking part: in a narrow pane their titles fade at the clipped edge down
* to the chip's floor and then the chips scroll there, keeping the active one
* in view, so the add control after them (drawn while the embedder's
* `canAddTab` allows), the pane's split control, and the embedder's chrome keep
* their width and their place at the strip's end.
*/
/**
* The ic_ds_panel_left_outline_16 frame alone: its outer and inner rounded
* rectangles as one even-odd ring, without the divider. The glyphs below draw
* inside it so they read as siblings of the panel controls beside them.
*/
const PANEL_FRAME = "M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM4.1828 14.0873L5.54303 14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715L4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873Z";
/** The split control's glyph from the shared product artwork. */
function SplitGlyph() {
	return jsxs("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		children: [jsx("path", {
			d: "M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z",
			stroke: "currentColor"
		}), jsx("path", {
			d: "M8 1.5V14.5",
			stroke: "currentColor"
		})]
	});
}
/**
* The drop hint's fill per zone: the half or the whole a release would fill
* drawn solid, so the hint names its zone before its caption is read. A half
* is drawn out to the frame's outer edge, under the ring, so its visible edge
* is exactly the ring's inner edge with no seam at the corners; the whole sits
* one stroke inside the frame so the ring stays visible around it.
*/
const ZONE_FILL = {
	center: "M4.56 3.48H11.44A1.6 1.6 0 0 1 13.04 5.08V10.92A1.6 1.6 0 0 1 11.44 12.52H4.56A1.6 1.6 0 0 1 2.96 10.92V5.08A1.6 1.6 0 0 1 4.56 3.48Z",
	left: "M4 0.523H8V15.477H4A4 4 0 0 1 0 11.477V4.523A4 4 0 0 1 4 0.523Z",
	right: "M8 0.523H12A4 4 0 0 1 16 4.523V11.477A4 4 0 0 1 12 15.477H8Z",
	top: "M0 8V4.523A4 4 0 0 1 4 0.523H12A4 4 0 0 1 16 4.523V8Z",
	bottom: "M0 8H16V11.477A4 4 0 0 1 12 15.477H4A4 4 0 0 1 0 11.477Z"
};
/** The drop hint's glyph: the panel frame with the zone's fill drawn solid. */
function ZoneGlyph({ zone }) {
	return jsxs("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		children: [jsx("path", {
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: PANEL_FRAME,
			fill: "currentColor"
		}), jsx("path", {
			d: ZONE_FILL[zone],
			fill: "currentColor"
		})]
	});
}
/**
* One landing card, inset inside the region a release would fill: a dashed
* frame, the zone's glyph, and its caption. `active` is the region under the
* pointer; a sibling shown for orientation only draws quieter.
*/
function DockHint({ zone, active, labels }) {
	return jsx("div", {
		className: css.dockHint,
		"data-dockkit-dock-zone": zone,
		"data-dockkit-drop-active": active || void 0,
		children: jsxs("div", {
			className: css.dockHintCard,
			children: [jsx(ZoneGlyph, { zone }), jsx("span", {
				className: css.dockHintLabel,
				children: labels.dropZone[zone]
			})]
		})
	});
}
/**
* The chip a navigation key moves focus to, in the WAI-ARIA tabs pattern with
* manual activation: Left and Right step through the strip and wrap, Home and
* End jump to its ends. Selecting is a separate key.
* @returns the chip to focus, or `undefined` when the key is not a navigation key.
*/
function chipToFocus(key, tabs, tabId) {
	const count = tabs.length;
	const index = tabs.indexOf(tabId);
	switch (key) {
		case "ArrowLeft": return tabs[(index - 1 + count) % count];
		case "ArrowRight": return tabs[(index + 1) % count];
		case "Home": return tabs[0];
		case "End": return tabs.at(-1);
		default: return;
	}
}
/** Whether a key selects the focused chip. */
function selects(key) {
	return key === "Enter" || key === " ";
}
/**
* Which sides of the chip box hold chips scrolled out of view, as the
* `data-dockkit-strip-scroll` value the stylesheet fades: `undefined` while
* every chip is in view.
*/
function hiddenSides(box) {
	const start = box.scrollLeft > 1;
	const end = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
	if (start && end) return "start end";
	if (start) return "start";
	if (end) return "end";
}
/**
* Keep the chip box's `data-dockkit-strip-scroll` current: read after each
* commit that can change the chips, on scroll, and on resize. Written to the
* DOM directly rather than through state because a reading never changes
* what renders, only how the stylesheet fades it.
*
* Known gap: a content-width change that alters neither `tabs` nor the box's
* outer size — a live `renderTabTitle` growing a chip, or a drop-caret slot
* mounting mid-drag — keeps the fade at its last reading until the next
* scroll or resize. The fade is orientation chrome, so a stale edge fades a
* few frames late rather than hiding anything.
*/
function useStripScrollFades(box, tabs) {
	useLayoutEffect(() => {
		const element = box.current;
		/* v8 ignore next -- the box is rendered unconditionally with the strip. */
		if (element === null) return void 0;
		const apply = () => {
			const sides = hiddenSides(element);
			if (sides === void 0) delete element.dataset.dockkitStripScroll;
			else element.dataset.dockkitStripScroll = sides;
		};
		apply();
		element.addEventListener("scroll", apply, { passive: true });
		const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(apply);
		observer?.observe(element);
		return () => {
			element.removeEventListener("scroll", apply);
			observer?.disconnect();
		};
	}, [box, tabs]);
}
/**
* Bring the active chip into the chip box's view whenever the active tab or
* the row of chips changes: a tab opened or selected past the box's edge, or
* moved there by a close or a reorder, scrolls the box to it, with the fade
* band (24px) cleared so the chip is not under it. A chip already in view
* moves nothing. Direct DOM, like the fades above: the box's scroll position
* renders nothing.
*/
function useActiveChipInView(box, chips, tabs, activeTabId) {
	useLayoutEffect(() => {
		const element = box.current;
		const chip = activeTabId === void 0 ? void 0 : chips.get(activeTabId);
		/* v8 ignore next -- the box and the active tab's chip are rendered with the strip. */
		if (element === null || chip === void 0) return;
		const bounds = element.getBoundingClientRect();
		const rect = chip.getBoundingClientRect();
		if (rect.left < bounds.left) element.scrollLeft += rect.left - bounds.left - STRIP_FADE;
		else if (rect.right > bounds.right) element.scrollLeft += rect.right - bounds.right + STRIP_FADE;
	}, [
		box,
		chips,
		tabs,
		activeTabId
	]);
}
/** Width of the chip box's fade at a hidden side; mirrors the stylesheet's 24px. */
const STRIP_FADE = 24;
/** Why the split control cannot act right now. */
function splitBlockedTitle(labels, block) {
	switch (block) {
		case "budget": return labels.splitPaneDisabled;
		case "width": return labels.splitPaneNarrow;
	}
}
/** @param props - pane state and gestures. @returns its tab strip without a content container. */
function TabStrip({ state, pane, callbacks }) {
	const [menu, setMenu] = useState(void 0);
	const [chips] = useState(() => /* @__PURE__ */ new Map());
	const stripTabs = useRef(null);
	useStripScrollFades(stripTabs, pane.tabs);
	useActiveChipInView(stripTabs, chips, pane.tabs, pane.activeTabId);
	const block = callbacks.splitBlock(pane.id);
	const target = callbacks.dropTarget;
	const stripIndex = target !== void 0 && target.kind === "strip" && target.paneId === pane.id ? target.index : void 0;
	/** Select a tab from a click or a key, unless it is the active pane's selected tab already: that changes nothing. */
	const activate = (tabId) => {
		if (state.activePaneId === pane.id && pane.activeTabId === tabId) return;
		callbacks.onFocusTab(tabId);
	};
	const focusChip = (tabId) => {
		const chip = chips.get(tabId);
		/* v8 ignore next -- every tab in the strip has a mounted chip, registered by its ref. */
		if (chip === void 0) return;
		chip.focus();
	};
	return jsxs("div", {
		className: css.tabStrip,
		role: "tablist",
		"data-dockkit-strip": pane.id,
		"data-window-drag": state.floats.length === 0 ? true : void 0,
		children: [
			jsxs("div", {
				ref: stripTabs,
				className: css.stripTabs,
				role: "presentation",
				"data-dockkit-strip-tabs": pane.id,
				children: [pane.tabs.map((tabId, index) => {
					const tab = getTab(state, tabId);
					const selected = tabId === pane.activeTabId;
					const closable = callbacks.canCloseTab(tabId);
					const quiet = !closable && pane.tabs.length === 1;
					return jsxs(Fragment$1, { children: [(index > 0 || stripIndex === index) && jsx("div", {
						className: clsx(css.slot, stripIndex === index && css.slotCaret),
						"data-dockkit-caret": stripIndex === index ? index : void 0
					}), jsxs("div", {
						role: "tab",
						"aria-selected": selected,
						tabIndex: selected ? 0 : -1,
						className: clsx(css.tab, selected && css.tabActive, quiet && css.tabQuiet, callbacks.draggingTabId === tabId && css.tabDragging),
						"data-dockkit-tab": tabId,
						"data-dockkit-tab-quiet": quiet || void 0,
						ref: (element) => {
							if (element === null) chips.delete(tabId);
							else chips.set(tabId, element);
						},
						onPointerDown: (event) => {
							if (event.button === 2) return;
							callbacks.onTabPressed(tabId, event);
						},
						onClick: (event) => {
							event.stopPropagation();
							activate(tabId);
						},
						onKeyDown: (event) => {
							if (event.target !== event.currentTarget) return;
							if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return;
							const next = chipToFocus(event.key, pane.tabs, tabId);
							if (next !== void 0) {
								event.preventDefault();
								focusChip(next);
								return;
							}
							if (selects(event.key)) {
								event.preventDefault();
								activate(tabId);
							}
						},
						onContextMenu: (event) => {
							event.preventDefault();
							const anchor = event.currentTarget;
							setMenu((current) => current?.tabId === tabId ? void 0 : {
								tabId,
								anchor
							});
						},
						children: [
							jsx(TabTitle, { children: callbacks.renderTabTitle?.(tab) ?? tab.title }),
							closable && jsx(Tooltip, {
								disabled: menu !== void 0,
								label: callbacks.labels.closeTab,
								shortcutKeys: callbacks.labels.closeTabKeys,
								side: "bottom",
								delayMs: 500,
								children: jsx("button", {
									type: "button",
									className: css.tabClose,
									"aria-label": callbacks.labels.closeTab,
									"aria-keyshortcuts": callbacks.labels.closeTabShortcut,
									"data-dockkit-tab-close": tabId,
									onPointerDown: (event) => {
										event.stopPropagation();
									},
									onClick: (event) => {
										event.stopPropagation();
										callbacks.onCloseTab(tabId);
									},
									children: jsx(IconCloseFillRegular, { size: 14 })
								})
							}),
							menu?.tabId === tabId && jsx(TabMenu, {
								labels: callbacks.labels,
								anchor: menu.anchor,
								onClose: closable ? () => {
									setMenu(void 0);
									callbacks.onCloseTab(tabId);
								} : void 0,
								onDismiss: () => {
									setMenu(void 0);
								},
								extras: callbacks.renderTabMenuItems?.(tab, () => {
									setMenu(void 0);
								})
							})
						]
					})] }, tabId);
				}), stripIndex === pane.tabs.length && jsx("div", {
					className: clsx(css.slot, css.slotCaret),
					"data-dockkit-caret": stripIndex
				})]
			}),
			callbacks.canAddTab(pane.id) && jsx(Tooltip, {
				label: callbacks.labels.addTab,
				side: "bottom",
				delayMs: 500,
				children: jsx("button", {
					type: "button",
					className: css.addTab,
					"aria-label": callbacks.labels.addTab,
					"data-dockkit-add-tab": pane.id,
					onClick: (event) => {
						event.stopPropagation();
						callbacks.onAddTab(pane.id);
					},
					children: jsx(IconPlusOutlineRegular, { size: 14 })
				})
			}),
			jsx("div", {
				className: css.stripFill,
				"data-dockkit-strip-fill": true
			}),
			!(callbacks.hideSplitWhenBlocked && block !== void 0) && jsx(Tooltip, {
				label: block === void 0 ? callbacks.labels.splitPane : splitBlockedTitle(callbacks.labels, block),
				shortcutKeys: callbacks.labels.splitPaneKeys,
				side: "bottom",
				delayMs: 500,
				children: jsx("span", {
					tabIndex: block === void 0 ? void 0 : 0,
					"aria-label": block === void 0 ? void 0 : splitBlockedTitle(callbacks.labels, block),
					children: jsx("button", {
						type: "button",
						className: css.iconButton,
						"aria-label": callbacks.labels.splitPane,
						"aria-keyshortcuts": callbacks.labels.splitPaneShortcut,
						disabled: block !== void 0,
						"data-dockkit-split-button": pane.id,
						"data-dockkit-split-blocked": block,
						onClick: (event) => {
							event.stopPropagation();
							callbacks.onSplitPane(pane.id);
						},
						children: jsx(SplitGlyph, {})
					})
				})
			}),
			pane.id === callbacks.chromePaneId && callbacks.chrome !== void 0 && jsx("div", {
				className: css.stripChrome,
				"data-dockkit-strip-chrome": true,
				onClick: (event) => {
					event.stopPropagation();
				},
				children: callbacks.chrome
			})
		]
	});
}
/** @param props - target pane and drag preview. @returns body-local drop feedback, or nothing. */
function PaneDropHints({ pane, callbacks }) {
	const target = callbacks.dropTarget;
	const zone = target?.kind === "zone" && target.paneId === pane.id ? target.zone : void 0;
	if (zone === void 0) return null;
	return jsxs(Fragment, { children: [jsx("div", {
		className: css.dockScrim,
		"data-dockkit-dock-scrim": true
	}), callbacks.horizontalDrops && zone !== "center" ? jsxs(Fragment, { children: [jsx(DockHint, {
		zone: "left",
		active: zone === "left",
		labels: callbacks.labels
	}), jsx(DockHint, {
		zone: "right",
		active: zone === "right",
		labels: callbacks.labels
	})] }) : jsx(DockHint, {
		zone,
		active: true,
		labels: callbacks.labels
	})] });
}
/** @param props - pane state and gestures. @returns one pane in the recursive, visibility-mounted layout. */
function TabPanel({ state, pane, callbacks }) {
	const active = pane.activeTabId === void 0 ? void 0 : getTab(state, pane.activeTabId);
	return jsxs("section", {
		className: css.pane,
		"data-dockkit-pane": pane.id,
		tabIndex: -1,
		"data-dockkit-pane-active": state.activePaneId === pane.id || void 0,
		onClick: () => {
			if (state.activePaneId !== pane.id) callbacks.onFocusPane(pane.id);
		},
		children: [jsx(TabStrip, {
			state,
			pane,
			callbacks
		}), jsxs("div", {
			className: css.paneBody,
			children: [active === void 0 ? jsx("p", {
				className: css.empty,
				children: callbacks.labels.emptyPane
			}) : callbacks.renderTab(active), jsx(PaneDropHints, {
				pane,
				callbacks
			})]
		})]
	});
}
//#endregion
//#region lib/types/components/PaneTree.js
/**
* The docked split tree: nested flex runs sized by each split's fractions, with a
* draggable divider between neighbours. A live divider drag renders from the
* preview fractions instead of the recorded ones — the gesture only settles one
* intent when it ends.
*/
/** Render a split or pane node and everything under it. */
function PaneTree({ state, nodeId, callbacks, preview }) {
	const node = getNode(state, nodeId);
	if (node.kind === "pane") return jsx(TabPanel, {
		state,
		pane: node,
		callbacks
	});
	const sizes = preview !== void 0 && preview.splitId === node.id ? preview.sizes : node.sizes;
	return jsx("div", {
		className: clsx(css.split, node.axis === "row" ? css.splitRow : css.splitColumn),
		"data-dockkit-split": node.id,
		children: node.children.map((childId, index) => jsxs(Fragment$1, { children: [index > 0 && jsx("div", {
			className: css.divider,
			"data-dockkit-divider": `${node.id}:${index - 1}`,
			onPointerDown: (event) => {
				callbacks.onDividerPressed(node.id, index - 1, event);
			}
		}), jsx("div", {
			className: css.splitCell,
			"data-dockkit-cell": `${node.id}:${index}`,
			style: { flexGrow: sizes[index] },
			children: jsx(PaneTree, {
				state,
				nodeId: childId,
				callbacks,
				preview
			})
		})] }, childId))
	});
}
//#endregion
//#region lib/types/components/FloatLayer.js
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
/** The rectangle a gesture has reached. */
function draggedRect(drag, x, y) {
	const dx = x - drag.originX;
	const dy = y - drag.originY;
	return drag.mode === "move" ? movedRect(drag.rect, dx, dy) : resizedRect(drag.rect, dx, dy, FLOAT_MIN_SIZE);
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
function useFloatGestures(state, intents) {
	const [preview, setPreview] = useState(void 0);
	const begin = useGesture(() => {
		setPreview(void 0);
	});
	/** Focus and raise a panel from a press or click on it, unless it is raised already. */
	const raise = (paneId) => {
		if (raised(state, paneId)) return;
		intents.focusPane(paneId);
	};
	/** Start a move or resize from a press on the panel's grip or corner; a release that moved nothing is a click. */
	const drag = (mode, paneId, event) => {
		event.stopPropagation();
		const root = document.documentElement;
		const windows = root.hasAttribute("data-windows-titlebar");
		const caption = windows && !root.hasAttribute("data-fullscreen") ? Number.parseFloat(root.style.getPropertyValue("--dsh-windows-titlebar-height")) : 0;
		const saved = floatRect(getPane(state, paneId));
		const rect = {
			...saved,
			y: Math.max(saved.y, windows ? caption + 20 : 0)
		};
		const start = {
			mode,
			originX: event.clientX,
			originY: event.clientY,
			rect
		};
		begin(event.currentTarget, event.pointerId, {
			move: (moved) => {
				setPreview({
					paneId,
					rect: draggedRect(start, moved.clientX, moved.clientY)
				});
			},
			up: (released) => {
				const rect = draggedRect(start, released.clientX, released.clientY);
				if (sameRect(rect, start.rect)) raise(paneId);
				else if (mode === "move") intents.moveFloat(paneId, rect.x, rect.y);
				else intents.resizeFloat(paneId, rect);
			}
		});
	};
	return {
		preview,
		raise,
		drag
	};
}
/**
* Header-only controls, usable above either retained or visibility-mounted bodies.
* @param props - owning pane/tab, localized labels and gesture callbacks.
* @returns the float header without a content container.
*/
function FloatHeader({ paneId, tab, labels, intents, renderTabTitle, canCloseTab, drag }) {
	return jsxs("header", {
		className: clsx(css.tabStrip, css.floatHeader),
		"data-dockkit-float-grip": paneId,
		onPointerDown: (event) => {
			drag("move", paneId, event);
		},
		children: [
			jsx("div", {
				className: clsx(css.tab, css.floatTitle),
				"data-dockkit-float-title": true,
				children: jsx(TabTitle, { children: renderTabTitle?.(tab) ?? tab.title })
			}),
			jsx("div", { className: css.stripFill }),
			jsx(Tooltip, {
				label: labels.dockFloat,
				side: "bottom",
				delayMs: 500,
				children: jsx("button", {
					type: "button",
					className: css.iconButton,
					"aria-label": labels.dockFloat,
					"data-dockkit-float-dock": paneId,
					onPointerDown: (event) => {
						event.stopPropagation();
					},
					onClick: () => {
						intents.unfloatPane(paneId);
					},
					children: jsx(IconPanelLeftOutlineRegular, { className: css.dockGlyph })
				})
			}),
			(canCloseTab?.(tab.id) ?? true) && jsx(Tooltip, {
				label: labels.closeTab,
				shortcutKeys: labels.closeTabKeys,
				side: "bottom",
				delayMs: 500,
				children: jsx("button", {
					type: "button",
					className: css.iconButton,
					"aria-label": labels.closeTab,
					"data-dockkit-float-close": paneId,
					onPointerDown: (event) => {
						event.stopPropagation();
					},
					onClick: () => {
						intents.closeTab(tab.id);
					},
					children: jsx(IconCloseOutlineRegular, {})
				})
			})
		]
	});
}
/** Every floating panel, in z order. */
function FloatLayer({ state, intents, labels, renderTab, renderTabTitle, canCloseTab }) {
	const { preview, raise, drag } = useFloatGestures(state, intents);
	return jsx(Fragment, { children: state.floats.map((paneId, depth) => {
		const pane = getPane(state, paneId);
		const tab = getTab(state, onlyTabId(pane));
		const lifted = preview?.paneId === paneId ? preview.rect : void 0;
		const live = lifted ?? floatRect(pane);
		return jsxs("div", {
			className: css.float,
			"data-dockkit-float": paneId,
			tabIndex: -1,
			"data-dockkit-float-active": state.activePaneId === paneId || void 0,
			style: {
				left: live.x,
				top: `max(var(--dsh-dockkit-float-top, 0px), ${live.y}px)`,
				width: live.width,
				height: live.height,
				zIndex: lifted === void 0 ? depth + 1 : state.floats.length + 1
			},
			onPointerDown: () => {
				raise(paneId);
			},
			children: [
				jsx(FloatHeader, {
					paneId,
					tab,
					labels,
					intents,
					renderTabTitle,
					canCloseTab,
					drag
				}),
				jsx("div", {
					className: css.floatBody,
					children: renderTab(tab)
				}),
				jsx("div", {
					className: css.floatResize,
					"data-dockkit-float-resize": paneId,
					onPointerDown: (event) => {
						drag("resize", paneId, event);
					}
				})
			]
		}, paneId);
	}) });
}
//#endregion
//#region lib/types/components/TabLayout.js
/** Stable tab siblings in one horizontal Grid, including viewport-positioned floats. */
/** A tab's ancestors stay identical across selection, pane moves and floating. */
function TabHost({ state, callbacks, intents, tab, pane, column, floats, focusRequest, keepMounted, active = true }) {
	const floating = pane.host === "float";
	const selected = floating || pane.activeTabId === tab.id;
	const visible = active && selected && (floating || state.expanded);
	const retained = keepMounted?.(tab) ?? false;
	const [visited, setVisited] = useState(visible);
	if (visible && !visited) setVisited(true);
	const host = useRef(null);
	const body = useRef(null);
	useLayoutEffect(() => {
		const section = host.current;
		section.inert = !visible;
		const focused = document.activeElement;
		if (!visible && focused instanceof HTMLElement && section.contains(focused)) focused.blur();
		const request = focusRequest.current;
		if (!visible || request?.tabId !== tab.id) return;
		focusRequest.current = void 0;
		if (focused !== null && focused !== document.body && focused !== document.documentElement && focused !== request.origin) return;
		[...section.querySelector("[data-dockkit-strip]")?.querySelectorAll("[data-dockkit-tab]") ?? []].find((element) => element.dataset.dockkitTab === tab.id)?.focus({ preventScroll: true });
	}, [
		visible,
		tab.id,
		focusRequest
	]);
	useEffect(() => {
		const element = body.current;
		const focus = () => {
			if (!visible) return;
			if (floating) floats.raise(pane.id);
			else if (state.activePaneId !== pane.id) callbacks.onFocusPane(pane.id);
		};
		element.addEventListener("focus", focus, true);
		return () => {
			element.removeEventListener("focus", focus, true);
		};
	}, [
		visible,
		floating,
		floats,
		pane.id,
		state.activePaneId,
		callbacks
	]);
	const lifted = floating && floats.preview?.paneId === pane.id ? floats.preview.rect : void 0;
	const rect = floating ? lifted ?? floatRect(pane) : void 0;
	const depth = lifted === void 0 ? state.floats.indexOf(pane.id) + 1 : state.floats.length + 1;
	return jsx("div", {
		className: clsx(css.tabCell, floating && css.floatingCell),
		hidden: !selected,
		"data-dockkit-host": floating ? "float" : "dock",
		"data-dockkit-column": floating ? void 0 : column,
		style: {
			gridColumn: floating ? 1 : column * 2 + 1,
			gridRow: 1,
			order: floating ? depth : 0
		},
		children: jsxs("section", {
			ref: host,
			tabIndex: -1,
			className: clsx(css.tabHost, floating ? css.float : css.pane),
			"aria-hidden": !visible || void 0,
			"data-dockkit-content": tab.id,
			"data-dockkit-pane": !floating && selected ? pane.id : void 0,
			"data-dockkit-pane-active": !floating && state.activePaneId === pane.id || void 0,
			"data-dockkit-float": floating ? pane.id : void 0,
			"data-dockkit-float-active": floating && state.activePaneId === pane.id || void 0,
			"data-dockkit-column": !floating ? column : void 0,
			style: rect === void 0 ? void 0 : {
				left: rect.x,
				top: `max(var(--dsh-dockkit-float-top, 0px), ${rect.y}px)`,
				width: rect.width,
				height: rect.height
			},
			onPointerDown: () => {
				if (floating) floats.raise(pane.id);
			},
			onClick: () => {
				if (!floating && state.activePaneId !== pane.id) callbacks.onFocusPane(pane.id);
			},
			children: [
				jsx("div", {
					className: css.tabHostHeader,
					children: selected && (floating ? jsx(FloatHeader, {
						paneId: pane.id,
						tab,
						labels: callbacks.labels,
						intents,
						renderTabTitle: callbacks.renderTabTitle,
						canCloseTab: callbacks.canCloseTab,
						drag: floats.drag
					}) : jsx(TabStrip, {
						state,
						pane,
						callbacks
					}))
				}),
				jsxs("div", {
					ref: body,
					className: clsx(css.tabHostBody, floating ? css.floatBody : css.paneBody),
					children: [visited && (retained || active && selected) ? callbacks.renderTab(tab) : null, !floating && jsx(PaneDropHints, {
						pane,
						callbacks
					})]
				}),
				floating && jsx("div", {
					className: css.floatResize,
					"data-dockkit-float-resize": pane.id,
					onPointerDown: (event) => {
						floats.drag("resize", pane.id, event);
					}
				})
			]
		})
	});
}
/**
* One or two horizontal panes; CSS resolves content sizes from track fractions.
* @param props - committed layout, gesture preview and body retention policy.
* @returns stable tab containers, including floating tabs.
* @throws if the docked tree is not one pane or two horizontal panes.
*/
function TabLayout(props) {
	const { state, callbacks, preview } = props;
	const focusRequest = useRef();
	const tabCallbacks = {
		...callbacks,
		onFocusTab: (tabId) => {
			focusRequest.current = findTabPane(state, tabId).activeTabId === tabId ? void 0 : {
				tabId,
				origin: document.activeElement
			};
			callbacks.onFocusTab(tabId);
		}
	};
	const root = getNode(state, state.rootId);
	if (root.kind === "split" && (root.axis !== "row" || root.children.length !== 2)) throw new Error("DockLayout requires one pane or two horizontally split panes");
	const panes = root.kind === "pane" ? [root] : root.children.map((id) => getPane(state, id));
	const sizes = root.kind === "split" ? preview?.splitId === root.id ? preview.sizes : root.sizes : [1];
	const floats = useFloatGestures(state, props.intents);
	const columns = sizes.map((size) => `minmax(0, ${size}fr)`).join(" 0px ");
	return jsxs("div", {
		className: css.tabLayout,
		"data-dockkit-split": root.kind === "split" ? root.id : void 0,
		style: { gridTemplateColumns: columns },
		children: [
			Object.values(state.tabs).sort((a, b) => a.id.localeCompare(b.id)).map((tab) => {
				const pane = findTabPane(state, tab.id);
				return jsx(TabHost, {
					...props,
					callbacks: tabCallbacks,
					tab,
					pane,
					column: panes.findIndex((candidate) => candidate.id === pane.id),
					floats,
					focusRequest
				}, tab.id);
			}),
			panes.filter((pane) => pane.tabs.length === 0).map((pane) => jsx("div", {
				className: css.emptyTabHost,
				"data-dockkit-empty": true,
				style: {
					gridColumn: panes.indexOf(pane) * 2 + 1,
					gridRow: 1
				},
				children: jsx(TabPanel, {
					state,
					pane,
					callbacks
				})
			}, pane.id)),
			root.kind === "split" && jsx("div", {
				className: clsx(css.divider, css.tabLayoutDivider),
				"data-dockkit-divider": `${root.id}:0`,
				style: {
					gridColumn: 2,
					gridRow: 1
				},
				onPointerDown: (event) => {
					callbacks.onDividerPressed(root.id, 0, event);
				}
			})
		]
	});
}
//#endregion
//#region lib/types/components/DockSurface.js
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
const NO_PREVIEW = {
	draggingTabId: void 0,
	dropTarget: void 0,
	sizes: void 0
};
/** Nothing measured yet: every pane fits until a reading says otherwise. */
const NO_FITS = /* @__PURE__ */ new Map();
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
		if (!containsPoint(rect, x, y)) continue;
		const strip = pane.querySelector("[data-dockkit-strip]");
		if (strip !== null && containsPoint(strip.getBoundingClientRect(), x, y)) return {
			kind: "strip",
			paneId,
			index: insertionIndex([...strip.querySelectorAll("[data-dockkit-tab]")].map((tab) => tab.getBoundingClientRect()), x)
		};
		const zone = dropZones === "horizontal" ? canSplit && fitOf(fits, paneId).row ? x < rect.x + rect.width / 2 ? "left" : "right" : "center" : zoneInRect(rect, x, y);
		if (zone !== "center") {
			const fit = fitOf(fits, paneId);
			const room = zone === "left" || zone === "right" ? fit.row : fit.column;
			if (!canSplit || !room) return void 0;
		}
		return {
			kind: "zone",
			paneId,
			zone
		};
	}
}
/** Fractions a divider drag has reached, clamped to the pane minimum. */
function draggedSizes(drag, x, y, minimum) {
	const moved = (drag.axis === "row" ? x : y) - drag.origin;
	const delta = drag.extent > 0 ? moved / drag.extent : 0;
	return clampSizes(dividerSizes(drag.sizes, drag.index, delta), minimum);
}
/** Fractions closer than this are the same split: renormalizing recorded sizes moves them by no more. */
const SIZE_TOLERANCE = 1e-9;
/** Whether two fraction lists describe the same split. */
function sameSizes(a, b) {
	return a.length === b.length && a.every((size, index) => {
		const other = b[index];
		return other !== void 0 && Math.abs(size - other) < SIZE_TOLERANCE;
	});
}
/** The split tree and the gestures over it. */
function Surface({ state, canSplit, canAddTab, canCloseTab, intents, labels, renderTab, renderTabTitle, renderTabMenuItems, chrome, onRoom, draw, dropZones = "edges", minPaneFraction = MIN_PANE_FRACTION, hideSplitWhenBlocked = false }) {
	const surface = useRef(null);
	const [preview, setPreview] = useState(NO_PREVIEW);
	const [fits, setFits] = useState(NO_FITS);
	const begin = useGesture(() => {
		setPreview(NO_PREVIEW);
	});
	/** Run `use` on the surface element, which every commit and every press inside it has mounted. */
	const withSurface = useCallback((use) => {
		const root = surface.current;
		/* v8 ignore next -- ref-null guard: the surface div renders unconditionally. */
		if (root === null) return;
		use(root);
	}, []);
	const remeasure = useCallback(() => {
		withSurface((root) => {
			const next = measurePaneFits(root, hideSplitWhenBlocked);
			setFits((current) => sameFits(current, next) ? current : next);
		});
	}, [withSurface, hideSplitWhenBlocked]);
	useLayoutEffect(() => {
		remeasure();
	});
	useEffect(() => {
		onRoom?.(fits);
	}, [fits, onRoom]);
	useEffect(() => {
		const root = surface.current;
		if (root === null || typeof ResizeObserver === "undefined") return void 0;
		const observer = new ResizeObserver(() => {
			remeasure();
		});
		observer.observe(root);
		return () => {
			observer.disconnect();
		};
	}, [remeasure]);
	/** Why a pane cannot split right now: the budget first, then its own width. */
	const splitBlock = (paneId) => {
		if (!canSplit) return "budget";
		return fitOf(fits, paneId).row ? void 0 : "width";
	};
	const callbacks = {
		onFocusTab: intents.focusTab.bind(intents),
		onFocusPane: intents.focusPane.bind(intents),
		onSplitPane: intents.splitPane.bind(intents),
		onAddTab: intents.addTab.bind(intents),
		onCloseTab: intents.closeTab.bind(intents),
		onTabPressed: (tabId, event) => {
			withSurface((root) => {
				const startX = event.clientX;
				const startY = event.clientY;
				let dragging = false;
				begin(event.currentTarget, event.pointerId, {
					move: (moved) => {
						if (!dragging) {
							if (!passedThreshold(startX, startY, moved.clientX, moved.clientY)) return;
							dragging = true;
						}
						setPreview({
							...NO_PREVIEW,
							draggingTabId: tabId,
							dropTarget: hitTest(root, moved.clientX, moved.clientY, canSplit, fits, dropZones)
						});
					},
					up: (released) => {
						if (!dragging) return;
						const target = hitTest(root, released.clientX, released.clientY, canSplit, fits, dropZones);
						if (target === void 0) {
							if (containsPoint(root.getBoundingClientRect(), released.clientX, released.clientY)) return;
							intents.floatTab(tabId, floatRectAt(released.clientX, released.clientY, FLOAT_DEFAULT_SIZE));
							return;
						}
						if (target.kind === "strip") intents.placeTab(tabId, target.paneId, target.index);
						else intents.dropTab(tabId, target.paneId, target.zone);
					}
				});
			});
		},
		onDividerPressed: (splitId, index, event) => {
			const container = event.currentTarget.parentElement;
			/* v8 ignore next -- a divider is rendered as a child of its split's element. */
			if (container === null) return;
			const split = getSplit(state, splitId);
			const box = container.getBoundingClientRect();
			const drag = {
				splitId,
				index,
				axis: split.axis,
				origin: split.axis === "row" ? event.clientX : event.clientY,
				extent: split.axis === "row" ? box.width : box.height,
				sizes: split.sizes
			};
			begin(event.currentTarget, event.pointerId, {
				move: (moved) => {
					setPreview({
						...NO_PREVIEW,
						sizes: {
							splitId,
							sizes: draggedSizes(drag, moved.clientX, moved.clientY, minPaneFraction)
						}
					});
				},
				up: (released) => {
					const sizes = draggedSizes(drag, released.clientX, released.clientY, minPaneFraction);
					if (sameSizes(sizes, drag.sizes)) return;
					intents.resizeSplit(splitId, sizes);
				}
			});
		},
		splitBlock,
		hideSplitWhenBlocked,
		canAddTab: canAddTab ?? ALWAYS,
		canCloseTab: canCloseTab ?? ALWAYS,
		dropTarget: preview.dropTarget,
		horizontalDrops: dropZones === "horizontal",
		draggingTabId: preview.draggingTabId,
		labels,
		renderTab,
		renderTabTitle,
		renderTabMenuItems,
		chromePaneId: topRightPaneId(state),
		chrome
	};
	return jsx("div", {
		className: css.surface,
		ref: surface,
		"data-dockkit-surface": true,
		"data-dockkit-drop-zones": dropZones,
		children: draw(callbacks, preview.sizes)
	});
}
/** Recursive docked layout; floating content is rendered separately by FloatLayer. */
function DockSurface(props) {
	return jsx(Surface, {
		...props,
		draw: (callbacks, preview) => jsx(PaneTree, {
			state: props.state,
			nodeId: props.state.rootId,
			callbacks,
			preview
		})
	});
}
/**
* Render one pane or two horizontal panes, and their floats, in one stable content tree.
* @param props - layout, gestures and lazy body-retention policy.
* @returns the layout; the containing ancestors must not clip or establish a fixed-position containing block.
*/
function DockLayout(props) {
	return jsx(Surface, {
		...props,
		draw: (callbacks, preview) => jsx(TabLayout, {
			...props,
			callbacks,
			preview
		})
	});
}
//#endregion
export { DOCK_EDGE_FRACTION, DOCK_ZONES, DRAG_THRESHOLD, DockController, DockLayout, DockSurface, EMPTY_HISTORY, FLOAT_DEFAULT_SIZE, FLOAT_MIN_SIZE, FloatLayer, MAX_DOCK_PANES, MIN_PANE_FRACTION, SPLIT_MINIMUMS, Sequencer, activeDockPaneId, applyOp, canSplit, canStepBack, canStepForward, clampSizes, containsPoint, createIdMinter, createInitialState, dividerSizes, dockPaneCount, dockPaneIds, findContentTab, findPaneContentTab, findParent, findTabPane, floatRectAt, getNode, getPane, getSplit, getTab, halvesFit, insertionIndex, isFocusOp, movedRect, passedThreshold, planAddTab, planDropTab, planDuplicateTab, planFloatTab, planOpenContent, planPlaceTab, planResizeSplit, planSetExpanded, planSetMode, planSettle, planSplitPane, planUnfloatPane, record, recordedOps, replay, resizedRect, stepBack, stepForward, topRightPaneId, zoneAt, zoneInRect, zoneSplit };

//# sourceMappingURL=index.js.map