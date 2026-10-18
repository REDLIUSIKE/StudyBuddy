import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDownOutlineRegular, IconStopFillRegular, StateDot, TerminalBlock, useAnchoredPosition, useDismissOnOutsidePointer, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './JobListAction.module.css';
/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_JOBS = [];
/** Minimum gap kept between the popover and the viewport edges (the Menu primitive's portal margin). */
const VIEWPORT_MARGIN = 12;
/** Distance between the trigger's bottom edge and the popover. */
const MENU_GAP = 5;
/** Unplaced list: hidden but laid out so the first placement measures real dimensions. */
const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };
/** Keyboard-reachable controls inside the list, in document order. */
const FOCUSABLE = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
/** How long an armed kill waits for its confirming press before disarming. */
const KILL_ARM_MS = 3_000;
/** How long a failed kill keeps its hint before the button resets. */
const KILL_FAILED_MS = 4_000;
function isLive(job) {
    return job.status === 'running' || job.status === 'stopping';
}
/**
 * Whether the row offers an output panel: every live job (its output may
 * still arrive) and a settled one that left retained output behind.
 */
function isObservable(job) {
    return isLive(job) || job.output.total > 0;
}
/** The one-line qualifier beside the status: live progress while running, the terminal reason once settled. */
function jobDetail(job) {
    return job.progress ?? job.detail;
}
/** Closed-union exhaustiveness fence for the wire status set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
function assertNever(value) {
    throw new Error(`unhandled job status: ${JSON.stringify(value)}`);
}
/**
 * Status marker semantics. `stopping` and `killed` share the attention color:
 * both mean the work ended (or is ending) on request rather than on its own.
 */
function dotState(status) {
    switch (status) {
        case 'running': return 'ongoing';
        case 'stopping': return 'warning';
        case 'completed': return 'done';
        case 'killed': return 'warning';
        case 'failed': return 'error';
        /* v8 ignore next -- closed wire status union */
        default: return assertNever(status);
    }
}
function statusLabel(status, t) {
    switch (status) {
        case 'running': return t('status.running');
        case 'stopping': return t('status.stopping');
        case 'completed': return t('status.completed');
        case 'killed': return t('status.killed');
        case 'failed': return t('status.failed');
        /* v8 ignore next -- closed wire status union */
        default: return assertNever(status);
    }
}
/**
 * Elapsed time in at most two adjacent units. A job that outlives an hour is
 * already exceptional, so hours is the widest unit — beyond that the figure
 * stays in hours rather than growing a day/month vocabulary no producer
 * currently reaches.
 */
function formatDuration(elapsedMs, t) {
    const total = Math.max(0, Math.floor(elapsedMs / 1_000));
    const seconds = total % 60;
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3_600);
    if (hours > 0)
        return t('duration.hours', { hours, minutes });
    if (minutes > 0)
        return t('duration.minutes', { minutes, seconds });
    return t('duration.seconds', { seconds });
}
/** Localized display copy for the embedded terminal panel. */
function terminalLabels(t) {
    return {
        commandLine: line => t('terminal.commandLine', { n: line }),
        // The labels contract requires exit-fact formatters, but this panel never
        // passes exit facts, so TerminalBlock never invokes them.
        /* v8 ignore next */
        signal: signal => t('terminal.signal', { signal }),
        /* v8 ignore next */
        exitCode: code => t('terminal.exitCode', { code }),
        noExitCode: t('terminal.noExitCode'),
        running: t('terminal.running'),
        failed: t('terminal.failed'),
        done: t('terminal.done'),
        copy: t('terminal.copy'),
        copied: t('terminal.copied'),
        noOutput: t('terminal.noOutput'),
        collapseAria: t('terminal.collapseAria'),
        collapse: t('terminal.collapse'),
        // The panel never caps lines (it scrolls), so the fold controls that
        // would invoke these stay unrendered.
        /* v8 ignore next */
        expandAria: hidden => t('terminal.expandAria', { n: hidden }),
        /* v8 ignore next */
        expand: hidden => t('terminal.expand', { n: hidden }),
    };
}
/**
 * Live rows first in start order, then settled rows newest-first. Two rows
 * that settled in the same millisecond fall back to start order, so the sort
 * never depends on the host's map iteration.
 */
