import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Stable tab siblings in one horizontal Grid, including viewport-positioned floats. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { findTabPane, floatRect, getNode, getPane } from "../engine/tree.js";
import { FloatHeader, useFloatGestures } from "./FloatLayer.js";
import { PaneDropHints, TabPanel, TabStrip } from "./TabPanel.js";
import css from './dockkit.module.css';
/** A tab's ancestors stay identical across selection, pane moves and floating. */
function TabHost({ state, callbacks, intents, tab, pane, column, floats, focusRequest, keepMounted, active = true }) {
    const floating = pane.host === 'float';
    const selected = floating || pane.activeTabId === tab.id;
    const visible = active && selected && (floating || state.expanded);
    const retained = keepMounted?.(tab) ?? false;
    const [visited, setVisited] = useState(visible);
    if (visible && !visited)
        setVisited(true);
    const host = useRef(null);
    const body = useRef(null);
    useLayoutEffect(() => {
        // Both refs target unconditional descendants attached before these effects.
        const section = host.current;
        section.inert = !visible;
        const focused = document.activeElement;
        if (!visible && focused instanceof HTMLElement && section.contains(focused))
            focused.blur();
        const request = focusRequest.current;
        if (!visible || request?.tabId !== tab.id)
            return;
        focusRequest.current = undefined;
        // Preserve deliberate focus taken by another control or the newly shown body.
        if (focused !== null && focused !== document.body && focused !== document.documentElement && focused !== request.origin)
            return;
        const strip = section.querySelector('[data-dockkit-strip]');
        const chip = [...strip?.querySelectorAll('[data-dockkit-tab]') ?? []]
            .find(element => element.dataset.dockkitTab === tab.id);
        chip?.focus({ preventScroll: true });
    }, [visible, tab.id, focusRequest]);
    // Electron emits a non-bubbling focus event on the webview element.
    useEffect(() => {
        const element = body.current;
        const focus = () => {
            if (!visible)
                return;
            if (floating)
                floats.raise(pane.id);
            else if (state.activePaneId !== pane.id)
                callbacks.onFocusPane(pane.id);
        };
        element.addEventListener('focus', focus, true);
        return () => { element.removeEventListener('focus', focus, true); };
    }, [visible, floating, floats, pane.id, state.activePaneId, callbacks]);
    const lifted = floating && floats.preview?.paneId === pane.id ? floats.preview.rect : undefined;
    const rect = floating ? lifted ?? floatRect(pane) : undefined;
    const depth = lifted === undefined ? state.floats.indexOf(pane.id) + 1 : state.floats.length + 1;
    return (_jsx("div", { className: clsx(css.tabCell, floating && css.floatingCell), hidden: !selected, "data-dockkit-host": floating ? 'float' : 'dock', "data-dockkit-column": floating ? undefined : column, style: { gridColumn: floating ? 1 : column * 2 + 1, gridRow: 1, order: floating ? depth : 0 }, children: _jsxs("section", { ref: host, tabIndex: -1, className: clsx(css.tabHost, floating ? css.float : css.pane), "aria-hidden": !visible || undefined, "data-dockkit-content": tab.id, "data-dockkit-pane": !floating && selected ? pane.id : undefined, "data-dockkit-pane-active": !floating && state.activePaneId === pane.id || undefined, "data-dockkit-float": floating ? pane.id : undefined, "data-dockkit-float-active": floating && state.activePaneId === pane.id || undefined, "data-dockkit-column": !floating ? column : undefined, style: rect === undefined ? undefined : {
                left: rect.x, top: `max(var(--dsh-dockkit-float-top, 0px), ${rect.y}px)`, width: rect.width, height: rect.height,
            }, onPointerDown: () => { if (floating)
                floats.raise(pane.id); }, onClick: () => { if (!floating && state.activePaneId !== pane.id)
                callbacks.onFocusPane(pane.id); }, children: [_jsx("div", { className: css.tabHostHeader, children: selected && (floating
                        ? _jsx(FloatHeader, { paneId: pane.id, tab: tab, labels: callbacks.labels, intents: intents, renderTabTitle: callbacks.renderTabTitle, canCloseTab: callbacks.canCloseTab, drag: floats.drag })
                        : _jsx(TabStrip, { state: state, pane: pane, callbacks: callbacks })) }), _jsxs("div", { ref: body, className: clsx(css.tabHostBody, floating ? css.floatBody : css.paneBody), children: [visited && (retained || (active && selected)) ? callbacks.renderTab(tab) : null, !floating && _jsx(PaneDropHints, { pane: pane, callbacks: callbacks })] }), floating && _jsx("div", { className: css.floatResize, "data-dockkit-float-resize": pane.id, onPointerDown: (event) => { floats.drag('resize', pane.id, event); } })] }) }));
}
/**
 * One or two horizontal panes; CSS resolves content sizes from track fractions.
 * @param props - committed layout, gesture preview and body retention policy.
 * @returns stable tab containers, including floating tabs.
 * @throws if the docked tree is not one pane or two horizontal panes.
 */
export function TabLayout(props) {
    const { state, callbacks, preview } = props;
    const focusRequest = useRef();
    const tabCallbacks = {
        ...callbacks,
        onFocusTab: (tabId) => {
            // Only changing the selected body replaces its strip; pane-only focus does not.
            focusRequest.current = findTabPane(state, tabId).activeTabId === tabId
                ? undefined : { tabId, origin: document.activeElement };
            callbacks.onFocusTab(tabId);
        },
    };
    const root = getNode(state, state.rootId);
    if (root.kind === 'split' && (root.axis !== 'row' || root.children.length !== 2)) {
        throw new Error('DockLayout requires one pane or two horizontally split panes');
    }
    const panes = root.kind === 'pane' ? [root] : root.children.map(id => getPane(state, id));
    const sizes = root.kind === 'split' ? preview?.splitId === root.id ? preview.sizes : root.sizes : [1];
    const floats = useFloatGestures(state, props.intents);
    const columns = sizes.map(size => `minmax(0, ${size}fr)`).join(' 0px ');
    return (_jsxs("div", { className: css.tabLayout, "data-dockkit-split": root.kind === 'split' ? root.id : undefined, style: { gridTemplateColumns: columns }, children: [Object.values(state.tabs).sort((a, b) => a.id.localeCompare(b.id)).map((tab) => {
                const pane = findTabPane(state, tab.id);
                return _jsx(TabHost, { ...props, callbacks: tabCallbacks, tab: tab, pane: pane, column: panes.findIndex(candidate => candidate.id === pane.id), floats: floats, focusRequest: focusRequest }, tab.id);
            }), panes.filter(pane => pane.tabs.length === 0).map(pane => (_jsx("div", { className: css.emptyTabHost, "data-dockkit-empty": true, style: { gridColumn: panes.indexOf(pane) * 2 + 1, gridRow: 1 }, children: _jsx(TabPanel, { state: state, pane: pane, callbacks: callbacks }) }, pane.id))), root.kind === 'split' && _jsx("div", { className: clsx(css.divider, css.tabLayoutDivider), "data-dockkit-divider": `${root.id}:0`, style: { gridColumn: 2, gridRow: 1 }, onPointerDown: (event) => { callbacks.onDividerPressed(root.id, 0, event); } })] }));
}
//# sourceMappingURL=TabLayout.js.map