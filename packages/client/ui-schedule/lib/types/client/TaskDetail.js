import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** One retained task's rule, saved deliveries, run-time edits, deletion, and original-Session link. */
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconChevronUpOutlineRegular, IconClockOutlineRegular, IconCloseOutlineRegular, IconEllipsisOutlineRegular, IconTrashOutlineRegular, Modal, Pill, ReferenceIconRegular, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { CatalogFeedback } from "./CatalogFeedback.js";
import { IconCalendarOutlineRegular } from "./CalendarIcon.js";
import { ClockPicker } from "./ClockPicker.js";
import { DatePicker } from "./DatePicker.js";
import { DeliveryHistory } from "./DeliveryHistory.js";
import { draftZone, secondPrecision, slashDate, timingDraft, timingError, timingSnapshot, zonedWallClock } from "./task-timing.js";
import { useRelativeClock } from "./relative-clock.js";
import { formatScheduleFrequency, nextRunParts, recordTimeZone, zoneChoices, zoneLabel, zoneName } from "./schedule-format.js";
import { cronPreview, cronShapeExpression, parseCronExpression, recognizeCronShape } from "./task-cron.js";
import { sessionLabel, sessionLinkState } from "./session-link.js";
import { loadRecentTimeZones, rememberTimeZone } from "./recent-time-zones.js";
import { TaskMenu } from "./TaskMenu.js";
import css from './TaskManagerPage.module.css';
/** Recurrence choices the Run time card's Repeat row offers, in mock menu order. */
const RULE_CHOICES = [
    'weekly', 'weekdays', 'daily', 'every-hour', 'every-minute', 'every-second', 'once', 'cron',
];
/** Repeat menu label of each recurrence choice. */
const RULE_KIND_LABELS = {
    daily: 'rule.daily', weekdays: 'rule.weekdays', weekly: 'rule.weekly',
    every: 'rule.everyMinutes', once: 'rule.once', cron: 'rule.cron',
};
/** Repeat-menu label of each visible choice. */
const RULE_CHOICE_LABELS = {
    daily: 'rule.daily', weekdays: 'rule.weekdays', weekly: 'rule.weekly',
    'every-minute': 'rule.everyMinutes', 'every-hour': 'rule.everyHours', 'every-second': 'rule.everySeconds',
    once: 'rule.once', cron: 'rule.cron',
};
/** Unit word the elapsed-interval row shows beside its quantity input. */
const INTERVAL_UNIT_LABELS = {
    hour: 'timing.unit.hour', minute: 'timing.unit.minute', second: 'timing.unit.second',
};
/** Lower-bound hint of the elapsed-interval row, stated in the row's own unit. */
const INTERVAL_HINT_KEYS = {
    hour: 'timing.intervalHint.hour',
    minute: 'timing.intervalHint.minute',
    second: 'timing.intervalHint.second',
};
/** Below-floor save message, stated in the same unit as the row and its hint. */
const INTERVAL_ERROR_KEYS = {
    hour: 'timing.invalidInterval.hour',
    minute: 'timing.invalidInterval.minute',
    second: 'timing.invalidInterval.second',
};
/** Messages `draftError` can return; each clears as soon as edits fix the draft. */
const LOCAL_FAILURES = new Set([
    'rule.invalidTitle', 'rule.invalidPrompt', 'timing.invalidInterval', 'rule.cronInvalid', 'timing.invalid',
]);
/** Elapsed interval a rule receives when it starts repeating without a stored interval. */
const RULE_DEFAULT_EVERY_SECONDS = 3_600;
/** Friendly units the elapsed-interval editor can express without changing storage semantics. */
const INTERVAL_UNITS = ['second', 'minute', 'hour'];
/** Seconds represented by each friendly interval unit. */
const INTERVAL_UNIT_SECONDS = { second: 1, minute: 60, hour: 3_600 };
/** Shortest elapsed interval the Host accepts, stated in seconds. */
const MIN_INTERVAL_SECONDS = 60;
/** Exhaustive recurrence-choice labels of the stored rule records. */
const RULE_KIND_BY_RECORD = {
    at: 'once', after: 'once', every: 'every', daily: 'daily', weekly: 'weekly', cron: 'cron',
};
/** ISO weekdays of the weekly choice in display order, Monday through Sunday. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
/** ISO weekday set the `weekdays` choice stores: Monday through Friday. */
const WEEKDAY_RULE = [1, 2, 3, 4, 5];
/**
 * Recurrence choices that state their rule with the clock and zone rows.
 *
 * The cron choice carries its clock inside its expression and its timing draft
 * has no time row, so it neither carries nor receives that pair: an expression
 * seeded from the occurrence's UTC clock with another zone would name a
 * different instant, and carrying an expression's empty time would empty the
 * clock row a switch to another choice shows.
 */
const CLOCK_KINDS = ['daily', 'weekdays', 'weekly'];
/** Localized name of each ISO weekday. */
const WEEKDAY_LABELS = {
    1: 'frequency.weekday.1', 2: 'frequency.weekday.2', 3: 'frequency.weekday.3', 4: 'frequency.weekday.4',
    5: 'frequency.weekday.5', 6: 'frequency.weekday.6', 7: 'frequency.weekday.7',
};
/**
 * Whether a stored weekly record carries exactly the Monday-to-Friday set the
 * `weekdays` choice stores, so the Repeat row shows that choice for it.
 * @param weekdays - stored ISO weekday set.
 * @returns whether the set is Monday through Friday.
 */
function isWeekdayRule(weekdays) {
    return weekdays.length === WEEKDAY_RULE.length && WEEKDAY_RULE.every(day => weekdays.includes(day));
}
const sessionLinkMessages = {
    loading: 'detail.sessionLoading', archived: 'detail.sessionArchived', unavailable: 'detail.sessionUnavailable',
};
/**
 * Own the editing state one task detail shares across both of its owners.
 *
 * The shown task is the catalog row for `taskId`, or the draft a mutation
 * pending against that row retained after the row left the catalog. The view,
 * the confirmation, and the draft all reset when `taskId` changes, so one
 * task's draft never carries into another.
 * @param injected - detail actions, localized copy, and framework readers.
 * @param catalog - the owner's authoritative task catalog snapshot.
 * @param taskId - task the owner selected, or undefined when it selected none.
 * @returns the shown task and catalog row, its element id, its confirmation, and the detail props.
 */
export function useTaskDetail(injected, catalog, taskId) {
    const [draft, setDraft] = useState(null);
    const [tab, setTab] = useState('rule');
    const [confirmId, setConfirmId] = useState(null);
    const id = useId();
    useEffect(() => {
        setDraft(null);
        setTab('rule');
        setConfirmId(null);
    }, [taskId]);
    const record = taskId === undefined ? undefined : catalog.records.find(item => item.id === taskId);
    const task = record ?? (draft !== null && draft.id === taskId ? draft : undefined);
    return {
        record, task, id, confirmId, setConfirmId, setTab,
        props: {
            ...injected,
            status: catalog.status,
            deleting: catalog.deleting,
            id,
            onEditState: setDraft,
            tab,
            onTabChange: setTab,
            confirmId,
            onConfirm: setConfirmId,
        },
    };
}
/**
 * Render one task's rule or saved deliveries with confirm-first deletion and its original Session.
 *
 * A deletion this detail confirmed settles with the refreshed catalog: once
 * that refresh reports the row gone, the detail calls `onDeleted` and its owner
 * leaves the task. The app-wide toast, not this detail, announces the outcome.
 * @param props - task, catalog state, detail view, confirmation, localized copy, and action callbacks.
 * @returns the detail region, its deletion confirmation dialog, and the linked Session entry.
 */
