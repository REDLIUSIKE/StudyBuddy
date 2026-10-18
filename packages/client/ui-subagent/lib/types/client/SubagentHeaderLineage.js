import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconRefreshOutlineRegular, StateDot, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './SubagentHeaderLineage.module.css';
function treeItems(root) {
    return root === null
        ? []
        : Array.from(root.querySelectorAll('[role="treeitem"]:not([aria-disabled="true"])'));
}
/** Compact token count shared in shape with the conversation stats strip. */
function formatTokens(value, t) {
    const scaled = (next) => next >= 100
        ? String(Math.round(next))
        : String(Math.round(next * 10) / 10);
    if (value < 1_000)
        return String(value);
    if (value < 1_000_000)
        return t('tokens.thousand', { value: scaled(value / 1_000) });
    return t('tokens.million', { value: scaled(value / 1_000_000) });
}
/** Sum the four disjoint durable provider-usage buckets. */
function tokenTotal(usage) {
    return usage === undefined
        ? undefined
        : usage.uncachedInputTokens + usage.outputTokens
            + usage.cacheReadTokens + usage.cacheWriteTokens;
}
/** Exact whole-second active-turn duration for one catalog row. */
function activityDuration(summary, activity, now) {
    if (summary === undefined)
        return undefined;
    const timing = summary.projectionValues?.subagentTiming;
    if (timing === undefined)
        return undefined;
    if (timing.active === undefined)
        return timing.settledMs;
    const end = activity === 'running'
        ? now
        : timing.active.through;
    return timing.settledMs + Math.max(0, end - timing.active.since);
}
function splitDuration(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1_000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    return {
        seconds: totalSeconds % 60,
        minutes: totalMinutes % 60,
        hours: totalHours % 24,
        days: Math.floor(totalHours / 24),
        totalMinutes,
        totalHours,
    };
}
/** Format a duration with decreasing visual precision at larger scales. */
function formatDuration(ms, t) {
    const { seconds, minutes, hours, days, totalMinutes, totalHours } = splitDuration(ms);
    if (days >= 365) {
        const years = Math.floor(days / 365);
        const months = Math.floor((days % 365) / 30);
        return months === 0
            ? t('duration.years', { years })
            : t('duration.yearsMonths', { years, months });
    }
    if (days >= 30) {
        const months = Math.floor(days / 30);
        const remainingDays = days % 30;
        return remainingDays === 0
            ? t('duration.months', { months })
            : t('duration.monthsDays', { months, days: remainingDays });
    }
    if (days > 0) {
        return hours === 0
            ? t('duration.days', { days })
            : t('duration.daysHours', { days, hours });
    }
    if (totalHours > 0) {
        return t('duration.hours', {
            hours: totalHours,
            minutes: String(minutes).padStart(2, '0'),
            seconds: String(seconds).padStart(2, '0'),
        });
    }
    if (totalMinutes > 0) {
        return t('duration.minutes', {
            minutes: totalMinutes,
            seconds: String(seconds).padStart(2, '0'),
        });
    }
    return t('duration.seconds', { seconds });
}
/** Preserve exact whole seconds for hover and accessible naming. */
function formatExactDuration(ms, t) {
    const { seconds, minutes, hours, days } = splitDuration(ms);
    return days === 0
        ? formatDuration(ms, t)
        : t('duration.exactDays', {
            days,
            hours: String(hours).padStart(2, '0'),
            minutes: String(minutes).padStart(2, '0'),
            seconds: String(seconds).padStart(2, '0'),
        });
}
function SubagentSwitcherIcon() {
    return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 20 20", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M5.99951 12.7L8.95546 14.9478C9.40011 15.2859 9.62244 15.455 9.87526 15.488C9.95774 15.4988 10.0413 15.4988 10.1238 15.488C10.3766 15.455 10.5989 15.2859 11.0436 14.9478L13.9995 12.7", stroke: "currentColor", strokeWidth: "1.5" }), _jsx("path", { d: "M13.9995 7.7417L11.0436 5.49387C10.5989 5.15574 10.3766 4.98668 10.1238 4.95362C10.0413 4.94283 9.95775 4.94283 9.87527 4.95362C9.62245 4.98668 9.40012 5.15574 8.95547 5.49387L5.99952 7.7417", stroke: "currentColor", strokeWidth: "1.5" })] }));
}
/** Render catalog loading without inventing child membership. */
function CatalogLoadingRows({ t }) {
    return _jsx("div", { className: css.notice, children: t('loading.label') });
}
/** A child becomes a known leaf only after its own authoritative catalog loads empty. */
function isKnownLeaf(catalog) {
    return catalog?.state === 'ready' && catalog.entries.length === 0;
}
/** Render one catalog level and recurse only through explicitly expanded rows. */
function CatalogRows({ parentSessionId, currentSessionId, catalog, catalogs, summaries, expanded, level, openChild, openChildAside, refreshProjection, toggleBranch, closeCatalog, t, }) {
    const [now, setNow] = useState(() => Date.now());
    const running = catalog.entries.some(entry => entry.activity === 'running');
    useEffect(() => {
        if (!running)
            return;
        const timer = setInterval(() => { setNow(Date.now()); }, 1_000);
        return () => { clearInterval(timer); };
    }, [running]);
    const emptyLoading = catalog.state === 'loading' && catalog.entries.length === 0;
    const reserveDisclosure = catalog.entries.some(entry => entry.mode !== 'external' && !isKnownLeaf(catalogs[entry.id])
        && summaries[entry.id]?.formatStatus !== 'migration-required'
        && catalogs[entry.id]?.state !== 'migration-required');
    return (_jsxs(_Fragment, { children: [emptyLoading && (_jsx(CatalogLoadingRows, { t: t })), catalog.state === 'error' && (_jsxs("div", { className: css.error, children: [_jsx("span", { children: catalog.error?.message ?? t('load.error') }), _jsxs("button", { type: "button", className: css.refresh, onClick: () => { refreshProjection(parentSessionId); }, children: [_jsx(IconRefreshOutlineRegular, { size: 14 }), t('retry')] })] })), catalog.entries.map((entry) => {
                const external = entry.mode === 'external';
                const childCatalog = catalogs[entry.id];
                const isCurrent = entry.id === currentSessionId;
                const knownLeaf = external || isKnownLeaf(childCatalog);
                const requiresOpening = summaries[entry.id]?.formatStatus === 'migration-required'
                    || childCatalog?.state === 'migration-required';
                const canExpand = !knownLeaf && !requiresOpening;
                const isExpanded = canExpand && expanded.has(entry.id);
                const childLoading = childCatalog === undefined
                    || (childCatalog.state === 'loading' && childCatalog.entries.length === 0);
                const summary = summaries[entry.id];
                const label = entry.label ?? entry.id;
                const mode = external ? t('mode.external') : entry.mode === 'unknown' ? t('mode.unknown')
                    : entry.mode === 'one-shot' ? t('mode.oneShot') : t('mode.continuable');
                const completed = !external && entry.activity === 'inactive'
                    && summary?.projectionValues?.subagentTiming?.lastTurnCompleted === true;
                const activity = external ? undefined : entry.activity === 'running'
                    ? t('activity.running')
                    : completed
                        ? t('activity.completed')
                        : t('activity.inactive');
                const secondary = [summary?.title, requiresOpening ? t('catalog.migrationRequired') : mode, activity]
                    .filter(value => value !== undefined)
                    .join(' · ');
                const totalTokens = tokenTotal(summary?.projectionValues?.tokenUsage);
                const durationMs = activityDuration(summary, entry.activity, now);
                const tokenMetric = totalTokens === undefined
                    ? undefined
                    : t('tokens.total', { value: formatTokens(totalTokens, t) });
                const durationMetric = durationMs === undefined
                    ? undefined
                    : {
                        compact: formatDuration(durationMs, t),
                        exact: formatExactDuration(durationMs, t),
                    };
                const metrics = [tokenMetric, durationMetric?.exact]
                    .filter(value => value !== undefined)
                    .join(' · ');
                const open = () => {
                    if (external)
                        return;
                    openChild({
                        parentSessionId,
                        childSessionId: entry.id,
                        mode: entry.mode,
                    });
                    closeCatalog();
                };
                const handleKey = (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        open();
                    }
                    else if ((event.key === 'ArrowRight' && canExpand && !isExpanded)
                        || (event.key === 'ArrowLeft' && isExpanded)) {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleBranch(entry.id);
                    }
                };
                const toggle = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleBranch(entry.id);
                };
                return (_jsxs("div", { className: css.node, children: [_jsxs("div", { role: "treeitem", tabIndex: external ? -1 : 0, "aria-disabled": external || undefined, "aria-level": level, "aria-current": isCurrent || undefined, "aria-label": [label, secondary, metrics].filter(value => value !== '').join(' '), ...canExpand ? { 'aria-expanded': isExpanded } : {}, className: css.row, onClick: open, onKeyDown: handleKey, children: [!canExpand
                                    ? reserveDisclosure && _jsx("span", { className: css.disclosureSpace })
                                    : (_jsx("button", { type: "button", tabIndex: -1, className: `${css.disclosure} ${isExpanded ? css.disclosureOpen : ''}`, "aria-label": t(isExpanded ? 'branch.collapse' : 'branch.expand', { label }), onClick: toggle, children: _jsx(IconChevronRightOutlineRegular, {}) })), _jsxs("div", { className: css.clickarea, children: [_jsx("span", { className: css.rowActivitySlot, children: _jsx(StateDot, { state: entry.activity === 'running' ? 'ongoing' : completed ? 'done' : 'idle' }) }), _jsxs("span", { className: css.content, children: [_jsx("span", { className: `${css.label} ${isCurrent ? css.currentLabel : ''}`, children: label }), _jsx("span", { className: css.summary, children: secondary })] }), metrics !== '' && (_jsxs("span", { className: css.metrics, children: [tokenMetric !== undefined && _jsx("span", { className: css.metricToken, children: tokenMetric }), durationMetric !== undefined && (_jsx("span", { className: css.metricDuration, title: t('duration.exactTitle', { duration: durationMetric.exact }), children: durationMetric.compact }))] })), !isCurrent && !external && (_jsx(Tooltip, { label: t('open.sidebar'), side: "bottom", align: "end", children: _jsx("button", { type: "button", className: css.sidebarButton, "aria-label": t('open.sidebar.aria', { label }), onClick: (event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    openChildAside({ parentSessionId, childSessionId: entry.id, mode: entry.mode });
                                                    closeCatalog();
                                                }, onKeyDown: (event) => { event.stopPropagation(); }, children: _jsx(IconChevronRightOutlineRegular, {}) }) }))] })] }), isExpanded && (_jsx("div", { role: "group", className: css.children, "aria-busy": childLoading || undefined, children: childCatalog === undefined
                                ? _jsx(CatalogLoadingRows, { t: t })
                                : (_jsx(CatalogRows, { parentSessionId: entry.id, currentSessionId: currentSessionId, catalog: childCatalog, catalogs: catalogs, summaries: summaries, expanded: expanded, level: level + 1, openChild: openChild, openChildAside: openChildAside, refreshProjection: refreshProjection, toggleBranch: toggleBranch, closeCatalog: closeCatalog, t: t })) }))] }, entry.id));
            })] }));
}
const MENU_VIEWPORT_MARGIN = 16;
/** Place a portaled catalog below its trigger without crossing the viewport edge. */
function catalogMenuPosition(trigger) {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(336, window.innerWidth - MENU_VIEWPORT_MARGIN * 2);
    return {
        top: rect.bottom + 5,
        left: Math.min(Math.max(MENU_VIEWPORT_MARGIN, rect.left), window.innerWidth - width - MENU_VIEWPORT_MARGIN),
    };
}
/** One trigger-plus-tree dropdown over the catalog rooted at `rootSessionId`. */
function CatalogDropdown({ rootSessionId, currentSessionId, displayTitle, openTitle, variant, useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, t, }) {
    const ancestorSwitcher = variant === 'switcher' && openTitle !== undefined;
    const projections = useSessions(state => state.projectionsBySession);
    const summaries = useSessions(state => state.byId);
    const statuses = useSessionStatus(value => value);
    const catalogs = useMemo(() => {
        return Object.fromEntries(Object.entries(projections).map(([id, snapshot]) => {
            const projected = snapshot.values.subagentCatalog;
            const state = snapshot.state === 'idle'
                ? projected === undefined ? 'loading' : 'ready'
                : snapshot.state === 'migration-required' && projected !== undefined ? 'ready' : snapshot.state;
            return [id, {
                    state,
                    error: snapshot.error,
                    entries: (projected ?? []).map(entry => ({
                        ...entry,
                        activity: (statuses.get(entry.id)?.running ?? summaries[entry.id]?.running) === true
                            ? 'running' : 'inactive',
                    })),
                }];
        }));
    }, [projections, summaries, statuses]);
    const catalog = catalogs[rootSessionId];
    const [open, setOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState();
    const [expanded, setExpanded] = useState(() => new Set());
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const hoverOpenTimer = useRef(undefined);
    const hoverCloseTimer = useRef(undefined);
    // A click-opened (pinned) menu ignores hover-out; only explicit dismissal closes it.
    const pinnedRef = useRef(false);
    const currentEntry = currentSessionId === undefined
        ? undefined
        : projections[rootSessionId]?.values.subagentCatalog?.find(entry => entry.id === currentSessionId);
    const switcherDisplayTitle = currentEntry !== undefined
        ? currentEntry.label ?? currentEntry.id
        : displayTitle;
    const directChildren = catalog?.entries ?? [];
    const directCount = directChildren.length;
    const runningCount = directChildren.filter(entry => entry.activity === 'running').length;
    const totalCountKey = directCount === 1 ? 'count.total.one' : 'count.total.other';
    const runningCountKey = runningCount === 1 ? 'count.running.one' : 'count.running.other';
    const presentedCatalog = catalog ?? (variant === 'switcher'
        ? { entries: [], state: 'loading', error: null }
        : undefined);
    const cancelHoverClose = () => {
        if (hoverCloseTimer.current === undefined)
            return;
        clearTimeout(hoverCloseTimer.current);
        hoverCloseTimer.current = undefined;
    };
    const cancelHoverOpen = () => {
        if (hoverOpenTimer.current === undefined)
            return;
        clearTimeout(hoverOpenTimer.current);
        hoverOpenTimer.current = undefined;
    };
    const changeOpen = (next, restoreFocus = false) => {
        cancelHoverOpen();
        cancelHoverClose();
        if (next) {
            const trigger = triggerRef.current;
            /* v8 ignore next -- a queued callback can outlive the trigger */
            if (trigger === null)
                return;
            setOpen(true);
            setMenuPosition(catalogMenuPosition(trigger));
        }
        else {
            pinnedRef.current = false;
            setOpen(false);
            setMenuPosition(undefined);
            setExpanded(new Set());
        }
        if (restoreFocus)
            queueMicrotask(() => { triggerRef.current?.focus(); });
    };
    const scheduleHoverOpen = () => {
        cancelHoverOpen();
        cancelHoverClose();
        if (open)
            return;
        hoverOpenTimer.current = setTimeout(() => {
            hoverOpenTimer.current = undefined;
            changeOpen(true);
        }, 150);
    };
    const scheduleHoverClose = () => {
        cancelHoverOpen();
        cancelHoverClose();
        if (pinnedRef.current)
            return;
        hoverCloseTimer.current = setTimeout(() => {
            hoverCloseTimer.current = undefined;
            changeOpen(false);
        }, 120);
    };
    const closeBranch = (root) => {
        const closing = new Set();
        const visit = (parentSessionId) => {
            if (closing.has(parentSessionId) || !expanded.has(parentSessionId))
                return;
            closing.add(parentSessionId);
            const branch = catalogs[parentSessionId];
            for (const entry of branch?.entries ?? []) {
                visit(entry.id);
            }
        };
        visit(root);
        setExpanded(current => new Set([...current].filter(id => !closing.has(id))));
    };
    const toggleBranch = (childSessionId) => {
        if (expanded.has(childSessionId)) {
            closeBranch(childSessionId);
            return;
        }
        setExpanded(current => new Set(current).add(childSessionId));
        refreshProjection(childSessionId);
    };
    useEffect(() => {
        if (!open)
            return;
        const closeOutside = (event) => {
            if (event.target instanceof Node
                && !rootRef.current?.contains(event.target)
                && !menuRef.current?.contains(event.target)) {
                changeOpen(false);
            }
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => { document.removeEventListener('pointerdown', closeOutside); };
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const placeMenu = () => {
            const trigger = triggerRef.current;
            /* v8 ignore next -- native resize or scroll can outlive the trigger */
            if (trigger === null)
                return;
            setMenuPosition(catalogMenuPosition(trigger));
        };
        window.addEventListener('resize', placeMenu);
        document.addEventListener('scroll', placeMenu, true);
        return () => {
            window.removeEventListener('resize', placeMenu);
            document.removeEventListener('scroll', placeMenu, true);
        };
    }, [open]);
    useEffect(() => () => {
        cancelHoverOpen();
        cancelHoverClose();
    }, []);
    // Visibility needs catalog evidence of children or a failed load worth retrying.
    // An empty loading catalog is not evidence of children.
    const visible = presentedCatalog !== undefined
        && (variant === 'switcher'
            || presentedCatalog.state === 'error'
            || presentedCatalog.entries.length > 0);
    useEffect(() => {
        if (visible)
            return;
        cancelHoverOpen();
        cancelHoverClose();
        if (!open)
            return;
        pinnedRef.current = false;
        setOpen(false);
        setExpanded(new Set());
    }, [visible, open]);
    if (!visible)
        return null;
    const focusAt = (index) => {
        const items = treeItems(menuRef.current);
        if (items.length === 0)
            return;
        items[(index + items.length) % items.length]?.focus();
    };
    const navigate = (event) => {
        const items = treeItems(menuRef.current);
        const index = items.indexOf(document.activeElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            changeOpen(false, true);
        }
        else if (event.key === 'Home') {
            event.preventDefault();
            focusAt(0);
        }
        else if (event.key === 'End') {
            event.preventDefault();
            focusAt(items.length - 1);
        }
        else if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusAt(index + 1);
        }
        else if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusAt(index < 0 ? items.length - 1 : index - 1);
        }
    };
    return (_jsxs("div", { className: `${css.root} ${variant === 'switcher' ? css.switcherRoot : ''}`, ref: rootRef, onKeyDown: navigate, onMouseLeave: scheduleHoverClose, children: [_jsxs("button", { ref: triggerRef, onMouseEnter: scheduleHoverOpen, type: "button", className: variant === 'switcher'
                    ? `${css.switcherTrigger} ${ancestorSwitcher ? css.ancestorSwitcherTrigger : ''}`
                    : css.trigger, "aria-haspopup": "tree", "aria-expanded": open, "aria-label": variant === 'switcher'
                    ? t('switcher.aria', { title: switcherDisplayTitle })
                    : t(runningCount > 0 ? runningCountKey : totalCountKey, { count: runningCount > 0 ? runningCount : directCount }), onClick: openTitle === undefined
                    ? () => {
                        cancelHoverOpen();
                        cancelHoverClose();
                        pinnedRef.current = true;
                        if (!open)
                            changeOpen(true);
                    }
                    : () => {
                        cancelHoverOpen();
                        if (open)
                            changeOpen(false);
                        openTitle();
                    }, onKeyDown: (event) => {
                    if (event.key !== 'ArrowDown')
                        return;
                    event.preventDefault();
                    if (!open)
                        changeOpen(true);
                    queueMicrotask(() => { focusAt(0); });
                }, children: [variant === 'switcher'
                        ? _jsx("span", { className: css.switcherTitle, children: switcherDisplayTitle })
                        : (_jsxs(_Fragment, { children: [runningCount > 0 && (_jsx("span", { className: css.activitySlot, children: _jsx(StateDot, { state: "ongoing" }) })), _jsx("span", { className: css.count, children: t(totalCountKey, { count: directCount }) })] })), variant === 'switcher'
                        ? _jsx(SubagentSwitcherIcon, {})
                        : _jsx(IconChevronDownOutlineRegular, { className: open ? css.triggerOpen : undefined })] }), open && createPortal((_jsx("div", { ref: menuRef, className: css.menu, style: menuPosition, onMouseEnter: cancelHoverClose, onMouseLeave: scheduleHoverClose, children: _jsx("div", { className: css.menuBody, role: "tree", "aria-label": t('tree.aria'), children: _jsx(CatalogRows, { parentSessionId: rootSessionId, currentSessionId: currentSessionId, catalog: presentedCatalog, catalogs: catalogs, summaries: summaries, expanded: expanded, level: 1, openChild: openChild, openChildAside: openChildAside, refreshProjection: refreshProjection, toggleBranch: toggleBranch, closeCatalog: () => { changeOpen(false); }, t: t }) }) })), document.body)] }));
}
/**
 * Session-header catalog action for root sessions: the descendant count and
 * its dropdown at the start of the header actions band. Child sessions render nothing
 * here — their breadcrumb switcher in the lineage slot owns the same
 * navigation.
 * @param props - Session standard props plus the catalog actions and translator.
 * @returns The count dropdown, or null on a child session.
 */
