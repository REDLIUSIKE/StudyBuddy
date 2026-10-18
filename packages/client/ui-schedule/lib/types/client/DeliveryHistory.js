import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Lazy saved delivery pages owned by the selected task's mounted records view. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconClockOutlineRegular, IconInfoOutlineRegular, IconWarningOutlineRegular, StateDot, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatScheduleNextRun } from "./schedule-format.js";
import css from './TaskManagerPage.module.css';
/**
 * Render one saved prompt clamped to two lines; the toggle appears only while the clamp hides text.
 * Width changes re-measure a collapsed prompt; an expanded prompt keeps its toggle until collapsed.
 * @param props - Saved prompt text and locale.
 * @returns The prompt paragraph and, when its text exceeds two lines, the expand or collapse toggle.
 */
function SavedPrompt({ prompt, t }) {
    const ref = useRef(null);
    const id = useId();
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);
    useLayoutEffect(() => {
        if (expanded)
            return;
        const paragraph = ref.current;
        const measure = () => { setClamped(paragraph.scrollHeight > paragraph.clientHeight); };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(paragraph);
        return () => { observer.disconnect(); };
    }, [expanded, prompt]);
    return _jsxs(_Fragment, { children: [_jsx("p", { ref: ref, id: id, className: css.savedPrompt, "data-expanded": expanded || undefined, children: prompt }), clamped && _jsxs("button", { type: "button", className: css.savedPromptToggle, "aria-expanded": expanded, "aria-controls": id, onClick: () => { setExpanded(open => !open); }, children: [t(expanded ? 'delivery.collapse' : 'delivery.expand'), expanded ? _jsx(IconChevronUpOutlineRegular, { size: 14 }) : _jsx(IconChevronDownOutlineRegular, { size: 14 })] })] });
}
/**
 * Render immutable saved deliveries; the parent keys this view by task and Session.
 * Refreshes supersede pending older pages, and unmount ignores both late outcomes.
 * @param props - Exact task binding, latest receipt identity, Remote callback, task zone, and locale.
 * @returns Saved records and explicit loading, failure, and pagination actions.
 */
export function DeliveryHistory({ id, sessionId, latestMessageId, timeZone, loadHistory, t }) {
    const [page, setPage] = useState();
    const [loading, setLoading] = useState(true);
    const [failure, setFailure] = useState();
    const [retentionOpen, setRetentionOpen] = useState(false);
    const retentionId = useId();
    const request = useRef({ epoch: 0, pending: false });
    const load = useCallback(async (before) => {
        if (request.current.pending)
            return;
        request.current.pending = true;
        const epoch = ++request.current.epoch;
        setLoading(true);
        setFailure(undefined);
        let result;
        try {
            result = await loadHistory({ id, sessionId, limit: 20, ...(before === undefined ? {} : { before }) });
        }
        catch (_error) {
            // Transport exceptions use the same localized retry as Remote failures.
            if (epoch !== request.current.epoch)
                return;
            request.current.pending = false;
            setLoading(false);
            setFailure({ key: 'delivery.error', before });
            return;
        }
        if (epoch !== request.current.epoch)
            return;
        request.current.pending = false;
        setLoading(false);
        if (!result.ok) {
            setFailure({ key: 'delivery.error', before });
        }
        else if ('code' in result.value) {
            setFailure({ key: result.value.code === 'schedule_not_found' ? 'delivery.notFound' : 'delivery.cursorError', before: undefined });
        }
        else {
            const next = result.value;
            setPage((previous) => {
                if (before === undefined || previous === undefined)
                    return next;
                const seen = new Set(previous.records.map(record => record.messageId));
                const records = [...previous.records];
                for (const record of next.records) {
                    if (!seen.has(record.messageId)) {
                        seen.add(record.messageId);
                        records.push(record);
                    }
                }
                return { ...next, records };
            });
        }
    }, [id, sessionId, loadHistory]);
    useEffect(() => {
        void load();
        return () => { request.current.epoch++; request.current.pending = false; };
    }, [load, latestMessageId]);
    const formatOccurrence = (value) => formatScheduleNextRun(value, t('time.locale'), timeZone);
    const hasRecords = page !== undefined && page.records.length > 0;
    return _jsxs("div", { className: css.deliveryHistory, "aria-busy": loading, children: [_jsxs("div", { className: css.detailScroll, children: [loading && !hasRecords && _jsx("div", { className: css.empty, role: "status", "aria-label": t('delivery.loading'), children: _jsx(StateDot, { state: "ongoing" }) }), failure !== undefined && (hasRecords
                        ? _jsxs("div", { className: css.notice, children: [_jsx("p", { role: "alert", children: t(failure.key) }), _jsx(Button, { variant: "outline", size: "sm", onClick: () => { void load(failure.before); }, children: t(failure.key === 'delivery.cursorError' ? 'delivery.refresh' : 'delivery.retry') })] })
                        : _jsxs("div", { className: css.empty, children: [_jsx(IconWarningOutlineRegular, { size: 24, className: css.emptyGlyph }), _jsx("p", { role: "alert", className: css.emptyTitle, children: t(failure.key) }), _jsx(Button, { variant: "outline", className: css.emptyAction, onClick: () => { void load(failure.before); }, children: t(failure.key === 'delivery.cursorError' ? 'delivery.refresh' : 'delivery.retry') })] })), !loading && failure === undefined && page?.records.length === 0
                        && _jsxs("div", { className: css.empty, role: "status", children: [_jsx(IconClockOutlineRegular, { size: 24, className: css.emptyGlyph }), _jsx("h3", { children: t('delivery.empty') })] }), page?.records.map(record => _jsxs("section", { className: css.delivery, "aria-label": t('delivery.label'), children: [_jsx(IconClockOutlineRegular, { className: css.deliveryGlyph }), _jsxs("div", { className: css.deliveryBody, children: [_jsx("div", { className: css.deliveryHead, children: _jsx("time", { className: css.deliveryTime, dateTime: record.scheduledAt, children: formatOccurrence(record.scheduledAt) }) }), record.prompt !== undefined && _jsx(SavedPrompt, { prompt: record.prompt, t: t })] })] }, record.messageId)), page?.nextBefore !== undefined && failure === undefined && _jsx(Button, { variant: "outline", disabled: loading, onClick: () => { void load(page.nextBefore); }, children: t('delivery.loadMore') })] }), hasRecords && page.earlierRecordsPruned && page.nextBefore === undefined && !loading && failure === undefined
                && _jsxs("footer", { className: css.retentionEnd, children: [_jsxs("div", { className: css.retentionLine, children: [_jsx("span", { children: t('delivery.pruned') }), _jsx(Tooltip, { label: t('delivery.retention'), side: "top", portal: true, children: _jsx("button", { type: "button", className: css.retentionInfo, "aria-label": t('delivery.retention'), "aria-expanded": retentionOpen, "aria-controls": retentionId, onClick: () => { setRetentionOpen(open => !open); }, children: _jsx(IconInfoOutlineRegular, { size: 14 }) }) })] }), retentionOpen && _jsxs("div", { id: retentionId, className: css.retentionRule, children: [_jsx("p", { children: t('delivery.retentionBounds', { days: page.retention.days, records: page.retention.records }) }), _jsx("p", { children: t('delivery.retentionExplanation') })] })] })] });
}
//# sourceMappingURL=DeliveryHistory.js.map