export function TaskDetail({ task, authoritative, id, status, deleting, onDelete, onRetry, onUpdateTiming, loadHistory, onOpenSession, onEditState, tab, onTabChange, confirmId, onConfirm, onDeleted, onClose, withinSession, useSessions, useWorkspaces, t, }) {
    const sessions = useSessions(snapshot => snapshot);
    const workspaces = useWorkspaces(snapshot => snapshot);
    const detailTabsRef = useRef(null);
    const moreRef = useRef(null);
    const nameRef = useRef(null);
    const panelRef = useRef(null);
    const footerRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    // The next-run line states how long remains, so the panel reads the same
    // ticking clock the task list does.
    const now = useRelativeClock();
    const busy = deleting.includes(task.id) || status === 'loading';
    const confirming = authoritative && confirmId === task.id;
    const sessionLink = sessionLinkState(task.sessionId, sessions, workspaces);
    const linkedSession = sessionLabel(task.sessionId, sessions);
    const sessionNotice = sessionLink === 'available' ? undefined : t(sessionLinkMessages[sessionLink]);
    const linkedShown = tab === 'rule' && withinSession !== task.sessionId;
    const linkedText = t('detail.session');
    const [linkedCompact, setLinkedCompact] = useState(false);
    const linkedRef = useRef(null);
    // The expanded entry's width for its current label, measured while it last
    // rendered expanded; the compact icon cannot report it.
    const linkedExpanded = useRef(undefined);
    const linkedAction = linkedSession.titled
        ? t('detail.openSessionTitle', { title: linkedSession.text })
        : t('detail.openSession');
    // The Session name is the entry's visually hidden accessible description in both layouts.
    const linkedName = _jsx("span", { id: `${id}-session`, className: css.linkedSessionName, children: linkedSession.text });
    const linkedDescribedBy = `${id}-session${sessionNotice === undefined ? '' : ` ${id}-session-state`}`;
    useLayoutEffect(() => {
        if (!linkedShown)
            return;
        const tabs = detailTabsRef.current;
        const linked = linkedRef.current;
        const measure = () => {
            const width = linked.getBoundingClientRect().width;
            if (!linkedCompact)
                linkedExpanded.current = { label: linkedText, width };
            // The first measurement is always expanded, so a width is recorded; a
            // label changed while compact has no expanded width for that label yet.
            const expanded = linkedExpanded.current;
            if (expanded.label !== linkedText) {
                setLinkedCompact(false);
                return;
            }
            // The tab list grows into the strip's free width, so its own width cannot
            // tell whether its tabs overflow; the tabs' extent can. The expanded entry
            // fits only when that extent still fits in the width it would leave.
            const extent = tabs.lastElementChild.getBoundingClientRect().right
                - tabs.firstElementChild.getBoundingClientRect().left;
            // Expanding again takes 1px more room than collapsing, so whole-pixel
            // clientWidth rounding cannot switch the two layouts back and forth.
            setLinkedCompact(extent > tabs.clientWidth - (expanded.width - width) - (linkedCompact ? 1 : 0));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(tabs);
        // A tab label can widen, as when a web font loads, without resizing the list.
        for (const tab of tabs.children)
            observer.observe(tab);
        return () => { observer.disconnect(); };
    }, [linkedShown, linkedCompact, linkedText]);
    const taskIdentity = `${task.sessionId}\u0000${task.id}`;
    const [edit, setEdit] = useState(() => initialRuleEdit(task));
    // The elapsed-interval unit lives here, not in the Run time card, so the saved
    // draft's below-floor message states the same unit the row shows.
    const [intervalUnit, setIntervalUnit] = useState(() => preferredIntervalUnit(edit.shown.draft.seconds));
    // A unit the user picked in the Repeat menu outranks the seeded seconds, so
    // the kind effect below must not derive one back from the whole-hour seed and
    // overwrite the explicit choice.
    const explicitUnit = useRef(false);
    const previousKind = useRef(edit.shown.kind);
    useEffect(() => {
        if (previousKind.current === edit.shown.kind)
            return;
        previousKind.current = edit.shown.kind;
        if (edit.shown.kind !== 'every') {
            // Leaving the interval drops the explicit choice with the row that held it.
            explicitUnit.current = false;
            return;
        }
        if (explicitUnit.current)
            return;
        setIntervalUnit(preferredIntervalUnit(edit.shown.draft.seconds));
    }, [edit.shown.kind, edit.shown.draft.seconds]);
    const [pending, setPending] = useState(false);
    const [failure, setFailure] = useState();
    // A locally refused save re-reads the draft on every render, so its message
    // leaves the hint slot as soon as edits remove the cause and the descriptive
    // hint returns; Host failures stay until the next cancel or save.
    const shownFailure = failure !== undefined && LOCAL_FAILURES.has(failure)
        ? draftError(edit.shown)
        : failure;
    const [deletionConfirmed, setDeletionConfirmed] = useState(false);
    const deletionInFlight = useRef(null);
    const [trackedIdentity, setTrackedIdentity] = useState(taskIdentity);
    const identityRef = useRef(taskIdentity);
    identityRef.current = taskIdentity;
    // Which save this detail last submitted. `mounted` and the task identity are
    // not enough to retire a response: the same detail renders every task, and a
    // save of task A can still be in flight when the reader leaves A, opens B, and
    // comes back to A. A later submission, or a task switch, retires every earlier
    // one, so only the newest response may touch the draft.
    //
    // A retired response reports neither success nor failure: its outcome reaches
    // this detail only through the catalog refresh that the save's own callback
    // triggers. That is deliberate — the reader is looking at another task, and a
    // notice about a save they left belongs to the refresh, not to this draft.
    const submissions = useRef(0);
    const chosenWeekdays = useRef(undefined);
    /** The day set this task's card remembers, or undefined when it has none. */
    const taskMemory = () => chosenWeekdays.current?.identity === taskIdentity ? chosenWeekdays.current.weekdays : undefined;
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    useEffect(() => {
        // Focus follows the shown task, but the panel itself takes it: landing in the
        // name control would place a text caret the reader did not ask for. Focusing
        // without scrolling keeps a restored panel from jumping as it re-renders.
        panelRef.current?.focus({ preventScroll: true });
    }, [task.sessionId, task.id]);
    useEffect(() => {
        // The owner retains this task while a save is in flight or failed and after
        // a confirmed deletion, so a catalog refresh that drops the row can neither
        // close a surfaced failure nor unmount the detail before `onDeleted` runs.
        onEditState(pending || shownFailure !== undefined || deletionConfirmed ? task : null);
    }, [pending, shownFailure, deletionConfirmed, task, onEditState]);
    useEffect(() => {
        // The catalog reports each task's deletion while it is in flight. A
        // confirmed deletion whose attempt ended with the task still in the
        // authoritative ready list was not applied, so its rule comes back; a
        // successful deletion reports loading first and then drops the row.
        if (deleting.includes(task.id)) {
            deletionInFlight.current = task.id;
            return;
        }
        if (!deletionConfirmed || deletionInFlight.current !== task.id)
            return;
        deletionInFlight.current = null;
        if (status === 'ready' && authoritative)
            setDeletionConfirmed(false);
    }, [deletionConfirmed, deleting, task.id, status, authoritative]);
    useEffect(() => {
        if (confirming)
            footerRef.current?.querySelector('button')?.focus();
    }, [confirming]);
    const closeConfirmation = () => {
        onConfirm(null);
        moreRef.current?.focus();
    };
    const menuItems = [
        {
            id: 'delete',
            label: t(deleting.includes(task.id) ? 'delete.pending' : 'delete.action'),
            icon: _jsx(IconTrashOutlineRegular, {}),
            danger: true,
            disabled: busy || !authoritative,
        },
    ];
    const storedValues = ruleValues(task);
    const propKey = shownValues(storedValues);
    if (trackedIdentity !== taskIdentity) {
        // A shown task's unsaved draft, failure, pending save, and deletion never carry over.
        submissions.current += 1;
        chosenWeekdays.current = undefined;
        explicitUnit.current = false;
        previousKind.current = storedValues.kind;
        setTrackedIdentity(taskIdentity);
        setEdit(initialRuleEdit(task));
        setIntervalUnit(preferredIntervalUnit(storedValues.draft.seconds));
        setPending(false);
        setFailure(undefined);
        setDeletionConfirmed(false);
    }
    else if (edit.propKey !== propKey) {
        // A memory that only mirrors the record's own day set is a seed rather than a
        // choice, so any refresh that finds the two equal retires it — a renamed
        // record alone included, where the retirement settles the same state. Where
        // the refresh changed the set, a kept seed would restore the pre-refresh set.
        const memory = taskMemory();
        if (memory !== undefined && sameWeekdays(memory, edit.stored.weekdays)) {
            chosenWeekdays.current = undefined;
        }
        // An ended task is read-only: its unsaved notice and Cancel action are gone,
        // so a surviving draft would read as the stored rule. The refresh replaces
        // the draft with the stored values instead.
        setEdit(task.status === 'inactive'
            ? { propKey, stored: storedValues, shown: storedValues }
            // `mergeRuleDraft` decides by rule kind: a staged switch keeps its own time
            // fields, a remote kind change adopts or keeps a whole rule, and matching
            // kinds re-seed field by field, so a value the user changed survives while
            // every other field takes the refreshed record. The refreshed record stays
            // the complete expected rule of the next save.
            : { propKey, stored: storedValues, shown: mergeRuleDraft(storedValues, edit.shown, edit.stored) });
    }
    useEffect(() => {
        // An ended task is read-only and offers no Cancel, so nothing can submit the
        // draft any more: the stored values replace it rather than reading as saved.
        if (task.status !== 'inactive')
            return;
        setEdit(current => (shownValues(current.shown) === shownValues(current.stored)
            ? current
            : { ...current, shown: current.stored }));
    }, [task.status]);
    const shown = edit.shown;
    const dirty = shownValues(shown) !== shownValues(edit.stored);
    // The deletion is done once the refreshed catalog reports no row: the owner
    // then leaves the task through `onDeleted`, and the guards below keep the
    // one frame before that effect from showing a rule the deletion removed.
    const deleted = deletionConfirmed && !authoritative;
    useEffect(() => {
        if (deleted)
            onDeleted();
    }, [deleted, onDeleted]);
    // One pair for the next-run line: both halves come from this one call.
    const nextRun = nextRunParts(task.scheduledAt, t('time.locale'), now, t);
    // The day set one task's card last had in hand, kept across a detour through a
    // kind that shows no weekday row: switching Monday-to-Friday to Daily and then
    // to Weekly would otherwise collapse the rule to the one day the carried clock
    // falls on, though the user chose five.
    //
    // It is scoped to this task's identity, because the same `TaskDetail` renders
    // whichever task is selected: a set chosen on one task must never reach
    // another. Cancel drops it with the draft it belongs to.
    const rememberWeekdays = (weekdays) => {
        chosenWeekdays.current = { identity: taskIdentity, weekdays };
    };
    /**
     * Day set one rule states, when its kind carries one.
     * @param kind - choice the rule is stated as.
     * @param weekdays - that rule's day set.
     * @returns the set for the kinds that carry one, otherwise undefined.
     */
    const setOf = (kind, weekdays) => kind === 'weekdays' || kind === 'weekly' ? weekdays : undefined;
    const chooseKind = (kind, unit) => {
        // Switching among the interval choices restates the unit without changing
        // the kind, so the unit is taken before the same-kind return below.
        if (unit !== undefined) {
            explicitUnit.current = true;
            setIntervalUnit(unit);
        }
        if (kind === shown.kind)
            return;
        // The memory is written here, outside the state updater — as `toggleWeekday`
        // also does — because it is a ref: a double-invoked updater must not decide
        // what it holds. Leaving a rule that states a day set refreshes it with that
        // set, which is the one the user has in hand; the stored rule only seeds a
        // memory this task has not got yet, because overwriting an existing one would
        // throw away an edited set and make the answer depend on how many kinds the
        // detour passed through.
        const leavingSet = setOf(shown.kind, shown.weekdays)
            ?? (taskMemory() === undefined ? setOf(storedValues.kind, storedValues.weekdays) : undefined);
        if (leavingSet !== undefined)
            rememberWeekdays(leavingSet);
        setEdit((current) => {
            // Choosing the stored kind again is not a change to stage: it restores
            // the stored values instead of reseeding the rows from the current
            // occurrence, which would stage the occurrence's UTC clock for a rule the
            // record already states in its own zone.
            const restore = kind === current.stored.kind;
            // Two clock-time choices name the same instant with a wall clock in one
            // zone, so the switch carries the pair the card shows instead of restating
            // that instant in UTC and rewriting the zone the rule states. That pair is
            // the instant the committed occurrence already names, so the weekly choice
            // seeds its ISO weekday set from the occurrence in that zone.
            const carriesClock = !restore
                && CLOCK_KINDS.includes(kind)
                && CLOCK_KINDS.includes(current.shown.kind);
            // The Monday-to-Friday choice and the weekly choice are the same stored
            // weekly rule, so switching between them keeps the day set the user
            // already has. Seeding it from one occurrence would collapse the rule to
            // the single day that occurrence falls on.
            //
            // After a detour through Daily the shown kind says nothing, and the sets
            // in order of authority are the one this task's card remembers, then the
            // one the stored rule itself states (a stored Monday-to-Friday rule still
            // means five days), and only then the occurrence's own day.
            const storedSet = setOf(current.stored.kind, current.stored.weekdays);
            const carried = kind === 'weekly'
                ? (setOf(current.shown.kind, current.shown.weekdays) ?? taskMemory() ?? storedSet)
                : undefined;
            return {
                ...current,
                // The weekdays choice stages the Monday-to-Friday set it submits; every
                // other choice stages the set of the stored rule it seeds from, except
                // the weekly choice of a clock-time switch, whose set names the local day
                // the carried clock falls on, and the weekly choice of a stored
                // Monday-to-Friday rule, which keeps that stored set.
                shown: {
                    ...current.shown,
                    kind,
                    draft: restore
                        ? current.stored.draft
                        : carriesClock
                            ? { ...seedDraft(task, kind), time: current.shown.draft.time, timeZone: current.shown.draft.timeZone }
                            : unit === undefined
                                ? seedDraft(task, kind)
                                : { ...seedDraft(task, kind), seconds: String(seedIntervalSeconds()) },
                    weekdays: kind === 'weekdays'
                        ? [...WEEKDAY_RULE]
                        : kind === 'weekly' && carried !== undefined
                            // Carried before restored: the set the draft carries is either
                            // the one the user just edited or the stored rule's own, so an
                            // edited set survives a detour back to the stored Weekly choice.
                            ? [...carried]
                            : restore
                                ? current.stored.weekdays
                                : kind === 'weekly' && carriesClock
                                    ? [zonedWeekday(task.scheduledAt, current.shown.draft.timeZone)]
                                    : seedWeekdays(task),
                },
            };
        });
    };
    const chooseZone = (zone) => {
        if (zone === shown.draft.timeZone)
            return;
        setEdit(current => ({ ...current, shown: { ...current.shown, draft: { ...current.shown.draft, timeZone: zone } } }));
    };
    const toggleWeekday = (weekday) => {
        // The Host rejects an empty weekday set, so the last selected day stays on.
        if (shown.weekdays.length === 1 && shown.weekdays.includes(weekday))
            return;
        const weekdays = shown.weekdays.includes(weekday)
            ? shown.weekdays.filter(day => day !== weekday)
            : WEEKDAYS.filter(day => day === weekday || shown.weekdays.includes(day));
        rememberWeekdays(weekdays);
        setEdit(current => ({ ...current, shown: { ...current.shown, weekdays } }));
    };
    const editDraft = (patch) => {
        setEdit(current => ({ ...current, shown: { ...current.shown, draft: { ...current.shown.draft, ...patch } } }));
    };
    const editContent = (patch) => {
        setEdit(current => ({ ...current, shown: { ...current.shown, ...patch } }));
    };
    const cancelDraft = () => {
        // The stored values become the shown values again, so the notice clears with them.
        chosenWeekdays.current = undefined;
        setEdit(current => ({ ...current, shown: current.stored }));
        setFailure(undefined);
    };
    const saveDraft = async () => {
        const invalid = draftError(shown);
        if (invalid !== undefined) {
            setFailure(invalid);
            return;
        }
        const submitted = taskIdentity;
        const generation = ++submissions.current;
        setPending(true);
        setFailure(undefined);
        const request = {
            sessionId: task.sessionId, id: task.id,
            // The refreshed record stays the complete expected rule even while an
            // unsaved draft keeps the shown values.
            expected: timingSnapshot(task),
            ...contentChange(shown, storedValues),
        };
        let result;
        try {
            // A name- or instruction-only save submits no timing change: `change` is optional.
            result = await onUpdateTiming(timingValues(shown) === timingValues(storedValues)
                ? request
                : { ...request, change: ruleChange(shown.draft, shown.kind, shown.weekdays) });
        }
        catch (_error) {
            // A rejected request cannot establish whether the Host committed the edit.
            if (!mounted.current || identityRef.current !== submitted
                || generation !== submissions.current)
                return;
            setPending(false);
            setFailure('rule.error.unknown');
            return;
        }
        if (!mounted.current || identityRef.current !== submitted
            || generation !== submissions.current)
            return;
        setPending(false);
        if (!result.ok) {
            setFailure('rule.error.unknown');
            return;
        }
        if ('code' in result.value) {
            setFailure(ruleError(result.value.code));
            return;
        }
        const saved = ruleValues(result.value.record);
        // A refresh that landed while this save was in flight already seeded a newer
        // record. This response describes the record the save submitted, so it must
        // not put those older values back; the newer seed stays authoritative and
        // the in-flight draft leaves with the completed save.
        setEdit(current => (current.propKey === propKey
            ? { ...current, stored: saved, shown: saved }
            : { ...current, shown: current.stored }));
    };
    const confirmDelete = () => {
        // Confirming retains the task before the acknowledgement-driven refresh can
        // drop its row, so this detail and its saved records stay reachable.
        setDeletionConfirmed(true);
        closeConfirmation();
        void onDelete(task.id);
    };
    return _jsxs(_Fragment, { children: [_jsxs("aside", { ref: panelRef, className: css.detail, id: id, tabIndex: -1, "aria-label": t('detail.label'), children: [_jsxs("div", { className: css.detailTabsBar, children: [_jsx("div", { ref: detailTabsRef, className: css.detailTabs, role: "tablist", "aria-label": t('detail.tabs'), children: ['rule', 'records'].map(value => (_jsx("button", { type: "button", "data-detail-tab": value, role: "tab", id: `${id}-${value}-tab`, "aria-controls": `${id}-${value}-panel`, "aria-selected": tab === value, tabIndex: tab === value ? 0 : -1, className: css.detailTab, onClick: () => { onTabChange(value); }, onKeyDown: (event) => {
                                        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
                                            return;
                                        let next;
                                        switch (event.key) {
                                            case 'ArrowLeft':
                                            case 'ArrowRight':
                                                next = value === 'rule' ? 'records' : 'rule';
                                                break;
                                            case 'Home':
                                                next = 'rule';
                                                break;
                                            case 'End':
                                                next = 'records';
                                                break;
                                            default: return;
                                        }
                                        event.preventDefault();
                                        onTabChange(next);
                                        detailTabsRef.current?.querySelector(`[data-detail-tab="${next}"]`)?.focus();
                                    }, children: t(`detail.${value}`) }, value))) }), _jsxs("div", { className: css.detailActions, children: [linkedShown && _jsx(Tooltip, { label: linkedText, side: "bottom", portal: true, disabled: !linkedCompact, children: _jsx("span", { ref: linkedRef, className: css.detailContext, children: _jsx(Button, { size: linkedCompact ? 'sm' : 'md', className: linkedCompact ? css.detailIconButton : css.linkedSession, title: linkedCompact ? undefined : linkedSession.titled ? linkedSession.text : task.sessionId, "aria-label": linkedAction, "aria-describedby": linkedDescribedBy, disabled: sessionLink !== 'available', onClick: () => { onOpenSession(task.sessionId); }, children: linkedCompact
                                                    ? _jsxs(_Fragment, { children: [_jsx(ReferenceIconRegular, { kind: "session" }), linkedName] })
                                                    : _jsxs(_Fragment, { children: [_jsx("span", { className: css.linkedSessionLabel, children: linkedText }), _jsxs("span", { className: css.linkedSessionTarget, children: [linkedName, _jsx(IconChevronRightOutlineRegular, {})] })] }) }) }) }), _jsx("span", { className: css.menuGuard, onKeyDown: (event) => {
                                            guardMenuEscape(event, menuOpen, () => {
                                                setMenuOpen(false);
                                                moreRef.current?.focus();
                                            });
                                        }, children: _jsx(TaskMenu, { open: menuOpen, onClose: () => { setMenuOpen(false); }, items: menuItems, onSelect: () => {
                                                setMenuOpen(false);
                                                onConfirm(task.id);
                                            }, align: "end", portal: true, anchor: _jsx(Button, { size: "sm", className: css.detailIconButton, "aria-label": t('detail.more'), title: t('detail.more'), "aria-haspopup": "menu", "aria-expanded": menuOpen, onClick: (event) => {
                                                    moreRef.current = event.currentTarget;
                                                    setMenuOpen(open => !open);
                                                }, children: _jsx(IconEllipsisOutlineRegular, {}) }) }) }), onClose !== undefined && _jsx(Button, { size: "sm", className: css.detailIconButton, "aria-label": t('detail.close'), onClick: onClose, children: _jsx(IconCloseOutlineRegular, {}) })] })] }), _jsxs("div", { className: clsx(css.detailScroll, tab === 'records' && css.detailRecords), children: [_jsx(CatalogFeedback, { status: status, populated: true, onRetry: onRetry, t: t }), tab === 'rule' && !deleted && _jsx("header", { className: css.detailHeader, children: task.status === 'inactive'
                                    ? _jsx("h2", { className: css.readonlyName, children: shown.title })
                                    : _jsx("input", { ref: nameRef, className: css.editName, "aria-label": t('detail.name'), disabled: busy || pending, value: shown.title, onChange: (event) => { editContent({ title: event.target.value }); } }) }), tab === 'rule' && !deleted && _jsx("div", { className: css.nextRun, children: task.status === 'active'
                                    ? _jsxs("p", { children: [t('detail.nextRun'), ' ', _jsx("time", { dateTime: task.scheduledAt, children: nextRun.absolute }), ' ', _jsx("span", { className: css.nextRunRelative, children: nextRun.relative })] })
                                    : _jsx("p", { children: t('status.inactive') }) }), _jsx("div", { role: "tabpanel", id: `${id}-rule-panel`, "aria-labelledby": `${id}-rule-tab`, hidden: tab !== 'rule' || deleted, tabIndex: 0, children: !deleted && _jsxs(_Fragment, { children: [task.status === 'inactive'
                                            ? _jsx("p", { className: css.readonlyPrompt, children: shown.prompt })
                                            : _jsx("textarea", { className: css.instruction, "aria-label": t('detail.instruction'), disabled: busy || pending, value: shown.prompt, onChange: (event) => { editContent({ prompt: event.target.value }); } }), _jsx(RuleCard, { task: task, disabled: busy || pending || task.status === 'inactive', values: shown, intervalUnit: intervalUnit, failure: shownFailure === 'timing.invalidInterval' ? INTERVAL_ERROR_KEYS[intervalUnit] : shownFailure, onChooseKind: chooseKind, onChooseZone: chooseZone, onToggleWeekday: toggleWeekday, onEditDraft: editDraft, t: t }, JSON.stringify([task.sessionId, task.id]))] }) }), _jsx("div", { role: "tabpanel", id: `${id}-records-panel`, "aria-labelledby": `${id}-records-tab`, className: css.recordsPanel, hidden: tab !== 'records', tabIndex: 0, children: tab === 'records' && !deleted && _jsx(DeliveryHistory, { id: task.id, sessionId: task.sessionId, latestMessageId: task.lastDelivery?.messageId, timeZone: recordTimeZone(task), loadHistory: loadHistory, t: t }, JSON.stringify([task.sessionId, task.id])) })] }), tab === 'rule' && sessionNotice !== undefined && _jsx("p", { id: `${id}-session-state`, className: css.detailNotice, role: "status", children: sessionNotice }), tab === 'records' && shownFailure !== undefined && _jsx("p", { className: css.saveFailure, role: "alert", children: t(shownFailure === 'timing.invalidInterval' ? INTERVAL_ERROR_KEYS[intervalUnit] : shownFailure) }), dirty && !deleted && task.status !== 'inactive' && _jsxs("footer", { className: css.saveFooter, children: [_jsx("span", { className: css.saveNotice, children: t('rule.unsaved') }), _jsx(Button, { disabled: pending, onClick: cancelDraft, children: t('rule.cancel') }), _jsx(Button, { variant: "primary", disabled: pending || !dirty, onClick: () => { void saveDraft(); }, children: t(pending ? 'rule.saving' : 'rule.save') })] })] }), _jsx(Modal, { className: css.confirmDialog, contentClassName: css.confirmContent, open: confirming, title: t('delete.title'), description: t('delete.description'), closeLabel: t('delete.close'), onClose: closeConfirmation, footer: confirming && _jsxs("div", { ref: footerRef, className: css.confirmActions, children: [_jsx(Button, { variant: "outline", onClick: closeConfirmation, children: t('delete.cancel') }), _jsx(Button, { className: css.deleteButton, disabled: busy, onClick: confirmDelete, children: t('delete.confirm') })] }), children: confirming && _jsx("p", { className: css.confirmTitle, children: task.title }) })] });
}
/**
 * Identify the Repeat row choice that represents a stored rule. A weekly rule
 * whose stored set is exactly Monday through Friday maps to the `weekdays`
 * choice, which is the same rule the menu's Monday-to-Friday option submits.
 * @param record - shown rule.
 * @returns the choice matching its stored recurrence kind.
 */
function ruleKind(record) {
    if (record.kind === 'weekly' && isWeekdayRule(record.weekdays))
        return 'weekdays';
    return RULE_KIND_BY_RECORD[record.kind];
}
/**
 * Choice that states the same stored rule as another.
 *
 * The Monday-to-Friday choice and the weekly choice both submit one Host
 * `weekly` rule, so a comparison of choices must fold them together; the three
 * elapsed-interval choices already share the one `every` choice, and every other
 * choice names its own Host rule.
 * @param kind - Repeat row choice.
 * @returns the choice that states the same stored rule.
 */
function storedRuleChoice(kind) {
    return kind === 'weekdays' ? 'weekly' : kind;
}
/**
 * Preserve a native time's declared precision when only minutes were entered.
 * @param time - native time value.
 * @returns the same time with whole seconds.
 */
function withSeconds(time) {
    return time.length === 5 ? `${time}:00` : time;
}
/**
 * Native input values a rule gets when it is on, or switches to, one choice.
 *
 * A one-shot target, a daily clock time, a Monday-to-Friday clock time, and a
 * weekly clock time all start from the zone the stored rule states, or from
 * this device's zone when the rule stores none; the one-shot rows show the
 * committed occurrence in that zone, so the pair still names the same instant.
 * The weekly choice seeds its weekday set separately, and the cron choice seeds
 * a daily expression from that occurrence. A switch between two clock-time
 * choices replaces the seeded time and zone with the pair the card shows,
 * wherever `chooseKind` carries it, and a switch into the elapsed interval
 * replaces its seeded seconds with `seedIntervalSeconds` for the chosen unit.
 * @param record - shown rule.
 * @param kind - choice to seed.
 * @returns complete native input values for that choice.
 */
function seedDraft(record, kind) {
    const zone = draftZone(record).zone;
    switch (kind) {
        case 'once': {
            const wallClock = zonedWallClock(record.scheduledAt, zone);
            return {
                date: wallClock.slice(0, 10), time: wallClock.slice(11, 23),
                timeZone: zone, seconds: '', expression: '',
            };
        }
        case 'every':
            return { date: '', time: '', timeZone: '', seconds: String(RULE_DEFAULT_EVERY_SECONDS), expression: '' };
        case 'daily':
        case 'weekdays':
        case 'weekly':
            return {
                date: '', time: zonedWallClock(record.scheduledAt, zone).slice(11, 23),
                timeZone: zone, seconds: '', expression: '',
            };
        case 'cron':
            return { date: '', time: '', timeZone: zone, seconds: '', expression: seedCronExpression(record, zone) };
    }
}
/**
 * Cron expression the cron choice starts from: the committed occurrence's clock
 * in the choice's zone as a daily rule, the same instant and zone the other
 * wall-clock choices seed their time row with.
 * @param record - shown rule.
 * @param zone - IANA zone the seeded expression is stated in.
 * @returns five-field expression matching that occurrence.
 */
function seedCronExpression(record, zone) {
    const wallClock = zonedWallClock(record.scheduledAt, zone);
    return `${Number(wallClock.slice(14, 16))} ${Number(wallClock.slice(11, 13))} * * *`;
}
/**
 * ISO weekday set the weekly choice edits. A weekly rule keeps its stored set;
 * another kind seeds the committed occurrence's weekday in the zone `seedDraft`
 * gives that choice, so the set and the seeded clock describe the same local day.
 * A switch between two clock-time choices carries the shown clock and zone into
 * that time, and the weekly choice then takes the occurrence's weekday in that
 * zone from `zonedWeekday`, so the set and the carried clock name one local day.
 * @param record - shown rule.
 * @returns ascending ISO weekdays, never empty.
 */
function seedWeekdays(record) {
    if (record.kind === 'weekly')
        return [...record.weekdays];
    const zone = draftZone(record).zone;
    return [zonedWeekday(record.scheduledAt, zone)];
}
/**
 * ISO weekday one instant falls on in one zone, for the weekly choice's set.
 *
 * The formatter locale is fixed, because the seeded weekday is part of the rule
 * a save submits: it must not change with the interface language.
 * @param instant - canonical instant the rule commits.
 * @param timeZone - IANA zone whose calendar day names the weekday.
 * @returns that weekday, ISO 1 through 7; an unparsable instant reads UTC.
 */
function zonedWeekday(instant, timeZone) {
    const at = new Date(instant);
    let calendarDay;
    try {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(at).map(part => [part.type, part.value]));
        calendarDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    }
    catch {
        // An unusable zone or instant cannot place the day; the UTC calendar day is
        // the same fallback an unparsable stored instant already reads.
        calendarDay = at;
    }
    const day = calendarDay.getUTCDay();
    return ((day + 6) % 7 + 1);
}
/**
 * Build the timing change one staged Run time draft saves.
 *
 * The draft already holds complete values for its choice: switching recurrence
 * seeds them at the switch, so every edit stays in the request.
 * @param draft - values the card shows.
 * @param kind - choice the values belong to.
 * @param weekdays - ISO weekday set the weekly choice saves.
 * @returns the complete timing change for the compare-and-update request.
 */
