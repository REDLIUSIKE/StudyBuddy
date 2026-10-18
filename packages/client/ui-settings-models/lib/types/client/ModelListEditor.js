import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The model list of one pi-ai provider profile, plus the action that asks the
 * provider what it serves.
 *
 * The list is the profile's `models` array as the card holds it: an empty list
 * means "serve this route's built-in catalog", and any entry replaces that
 * catalog, so a row is only ever added deliberately. Fetching asks the endpoint
 * **the form currently shows** — including a key typed but not yet saved — so
 * adding a provider is one pass instead of save-then-return; the reply is
 * candidates the user picks from, never configuration written behind them.
 *
 * A provider that cannot be interrogated (an unreachable endpoint, a protocol
 * with no readable listing) is not a dead end: the failure is shown next to the
 * rows the user can still fill in by hand.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, IconPlusOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatCapacity, parseCapacity } from "./DeepSeekModelsEditor.js";
import { ModelRow } from "./ModelRow.js";
import styles from './ModelsSection.module.css';
/** A row's text field, or the empty string when unset or not a string. */
function textOf(model, key) {
    const value = model[key];
    return typeof value === 'string' ? value : '';
}
/** A row's numeric field, or `undefined` when unset or not a number. */
function numberOf(model, key) {
    const value = model[key];
    return typeof value === 'number' ? value : undefined;
}
/**
 * What an empty capacity field is worth, shown as its placeholder so a row left
 * blank does not read as a model with no capacity at all.
 *
 * The magnitudes are the adapter's own route-level fallbacks (`llm-pi-ai`'s
 * `defaultContextWindow` and `defaultMaxTokens`), spelled the way a person
 * would say them. They are a hint, not a mirror: this page counts `K` as 1000,
 * so typing `256K` stores 256000 while leaving the field blank keeps the
 * adapter's 262144. A deployment that overrides those defaults is not
 * reflected here — nothing on this page can read them.
 */
const CAPACITY_HINT = {
    contextWindow: '256K',
    maxTokens: '32K',
};
/**
 * Spell a stored count for a field that may be unset. The spelling itself is
 * {@link formatCapacity}, shared with the DeepSeek catalog editor so both
 * surfaces read and write one K/M vocabulary.
 * @param value - stored capacity, or `undefined` for an unset field.
 * @returns the field text, empty when unset.
 */
function capacitySpelling(value) {
    return value === undefined ? '' : formatCapacity(value);
}
/** Adopt a candidate, preserving disclosed capacities and input types. */
function adopt(candidate) {
    return {
        id: candidate.id,
        ...candidate.name === undefined ? {} : { name: candidate.name },
        ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
        ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
        ...candidate.inputModalities === undefined ? {} : { input: [...candidate.inputModalities] },
    };
}
/**
 * Render the model list with its fetch action.
 * @param props - the drafted rows, probe target, wire face, and copy.
 * @returns the model-list editor.
 */