function ordered(jobs) {
    return [...jobs].sort((left, right) => {
        const liveLeft = isLive(left);
        if (liveLeft !== isLive(right))
            return liveLeft ? -1 : 1;
        if (liveLeft)
            return left.startedAt - right.startedAt;
        const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
        return finished !== 0 ? finished : left.startedAt - right.startedAt;
    });
}
/** One job row plus, when observable and expanded, its live output panel. */
function JobItem({ job, view, expanded, now, onToggle, kill, t }) {
    const live = isLive(job);
    const status = statusLabel(job.status, t);
    const detail = jobDetail(job);
    const observable = isObservable(job);
    const labels = useMemo(() => terminalLabels(t), [t]);
    const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt;
    const duration = formatDuration(elapsed, t);
    const durationCell = (_jsx("span", { className: css.duration, title: t(live ? 'duration.title.live' : 'duration.title.done', { duration }), children: duration }));
    const body = live
        ? (_jsxs(_Fragment, { children: [_jsx(StateDot, { state: dotState(job.status), className: css.rowDot }), _jsxs("span", { className: css.main, children: [_jsx("span", { className: css.primary, children: _jsx("span", { className: css.label, title: job.label, children: job.label }) }), _jsxs("span", { className: css.secondary, title: detail ?? status, children: [_jsx("span", { className: css.kind, children: job.kind }), detail !== undefined ? _jsx("span", { className: css.status, children: detail }) : null, durationCell] })] }), _jsx("span", { className: css.chevronBox, children: _jsx(IconChevronDownOutlineRegular, { size: 12, className: expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron }) })] }))
        : (_jsxs(_Fragment, { children: [_jsx(StateDot, { state: dotState(job.status), className: css.rowDot }), _jsx("span", { className: css.kind, children: job.kind }), _jsx("span", { className: css.label, title: job.label, children: job.label }), _jsx("span", { className: css.status, title: detail ?? status, children: detail ?? status }), durationCell, observable
                    ? (_jsx("span", { className: css.chevronBox, children: _jsx(IconChevronDownOutlineRegular, { size: 12, className: expanded ? `${css.chevron} ${css.chevronOpen}` : css.chevron }) }))
                    : null] }));
    const killTitle = kill === undefined
        ? undefined
        : kill.state === 'armed'
            ? t('kill.confirm')
            : kill.state === 'failed' ? t('kill.failed') : t('kill.stop', { label: job.label });
    return (_jsxs("li", { className: css.item, children: [_jsxs("div", { className: live ? `${css.rowLine} ${css.rowLineLive}` : css.rowLine, children: [observable
                        ? (_jsx("button", { type: "button", className: live ? css.row : `${css.row} ${css.rowSettled}`, "aria-expanded": expanded, "aria-label": t(expanded ? 'row.collapseAria' : 'row.expandAria', { label: job.label }), onClick: onToggle, children: body }))
                        : (_jsx("span", { className: `${css.row} ${css.rowSettled} ${css.rowStatic}`, children: body })), kill !== undefined
                        ? (_jsxs("button", { type: "button", className: kill.state === 'armed'
                                ? `${css.stop} ${css.stopArmed}`
                                : kill.state === 'failed' ? `${css.stop} ${css.stopFailed}` : css.stop, "data-kill-state": kill.state, disabled: kill.state === 'pending', "aria-label": killTitle, title: killTitle, onClick: kill.onPress, children: [_jsx(IconStopFillRegular, { size: 10 }), kill.state === 'armed' ? _jsx("span", { className: css.stopLabel, children: t('kill.confirmAction') }) : null] }))
                        : null] }), expanded && view !== undefined
                ? (_jsxs("div", { className: css.panel, children: [view.gapBefore ? _jsx("div", { className: css.notice, children: t('output.gap') }) : null, view.error !== undefined
                            ? _jsx("div", { className: `${css.notice} ${css.noticeError}`, children: t('output.error', { error: view.error }) })
                            : null, _jsx(TerminalBlock, { command: job.label, output: view.text, running: live, copyText: job.label, 
                            // The row above the panel already carries the state dot.
                            runStateDot: false, 
                            // The panel scrolls its output (a stylesheet height cap) instead
                            // of collapsing the middle.
                            maxLines: Number.POSITIVE_INFINITY, labels: labels })] }))
                : null] }));
}
/**
 * Session-header entry point for this session's background jobs. Mounting it
 * keeps the session's roster stream open; it renders nothing at all until the
 * session can see at least one job. Expanding an observable row (a live job,
 * or a settled one with retained output) starts its observation stream, and
 * collapsing (or closing the popover) stops it — output only flows while
 * someone is watching. A running row carries a two-press stop button that
 * requests a human kill through the job controller.
 * @param props - runtime slot currency, the jobs snapshot hook, the roster,
 *   observation, and kill controls, and the namespace translator.
 * @returns the trigger and its popover list, or null when there is nothing to show.
 */