function ruleChange(draft, kind, weekdays) {
    switch (kind) {
        case 'once': return {
            kind: 'at',
            at: { date: draft.date, time: withSeconds(draft.time), time_zone: draft.timeZone.trim() },
        };
        case 'every': return { kind: 'every', every_seconds: Number(draft.seconds) };
        case 'daily': return {
            kind: 'daily',
            daily: { time: withSeconds(draft.time), time_zone: draft.timeZone.trim() },
        };
        case 'cron': return {
            kind: 'cron',
            cron: { expression: draft.expression.trim(), time_zone: draft.timeZone.trim() },
        };
        case 'weekdays':
        case 'weekly': return {
            kind: 'weekly',
            weekly: {
                time: withSeconds(draft.time),
                time_zone: draft.timeZone.trim(),
                weekdays: kind === 'weekdays' ? [...WEEKDAY_RULE] : [...weekdays],
            },
        };
    }
}
/**
 * Longest task name the Host accepts. The browser-safe Schedule entry exports
 * types only, so the client repeats the limit its local validation uses.
 */
const RULE_TITLE_MAX_LENGTH = 120;
/**
 * Whether a staged one-shot date is a real ISO calendar date.
 *
 * The control is a text field, so the value can be anything the reader types;
 * only `YYYY-MM-DD` naming an existing day is accepted. A round trip through
 * `Date.UTC` rejects a shape-correct but impossible date such as `2026-02-31`.
 * @param value - staged date text.
 * @returns true when the text is an existing ISO calendar date.
 */
function validIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
/**
 * Local validation of a staged draft before it is saved.
 * @param shown - values the detail shows.
 * @returns dictionary key of the invalid field, or undefined when the draft can be saved.
 */
function draftError(shown) {
    const title = shown.title.trim();
    if (title.length === 0 || title.length > RULE_TITLE_MAX_LENGTH)
        return 'rule.invalidTitle';
    if (shown.prompt.trim().length === 0)
        return 'rule.invalidPrompt';
    if (shown.kind === 'every') {
        return /^\d+$/.test(shown.draft.seconds) && Number(shown.draft.seconds) >= MIN_INTERVAL_SECONDS
            ? undefined
            : 'timing.invalidInterval';
    }
    if (shown.kind === 'cron') {
        return parseCronExpression(shown.draft.expression) === undefined ? 'rule.cronInvalid' : undefined;
    }
    if ((shown.kind === 'once' && !validIsoDate(shown.draft.date))
        || !/^\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(shown.draft.time))
        return 'timing.invalid';
    return undefined;
}
/**
 * Name and instruction one staged save replaces, omitting each value the
 * authoritative record already stores.
 * @param shown - values the detail edits.
 * @param stored - authoritative values the request carries as its expected record.
 * @returns content fields to submit, empty when both already match that record.
 */