export function SubagentCatalogAction({ sessionId, useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, t, }) {
    const isChild = useSessions(state => state.byId[sessionId]?.origin === 'subagent');
    if (isChild)
        return null;
    return (_jsx(CatalogDropdown, { rootSessionId: sessionId, variant: "count", useSessions: useSessions, useSessionStatus: useSessionStatus, openChild: openChild, openChildAside: openChildAside, refreshProjection: refreshProjection, t: t }, sessionId));
}
/**
 * Render one breadcrumb title together with its subagent navigation.
 * @param props - Breadcrumb title, session standard props, and catalog actions.
 * @returns A title-and-chevron sibling switcher, or nothing on a root session.
 */
export function SubagentHeaderLineage({ lineageSessionId, displayTitle, openTitle, useSessions, useSession, useSessionStatus, openChild, openChildAside, refreshProjection, t, }) {
    const address = useSession(session => session.subagent?.address);
    const parentId = useSessions((state) => {
        if (address?.childSessionId === lineageSessionId)
            return address.parentSessionId;
        for (const [parentId, snapshot] of Object.entries(state.projectionsBySession)) {
            if (snapshot.values.subagentCatalog?.some(entry => entry.id === lineageSessionId))
                return parentId;
        }
        const summary = state.byId[lineageSessionId];
        return summary?.origin === 'subagent' ? summary.parentId : undefined;
    });
    const shared = { useSessions, useSessionStatus, openChild, openChildAside, refreshProjection, t };
    // Root sessions carry no breadcrumb; their descendant count lives in the
    // header actions band (SubagentCatalogAction).
    if (parentId === undefined)
        return null;
    return (_jsxs(_Fragment, { children: [_jsx(CatalogDropdown, { rootSessionId: parentId, currentSessionId: lineageSessionId, variant: "switcher", displayTitle: displayTitle, ...openTitle === undefined ? {} : { openTitle }, ...shared }, `switcher:${lineageSessionId}`), openTitle === undefined && (_jsx(CatalogDropdown, { rootSessionId: lineageSessionId, variant: "count", ...shared }, `children:${lineageSessionId}`))] }));
}
//# sourceMappingURL=SubagentHeaderLineage.js.map