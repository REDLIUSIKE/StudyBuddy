import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The docked split tree: nested flex runs sized by each split's fractions, with a
 * draggable divider between neighbours. A live divider drag renders from the
 * preview fractions instead of the recorded ones — the gesture only settles one
 * intent when it ends.
 */
import { Fragment } from 'react';
import clsx from 'clsx';
import { getNode } from "../engine/tree.js";
import { TabPanel } from "./TabPanel.js";
import css from './dockkit.module.css';
/** Render a split or pane node and everything under it. */
export function PaneTree({ state, nodeId, callbacks, preview }) {
    const node = getNode(state, nodeId);
    if (node.kind === 'pane')
        return _jsx(TabPanel, { state: state, pane: node, callbacks: callbacks });
    const sizes = preview !== undefined && preview.splitId === node.id ? preview.sizes : node.sizes;
    return (_jsx("div", { className: clsx(css.split, node.axis === 'row' ? css.splitRow : css.splitColumn), "data-dockkit-split": node.id, children: node.children.map((childId, index) => (_jsxs(Fragment, { children: [index > 0 && (_jsx("div", { className: css.divider, "data-dockkit-divider": `${node.id}:${index - 1}`, onPointerDown: (event) => { callbacks.onDividerPressed(node.id, index - 1, event); } })), _jsx("div", { className: css.splitCell, "data-dockkit-cell": `${node.id}:${index}`, style: { flexGrow: sizes[index] }, children: _jsx(PaneTree, { state: state, nodeId: childId, callbacks: callbacks, preview: preview }) })] }, childId))) }));
}
//# sourceMappingURL=PaneTree.js.map