function contentChange(shown, stored) {
    const content = {};
    const title = shown.title.trim();
    const prompt = shown.prompt.trim();
    if (title !== stored.title)
        content.title = title;
    if (prompt !== stored.prompt)
        content.prompt = prompt;
    return content;
}
/**
 * Display the recurrence the Repeat row shows: the staged choice while it differs
 * from the stored kind, otherwise the stored rule's localized frequency. The
 * cron choice always reads as its menu label: the rule card's own rows and
 * sentence state the rule, and an unrecognized expression has no short summary.
 * @param record - stored rule.
 * @param kind - choice the draft stages.
 * @param t - namespace-bound task-manager translate.
 * @param zone - host-zone context the frequency line uses to omit or name the stored zone.
 * @returns localized recurrence text.
 */
function repeatValue(record, kind, t, zone) {
    if (kind === 'cron' || ruleKind(record) !== kind)
        return t(RULE_KIND_LABELS[kind]);
    return formatScheduleFrequency(record, t, zone);
}
/** Prefer the largest friendly unit that represents a stored whole-second interval exactly. */
function preferredIntervalUnit(seconds) {
    const value = Number(seconds);
    if (Number.isSafeInteger(value) && value > 0 && value % INTERVAL_UNIT_SECONDS.hour === 0)
        return 'hour';
    if (Number.isSafeInteger(value) && value > 0 && value % INTERVAL_UNIT_SECONDS.minute === 0)
        return 'minute';
    return 'second';
}
/** Repeat-menu label for one elapsed interval unit. */
function intervalRuleLabel(unit) {
    if (unit === 'hour')
        return 'rule.everyHours';
    if (unit === 'minute')
        return 'rule.everyMinutes';
    return 'rule.everySeconds';
}
/** Whether one visible Repeat-menu option selects an elapsed interval. */
function isIntervalChoice(choice) {
    return choice === 'every-hour' || choice === 'every-minute' || choice === 'every-second';
}
/** Stored interval unit selected by one visible interval choice. */
function intervalChoiceUnit(choice) {
    if (choice === 'every-hour')
        return 'hour';
    if (choice === 'every-minute')
        return 'minute';
    return 'second';
}
/**
 * Elapsed seconds the elapsed-interval row starts from when the user selects one
 * unit explicitly, so the number the row shows and the unit it shows agree: 3600
 * seconds is one whole hour and sixty whole minutes. The unit itself always
 * follows the user's choice, so this seed never has to express minutes or
 * seconds as the base unit.
 * @returns whole seconds that display as a whole number of the chosen unit.
 */
function seedIntervalSeconds() {
    return INTERVAL_UNIT_SECONDS.hour;
}
/**
 * Three shared timing messages name Save, Cancel, and a retained draft, none of
 * which this card has; the other codes keep their shared wording.
 */
const RULE_ERROR_OVERRIDES = {
    'timing.conflict': 'rule.error.conflict',
    'timing.notFound': 'rule.error.notFound',
    'timing.error': 'rule.error.unknown',
};
/**
 * Localize a rejected rule update without exposing transport or storage diagnostics.
 * @param code - error code returned by the compare-and-update.
 * @returns dictionary key describing the recovery action.
 */
function ruleError(code) {
    const key = timingError(code);
    return RULE_ERROR_OVERRIDES[key] ?? key;
}
/**
 * Close an open dropdown on Escape before the page's own Escape handler sees
 * the key, so dismissing a menu never closes the whole task detail. Stopping
 * the key's propagation withholds it from the menu's own document listener,
 * which the page's handler honors; this guard covers a dropdown whose listener
 * stands down before that.
 * @param event - keydown from the wrapper around that menu.
 * @param open - whether this wrapper's menu is showing.
 * @param close - dismiss that menu and return focus to its trigger.
 */
function guardMenuEscape(event, open, close) {
    if (event.key !== 'Escape')
        return;
    if (!open)
        return;
    event.stopPropagation();
    close();
}
/**
 * Seed the detail's editable values from one stored record.
 * @param record - rule to seed from.
 * @returns complete shown values for that rule.
 */
function ruleValues(record) {
    return {
        title: record.title, prompt: record.prompt,
        kind: ruleKind(record), draft: timingDraft(record), weekdays: seedWeekdays(record),
    };
}
/**
 * Seed the detail's staged draft state from one stored record.
 * @param record - rule to seed from.
 * @returns a clean draft that equals its stored values.
 */
function initialRuleEdit(record) {
    const values = ruleValues(record);
    return { propKey: shownValues(values), stored: values, shown: values };
}
/**
 * Comparison key of the staged timing values alone, without the stored record's
 * identity or committed target.
 * @param shown - values the detail displays.
 * @returns key that changes exactly when one staged timing value changes.
 */
function timingValues(shown) {
    const { kind, draft, weekdays } = shown;
    return JSON.stringify([kind, draft.date, draft.time, draft.timeZone, draft.seconds, draft.expression, weekdays]);
}
/**
 * Comparison key of every staged value, without the stored record's identity or
 * committed target. The name and instruction compare trimmed, because the Host
 * stores both trimmed.
 * @param shown - values the detail displays.
 * @returns key that changes exactly when one shown value changes.
 */
function shownValues(shown) {
    return JSON.stringify([shown.title.trim(), shown.prompt.trim(), timingValues(shown)]);
}
/**
 * Choose one merged text field: text the user changed keeps the draft value,
 * and text the user left untouched takes the refreshed record. Both sides
 * compare trimmed, because the Host stores both trimmed.
 * @param draft - text the control shows.
 * @param stored - authoritative text the draft was compared against.
 * @param authoritative - text of the refreshed record.
 * @returns the text the merge keeps.
 */
function reseedText(draft, stored, authoritative) {
    return draft.trim() === stored.trim() ? authoritative : draft;
}
/** Whether two weekday sets hold the same days in the same order. */
function sameWeekdays(left, right) {
    return left.length === right.length && left.every((day, index) => day === right[index]);
}
/**
 * Whether the user changed any timing field of a draft.
 * @param draft - values the detail currently shows.
 * @param stored - values the draft was compared against.
 * @returns whether any timing field differs from the stored one.
 */
function editedTiming(draft, stored) {
    return draft.draft.date !== stored.draft.date
        || draft.draft.time !== stored.draft.time
        || draft.draft.timeZone !== stored.draft.timeZone
        || draft.draft.seconds !== stored.draft.seconds
        || draft.draft.expression !== stored.draft.expression
        || !sameWeekdays(draft.weekdays, stored.weekdays);
}
/**
 * Choose one merged timing field of a draft whose rule kind did not change.
 * @param draft - value the detail shows.
 * @param stored - value the draft was compared against.
 * @param authoritative - value of the refreshed record.
 * @returns the value the merge keeps.
 */
function reseedValue(draft, stored, authoritative) {
    return draft === stored ? authoritative : draft;
}
/**
 * Merge one refreshed authoritative record into a staged draft.
 *
 * Three cases, because a rule kind and the fields that describe it are one
 * value. The Monday-to-Friday choice and the weekly choice state the same Host
 * weekly rule, so the comparisons below fold them together and only the day set
 * tells them apart.
 *
 * The draft stages another kind than the stored record. Its fields describe a
 * rule the refreshed record does not state, so the draft keeps them whole.
 *
 * The draft stages the stored kind, and the refreshed record changed that kind.
 * The two rules cannot be mixed, so the draft is kept whole when the user edited
 * it and the refreshed rule is adopted whole when the user did not.
 *
 * All three kinds agree. Only here can one field differ legitimately on each
 * side, so the fields merge on their own: a field the user changed keeps the
 * draft value and every other field takes the refreshed record, which is what
 * carries a concurrent remote timing edit into an unrelated local edit.
 *
 * The name and the instruction merge field by field in every case: another
 * client's rename reaches this detail even while a rule change is staged.
 * @param authoritative - values of the refreshed record.
 * @param draft - values the detail currently shows.
 * @param stored - authoritative values the draft was compared against.
 * @returns the merged values.
 */
