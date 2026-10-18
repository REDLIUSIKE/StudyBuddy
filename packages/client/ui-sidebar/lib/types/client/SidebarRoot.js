import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Sidebar shell: column geometry and global panel navigation.
 * Collapse is a slide plus crossfade:
 * content freezes at its expanded width (inline style) and fades out in place
 * while the sliding column (AppFrame grid tracks) clips it — nothing reflows
 * mid-slide. At settle the wide-only content unmounts and the upper
 * controls enter the 56px rail from the same horizontal offset (one icon each,
 * same top-down order) on one fade that ends with the slide. The bottom-pinned
 * settings and management controls only fade. The workspace/session browsing region between
 * global panel rows and the foot is the `sidebar.workspaces` registrant's,
 * and the foot holds `sidebar.settings`, `sidebar.footer.action`, and bottom panel rows; the shell
 * hands them the wide flag (plus an expand request callback for the browser).
 *
 * The column also owns whether the scroll regions nested in it draw a
 * scrollbar at all: the shell tracks the pointer and rebinds ui-theme's
 * scrollbar indirection away while it is elsewhere, so a list the user is not
 * pointing at carries no bar.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { FishLogo, IconNewChatOutlineMedium, IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, isDarwinDesktop, ShortcutKeys, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './SidebarRoot.module.css';
/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150;
/** Management destinations stay above the bottom-pinned Settings entry. */
const BOTTOM_PANEL_IDS = ['schedules', 'plugins'];
/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 * The bar is a pointer affordance here, and hiding it on the leave event
 * itself makes it blink out while the pointer is only crossing the column's
 * edge — on the way to the conversation, or around a portalled menu.
 */
const SCROLLBAR_LINGER_MS = 2000;
/** Format complete-build metadata for the local brand badge. */
function localBuildVersion() {
    const version = process.env.DSH_CLIENT_VERSION;
    if (version === undefined)
        return undefined;
    const commit = process.env.DSH_CLIENT_COMMIT_HASH;
    return version
        + (commit === undefined ? '' : `-${commit}`)
        + (process.env.DSH_CLIENT_GIT_DIRTY === 'true' ? '-dirty' : '');
}
/** Each panel row subscribes only to its own selection state. */
function PanelRow({ id, label, wide, covered = false, usePanelInfo, selectPanel, renderSlot }) {
    const active = usePanelInfo(info => info.activePanelId === id);
    return (_jsx(Tooltip, { label: label, delayMs: 500, disabled: wide, children: _jsxs("button", { type: "button", className: clsx(css.panelRow, active && css.panelActive), "aria-label": label, "aria-current": active ? 'page' : undefined, "aria-hidden": covered || undefined, tabIndex: covered ? -1 : undefined, ...(covered ? { inert: '' } : {}), onClick: () => { selectPanel(id); }, children: [_jsx("span", { className: css.panelGlyph, "aria-hidden": "true", children: renderSlot('sidebar.panellist', { size: wide ? 16 : 18, active }, { only: id }) }), wide && (_jsx("span", { className: clsx(css.panelTitle, css.wide), children: label }))] }) }));
}
/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({ collapsed, width, startSession, toggleSidebar, selectPanel, usePanels, useShortcuts, usePanelInfo, t, renderSlot, }) {
    const panels = usePanels(snapshot => snapshot);
    const upperPanels = panels.filter(({ id }) => !BOTTOM_PANEL_IDS.some(bottomId => bottomId === id));
    const bottomPanels = BOTTOM_PANEL_IDS.flatMap(id => panels.filter(panel => panel.id === id));
    const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'));
    const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'));
    const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse');
    // Wide content stays mounted while the collapse animates (fading via
    // .collapsed .wide), unmounts at settle, and remounts right away on expand.
    const [settled, setSettled] = useState(collapsed);
    useEffect(() => {
        if (!collapsed) {
            setSettled(false);
            return;
        }
        const timer = window.setTimeout(() => { setSettled(true); }, COLLAPSE_SETTLE_MS);
        return () => { window.clearTimeout(timer); };
    }, [collapsed]);
    const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar');
    const wide = windowsTitlebar ? !collapsed : !collapsed || !settled;
    const upperNavigation = useRef(null);
    const [workspaceHeight, setWorkspaceHeight] = useState(0);
    const [workspaceGeometry, setWorkspaceGeometry] = useState({ maxHeight: 0, rowBottoms: [] });
    const upperPanelKey = upperPanels.map(({ id }) => id).join('\0');
    // Keep the feature rows in place and enlarge the same browser over their
    // lower edge. The measured limit protects the brand and New Session.
    useLayoutEffect(() => {
        if (!wide || collapsed)
            return;
        const navigation = upperNavigation.current;
        const measure = () => {
            const rect = navigation?.getBoundingClientRect();
            const margin = navigation === null ? 0 : Number.parseFloat(getComputedStyle(navigation).marginBottom) || 0;
            const maxHeight = Math.max(0, (rect?.height ?? 0) + margin);
            const rowBottoms = navigation === null ? [] : Array.from(navigation.querySelectorAll('button'))
                .map(row => row.getBoundingClientRect().bottom - (rect?.top ?? 0));
            setWorkspaceGeometry(previous => previous.maxHeight === maxHeight
                && previous.rowBottoms.length === rowBottoms.length
                && previous.rowBottoms.every((bottom, index) => bottom === rowBottoms[index])
                ? previous : { maxHeight, rowBottoms });
            setWorkspaceHeight(previous => Math.min(previous, maxHeight));
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        if (navigation !== null)
            observer?.observe(navigation);
        window.addEventListener('resize', measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [wide, collapsed, width, upperPanelKey]);
    const expandedHeight = wide && !collapsed ? Math.min(workspaceHeight, workspaceGeometry.maxHeight) : 0;
    // Caption controls share a row with the native menus. Keep their bubbles
    // below that row, clear of menu text and the window controls.
    const captionTooltipSide = windowsTitlebar ? 'bottom' : 'right';
    // Freeze the content at its expanded width while it fades out (collapsed
    // && wide): the sliding column then clips it instead of reflowing it. The
    // rail layout (.collapsed styles) only applies once the fade settles.
    const lastWideWidth = useRef(width);
    if (!collapsed)
        lastWideWidth.current = width;
    // Rail-in only crossfades a live collapse: a refresh straight into the
    // collapsed state renders the rail statically (no delay-hidden icons).
    const everWide = useRef(!collapsed);
    if (!collapsed)
        everWide.current = true;
    // Scrollbars in the column follow the pointer (.quietBars rebinds them
    // away): drawn while it is inside, and for SCROLLBAR_LINGER_MS after it
    // leaves. A pointer that returns within that window cancels the pending
    // hide rather than restarting from a hidden bar.
    const column = useRef(null);
    const [pointerInside, setPointerInside] = useState(false);
    const lingerTimer = useRef(undefined);
    const armLinger = () => {
        if (lingerTimer.current !== undefined)
            return;
        lingerTimer.current = window.setTimeout(() => {
            lingerTimer.current = undefined;
            setPointerInside(false);
        }, SCROLLBAR_LINGER_MS);
    };
    const cancelLinger = () => {
        window.clearTimeout(lingerTimer.current);
        lingerTimer.current = undefined;
    };
    // Leaving is decided by the column's BOX, not by DOM containment, and only
    // while the bars are drawn. ui-settings renders its full-viewport panel as a
    // fixed-position DESCENDANT of this column, so a pointer moved onto that
    // panel — or onto the conversation once it closes — fires no `pointerleave`
    // here, and the bars would stay drawn over a column nobody is pointing at.
    // The element's own leave stays as the one signal geometry cannot give: a
    // pointer that leaves the window emits no further moves.
    useEffect(() => {
        if (!pointerInside)
            return;
        const onMove = (event) => {
            const rect = column.current?.getBoundingClientRect();
            /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
            if (rect === undefined)
                return;
            const inside = event.clientX >= rect.left && event.clientX < rect.right
                && event.clientY >= rect.top && event.clientY < rect.bottom;
            if (inside)
                cancelLinger();
            else
                armLinger();
        };
        document.addEventListener('pointermove', onMove);
        return () => {
            document.removeEventListener('pointermove', onMove);
            cancelLinger();
        };
    }, [pointerInside]);
    const buildVersion = localBuildVersion();
    const darwinDesktop = isDarwinDesktop();
    // Rail resting state is the whale mark; hovering swaps in the panel icon
    // (the expand affordance, figma sidebar-hover flow). Expanded it is a plain
    // panel icon.
    const toggle = (_jsx(Tooltip, { label: toggleLabel, shortcutKeys: shortcut?.keys, delayMs: 500, side: captionTooltipSide, children: _jsxs("button", { type: "button", className: clsx(css.iconButton, css.toggle), "aria-label": toggleLabel, "aria-keyshortcuts": shortcut?.aria, onClick: () => { toggleSidebar(); }, children: [!wide && !windowsTitlebar && (_jsx("span", { className: css.railMark, "aria-hidden": "true", children: renderSlot('sidebar.brand.mark', { size: 24, wide: false }, { fallback: _jsx(FishLogo, { size: 24 }) }) })), _jsx(IconPanelLeftOutlineRegular, { className: css.panelIcon, size: wide || windowsTitlebar ? 16 : 18 }), !wide && renderSlot('sidebar.toggle.badge', {})] }) }));
    return (_jsxs("div", { ref: column, className: clsx(css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn, collapsed && wide && css.fading, !pointerInside && css.quietBars), style: wide ? { width: collapsed ? lastWideWidth.current : width } : undefined, onPointerEnter: () => {
            cancelLinger();
            setPointerInside(true);
        }, onPointerLeave: () => { armLinger(); }, children: [darwinDesktop && _jsxs("div", { className: css.topStrip, "data-window-drag": true, children: [toggle, renderSlot('sidebar.header.action', {})] }), _jsxs("div", { className: css.logoRow, "data-window-drag": true, children: [wide && (() => {
                        const identity = (_jsxs("span", { className: css.brandIdentity, "aria-hidden": "true", children: [_jsx("span", { className: css.brandMark, children: renderSlot('sidebar.brand.mark', { size: 24, wide: true }, { fallback: _jsx(FishLogo, { size: 24 }) }) }), _jsx("span", { className: css.brandName, children: renderSlot('sidebar.brand.name', {}, {
                                        fallback: buildVersion === undefined
                                            ? _jsx("span", { className: css.fallbackBrandName, children: t('brand.localBuild') })
                                            : (_jsxs("span", { className: css.localBuildBrand, children: [_jsx("span", { className: css.localBuildTitle, children: t('brand.localBuild') }), _jsx("span", { className: css.buildVersion, children: buildVersion })] })),
                                    }) })] }));
                        return darwinDesktop
                            ? _jsx("span", { className: clsx(css.brand, css.wide), children: identity })
                            : (_jsx("button", { type: "button", className: clsx(css.brand, css.wide), "aria-label": t('session.new.label'), "aria-keyshortcuts": newShortcut?.aria, onClick: () => { startSession(); }, children: identity }));
                    })(), !darwinDesktop && toggle, !darwinDesktop && _jsx("span", { className: css.headerActions, children: renderSlot('sidebar.header.action', {}) })] }), _jsx(Tooltip, { label: t('session.new.label'), shortcutKeys: newShortcut?.keys, delayMs: 500, side: captionTooltipSide, disabled: wide, children: _jsxs("button", { type: "button", className: css.newSession, "aria-label": t('session.new.label'), "aria-keyshortcuts": newShortcut?.aria, onClick: () => { startSession(); }, children: [_jsx("span", { className: css.newSessionLabelMask, children: _jsxs("span", { className: css.newSessionContent, children: [wide
                                        ? _jsx(IconNewChatOutlineMedium, { size: 14 })
                                        : _jsx(IconNewChatOutlineRegular, { size: windowsTitlebar ? 16 : 18 }), wide && _jsx("span", { className: clsx(css.newSessionLabel, css.wide), children: t('session.new') })] }) }), wide && newShortcut !== undefined && newShortcut.keys.length > 0 && _jsx("span", { className: css.newSessionShortcut, "aria-hidden": "true", children: _jsx(ShortcutKeys, { keys: newShortcut.keys }) })] }) }), upperPanels.length > 0 && (_jsx("nav", { ref: upperNavigation, className: css.panelList, "aria-label": t('panels.label'), children: upperPanels.map(({ id, label }, index) => (_jsx(PanelRow, { id: id, label: label, wide: wide, covered: expandedHeight > 0 && (expandedHeight >= workspaceGeometry.maxHeight
                        || (workspaceGeometry.rowBottoms[index] ?? 0) > workspaceGeometry.maxHeight - expandedHeight), usePanelInfo: usePanelInfo, selectPanel: selectPanel, renderSlot: renderSlot }, id))) })), _jsx("div", { className: clsx(css.regionArea, expandedHeight > 0 && css.regionExpanded), style: workspaceGeometry.maxHeight > 0 ? { marginTop: -expandedHeight } : undefined, children: renderSlot('sidebar.workspaces', {
                    wide,
                    expandSidebar: () => { if (collapsed)
                        toggleSidebar(); },
                    workspaceExpansion: wide && !collapsed ? {
                        height: expandedHeight,
                        maxHeight: workspaceGeometry.maxHeight,
                        setHeight: height => {
                            if (Number.isFinite(height))
                                setWorkspaceHeight(Math.max(0, Math.min(height, workspaceGeometry.maxHeight)));
                        },
                    } : undefined,
                }) }), _jsxs("div", { className: css.footArea, children: [_jsx("div", { className: css.footerActions, children: renderSlot('sidebar.footer.action', { wide }) }), bottomPanels.length > 0 && (_jsx("nav", { className: css.bottomPanelList, "aria-label": t('panels.label'), children: bottomPanels.map(({ id, label }) => (_jsx(PanelRow, { id: id, label: label, wide: wide, usePanelInfo: usePanelInfo, selectPanel: selectPanel, renderSlot: renderSlot }, id))) })), _jsx("div", { className: css.settingsArea, children: renderSlot('sidebar.settings', { wide }) })] })] }));
}
//# sourceMappingURL=SidebarRoot.js.map