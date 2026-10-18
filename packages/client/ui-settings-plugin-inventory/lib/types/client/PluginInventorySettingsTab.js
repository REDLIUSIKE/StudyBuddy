import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useMemo, useState } from 'react';
import { IconChevronDownOutlineRegular, IconSearchOutlineRegular, Menu, StateDot, Tag, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PluginInventorySettingsTab.module.css';
const PHASE_KEYS = {
    pending: 'pending',
    loading: 'loadingPhase',
    active: 'active',
    failed: 'failed',
    unloading: 'unloading',
};
/** Placeholder cards the loading skeleton lays out in the cards grid. */
const SKELETON_CARDS = [0, 1, 2, 3];
/** Localized accessible label for one root Fiber phase. */
function phaseLabel(phase, t) {
    return phase === null ? t('unobserved') : t(PHASE_KEYS[phase]);
}
/** Compact technical names for Settings without changing their module identity. */
function moduleShortName(moduleName) {
    const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName;
    return unscoped
        .replace(/^cordis:/, '')
        .replace(/^cordis-plugin-/, '')
        .replace(/^dsh-(?:host-|client-)?/, '');
}
/** Display an entry identity without the composition-only `include:` marker. */
function entrySubtitle(entryId) {
    return entryId.replace(/^include:/, '');
}
/** Whether a card shows its entry id: the id exists and, without its `include:` marker, differs from the title. */
function idAddsToTitle(entryId, title) {
    return entryId !== null && entrySubtitle(entryId) !== title;
}
/** Accessible card name: the title, the complete entry id when the card shows one, then the enablement state. */
function cardLabel(title, entryId, state) {
    return idAddsToTitle(entryId, title) ? `${title}, ${entryId}, ${state}` : `${title}, ${state}`;
}
/** Preserve translated titles and shorten literal package or module name fallbacks in Settings. */
function pluginText(row, resolveText) {
    const title = row.meta?.title;
    return {
        title: typeof title === 'object' ? resolveText(title) : moduleShortName(title ?? row.moduleName),
        description: row.meta?.description === undefined ? undefined : resolveText(row.meta.description) || undefined,
    };
}
/** Match translated text alongside the row's technical module and entry identities. */
function matches(row, normalizedQuery, resolveText) {
    if (normalizedQuery.length === 0)
        return true;
    const { title, description } = pluginText(row, resolveText);
    return [row.moduleName, row.entryId, title, description]
        .some(value => value?.toLocaleLowerCase().includes(normalizedQuery));
}
/** The roster row shown when the preset switcher has no explicit choice. */
function fallbackPreset(presets) {
    return presets.find(preset => preset.isDefault) ?? presets[0];
}
/** The switcher's display label for one preset. */
function presetLabel(preset, t, presetName) {
    const name = presetName(preset);
    if (preset.broken !== undefined)
        return t('presetOptionBroken', { name });
    if (preset.isDefault)
        return t('presetOptionDefault', { name });
    return name;
}
/** One expandable plugin card; the caller owns the trailing status content. */
function PluginCard({ rowKey, moduleName, title, description, metadataError, entryId, trailing, ariaLabel, failed, expanded, onToggle, children, }) {
    const open = expanded === rowKey;
    const detailId = `plugin-details-${encodeURIComponent(rowKey)}`;
    const descriptionId = useId();
    return (_jsxs("li", { className: css.card, "data-plugin-entry": entryId ?? undefined, "data-plugin-module": moduleName, "data-failed": failed ? 'true' : undefined, "data-open": open ? 'true' : undefined, children: [_jsxs("button", { className: css.cardContent, type: "button", "aria-expanded": open, "aria-controls": detailId, "aria-label": ariaLabel, "aria-describedby": description === undefined ? undefined : descriptionId, onClick: () => { onToggle(rowKey); }, children: [_jsxs("span", { className: css.cardMainRow, children: [_jsx("strong", { className: css.cardTitle, title: moduleName, children: title }), _jsxs("span", { className: css.cardTrailing, children: [trailing, _jsx(IconChevronDownOutlineRegular, { className: css.chevron, size: 12, "aria-hidden": "true" })] })] }), description === undefined ? null : _jsx("span", { className: css.cardDescription, id: descriptionId, children: description }), idAddsToTitle(entryId, title) ? (_jsx("span", { className: css.cardMeta, children: _jsx("code", { className: css.cardIdentity, title: entryId, children: entrySubtitle(entryId) }) })) : null] }), metadataError === undefined ? null : _jsx("p", { className: css.brokenNote, role: "status", "data-package-meta-error": true, children: metadataError }), open ? _jsx("div", { className: css.cardDetails, id: detailId, children: children }) : null] }));
}
/** Detail rows shared by every card: the Loader identity, then labeled facts. */
function CardFacts({ moduleName, moduleLabel, entryId, facts }) {
    return (_jsxs(_Fragment, { children: [entryId === null ? null : _jsx("code", { className: css.entryValue, "data-loader-entry": true, children: entryId }), _jsxs("dl", { className: css.details, children: [_jsxs("div", { children: [_jsx("dt", { children: moduleLabel }), _jsx("dd", { children: moduleName })] }), facts.map(([label, value]) => (_jsxs("div", { children: [_jsx("dt", { children: label }), _jsx("dd", { children: value })] }, label)))] })] }));
}
/* `pending` is the only dotted phase with no work under way. `loading` and
 * `unloading` are both live transitions the Host is running — an async
 * disposer can hold `unloading` for a while — so both animate. `active` and
 * `failed` carry no dot: a settled enabled row needs no marker, and a failed
 * row has the failure tag. */
const PHASE_DOT_STATES = {
    pending: 'idle',
    loading: 'ongoing',
    unloading: 'ongoing',
};
/** Whether a live root-fiber phase carries a dot of its own. */
function showsPhaseDot(phase) {
    return phase === 'pending' || phase === 'loading' || phase === 'unloading';
}
/** Status dot naming a live root-fiber phase; rows without a dotted phase show none. */
function PhaseDot({ phase, t }) {
    const status = phaseLabel(phase, t);
    /* StateDot is aria-hidden, so the phase name lives on this wrapper. */
    return (_jsx("span", { className: css.phaseDot, role: "img", "aria-label": status, title: status, children: _jsx(StateDot, { state: PHASE_DOT_STATES[phase] }) }));
}
const TAG_TONES = {
    disabled: 'neutral',
    conditional: 'warning',
    preset: 'info',
    failed: 'danger',
};
/** Enablement tag for the states that depart from the default; a plainly enabled row carries none. */
function StateTag({ kind, label }) {
    return kind === 'enabled' ? null : _jsx(Tag, { tone: TAG_TONES[kind], children: label });
}
/** Render the read-only plugin inventory: agent presets first, then the global plane. */
export function PluginInventorySettingsTab({ list, presetName, resolveText, t, useClientSync, retryClient }) {
    const clientSync = useClientSync(snapshot => snapshot);
    const sectionId = useId();
    const [request, setRequest] = useState(0);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(null);
    const [chosenPreset, setChosenPreset] = useState(null);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [presetOpen, setPresetOpen] = useState(null);
    const [globalOpen, setGlobalOpen] = useState(null);
    const [state, setState] = useState({ status: 'loading' });
    useEffect(() => {
        let current = true;
        void Promise.resolve().then(() => list()).then((snapshot) => { if (current)
            setState({ status: 'ready', snapshot }); }, () => { if (current)
            setState({ status: 'error' }); });
        return () => { current = false; };
    }, [list, request]);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const searching = normalizedQuery.length > 0;
    const snapshot = state.status === 'ready' ? state.snapshot : undefined;
    const presets = snapshot?.agentPresets ?? [];
    const selected = presets.find(preset => preset.id === chosenPreset) ?? fallbackPreset(presets);
    /** Presets that actually enable a module, keyed by module name. */
    const enabledIn = useMemo(() => {
        const found = new Map();
        for (const preset of presets) {
            for (const row of preset.rows) {
                if (row.enabled !== true)
                    continue;
                const groups = found.get(row.moduleName);
                if (groups === undefined)
                    found.set(row.moduleName, [preset]);
                else if (!groups.includes(preset))
                    groups.push(preset);
            }
        }
        return found;
    }, [presets]);
    const entries = snapshot?.entries ?? [];
    const failedEntries = [];
    const regularEntries = [];
    for (const entry of entries) {
        if (entry.fiberPhase === 'failed')
            failedEntries.push(entry);
        else
            regularEntries.push(entry);
    }
    const entryMatch = (entry) => matches(entry, normalizedQuery, resolveText);
    const rowMatch = (row) => matches(row, normalizedQuery, resolveText);
    const filteredFailed = failedEntries.filter(entryMatch);
    const filteredRegular = regularEntries.filter(entryMatch);
    const globalCount = filteredFailed.length + filteredRegular.length;
    const selectedRows = selected === undefined ? [] : selected.rows.filter(rowMatch);
    const otherPresetMatches = searching
        ? presets.filter(preset => preset !== selected && preset.rows.some(rowMatch))
        : [];
    const otherMatchCount = otherPresetMatches
        .reduce((total, preset) => total + preset.rows.filter(rowMatch).length, 0);
    // The preset group starts open and the larger global plane folded; a search opens both for as long as it lasts.
    const presetEffectiveOpen = searching || (presetOpen ?? true);
    const globalEffectiveOpen = searching || (globalOpen ?? false);
    const nothingMatches = searching && globalCount === 0 && selectedRows.length === 0
        && otherPresetMatches.length === 0;
    const retry = () => {
        setState({ status: 'loading' });
        setRequest(value => value + 1);
    };
    const toggleRow = (key) => {
        setExpanded(current => current === key ? null : key);
    };
    /** Trailing status and detail facts for one row of the selected preset. */
    const presetRowCard = (preset, row, index) => {
        const key = `preset:${preset.id}:${String(index)}`;
        const { title, description } = pluginText(row, resolveText);
        const failed = row.fiberPhase === 'failed';
        const stateText = failed
            ? t('failedTag')
            : row.enabled === true ? t('enabledTag') : row.enabled === false ? t('disabledTag') : t('conditionalTag');
        const kind = failed ? 'failed' : row.enabled === true ? 'enabled' : row.enabled === false ? 'disabled' : 'conditional';
        return (_jsx(PluginCard, { rowKey: key, moduleName: row.moduleName, title: title, description: description, metadataError: row.meta?.error === undefined ? undefined : t('metadataError', { error: row.meta.error }), entryId: row.entryId, failed: failed, expanded: expanded, onToggle: toggleRow, ariaLabel: cardLabel(title, row.entryId, stateText), trailing: (_jsxs(_Fragment, { children: [row.enabled === true && showsPhaseDot(row.fiberPhase)
                        ? _jsx(PhaseDot, { phase: row.fiberPhase, t: t })
                        : null, _jsx(StateTag, { kind: kind, label: stateText })] })), children: _jsx(CardFacts, { moduleName: row.moduleName, moduleLabel: t('moduleLabel'), entryId: row.entryId, facts: [
                    [t('fromPreset'), presetName(preset)],
                    [t('configuration'), stateText],
                    ...row.fiberPhase === null ? [] : [[t('runtime'), phaseLabel(row.fiberPhase, t)]],
                    ...row.condition === undefined ? [] : [[t('condition'), _jsx("code", { children: row.condition }, "condition")]],
                ] }) }, key));
    };
    /** One global-plane row; a preset-provided row carries the presets that enable it. */
    const globalRowCard = (entry, providers) => {
        const key = `global:${entry.entryId}`;
        const { title, description } = pluginText(entry, resolveText);
        const failed = entry.fiberPhase === 'failed';
        const stateText = failed
            ? t('failedTag')
            : providers !== undefined ? t('presetEnabledTag') : t(entry.enabled ? 'enabledTag' : 'disabledTag');
        const kind = failed ? 'failed' : providers !== undefined ? 'preset' : entry.enabled ? 'enabled' : 'disabled';
        return (_jsx(PluginCard, { rowKey: key, moduleName: entry.moduleName, title: title, description: description, metadataError: entry.meta?.error === undefined ? undefined : t('metadataError', { error: entry.meta.error }), entryId: entry.entryId, failed: failed, expanded: expanded, onToggle: toggleRow, ariaLabel: cardLabel(title, entry.entryId, stateText), trailing: (_jsxs(_Fragment, { children: [entry.enabled && showsPhaseDot(entry.fiberPhase)
                        ? _jsx(PhaseDot, { phase: entry.fiberPhase, t: t })
                        : null, _jsx(StateTag, { kind: kind, label: stateText })] })), children: _jsx(CardFacts, { moduleName: entry.moduleName, moduleLabel: t('moduleLabel'), entryId: entry.entryId, facts: providers !== undefined
                    ? [
                        [t('configuration'), t('presetProvidedDetail')],
                        [t('enabledIn'), (_jsxs("span", { className: css.enabledIn, children: [_jsx("span", { children: providers.map(preset => presetName(preset)).join(' · ') }), _jsx("button", { type: "button", className: css.jumpLink, onClick: () => { setChosenPreset(providers[0].id); }, children: t('viewInPreset') })] }))],
                    ]
                    : [
                        [t('configuration'), t(entry.enabled ? 'enabledTag' : 'disabledTag')],
                        ...entry.enabled ? [[t('runtime'), phaseLabel(entry.fiberPhase, t)]] : [],
                    ] }) }, key));
    };
    return (_jsxs("div", { className: css.section, "aria-busy": state.status === 'loading', children: [clientSync.syncing ? (_jsxs("p", { className: `${css.status} ${css.statusWithDot}`, role: "status", children: [_jsx(StateDot, { state: "ongoing" }), t('clientSyncing')] })) : null, clientSync.failures.length === 0 ? null : (_jsxs("div", { className: css.failure, "data-client-sync-failure": true, children: [_jsxs("p", { className: css.statusWithDot, role: "alert", children: [_jsx(StateDot, { state: "error" }), t('clientSyncFailed')] }), _jsx("ul", { children: clientSync.failures.map(failure => _jsxs("li", { children: [failure.id, ": ", failure.message] }, failure.id)) }), _jsx("button", { type: "button", disabled: clientSync.syncing, onClick: retryClient, children: t('clientSyncRetry') })] })), state.status === 'loading' ? (_jsxs("div", { className: css.cards, role: "status", children: [_jsx("span", { className: css.visuallyHidden, children: t('loading') }), SKELETON_CARDS.map(slot => (_jsxs("div", { className: css.skeletonCard, "aria-hidden": "true", children: [_jsx("span", { className: css.skeletonBar }), _jsx("span", { className: css.skeletonBar })] }, slot)))] })) : null, state.status === 'error' ? (_jsxs("div", { className: css.failure, children: [_jsxs("p", { className: css.statusWithDot, role: "alert", children: [_jsx(StateDot, { state: "error" }), t('error')] }), _jsx("button", { type: "button", onClick: retry, children: t('retry') })] })) : null, snapshot !== undefined ? (_jsxs("div", { className: css.catalog, children: [_jsxs("label", { className: css.search, children: [_jsx(IconSearchOutlineRegular, { "aria-hidden": "true" }), _jsx("span", { className: css.visuallyHidden, children: t('search') }), _jsx("input", { type: "search", value: query, placeholder: t('search'), "aria-label": t('search'), onChange: (event) => { setQuery(event.currentTarget.value); } })] }), entries.length === 0 && presets.length === 0 ? _jsx("p", { className: css.status, children: t('empty') }) : null, nothingMatches ? _jsx("p", { className: css.status, children: t('emptySearch') }) : null, selected !== undefined ? (_jsxs("section", { className: css.group, "data-plugin-scope": "preset", "data-preset-id": selected.id, children: [_jsxs("div", { className: css.groupTitleRow, children: [_jsxs("button", { type: "button", className: css.groupToggle, "aria-expanded": presetEffectiveOpen, "aria-controls": `${sectionId}-preset`, onClick: () => { setPresetOpen(!presetEffectiveOpen); }, children: [_jsx(IconChevronDownOutlineRegular, { className: css.chevron, size: 12, "aria-hidden": "true" }), _jsx("span", { className: css.groupTitle, children: t('presetTitle') })] }), _jsx("div", { className: css.headerEnd, children: _jsx(Menu, { open: switcherOpen, onClose: () => { setSwitcherOpen(false); }, items: presets.map(preset => ({ id: preset.id, label: presetLabel(preset, t, presetName) })), selectedId: selected.id, onSelect: (id) => {
                                                setSwitcherOpen(false);
                                                setChosenPreset(id);
                                            }, align: "end", portal: true, anchor: (_jsxs("button", { type: "button", className: css.switcher, "aria-haspopup": "menu", "aria-expanded": switcherOpen, "aria-label": t('switcherLabel'), onClick: () => { setSwitcherOpen(value => !value); }, children: [_jsx("span", { className: css.switcherLabel, children: presetLabel(selected, t, presetName) }), _jsx(IconChevronDownOutlineRegular, { className: css.chevron, "aria-hidden": "true" })] })) }) })] }), _jsxs("p", { className: css.groupSub, children: [_jsx("span", { children: t('presetSubtitle') }), _jsx("span", { "data-preset-plugin-count": selectedRows.length, children: `${String(selectedRows.length)} ${t('countUnit')}` })] }), presetEffectiveOpen ? (_jsxs("div", { id: `${sectionId}-preset`, className: css.groupBody, children: [selected.broken !== undefined ? (_jsx("p", { className: css.brokenNote, role: "alert", children: selected.broken })) : null, selectedRows.length > 0 ? (_jsx("ul", { className: css.cards, children: selectedRows.map((row, index) => presetRowCard(selected, row, index)) })) : null, otherMatchCount > 0 ? (_jsxs("p", { className: css.hint, children: [t('matchesInOtherPresets', { count: String(otherMatchCount) }), otherPresetMatches.map(preset => (_jsx("button", { type: "button", className: css.jumpLink, onClick: () => { setChosenPreset(preset.id); }, children: presetName(preset) }, preset.id)))] })) : null] })) : null] })) : null, entries.length > 0 ? (_jsxs("section", { className: css.group, "data-plugin-scope": "global", children: [_jsx("div", { className: css.groupTitleRow, children: _jsxs("button", { type: "button", className: css.groupToggle, "aria-expanded": globalEffectiveOpen, "aria-controls": `${sectionId}-global`, onClick: () => { setGlobalOpen(!globalEffectiveOpen); }, children: [_jsx(IconChevronDownOutlineRegular, { className: css.chevron, size: 12, "aria-hidden": "true" }), _jsx("span", { className: css.groupTitle, children: t('globalTitle') })] }) }), _jsxs("p", { className: css.groupSub, children: [_jsx("span", { children: t('globalSubtitle') }), _jsx("span", { "data-plugin-count": globalCount, children: `${String(globalCount)} ${t('countUnit')}` }), filteredFailed.length > 0 ? (_jsxs("span", { className: css.failedCount, children: [filteredFailed.length, " ", t('failedCountLabel')] })) : null] }), globalEffectiveOpen && globalCount > 0 ? (_jsxs("ul", { className: css.cards, id: `${sectionId}-global`, children: [filteredFailed.map(entry => globalRowCard(entry)), filteredRegular.map(entry => globalRowCard(entry, entry.enabled ? undefined : enabledIn.get(entry.moduleName)))] })) : null] })) : null] })) : null] }));
}
//# sourceMappingURL=PluginInventorySettingsTab.js.map