export function mergeRuleDraft(authoritative, draft, stored) {
    const text = {
        title: reseedText(draft.title, stored.title, authoritative.title),
        prompt: reseedText(draft.prompt, stored.prompt, authoritative.prompt),
    };
    // The merged text wins over the draft's own copies: `draft` carries the title
    // and prompt it was staged with, and spreading it last would put those stale
    // strings back over the refreshed ones.
    if (storedRuleChoice(draft.kind) !== storedRuleChoice(stored.kind))
        return { ...draft, ...text };
    if (storedRuleChoice(authoritative.kind) !== storedRuleChoice(stored.kind)) {
        return editedTiming(draft, stored) ? { ...draft, ...text } : { ...authoritative, ...text };
    }
    // The two `weekly` choices are one Host rule, so the merged choice has to
    // describe the merged set. The reader's own choice wins while they are using it:
    // a staged choice of the other `weekly` option, or a staged set of their own,
    // keeps its label, because the Weekday row exists only under Weekly and
    // relabelling it would close the row under the pointer. Only a choice they left
    // alone follows the refreshed set.
    const weekdays = sameWeekdays(draft.weekdays, stored.weekdays) ? authoritative.weekdays : draft.weekdays;
    const stagedChoice = draft.kind !== stored.kind || !sameWeekdays(draft.weekdays, stored.weekdays);
    return {
        ...text,
        kind: storedRuleChoice(draft.kind) === 'weekly'
            ? (stagedChoice ? draft.kind : (isWeekdayRule(weekdays) ? 'weekdays' : 'weekly'))
            : reseedValue(draft.kind, stored.kind, authoritative.kind),
        draft: {
            date: reseedValue(draft.draft.date, stored.draft.date, authoritative.draft.date),
            time: reseedValue(draft.draft.time, stored.draft.time, authoritative.draft.time),
            timeZone: reseedValue(draft.draft.timeZone, stored.draft.timeZone, authoritative.draft.timeZone),
            seconds: reseedValue(draft.draft.seconds, stored.draft.seconds, authoritative.draft.seconds),
            expression: reseedValue(draft.draft.expression, stored.draft.expression, authoritative.draft.expression),
        },
        weekdays,
    };
}
/**
 * Render the weekly rule's Weekday row: one pill per weekday, named by the row's
 * label and toggled in the rule the caller is editing.
 * @param props.weekdays - weekdays the rule currently selects, as the builder's stored day numbers.
 * @param props.disabled - whether the rule's controls are read-only.
 * @param props.t - frequency translator owning the weekday labels.
 * @param props.rowId - id builder for the row's label, which names the pill group.
 * @param props.onToggle - toggle one weekday in the rule being edited.
 * @returns the labelled Weekday row.
 */
function WeekdayRow({ weekdays, disabled, t, rowId, onToggle }) {
    return _jsxs("div", { className: css.ruleRow, children: [_jsx("span", { className: css.ruleLabel, id: rowId('weekday'), children: t('rule.weekday') }), _jsx("div", { className: clsx(css.ruleWeekdays, css.ruleControl), role: "group", "aria-labelledby": rowId('weekday'), children: WEEKDAYS.map((weekday) => {
                    const selected = weekdays.includes(weekday);
                    return _jsx(Pill, { className: css.ruleControl, active: selected, disabled: disabled, "aria-pressed": selected, "aria-label": t('rule.weekdayOption', { weekday: t(WEEKDAY_LABELS[weekday]) }), onClick: () => { onToggle(weekday); }, children: t(WEEKDAY_LABELS[weekday]) }, weekday);
                }) })] });
}
/**
 * Render the rule's recurrence, time, and zone as rows that edit a local draft.
 *
 * No row reaches the Host on its own: the detail's Save action submits the
 * complete expected record with the staged name, instruction, and timing change
 * through `schedule.update`.
 * @param props - task, staged values, blocking state, draft callbacks, and locale.
 * @returns the bordered Run time card with its staged rows.
 */
