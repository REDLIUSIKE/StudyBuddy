import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Virtualized raw-data table shared by Session log and Chat structure views. */
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { InspectorTableHierarchy, inspectorRowCollapsed } from "./table-model.js";
import { inspectorPreview } from "./format.js";
import { inspectorJson } from "./raw-json.js";
import { InspectorDetails } from "./InspectorDetails.js";
import { InspectorJsonTree, InspectorObjectTree } from "./InspectorObjectTree.js";
import { InspectorTableLayout, INSPECTOR_ROW_HEIGHT } from "./table-layout.js";
import { InspectorTypeFilter } from "./type-filter.js";
import { TypeFilter } from "./TypeFilter.js";
import css from './inspector.module.css';
const DataRow = memo(function DataRow({ row, selected, branch, collapsed, added, stickyLevel, pulse, context, select, toggle, useRecord, flash, showTime, t }) {
    const record = useRecord(row.key);
    const element = useRef(null);
    const previous = useRef(record);
    const previousPulse = useRef(0);
    useEffect(() => {
        const changed = previous.current !== record;
        previous.current = record;
        const navigated = pulse > 0 && previousPulse.current !== pulse;
        previousPulse.current = pulse;
        if ((!flash && !navigated) || (!changed && !added && !navigated) || element.current === null
            || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        const color = getComputedStyle(element.current).getPropertyValue('--dsw-specific-bubble-highlight');
        const animation = element.current.animate([{ backgroundColor: color }, { backgroundColor: 'transparent' }], { duration: 700 });
        return () => { animation.cancel(); };
    }, [record, added, flash, pulse]);
    const summary = useMemo(() => (collapsed ? record?.collapsedSummary : undefined)
        ?? record?.summary ?? inspectorPreview(record?.value), [record, collapsed]);
    return _jsxs("tr", { ref: element, "aria-selected": selected, "data-inspector-context": context ? '' : undefined, title: context ? t('filter.context') : undefined, className: [selected && css.selected, stickyLevel !== undefined && css.sticky, context && css.contextRow].filter(Boolean).join(' '), style: stickyLevel === undefined ? undefined : { top: (stickyLevel + 1) * INSPECTOR_ROW_HEIGHT, zIndex: 9 - stickyLevel }, children: [_jsx("td", { className: css.identity, children: _jsx(Tooltip, { label: record?.identity ?? '', side: "right", portal: true, children: _jsx("span", { className: css.identityText, tabIndex: 0, children: record?.identity }) }) }), _jsxs("td", { style: { paddingInlineStart: 8 + row.depth * 20 }, children: [branch && _jsx("button", { type: "button", className: css.disclosure, "aria-label": collapsed ? t('table.expand') : t('table.collapse'), "aria-expanded": !collapsed, onClick: () => {
                            // oxlint-disable-next-line typescript/no-non-null-assertion -- The clicked button belongs to this mounted row.
                            toggle(row, element.current);
                        }, children: collapsed ? '▸' : '▾' }), _jsx("button", { type: "button", className: css.record, onClick: () => { select(row.key); }, children: record?.type })] }), _jsx("td", { children: record?.location }), showTime && _jsx("td", { children: record?.time === undefined ? '' : new Date(record.time).toISOString().slice(11, 23) }), _jsx("td", { children: _jsx("button", { type: "button", className: css.preview, onClick: () => { select(row.key); }, children: summary }) })] });
});
/**
 * Render a paged hierarchy with stable virtual row keys and live JSON details.
 * @param props - Framework hooks, pagination, locale, and the view's highlight policy.
 * @returns Virtual table and selected raw data.
 */
export function InspectorTable({ title, flash, showTime, modeSelector, objects, navigation, pickedRow, notice, useRows, useRecord, useSession, loadOlder, typeOf, t }) {
    const allRows = useRows(value => value);
    const hasMore = useSession(value => value.hasMore);
    const loading = useSession(value => value.loadingOlder);
    const openError = useSession(value => value.openError);
    const [failure, setFailure] = useState(null);
    const [selected, setSelected] = useState(null);
    const record = useRecord(selected ?? '');
    const rowLabel = `${record?.type ?? ''} · ${record?.identity ?? selected}`;
    const [objectHistory, setObjectHistory] = useState(null);
    const objectTarget = objectHistory?.references.at(-1);
    const [reveal, setReveal] = useState(null);
    const appliedReveal = useRef(null);
    const appliedPick = useRef();
    const [disclosures, setDisclosures] = useState(new Map());
    const [typeQuery, setTypeQuery] = useState('');
    const typeFilter = useMemo(() => new InspectorTypeFilter(typeQuery), [typeQuery]);
    const filtered = useMemo(() => typeFilter.apply(allRows, typeOf), [allRows, typeOf, typeFilter]);
    const suggestTypes = useCallback((query) => new InspectorTypeFilter(query).suggest(allRows, typeOf), [allRows, typeOf]);
    const scroller = useRef(null);
    const followMode = useRef('tail');
    const viewport = useRef({ offset: 0, height: 600 });
    const disclosureAnchor = useRef();
    const [spacingGeneration, resetSpacing] = useState(0);
    const toggle = useCallback((row, element) => {
        // oxlint-disable-next-line typescript/no-non-null-assertion -- Row disclosure runs only inside the mounted scrollport.
        const host = scroller.current;
        followMode.current = 'manual';
        disclosureAnchor.current = { key: row.key,
            top: element.getBoundingClientRect().top - host.getBoundingClientRect().top - host.clientTop };
        viewport.current = { offset: host.scrollTop, height: host.clientHeight };
        setDisclosures((previous) => {
            const next = new Map(previous);
            next.set(row.key, { state: row.disclosure, collapsed: !inspectorRowCollapsed(row, previous) });
            return next;
        });
    }, []);
    const locateChat = useCallback((target) => {
        navigation?.reveal(target ?? {});
    }, [navigation]);
    const select = useCallback((key) => {
        setSelected(key);
        setObjectHistory(null);
        const target = navigation?.target(key);
        locateChat(target);
    }, [navigation, locateChat]);
    const revealRow = useCallback((key) => {
        const clearFilter = typeFilter.active && !filtered.rows.some(row => row.key === key);
        if (clearFilter)
            setTypeQuery('');
        followMode.current = 'scroll';
        setSelected(key);
        setDisclosures((previous) => {
            const next = new Map(previous);
            const byKey = new Map((clearFilter ? allRows : filtered.rows).map(row => [row.key, row]));
            let parent = byKey.get(key)?.parent;
            while (parent !== undefined) {
                const row = byKey.get(parent);
                if (row === undefined)
                    break;
                next.set(parent, { state: row.disclosure, collapsed: false });
                parent = row.parent;
            }
            return next;
        });
        setReveal(previous => ({ key, pulse: (previous?.pulse ?? 0) + 1 }));
    }, [allRows, typeFilter, filtered.rows]);
    const navigate = useCallback((reference) => {
        setObjectHistory(previous => ({
            // oxlint-disable-next-line typescript/no-non-null-assertion -- Detail navigation is mounted only for a selected row.
            rootKey: previous?.rootKey ?? selected,
            rootLabel: previous?.rootLabel ?? rowLabel,
            references: [...(previous?.references ?? []), reference],
        }));
        locateChat(reference.target);
        if (reference.rowKey !== undefined)
            revealRow(reference.rowKey);
    }, [revealRow, locateChat, selected, rowLabel]);
    const backToObject = (index) => {
        // oxlint-disable-next-line typescript/no-non-null-assertion -- A breadcrumb is enabled only when a reference history exists.
        const history = objectHistory;
        const reference = history.references[index - 1];
        const key = index === 0 ? history.rootKey : reference?.rowKey;
        const target = index === 0 ? navigation?.target(history.rootKey) : reference?.target;
        setObjectHistory(index === 0 ? null : { ...history, references: history.references.slice(0, index) });
        if (key !== undefined)
            revealRow(key);
        locateChat(target);
    };
    useLayoutEffect(() => {
        if (pickedRow === undefined || appliedPick.current === pickedRow || !allRows.some(row => row.key === pickedRow.key))
            return;
        appliedPick.current = pickedRow;
        setObjectHistory(null);
        revealRow(pickedRow.key);
    }, [pickedRow, allRows, revealRow]);
    const hierarchy = useMemo(() => new InspectorTableHierarchy(filtered.rows, disclosures), [filtered.rows, disclosures]);
    const rows = hierarchy.rows;
    const committed = useRef();
    const layout = useMemo(() => new InspectorTableLayout(hierarchy, committed.current?.disclosures === disclosures && committed.current.spacingGeneration === spacingGeneration
        ? committed.current.layout : undefined, viewport.current, disclosureAnchor.current), [hierarchy, disclosures, spacingGeneration]);
    const anchoredOffset = committed.current?.layout !== layout ? layout.scrollOffset : undefined;
    const seen = useRef(new Map());
    const initialized = useRef(false);
    const arrivals = useMemo(() => {
        const now = performance.now();
        const next = new Map(allRows.map(row => [row.key, seen.current.get(row.key) ?? (initialized.current ? now : -Infinity)]));
        if (allRows.length > 0)
            initialized.current = true;
        seen.current = next;
        return next;
    }, [allRows]);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- Virtualizer indexes are bounded by this layout's item count.
    const keyOf = useCallback((index) => layout.items[index].key, [layout]);
    // oxlint-disable-next-line typescript/no-non-null-assertion -- Virtualizer indexes are bounded by this layout's item count.
    const sizeOf = useCallback((index) => layout.items[index].size, [layout]);
    const virtualRef = useRef();
    const extractRange = useCallback((range) => {
        // oxlint-disable-next-line typescript/no-non-null-assertion -- The enabled Virtualizer initializes its offset before range extraction.
        const offset = anchoredOffset ?? virtualRef.current.scrollOffset;
        // Render the anchored viewport before the layout effect moves the scrollport.
        const visible = anchoredOffset === undefined ? range : { ...range,
            startIndex: Math.max(0, Math.floor(offset / INSPECTOR_ROW_HEIGHT) - 1),
            endIndex: Math.min(range.count - 1, Math.ceil((offset + viewport.current.height) / INSPECTOR_ROW_HEIGHT) - 1),
        };
        return [...new Set([...layout.stickyIndexesAtOffset(offset), ...defaultRangeExtractor(visible)])]
            .sort((left, right) => left - right);
    }, [layout, anchoredOffset]);
    const virtual = useVirtualizer({
        count: layout.items.length, getScrollElement: () => scroller.current,
        estimateSize: sizeOf, getItemKey: keyOf, overscan: 12,
        initialRect: { width: 0, height: 600 },
        anchorTo: layout.scrollOffset !== undefined || followMode.current === 'manual' ? 'start' : 'end', scrollEndThreshold: 40,
        paddingStart: INSPECTOR_ROW_HEIGHT, scrollPaddingStart: INSPECTOR_ROW_HEIGHT, rangeExtractor: extractRange,
        paddingEnd: layout.bottomPadding,
    });
    virtualRef.current = virtual;
    const viewportHeight = virtual.scrollRect?.height;
    const applyTypeFilter = (query) => {
        followMode.current = 'scroll';
        setTypeQuery(new InspectorTypeFilter(query).query);
        setDisclosures(new Map());
        resetSpacing(value => value + 1);
        setSelected(null);
        setObjectHistory(null);
        setReveal(null);
        virtual.scrollToOffset(0);
    };
    useLayoutEffect(() => {
        if (anchoredOffset !== undefined)
            virtual.scrollToOffset(anchoredOffset);
        else if (followMode.current === 'tail' && layout.bottomPadding === 0)
            virtual.scrollToEnd();
        // oxlint-disable-next-line typescript/no-non-null-assertion -- This layout effect runs with the scrollport ref attached.
        viewport.current = { offset: scroller.current.scrollTop, height: viewportHeight ?? 600 };
        disclosureAnchor.current = undefined;
        committed.current = { layout, disclosures, spacingGeneration };
    }, [virtual, layout, disclosures, spacingGeneration, viewportHeight, anchoredOffset]);
    useLayoutEffect(() => {
        if (reveal === null || appliedReveal.current === reveal)
            return;
        const index = layout.items.findIndex(item => item.key === reveal.key);
        if (index === -1)
            return;
        virtual.scrollToIndex(index, { align: 'center' });
        appliedReveal.current = reveal;
    }, [layout, reveal, virtual]);
    const items = virtual.getVirtualItems();
    // oxlint-disable-next-line typescript/no-non-null-assertion -- getVirtualItems initializes the enabled Virtualizer's scroll offset.
    const sticky = new Map(layout.stickyIndexesAtOffset(anchoredOffset ?? virtual.scrollOffset)
        .map((index, level) => [index, level]));
    const lastItem = items.at(-1);
    const bottom = lastItem === undefined ? 0 : Math.max(0, virtual.getTotalSize() - lastItem.end);
    const detail = useMemo(() => inspectorJson(objects === undefined ? record?.value : undefined), [record, objects]);
    const detailValue = objectTarget === undefined ? record?.value : objectTarget.read();
    const breadcrumbs = [objectHistory?.rootLabel ?? rowLabel,
        ...(objectHistory?.references.map(reference => `${t(`object.${reference.kind}`)} · ${reference.identity}`) ?? [])];
    const columns = showTime ? 5 : 4;
    return _jsxs("section", { className: css.root, "aria-label": title, children: [_jsxs("div", { className: css.toolbar, children: [_jsxs("span", { children: [modeSelector ?? title, " \u00B7 ", typeFilter.active ? `${filtered.matches.size} / ${allRows.length}` : allRows.length] }), hasMore && _jsx("button", { type: "button", disabled: loading, onClick: () => {
                            followMode.current = 'scroll';
                            setFailure(null);
                            void loadOlder().catch((error) => { setFailure(String(error)); });
                        }, children: loading ? t('table.loading') : t('table.older') }), _jsx("button", { type: "button", onClick: () => { followMode.current = 'tail'; resetSpacing(value => value + 1); }, children: t('table.latest') })] }), notice !== undefined && _jsx("div", { className: css.pickNotice, role: "status", children: notice }), (failure !== null || openError !== null) && _jsx("p", { role: "alert", children: failure ?? openError?.message }), _jsxs("div", { ref: scroller, className: css.scroller, onScroll: ({ currentTarget }) => {
                    viewport.current.offset = currentTarget.scrollTop;
                    if (followMode.current !== 'manual') {
                        followMode.current = currentTarget.scrollHeight - currentTarget.clientHeight - currentTarget.scrollTop <= 40 ? 'tail' : 'scroll';
                    }
                }, children: [_jsxs("table", { className: css.table, "aria-label": title, "aria-rowcount": rows.length + 1, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: css.idColumn, children: t('table.id') }), _jsx("th", { className: css.typeColumn, children: _jsxs("span", { className: css.typeHeader, children: [t('table.type'), _jsx(TypeFilter, { value: typeQuery, suggest: suggestTypes, apply: applyTypeFilter, t: t })] }) }), _jsx("th", { className: css.locationColumn, children: t('table.location') }), showTime && _jsx("th", { className: css.timeColumn, children: t('table.time') }), _jsx("th", { children: t('table.data') })] }) }), _jsxs("tbody", { children: [items.map((item, position) => {
                                        const gap = item.start - (items[position - 1]?.end ?? INSPECTOR_ROW_HEIGHT);
                                        // oxlint-disable-next-line typescript/no-non-null-assertion -- The virtual item comes from this layout's count.
                                        const entry = layout.items[item.index];
                                        // oxlint-disable-next-line typescript/no-non-null-assertion -- Every layout row belongs to the arrival map's allRows input.
                                        const arrival = arrivals.get(entry.row.key);
                                        return _jsxs(Fragment, { children: [gap > 0 && _jsx("tr", { "aria-hidden": "true", children: _jsx("td", { colSpan: columns, style: { height: gap, padding: 0 } }) }), _jsx(DataRow, { row: entry.row, selected: entry.row.key === selected, context: typeFilter.active && !filtered.matches.has(entry.row.key), branch: hierarchy.isBranch(entry.row.key), collapsed: inspectorRowCollapsed(entry.row, disclosures), stickyLevel: sticky.get(item.index), pulse: reveal?.key === entry.row.key ? reveal.pulse : 0, added: performance.now() - arrival < 700, useRecord: useRecord, select: select, toggle: toggle, flash: flash, showTime: showTime, t: t })] }, item.key);
                                    }), bottom > 0 && _jsx("tr", { "aria-hidden": "true", "data-inspector-fold-space": layout.bottomPadding > 0 ? '' : undefined, children: _jsx("td", { colSpan: columns, style: { height: bottom, padding: 0 } }) })] })] }), rows.length === 0 && _jsx("p", { className: css.empty, children: t('table.empty') })] }), selected !== null && _jsx(InspectorDetails, { failed: detail.failed, text: record === undefined ? t('table.removed') : detail.failed ? `${t('table.rawError')}\n${detail.text}` : detail.text, close: () => { setSelected(null); setObjectHistory(null); }, t: t, children: objects === undefined ? record === undefined || detail.failed ? undefined
                    : _jsx(InspectorJsonTree, { text: detail.text, t: t }, selected) : _jsxs(_Fragment, { children: [_jsx("nav", { className: css.objectBreadcrumbs, "aria-label": t('object.navigation'), children: _jsx("ol", { children: breadcrumbs.map((label, index) => _jsxs("li", { children: [index > 0 && _jsx("span", { "aria-hidden": "true", children: "\u203A" }), _jsx("button", { type: "button", title: label, disabled: index === breadcrumbs.length - 1, "aria-current": index === breadcrumbs.length - 1 ? 'page' : undefined, onClick: () => { backToObject(index); }, children: label })] }, index)) }) }), _jsx(InspectorObjectTree, { value: detailValue, objects: objects, navigate: navigate, t: t }, objectTarget?.id ?? selected)] }) })] });
}
//# sourceMappingURL=InspectorTable.js.map