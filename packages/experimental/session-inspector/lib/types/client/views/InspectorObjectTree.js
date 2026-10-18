import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/** Shared value rendering for JSON details and lazy runtime objects with identity links. */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { InspectorObjectValue } from "./object-value.js";
import css from './inspector.module.css';
const PAGE_SIZE = 50;
function ObjectBranch({ value, name, path, ancestors, root, accessor, absent, navigation, t }) {
    const json = navigation === undefined;
    const objects = navigation?.objects;
    const revision = navigation?.revision;
    const [expanded, setExpanded] = useState(root === true || json);
    const [limit, setLimit] = useState(json ? Infinity : PAGE_SIZE);
    const content = useMemo(() => {
        try {
            const reference = !root && value !== null && typeof value === 'object' ? objects?.reference(value) : undefined;
            const circular = value !== null && typeof value === 'object' ? ancestors.get(value) : undefined;
            const inline = reference === undefined || reference.kind === 'nodeData';
            const display = inline && circular === undefined && !accessor ? new InspectorObjectValue(value) : undefined;
            const entries = [];
            if (expanded && display?.expandable === true) {
                for (const entry of display.entries()) {
                    if (json && entry.properties)
                        continue;
                    entries.push(entry);
                    if (entries.length > limit)
                        break;
                }
            }
            return { reference, circular, display, entries, error: undefined };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }, [value, root, objects, ancestors, accessor, expanded, limit, revision, json]);
    const children = useMemo(() => {
        const next = new Map(ancestors);
        if (value !== null && typeof value === 'object')
            next.set(value, path);
        return next;
    }, [ancestors, value, path]);
    const field = _jsxs("span", { className: css.objectField, children: [name, ": "] });
    if (content.error !== undefined)
        return _jsxs("li", { role: "alert", children: [field, content.error] });
    if (absent)
        return _jsxs("li", { children: [field, _jsx("span", { className: css.objectMuted, children: t('object.absent') })] });
    if (accessor)
        return _jsxs("li", { children: [field, _jsx("span", { className: css.objectMuted, children: t('object.accessor') })] });
    const reference = content.reference;
    const link = reference === undefined || navigation === undefined ? undefined : _jsxs("button", { type: "button", className: css.objectReference, onClick: (event) => { event.preventDefault(); event.stopPropagation(); navigation.navigate(reference); }, children: ["\u2197 ", t(`object.${reference.kind}`), " \u00B7 ", reference.identity] });
    if (reference !== undefined && (reference.kind !== 'nodeData' || content.circular !== undefined))
        return _jsxs("li", { children: [field, link] });
    if (content.circular !== undefined)
        return _jsxs("li", { children: [field, _jsxs("span", { className: css.objectMuted, children: ["\u21A9 ", content.circular] })] });
    // oxlint-disable-next-line typescript/no-non-null-assertion -- Accessors, references, cycles, and read errors return above.
    const display = content.display;
    if (!display.expandable)
        return _jsxs("li", { children: [field, _jsx("span", { className: css.objectValue, children: display.label })] });
    return _jsx("li", { children: _jsxs("details", { open: expanded, onToggle: (event) => { setExpanded(event.currentTarget.open); }, children: [_jsxs("summary", { children: [field, link, " ", _jsx("span", { className: css.objectMuted, children: display.label })] }), expanded && _jsxs("ul", { children: [content.entries.slice(0, limit).map(({ key, properties, ...entry }) => _jsx(ObjectBranch, { ...entry, name: properties ? t('object.properties') : entry.name, path: properties ? path : `${path}.${entry.name}`, ancestors: children, navigation: navigation, t: t }, key)), content.entries.length === 0 && _jsx("li", { className: css.objectMuted, children: t('object.empty') }), content.entries.length > limit && _jsx("li", { children: _jsx("button", { type: "button", className: css.objectReference, onClick: () => { setLimit(value => value + PAGE_SIZE); }, children: t('object.more') }) })] })] }) });
}
function ValueTree(props) {
    const ancestors = useMemo(() => new Map(), []);
    return _jsx("ul", { className: css.objectTree, children: _jsx(ObjectBranch, { ...props, name: "$", path: "$", ancestors: ancestors, root: true }) });
}
/**
 * Display serialized Inspector JSON with every container initially expanded and no reference navigation.
 * @param props - Successful inspectorJson output and localized tree labels; empty text represents undefined.
 * @returns The same value tree as Chat details, without collection paging or runtime-object links.
 */
export function InspectorJsonTree({ text, t }) {
    const value = useMemo(() => text === '' ? undefined : JSON.parse(text), [text]);
    return _jsx(ValueTree, { value: value, t: t });
}
/**
 * Inspect the root and nested Node Data inline; other registered objects remain navigation links.
 * Node Data titles also navigate, while repeated ancestors never expand recursively.
 * Expanded fields are cached until their value or Conversation publication changes.
 * @param props - Original object, weak identity lookup, locale, and reference activation.
 * @returns A lazily expanded, typed tree that retains Map keys and collection identities.
 */
export function InspectorObjectTree(props) {
    const updates = props.objects.updates;
    const subscribe = useCallback((listener) => updates.subscribe(listener), [updates]);
    const getRevision = useCallback(() => updates.getSnapshot(), [updates]);
    const revision = useSyncExternalStore(subscribe, getRevision);
    return _jsx(ValueTree, { value: props.value, t: props.t, navigation: { objects: props.objects, navigate: props.navigate, revision } });
}
//# sourceMappingURL=InspectorObjectTree.js.map