function RuleCard({ task, disabled, values, intervalUnit, failure, onChooseKind, onChooseZone, onToggleWeekday, onEditDraft, t, }) {
    const shown = values;
    const [repeatOpen, setRepeatOpen] = useState(false);
    const [zoneOpen, setZoneOpen] = useState(false);
    const [zoneQuery, setZoneQuery] = useState('');
    const [dateOpen, setDateOpen] = useState(false);
    const [timeOpen, setTimeOpen] = useState(false);
    // The host's own zone is the only zone the card marks and leads with, and the
    // frequency line omits a stored zone equal to it and otherwise names it.
    const systemZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [recentZones, setRecentZones] = useState(() => loadRecentTimeZones(systemZone));
    const frequencyZone = { system: systemZone, label: zone => zoneLabel(zone, t) };
    const repeatRef = useRef(null);
    const zoneRef = useRef(null);
    const dateRef = useRef(null);
    const timeRef = useRef(null);
    const cardId = useId();
    const rowId = (name) => `${cardId}-${name}`;
    // An ended or blocked rule has no editable timing: a panel that opened while
    // the card could still edit must not keep staging values behind a disabled row.
    useEffect(() => {
        if (!disabled)
            return;
        setDateOpen(false);
        setTimeOpen(false);
    }, [disabled]);
    const chooseChoice = (choice) => {
        setRepeatOpen(false);
        if (isIntervalChoice(choice)) {
            onChooseKind('every', intervalChoiceUnit(choice));
            return;
        }
        onChooseKind(choice);
    };
    // The interval stepper's arrows move the staged quantity by one whole unit of
    // the row's own unit and never below the Host's floor in that unit.
    const intervalMin = Math.ceil(MIN_INTERVAL_SECONDS / INTERVAL_UNIT_SECONDS[intervalUnit]);
    const intervalValue = shown.draft.seconds === '' ? undefined : Number(shown.draft.seconds) / INTERVAL_UNIT_SECONDS[intervalUnit];
    const stepInterval = (delta) => {
        const next = intervalValue === undefined ? intervalMin : Math.max(intervalMin, intervalValue + delta);
        onEditDraft({ seconds: String(Math.round(next * INTERVAL_UNIT_SECONDS[intervalUnit])) });
    };
    const chooseZone = (zone) => {
        setZoneOpen(false);
        setZoneQuery('');
        setRecentZones(recent => rememberTimeZone(recent, zone));
        onChooseZone(zone);
    };
    // Build the several hundred ICU labels once per opening, not on every search keystroke.
    const zoneCatalog = useMemo(() => {
        if (!zoneOpen)
            return [];
        const at = Date.now();
        const byLabel = new Map();
        for (const zone of zoneChoices(shown.draft.timeZone, systemZone, at)) {
            const label = zoneName(zone, systemZone, t, at);
            const existing = byLabel.get(label);
            if (existing === undefined) {
                byLabel.set(label, { id: zone, label, disabled, zones: [zone] });
                continue;
            }
            existing.zones.push(zone);
            // Preserve the rule's exact IANA identity when its visible label shares
            // a row with equivalent zones. Every alias remains searchable below.
            if (zone === shown.draft.timeZone)
                existing.id = zone;
        }
        return [...byLabel.values()];
    }, [disabled, shown.draft.timeZone, systemZone, t, zoneOpen]);
    const zoneLocale = t('time.locale');
    const normalizedZoneQuery = zoneQuery.trim().toLocaleLowerCase(zoneLocale);
    // The zone a search names: an exact id always, otherwise the id the query
    // matched. A row whose ids several matches share keeps the id the rule states
    // while it is among them, and otherwise takes the first match, so a zone the
    // query never named is never selected. A friendly-name or offset search names no
    // zone, so its row keeps the preferred id.
    const namedZone = (zones, preferred) => {
        if (normalizedZoneQuery === '')
            return undefined;
        const exact = zones.find(zone => zone.toLocaleLowerCase(zoneLocale) === normalizedZoneQuery);
        if (exact !== undefined)
            return exact;
        const partial = zones.filter(zone => zone.toLocaleLowerCase(zoneLocale).includes(normalizedZoneQuery));
        if (partial.length === 0)
            return undefined;
        return partial.includes(preferred) ? preferred : partial[0];
    };
    const zoneItems = zoneCatalog
        .filter(item => `${item.zones.join(' ')} ${item.label}`
        .toLocaleLowerCase(zoneLocale).includes(normalizedZoneQuery))
        .map(item => ({ ...item, id: namedZone(item.zones, item.id) ?? item.id }));
    const recentItems = normalizedZoneQuery === '' ? recentZones.flatMap((zone) => {
        const item = zoneCatalog.find(choice => choice.zones.includes(zone));
        return item === undefined ? [] : [{ ...item, id: zone }];
    }).filter((item, index, items) => items.findIndex(candidate => candidate.label === item.label) === index) : [];
    const recentLabels = new Set(recentItems.map(item => item.label));
    const availableZoneItems = zoneItems.filter(item => !recentLabels.has(item.label));
    const shownZoneItems = recentItems.length === 0 ? availableZoneItems
        : availableZoneItems.length === 0 ? recentItems : [
            ...recentItems,
            { type: 'separator', id: '__recent' },
            ...availableZoneItems,
        ];
    // The cron choice parses the staged expression in the browser, so the row can
    // describe a valid expression and reject an invalid one without a Host call.
    const parsedCron = shown.kind === 'cron' ? parseCronExpression(shown.draft.expression) : undefined;
    // A rule that stored no zone needs one line saying so. The clock-time choices
    // whose rule does state a zone carry that fact in their own names, so their row
    // shows no hint at all, and the zone row's own picker names the rest.
    const clockHint = shown.kind === 'once' && !draftZone(task).stored
        ? 'timing.zoneNoStored'
        : undefined;
    const clockLine = failure ?? clockHint;
    return _jsxs("section", { className: css.ruleCard, "aria-label": t('rule.title'), children: [_jsx("h3", { children: t('rule.title') }), _jsxs("div", { className: css.ruleRows, children: [_jsx("span", { className: css.menuGuard, onKeyDown: (event) => {
                            guardMenuEscape(event, repeatOpen, () => {
                                setRepeatOpen(false);
                                repeatRef.current?.focus();
                            });
                        }, children: _jsx(TaskMenu, { className: css.ruleRowMenu, open: repeatOpen, onClose: () => { setRepeatOpen(false); }, items: RULE_CHOICES.map(value => ({
                                id: value, label: t(RULE_CHOICE_LABELS[value]), disabled,
                            })), selectedId: shown.kind === 'every' ? `every-${intervalUnit}` : shown.kind, onSelect: (id) => { chooseChoice(id); }, align: "end", portal: true, anchor: _jsxs("button", { ref: repeatRef, type: "button", className: css.ruleValue, disabled: disabled, "aria-haspopup": "menu", "aria-expanded": repeatOpen, onClick: () => { setRepeatOpen(open => !open); }, children: [_jsx("span", { className: css.ruleLabel, children: t('rule.repeat') }), _jsxs("span", { className: clsx(css.ruleValueFace, css.ruleControl), children: [_jsx("span", { className: css.ruleCurrent, children: shown.kind === 'every'
                                                    ? t(intervalRuleLabel(intervalUnit))
                                                    : repeatValue(task, shown.kind, t, frequencyZone) }), _jsx(IconChevronDownOutlineRegular, {})] })] }) }) }), shown.kind === 'weekly' && _jsx(WeekdayRow, { weekdays: shown.weekdays, disabled: disabled, t: t, rowId: rowId, onToggle: onToggleWeekday }), shown.kind === 'every' ? _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('interval'), children: t('timing.interval') }), _jsxs("span", { className: css.ruleInterval, children: [_jsxs("span", { className: css.ruleIntervalStepper, style: { '--interval-digits': String(intervalValue ?? '').length || 1 }, children: [_jsx("input", { id: rowId('interval'), className: clsx(css.ruleInput, css.ruleControl, css.ruleIntervalInput), type: "number", 
                                                // Both bounds are stated in the row's own unit, so the Host's
                                                // 60-second floor reads as 60 seconds, 1 minute, or 1 hour and
                                                // never as a fraction of a unit. Any step is accepted: a whole unit
                                                // step would reject a staged value such as 1.5 hours, which is a
                                                // whole 5400 seconds and so a legal interval.
                                                min: intervalMin, step: "any", disabled: disabled, value: intervalValue ?? '', "aria-describedby": rowId('interval-hint'), onChange: (event) => {
                                                    const value = event.target.value;
                                                    onEditDraft({
                                                        seconds: value === ''
                                                            ? ''
                                                            : String(Math.round(Number(value) * INTERVAL_UNIT_SECONDS[intervalUnit])),
                                                    });
                                                } }), _jsxs("span", { className: css.ruleIntervalArrows, children: [_jsx("button", { type: "button", className: css.ruleIntervalArrow, "aria-label": t('timing.intervalIncrease'), disabled: disabled, onClick: () => { stepInterval(1); }, children: _jsx(IconChevronUpOutlineRegular, { size: 9 }) }), _jsx("button", { type: "button", className: css.ruleIntervalArrow, "aria-label": t('timing.intervalDecrease'), disabled: disabled || (intervalValue !== undefined && intervalValue <= intervalMin), onClick: () => { stepInterval(-1); }, children: _jsx(IconChevronDownOutlineRegular, { size: 9 }) })] })] }), _jsx("span", { className: css.ruleIntervalUnit, children: t(INTERVAL_UNIT_LABELS[intervalUnit]) })] })] }) : _jsxs(_Fragment, { children: [shown.kind === 'once' && _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('date'), children: t('timing.date') }), _jsxs("span", { className: css.menuGuard, onKeyDown: (event) => {
                                            guardMenuEscape(event, dateOpen, () => {
                                                setDateOpen(false);
                                                dateRef.current?.focus();
                                            });
                                        }, children: [_jsxs("button", { ref: dateRef, id: rowId('date'), type: "button", className: clsx(css.ruleInput, css.ruleControl, css.pickerTrigger), disabled: disabled, "aria-label": t('timing.date'), "aria-haspopup": "dialog", "aria-expanded": dateOpen, "aria-describedby": clockHint === undefined ? undefined : rowId('time-hint'), onClick: () => { setDateOpen(open => !open); }, children: [_jsx("span", { children: slashDate(shown.draft.date) }), _jsx(IconCalendarOutlineRegular, { className: css.pickerIcon })] }), _jsx(DatePicker, { open: dateOpen, anchorRef: dateRef, value: shown.draft.date, onPick: (date) => { onEditDraft({ date }); }, onClose: () => { setDateOpen(false); }, t: t })] })] }), shown.kind !== 'cron' && _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('time'), children: t('timing.time') }), _jsxs("span", { className: css.menuGuard, onKeyDown: (event) => {
                                            guardMenuEscape(event, timeOpen, () => {
                                                setTimeOpen(false);
                                                timeRef.current?.focus();
                                            });
                                        }, children: [_jsxs("button", { ref: timeRef, id: rowId('time'), type: "button", className: clsx(css.ruleInput, css.ruleControl, css.pickerTrigger), disabled: disabled, "aria-label": t('timing.time'), "aria-haspopup": "dialog", "aria-expanded": timeOpen, "aria-describedby": clockHint === undefined ? undefined : rowId('time-hint'), onClick: () => { setTimeOpen(open => !open); }, children: [_jsx("span", { children: secondPrecision(shown.draft.time) }), _jsx(IconClockOutlineRegular, { className: css.pickerIcon })] }), _jsx(ClockPicker, { open: timeOpen, anchorRef: timeRef, value: shown.draft.time, onPick: (time) => { onEditDraft({ time }); }, onClose: () => { setTimeOpen(false); }, t: t })] })] }), shown.kind === 'cron' && _jsx(CronRows, { task: task, disabled: disabled, expression: shown.draft.expression, timeZone: shown.draft.timeZone, hintId: rowId('expression-hint'), onEditExpression: (expression) => { onEditDraft({ expression }); }, t: t }), _jsx("span", { className: css.menuGuard, onKeyDown: (event) => {
                                    guardMenuEscape(event, zoneOpen, () => {
                                        setZoneOpen(false);
                                        zoneRef.current?.focus();
                                    });
                                }, children: _jsx(TaskMenu, { className: css.ruleRowMenu, open: zoneOpen, onClose: () => { setZoneOpen(false); setZoneQuery(''); }, items: shownZoneItems.length > 0 ? shownZoneItems : [{
                                            id: '__empty', label: t('timing.zoneNoResults'), disabled: true,
                                        }], listClassName: css.zoneMenu, header: _jsx("input", { className: css.zoneSearch, type: "search", value: zoneQuery, placeholder: t('timing.zoneSearch'), "aria-label": t('timing.zoneSearch'), "data-menu-field": "", onChange: (event) => { setZoneQuery(event.target.value); } }), selectedId: shown.draft.timeZone, onSelect: (id) => { chooseZone(id); }, align: "end", portal: true, anchor: _jsxs("button", { ref: zoneRef, type: "button", className: css.ruleValue, disabled: disabled, "aria-haspopup": "menu", "aria-expanded": zoneOpen, onClick: () => {
                                            setZoneOpen((open) => {
                                                if (open)
                                                    setZoneQuery('');
                                                return !open;
                                            });
                                        }, children: [_jsx("span", { className: css.ruleLabel, children: t('timing.zone') }), _jsxs("span", { className: clsx(css.ruleValueFace, css.ruleControl), children: [_jsx("span", { className: css.ruleCurrent, children: zoneName(shown.draft.timeZone, systemZone, t) }), _jsx(IconChevronDownOutlineRegular, {})] })] }) }) })] })] }), shown.kind === 'every' && _jsx("p", { id: rowId('interval-hint'), role: failure === undefined ? undefined : 'alert', className: clsx(css.ruleHint, failure !== undefined && css.ruleHintError), children: t(failure ?? INTERVAL_HINT_KEYS[intervalUnit]) }), shown.kind !== 'every' && _jsx(_Fragment, { children: shown.kind === 'cron'
                    ? _jsx("p", { id: rowId('expression-hint'), role: failure === undefined && parsedCron !== undefined ? undefined : 'alert', className: clsx(css.ruleHint, (failure !== undefined || parsedCron === undefined) && css.ruleHintError), children: failure !== undefined ? t(failure)
                            : parsedCron === undefined ? t('rule.cronInvalid')
                                : cronPreview(parsedCron, t, t('time.locale')) })
                    : clockLine !== undefined && _jsx("p", { id: rowId('time-hint'), role: failure === undefined ? undefined : 'alert', className: clsx(css.ruleHint, failure !== undefined && css.ruleHintError), children: t(clockLine) }) })] });
}
/** Cron builder frequency choices in menu order; `raw` edits the expression text itself. */
const CRON_SHAPE_CHOICES = ['monthly', 'weekly', 'daily', 'hourly', 'minutely', 'raw'];
/** Days a month can hold, in the date grid's order. */
const MONTH_DAYS = Array.from({ length: 31 }, (_value, index) => index + 1);
/** Frequency-menu label of each builder choice; the stepped shapes reuse the Repeat menu's wording. */
const CRON_SHAPE_LABELS = {
    monthly: 'cronForm.monthly',
    weekly: 'cronForm.weekly',
    daily: 'cronForm.daily',
    hourly: 'rule.everyHours',
    minutely: 'rule.everyMinutes',
    raw: 'rule.cronLabel',
};
/** Whole minutes between runs a switch to the minutely shape starts from. */
const CRON_DEFAULT_MINUTE_STEP = 5;
/**
 * Render the cron choice as structured rows when the staged expression matches
 * one recognized shape, and as the raw expression input otherwise.
 *
 * The builder owns no rule state: every row edit regenerates the staged
 * expression, so storage stays a plain cron rule. Choosing the raw option keeps
 * the expression text editable even while it stays recognizable, until another
 * shape is chosen.
 * @param props - staged expression, blocking state, expression callback, and locale.
 * @returns the cron rows of the Run time card.
 */