export function ModelListEditor(props) {
    const { models, onChange, probe, operations, t, disabled, onBusyChange } = props;
    const { catalogProvider } = props;
    const [busy, setBusy] = useState(false);
    useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
    const [failure, setFailure] = useState(undefined);
    const [inheritedCatalog, setInheritedCatalog] = useState(undefined);
    useEffect(() => {
        if (catalogProvider === undefined)
            return;
        let current = true;
        void operations.discoverModels(probe.settingsNs, { provider: catalogProvider }).then((answer) => {
            if (!current)
                return;
            setInheritedCatalog({ provider: catalogProvider, models: answer.kind === 'found' ? answer.models : [] });
            setFailure(answer.kind === 'refused' ? answer.message : undefined);
        });
        return () => { current = false; };
    }, [catalogProvider, operations, probe.settingsNs]);
    const catalog = inheritedCatalog?.provider === catalogProvider ? inheritedCatalog?.models : undefined;
    const inputDefaults = useMemo(() => new Map(catalog?.map(model => [model.id, model.inputModalities])), [catalog]);
    const [candidates, setCandidates] = useState(undefined);
    const [picked, setPicked] = useState(new Set());
    const [candidateQuery, setCandidateQuery] = useState('');
    const [expanded, setExpanded] = useState(new Set());
    // Capacities are edited as text, so a field's keystrokes are held here rather
    // than re-derived from the parsed count on every change — that would rewrite
    // `1000` to `1K` mid-word. Unreadable text is kept past blur so the refusal
    // names a row the user can still see, which is why this is one entry PER
    // FIELD: a single buffer would be displaced by editing any other field, and
    // the abandoned one would render its stored NaN as the literal `NaN`.
    const [editing, setEditing] = useState(new Map());
    /** Buffer key for one capacity field; the row half moves when rows do. */
    const bufferKey = (index, field) => `${String(index)}:${field}`;
    const editCapacity = (index, field, text) => {
        setEditing(current => new Map(current).set(bufferKey(index, field), text));
        patch(index, { [field]: parseCapacity(text) });
    };
    /** What a capacity field shows: the buffer while typing, else the stored count. */
    const capacityText = (model, index, field) => editing.get(bufferKey(index, field)) ?? capacitySpelling(numberOf(model, field));
    /** Drop one row's entries and shift the rows after it down, in one pass. */
    const reindexOnRemove = (current, index) => {
        const next = new Map();
        for (const [key, value] of current) {
            const at = Number(key.slice(0, key.indexOf(':')));
            if (at === index)
                continue;
            // Only the row number moves; the field half of the key is untouched.
            next.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, value);
        }
        return next;
    };
    const toggleExpanded = (index) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(index))
                next.add(index);
            return next;
        });
    };
    const patch = (index, next) => {
        onChange(models.map((model, at) => {
            if (at !== index)
                return model;
            // Rebuilt rather than spread over: an emptied optional field has to leave
            // the profile, not be stored as a value its schema would reject.
            // Spread first so a field this card does not edit survives; an emptied
            // optional field is then dropped rather than stored as a value its
            // schema would reject.
            const cleared = new Set(Object.entries(next).filter(([, value]) => value === undefined || value === '').map(([key]) => key));
            return Object.fromEntries(Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key)));
        }));
    };
    const fetchModels = async () => {
        setBusy(true);
        setFailure(undefined);
        try {
            const answer = await operations.discoverModels(probe.settingsNs, {
                ...probe.provider === undefined ? {} : { provider: probe.provider },
                ...probe.baseURL === undefined || probe.baseURL.length === 0 ? {} : { baseURL: probe.baseURL },
                ...probe.api === undefined ? {} : { api: probe.api },
                ...probe.apiKey === undefined ? {} : { apiKey: probe.apiKey },
            });
            if (answer.kind === 'refused') {
                setFailure(answer.message);
                return;
            }
            const found = answer.models;
            if (catalogProvider !== undefined)
                setInheritedCatalog({ provider: catalogProvider, models: found });
            if (found.length === 0) {
                setFailure(t('fetchEmpty'));
                return;
            }
            // Everything already configured starts unchecked, so adopting a
            // selection never silently rewrites a capacity the user corrected.
            const known = new Set(models.map(model => textOf(model, 'id')));
            setCandidateQuery('');
            setCandidates(found);
            setPicked(new Set(found.filter(model => !known.has(model.id)).map(model => model.id)));
        }
        finally {
            setBusy(false);
        }
    };
    const closePicker = () => {
        setCandidates(undefined);
        setPicked(new Set());
        setCandidateQuery('');
    };
    const adoptPicked = () => {
        /* v8 ignore next -- the dialog only renders with candidates loaded */
        if (candidates === undefined)
            return;
        const byId = new Map(models.map(model => [textOf(model, 'id'), model]));
        for (const candidate of candidates) {
            if (!picked.has(candidate.id))
                continue;
            // A row the user already tuned wins over the provider's own numbers.
            // Keyed by id, so a half-typed row whose id is still empty is not a
            // match and the candidate joins as its own row — correct, since a row
            // without an id is not yet a model and the create/apply gates refuse it.
            byId.set(candidate.id, byId.get(candidate.id) ?? adopt(candidate));
        }
        onChange([...byId.values()]);
        closePicker();
    };
    const toggle = (id) => {
        setPicked((current) => {
            const next = new Set(current);
            if (!next.delete(id))
                next.add(id);
            return next;
        });
    };
    const activeCandidates = candidates ?? [];
    const normalizedCandidateQuery = candidateQuery.trim().toLowerCase();
    const visibleCandidates = normalizedCandidateQuery.length === 0
        ? activeCandidates
        : activeCandidates.filter(candidate => candidate.id.toLowerCase().includes(normalizedCandidateQuery)
            || candidate.name?.toLowerCase().includes(normalizedCandidateQuery) === true);
    const allVisibleCandidatesPicked = visibleCandidates.length > 0
        && visibleCandidates.every(candidate => picked.has(candidate.id));
    const toggleVisibleCandidates = () => {
        setPicked((current) => {
            if (visibleCandidates.every(candidate => current.has(candidate.id))) {
                return new Set();
            }
            const next = new Set(current);
            for (const candidate of visibleCandidates)
                next.add(candidate.id);
            return next;
        });
    };
    // A route the adapter already describes answers without an endpoint; only a
    // draft with neither has nothing to ask about.
    const askable = probe.provider !== undefined || (probe.baseURL !== undefined && probe.baseURL.length > 0);
    return (_jsxs("section", { className: styles['modelCatalog'], "aria-label": t('models'), children: [_jsxs("div", { className: styles['modelListHead'], children: [_jsxs("div", { className: styles['modelCatalogHeading'], children: [_jsx("span", { className: styles['modelCatalogTitle'], children: t('models') }), props.overridden === undefined
                                ? null
                                : (_jsx("span", { className: styles['modelCatalogMeta'], children: props.overridden ? t('modelsCustomized') : t('modelsInherited') }))] }), props.overridden === true && props.onReset !== undefined
                        ? (_jsx("button", { type: "button", className: styles['linkButton'], disabled: disabled, onClick: props.onReset, children: t('resetModels') }))
                        : null, _jsx("button", { type: "button", className: styles['linkButton'], disabled: disabled || busy || !askable || props.probeBlocked !== undefined, title: props.probeBlocked !== undefined
                            ? t(props.probeBlocked)
                            : askable ? undefined : t('fetchNeedsBaseUrl'), onClick: () => { void fetchModels(); }, children: busy ? t('fetching') : t('fetchModels') })] }), models.length === 0 ? _jsx("p", { className: styles['modelEmpty'], children: t('modelsEmpty') }) : null, _jsx("div", { className: styles['modelList'], children: models.map((model, index) => (_jsx(ModelRow, { model: model, position: index + 1, inputField: "input", inputFallback: inputDefaults.get(textOf(model, 'id')) ?? props.defaultInput, inputLoading: catalogProvider !== undefined && catalog === undefined, expanded: expanded.has(index), disabled: disabled, t: t, contextWindow: {
                        value: capacityText(model, index, 'contextWindow'),
                        placeholder: CAPACITY_HINT.contextWindow,
                        onChange: (text) => { editCapacity(index, 'contextWindow', text); },
                    }, maxTokens: {
                        value: capacityText(model, index, 'maxTokens'),
                        placeholder: CAPACITY_HINT.maxTokens,
                        onChange: (text) => { editCapacity(index, 'maxTokens', text); },
                    }, onFieldChange: (field, value) => { patch(index, { [field]: value }); }, onChange: (next) => { onChange(models.map((row, at) => at === index ? next : row)); }, onToggle: () => { toggleExpanded(index); }, onRemove: () => {
                        onChange(models.filter((_model, at) => at !== index));
                        setExpanded((current) => {
                            const next = new Set();
                            for (const at of current) {
                                if (at < index)
                                    next.add(at);
                                else if (at > index)
                                    next.add(at - 1);
                            }
                            return next;
                        });
                        setEditing(current => reindexOnRemove(current, index));
                    } }, index))) }), _jsxs("button", { type: "button", className: styles['addModelButton'], disabled: disabled, onClick: () => { onChange([...models, { id: '' }]); }, children: [_jsx(IconPlusOutlineRegular, { size: 14 }), t('addModel')] }), failure !== undefined ? _jsx("p", { className: styles['error'], children: failure }) : null, _jsxs(Modal, { open: candidates !== undefined, onClose: closePicker, title: t('fetchTitle'), closeLabel: t('close'), description: t('fetchDescription'), className: styles['fetchDialog'], footer: (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: closePicker, children: t('cancel') }), _jsx(Button, { variant: "outline", onClick: adoptPicked, children: t('fetchAdopt') })] })), children: [_jsxs("div", { className: styles['candidateToolbar'], children: [_jsx("input", { className: `${styles['input']} ${styles['candidateSearch']}`, type: "search", value: candidateQuery, placeholder: t('fetchSearch'), "aria-label": t('fetchSearch'), onChange: (event) => { setCandidateQuery(event.target.value); } }), _jsx(Button, { variant: "ghost", size: "sm", disabled: visibleCandidates.length === 0, onClick: toggleVisibleCandidates, children: t(allVisibleCandidatesPicked ? 'fetchDeselectAll' : 'fetchSelectAll') })] }), visibleCandidates.length === 0
                        ? _jsx("p", { className: styles['candidateEmpty'], role: "status", children: t('fetchNoMatches') })
                        : (_jsx("ul", { className: styles['candidateList'], children: visibleCandidates.map(candidate => (_jsx("li", { className: styles['candidate'], children: _jsxs("label", { className: styles['candidateLabel'], children: [_jsx("input", { type: "checkbox", checked: picked.has(candidate.id), onChange: () => { toggle(candidate.id); } }), _jsx("span", { className: styles['candidateId'], title: candidate.name ?? candidate.id, children: candidate.id })] }) }, candidate.id))) }))] })] }));
}
//# sourceMappingURL=ModelListEditor.js.map