export function JobListAction({ sessionId, useJobs, watchRows, observe, killJob, t }) {
    const jobs = useJobs(state => state.rows[sessionId]) ?? NO_JOBS;
    const observedViews = useJobs(state => state.observed);
    const [open, setOpen] = useState(false);
    const [expandedKey, setExpandedKey] = useState(undefined);
    const [now, setNow] = useState(() => Date.now());
    // Settled-section fold: an explicit user toggle wins; before one, the tail
    // folds only while live work exists (a settled-only list opens expanded).
    const [settledOpen, setSettledOpen] = useState(undefined);
    // Rows the user cleared from the settled tail (client-side hide only; the
    // registry keeps its records and a later settlement reappears normally).
    const [clearedKeys, setClearedKeys] = useState(() => new Set());
    // One kill affordance advances at a time: arming a row disarms any other.
    const [killPhase, setKillPhase] = useState(undefined);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const rows = useMemo(() => ordered(jobs), [jobs]);
    const liveRows = useMemo(() => rows.filter(isLive), [rows]);
    const settledRows = useMemo(() => rows.filter(job => !isLive(job) && !clearedKeys.has(String(job.id))), [rows, clearedKeys]);
    const settledExpanded = settledOpen ?? liveRows.length === 0;
    const visibleCount = liveRows.length + settledRows.length;
    // The popover portals to the document body: the session header sits in a
    // clipping column that the right sidebar borders or overlaps, so an in-place
    // popover is cut off or covered there.
    const menuPosition = useAnchoredPosition({
        open, anchorRef: rootRef, panelRef: menuRef, gap: MENU_GAP, margin: VIEWPORT_MARGIN,
    });
    useDismissOnOutsidePointer(rootRef, open, setOpen, menuRef);
    // The roster follows the mounted session: one stream while this control
    // lives, released with it.
    useEffect(() => watchRows(sessionId), [sessionId, watchRows]);
    // The clock only runs while an open list is showing something that moves.
    useEffect(() => {
        if (!open || liveRows.length === 0)
            return;
        setNow(Date.now());
        const timer = setInterval(() => { setNow(Date.now()); }, 1_000);
        return () => { clearInterval(timer); };
    }, [open, liveRows.length]);
    // Observation follows visibility: the stream opens when an observable panel
    // expands and closes when it collapses, unmounts, or the popover closes.
    const expandedRow = open && expandedKey !== undefined
        ? rows.find(job => String(job.id) === expandedKey)
        : undefined;
    const activeJob = expandedRow !== undefined && isObservable(expandedRow) ? expandedRow.id : undefined;
    useEffect(() => {
        if (activeJob === undefined)
            return;
        return observe(sessionId, activeJob);
    }, [sessionId, activeJob, observe]);
    // The last visible job disappearing removes this control; close first so
    // focus does not vanish from an unmounting node.
    useEffect(() => {
        if (visibleCount === 0 && open)
            setOpen(false);
    }, [visibleCount, open]);
    // An expanded row that left the list (owner disposal) folds its panel.
    useEffect(() => {
        if (expandedKey !== undefined && !rows.some(job => String(job.id) === expandedKey)) {
            setExpandedKey(undefined);
        }
    }, [rows, expandedKey]);
    // An armed kill disarms on a timer, and a failed one clears its hint; the
    // pending phase instead waits for the RPC (or the row's own status flip).
    // The cleanup clears the timer on every phase change, so a firing timer
    // always describes the current phase and may reset unconditionally.
    useEffect(() => {
        if (killPhase === undefined || killPhase.state === 'pending')
            return;
        const timer = setTimeout(() => { setKillPhase(undefined); }, killPhase.state === 'armed' ? KILL_ARM_MS : KILL_FAILED_MS);
        return () => { clearTimeout(timer); };
    }, [killPhase]);
    // A phase whose row stopped being killable (settled, stopping, removed)
    // has no button to describe any more.
    useEffect(() => {
        if (killPhase !== undefined
            && !rows.some(job => String(job.id) === killPhase.key && job.status === 'running')) {
            setKillPhase(undefined);
        }
    }, [rows, killPhase]);
    const pressKill = (job) => {
        const key = String(job.id);
        if (killPhase?.key !== key || killPhase.state !== 'armed') {
            setKillPhase({ key, state: 'armed' });
            return;
        }
        setKillPhase({ key, state: 'pending' });
        void killJob(sessionId, key).then((ok) => {
            // An admitted kill stays pending: the unary response (HTTP) and the jobs
            // frames (control stream) have no cross-carrier ordering, so re-enabling
            // here could offer a duplicate kill while the row still reads `running`.
            // The authoritative jobs frame flips the row to `stopping`, which removes
            // the button and clears the phase through the killable-set effect above.
            setKillPhase(current => current?.key === key && !ok
                ? { key, state: 'failed' }
                : current);
        });
    };
    if (visibleCount === 0)
        return null;
    const countKey = liveRows.length > 0
        ? (liveRows.length === 1 ? 'count.live.one' : 'count.live.other')
        : (visibleCount === 1 ? 'count.idle.one' : 'count.idle.other');
    const countLabel = t(countKey, { count: liveRows.length > 0 ? liveRows.length : visibleCount });
    const clearSettled = () => {
        setClearedKeys((current) => {
            const next = new Set(current);
            for (const job of settledRows)
                next.add(String(job.id));
            return next;
        });
        if (expandedKey !== undefined && settledRows.some(job => String(job.id) === expandedKey)) {
            setExpandedKey(undefined);
        }
    };
    // The portaled list sits at the end of the document, so Tab is bridged to
    // keep the in-place order: the trigger leads into the list, and leaving
    // either end of the list returns to the trigger's position in the page.
    const onKeyDown = (event) => {
        if (!open)
            return;
        const trigger = triggerRef.current;
        if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            trigger?.focus();
            return;
        }
        const menu = menuRef.current;
        /* v8 ignore next -- both refs are attached while the open list renders. */
        if (event.key !== 'Tab' || trigger === null || menu === null)
            return;
        const focusable = [...menu.querySelectorAll(FOCUSABLE)];
        if (event.target === trigger) {
            // Every list carries a control: a live row's toggle or the settled section's buttons.
            if (event.shiftKey)
                return;
            event.preventDefault();
            focusable[0]?.focus();
        }
        else if (event.shiftKey ? event.target === focusable[0] : event.target === focusable.at(-1)) {
            // Shift+Tab lands on the trigger itself; Tab continues from it to the
            // control that follows the trigger.
            if (event.shiftKey)
                event.preventDefault();
            trigger.focus();
        }
    };
    const item = (job) => (_jsx(JobItem, { job: job, view: isObservable(job) ? observedViews[String(job.id)] : undefined, expanded: expandedKey === String(job.id), now: now, onToggle: () => {
            setExpandedKey(current => current === String(job.id) ? undefined : String(job.id));
        }, ...job.status === 'running'
            ? {
                kill: {
                    state: killPhase?.key === String(job.id) ? killPhase.state : 'idle',
                    onPress: () => { pressKill(job); },
                },
            }
            : {}, t: t }, String(job.id)));
    return (_jsxs("div", { ref: rootRef, onKeyDown: onKeyDown, children: [_jsxs("button", { ref: triggerRef, type: "button", className: css.trigger, "aria-expanded": open, "aria-label": countLabel, onClick: () => {
                    // Sample the clock in the same commit that opens the list: the
                    // mount-time value predates every job, so the first painted frame
                    // would otherwise clamp a long-running row to zero until the
                    // open effect corrects it a frame later.
                    setNow(Date.now());
                    setOpen(current => !current);
                }, children: [liveRows.length > 0 ? _jsx(StateDot, { state: "ongoing", className: css.triggerDot }) : null, _jsx("span", { className: css.count, children: countLabel }), _jsx(IconChevronDownOutlineRegular, { size: 12, className: open ? css.triggerOpen : undefined })] }), open
                ? createPortal(_jsxs("ul", { ref: menuRef, className: css.menu, style: menuPosition ?? MEASURE_STYLE, "aria-label": t('list.aria'), children: [liveRows.length > 0
                            ? _jsx("li", { className: css.sectionHeader, "aria-hidden": "true", children: t('section.live') })
                            : null, liveRows.map(item), settledRows.length > 0
                            ? (_jsxs("li", { className: css.sectionHeader, children: [_jsxs("button", { type: "button", className: css.sectionToggle, "aria-expanded": settledExpanded, onClick: () => { setSettledOpen(!settledExpanded); }, children: [_jsx(IconChevronDownOutlineRegular, { size: 12, className: settledExpanded ? `${css.sectionChevron} ${css.sectionChevronOpen}` : css.sectionChevron }), t('section.settledCount', { count: settledRows.length })] }), _jsx("button", { type: "button", className: css.sectionClear, onClick: clearSettled, children: t('section.clear') })] }))
                            : null, settledExpanded ? settledRows.map(item) : null] }), document.body)
                : null] }));
}
//# sourceMappingURL=JobListAction.js.map