function CronRows({ task, disabled, expression, timeZone, hintId, onEditExpression, t }) {
    const parsed = parseCronExpression(expression);
    const shape = parsed === undefined ? undefined : recognizeCronShape(parsed);
    const [rawChosen, setRawChosen] = useState(false);
    const [freqOpen, setFreqOpen] = useState(false);
    const [timeOpen, setTimeOpen] = useState(false);
    const freqRef = useRef(null);
    const timeRef = useRef(null);
    const baseId = useId();
    const rowId = (name) => `${baseId}-${name}`;
    // Same rule as the card's own pickers: a picker that opened while the rows
    // could still edit must not keep staging values behind a disabled row.
    useEffect(() => {
        if (disabled)
            setTimeOpen(false);
    }, [disabled]);
    const builder = rawChosen ? undefined : shape;
    const chooseShape = (choice) => {
        setFreqOpen(false);
        if (choice === 'raw') {
            setRawChosen(true);
            return;
        }
        setRawChosen(false);
        if (choice === shape?.kind)
            return;
        // Fields the current shape lacks seed from the committed occurrence in the
        // staged zone, the same source the card's other choices seed from.
        const wallClock = zonedWallClock(task.scheduledAt, timeZone);
        const minute = shape !== undefined && shape.kind !== 'minutely' ? shape.minute : Number(wallClock.slice(14, 16));
        const hour = shape?.kind === 'daily' || shape?.kind === 'weekly' || shape?.kind === 'monthly'
            ? shape.hour
            : Number(wallClock.slice(11, 13));
        switch (choice) {
            case 'minutely':
                onEditExpression(cronShapeExpression({ kind: 'minutely', step: CRON_DEFAULT_MINUTE_STEP }));
                return;
            case 'hourly':
                onEditExpression(cronShapeExpression({ kind: 'hourly', step: 1, minute }));
                return;
            case 'daily':
                onEditExpression(cronShapeExpression({ kind: 'daily', hour, minute }));
                return;
            case 'weekly':
                // The guard above returns when the choice names the shape the expression
                // already has, so the seed never reuses a recognized weekly day set here.
                onEditExpression(cronShapeExpression({
                    kind: 'weekly',
                    weekdays: [zonedWeekday(task.scheduledAt, timeZone)],
                    hour,
                    minute,
                }));
                return;
            case 'monthly':
                onEditExpression(cronShapeExpression({
                    kind: 'monthly',
                    days: [Number(wallClock.slice(8, 10))],
                    hour,
                    minute,
                }));
                return;
            /* v8 ignore next -- the switch covers every CronShapeChoice, so the default holds no reachable statement. */
            default: assertNever(choice);
        }
    };
    const toggleDay = (current, weekday) => {
        // The Host rejects an empty weekday set: the last selected day stays on.
        if (current.weekdays.length === 1 && current.weekdays.includes(weekday))
            return;
        const weekdays = current.weekdays.includes(weekday)
            ? current.weekdays.filter(day => day !== weekday)
            : WEEKDAYS.filter(day => day === weekday || current.weekdays.includes(day));
        onEditExpression(cronShapeExpression({ ...current, weekdays }));
    };
    const toggleDate = (current, day) => {
        // Same guard as the weekday pills: an empty date set is not a cron field.
        if (current.days.length === 1 && current.days.includes(day))
            return;
        const days = current.days.includes(day)
            ? current.days.filter(value => value !== day)
            : MONTH_DAYS.filter(value => value === day || current.days.includes(value));
        onEditExpression(cronShapeExpression({ ...current, days }));
    };
    const pad = (value) => String(value).padStart(2, '0');
    const clock = builder?.kind === 'daily' || builder?.kind === 'weekly' || builder?.kind === 'monthly'
        ? `${pad(builder.hour)}:${pad(builder.minute)}`
        : '';
    return _jsxs(_Fragment, { children: [_jsx("span", { className: css.menuGuard, onKeyDown: (event) => {
                    guardMenuEscape(event, freqOpen, () => {
                        setFreqOpen(false);
                        freqRef.current?.focus();
                    });
                }, children: _jsx(TaskMenu, { className: css.ruleRowMenu, open: freqOpen, onClose: () => { setFreqOpen(false); }, items: CRON_SHAPE_CHOICES.map(value => ({ id: value, label: t(CRON_SHAPE_LABELS[value]), disabled })), selectedId: builder?.kind ?? 'raw', onSelect: (id) => { chooseShape(id); }, align: "end", portal: true, anchor: _jsxs("button", { ref: freqRef, type: "button", className: css.ruleValue, disabled: disabled, "aria-haspopup": "menu", "aria-expanded": freqOpen, "aria-describedby": hintId, onClick: () => { setFreqOpen(open => !open); }, children: [_jsx("span", { className: css.ruleLabel, children: t('cronForm.frequency') }), _jsxs("span", { className: clsx(css.ruleValueFace, css.ruleControl), children: [_jsx("span", { className: css.ruleCurrent, children: t(builder === undefined ? 'rule.cronLabel' : CRON_SHAPE_LABELS[builder.kind]) }), _jsx(IconChevronDownOutlineRegular, {})] })] }) }) }), builder?.kind === 'monthly' && _jsxs("div", { className: css.ruleRow, children: [_jsx("span", { className: css.ruleLabel, id: rowId('dates'), children: t('cronForm.dates') }), _jsx("div", { className: clsx(css.ruleMonthDays, css.ruleControl), role: "group", "aria-labelledby": rowId('dates'), children: MONTH_DAYS.map((day) => {
                            const selected = builder.days.includes(day);
                            return _jsx(Pill, { className: css.ruleControl, active: selected, disabled: disabled, "aria-pressed": selected, "aria-label": t('cronForm.dateOption', { day }), onClick: () => { toggleDate(builder, day); }, children: day }, day);
                        }) })] }), builder?.kind === 'weekly' && _jsx(WeekdayRow, { weekdays: builder.weekdays, disabled: disabled, t: t, rowId: rowId, onToggle: (weekday) => { toggleDay(builder, weekday); } }), (builder?.kind === 'minutely' || builder?.kind === 'hourly') && _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('step'), children: t('timing.interval') }), _jsxs("span", { className: css.ruleInterval, children: [_jsx(CronStepper, { id: rowId('step'), min: 1, max: builder.kind === 'minutely' ? 59 : 23, value: builder.step, disabled: disabled, increaseLabel: t('timing.intervalIncrease'), decreaseLabel: t('timing.intervalDecrease'), onChange: (step) => { onEditExpression(cronShapeExpression({ ...builder, step })); } }), _jsx("span", { className: css.ruleIntervalUnit, children: t(builder.kind === 'minutely' ? 'timing.unit.minute' : 'timing.unit.hour') })] })] }), builder?.kind === 'hourly' && _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('minute'), children: t('cronForm.atMinute') }), _jsx("span", { className: css.ruleInterval, children: _jsx(CronStepper, { id: rowId('minute'), min: 0, max: 59, value: builder.minute, disabled: disabled, increaseLabel: t('cronForm.minuteIncrease'), decreaseLabel: t('cronForm.minuteDecrease'), onChange: (minute) => { onEditExpression(cronShapeExpression({ ...builder, minute })); } }) })] }), (builder?.kind === 'daily' || builder?.kind === 'weekly' || builder?.kind === 'monthly') && _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('time'), children: t('timing.time') }), _jsxs("span", { className: css.menuGuard, onKeyDown: (event) => {
                            guardMenuEscape(event, timeOpen, () => {
                                setTimeOpen(false);
                                timeRef.current?.focus();
                            });
                        }, children: [_jsxs("button", { ref: timeRef, id: rowId('time'), type: "button", className: clsx(css.ruleInput, css.ruleControl, css.pickerTrigger), disabled: disabled, "aria-label": t('timing.time'), "aria-haspopup": "dialog", "aria-expanded": timeOpen, onClick: () => { setTimeOpen(open => !open); }, children: [_jsx("span", { children: clock }), _jsx(IconClockOutlineRegular, { className: css.pickerIcon })] }), _jsx(ClockPicker, { open: timeOpen, anchorRef: timeRef, value: clock, 
                                // A cron expression has no seconds field, so the panel offers none.
                                seconds: false, onPick: (time) => {
                                    onEditExpression(cronShapeExpression({ ...builder, hour: Number(time.slice(0, 2)), minute: Number(time.slice(3, 5)) }));
                                }, onClose: () => { setTimeOpen(false); }, t: t })] })] }), builder === undefined && _jsxs("div", { className: css.ruleRow, children: [_jsx("label", { className: css.ruleLabel, htmlFor: rowId('expression'), children: t('rule.cronLabel') }), _jsx("input", { id: rowId('expression'), className: clsx(css.ruleInput, css.ruleControl), type: "text", spellCheck: false, autoComplete: "off", disabled: disabled, "aria-invalid": parsed === undefined, "aria-describedby": hintId, value: expression, onChange: (event) => { onEditExpression(event.target.value); } })] })] });
}
/**
 * One whole-number stepper of the cron builder, styled like the elapsed-interval
 * stepper. Values clamp to the shape's own bounds, and an emptied or fractional
 * input stages nothing, so the regenerated expression stays valid on every edit.
 * @param props - bounds, staged value, blocking state, arrow labels, and callback.
 * @returns the stepper pill.
 */
function CronStepper({ id, min, max, value, disabled, increaseLabel, decreaseLabel, onChange }) {
    const clamp = (next) => Math.min(max, Math.max(min, next));
    return _jsxs("span", { className: css.ruleIntervalStepper, style: { '--interval-digits': String(value).length }, children: [_jsx("input", { id: id, className: clsx(css.ruleInput, css.ruleControl, css.ruleIntervalInput), type: "number", min: min, max: max, step: 1, disabled: disabled, value: value, onChange: (event) => {
                    const next = Number(event.target.value);
                    if (event.target.value === '' || !Number.isSafeInteger(next))
                        return;
                    onChange(clamp(next));
                } }), _jsxs("span", { className: css.ruleIntervalArrows, children: [_jsx("button", { type: "button", className: css.ruleIntervalArrow, "aria-label": increaseLabel, disabled: disabled || value >= max, onClick: () => { onChange(clamp(value + 1)); }, children: _jsx(IconChevronUpOutlineRegular, { size: 9 }) }), _jsx("button", { type: "button", className: css.ruleIntervalArrow, "aria-label": decreaseLabel, disabled: disabled || value <= min, onClick: () => { onChange(clamp(value - 1)); }, children: _jsx(IconChevronDownOutlineRegular, { size: 9 }) })] })] });
}
//# sourceMappingURL=TaskDetail.js.map