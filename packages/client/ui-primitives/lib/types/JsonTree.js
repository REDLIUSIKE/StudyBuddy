import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconCheckOutlineRegular, IconCopyOutlineRegular, IconWrapLinesOutlineRegular } from "./icons/index.js";
import { Menu } from "./Menu.js";
import css from './JsonTree.module.css';
const OBJECT_PREVIEW_LIMIT = 4;
const ARRAY_PREVIEW_LIMIT = 5;
const PREVIEW_DEPTH_LIMIT = 2;
function valueCopyMenuItems(labels) {
    return [
        { id: 'value', label: labels.copyValue },
        { id: 'json', label: labels.copyJson },
        { id: 'path', label: labels.copyPath },
    ];
}
function objectCopyMenuItems(labels) {
    return [
        { id: 'prettyJson', label: labels.copyPrettyJson },
        { id: 'json', label: labels.copyCompactJson },
        { id: 'path', label: labels.copyPath },
    ];
}
/** Notify only the old and new row actions; JSON values do not subscribe to hover state. */
function createCopyStore() {
    let current;
    const listeners = new Map();
    return {
        get: () => current,
        set(next) {
            const previous = current?.id;
            current = next;
            for (const id of new Set([previous, next?.id])) {
                if (id === undefined)
                    continue;
                for (const listener of listeners.get(id) ?? [])
                    listener();
            }
        },
        subscribe(id, listener) {
            let row = listeners.get(id);
            if (row === undefined)
                listeners.set(id, row = new Set());
            row.add(listener);
            return () => {
                row.delete(listener);
                if (row.size === 0)
                    listeners.delete(id);
            };
        },
    };
}
function JsonCopyAction({ store, target, persistent, labels, onCopy, onClose }) {
    const id = pathId(target.path);
    const subscribe = useCallback((listener) => store.subscribe(id, listener), [id, store]);
    const getSnapshot = () => {
        const current = store.get();
        return current?.id === id ? current : undefined;
    };
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const buttonRef = useRef(null);
    const state = snapshot?.state ?? 'idle';
    const object = typeof target.value === 'object' && target.value !== null;
    const copyTitle = state === 'copied'
        ? labels.copied
        : state === 'failed'
            ? labels.copyFailed
            : object ? labels.copyPrettyJson : labels.copyValue;
    return (_jsx("span", { className: css.copySlot, children: (persistent || snapshot !== undefined) && (_jsx(Menu, { open: snapshot?.menuOpen === true, compact: true, portal: true, align: "end", anchor: (_jsx("button", { ref: buttonRef, type: "button", className: css.actionButton, "data-json-copy-button": true, "data-state": state, "aria-label": copyTitle, title: labels.copyButtonTitle(copyTitle), onClick: () => void onCopy(target, object ? 'prettyJson' : 'value'), onContextMenu: (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    store.set({ id, target, state, menuOpen: true });
                }, children: state === 'copied'
                    ? _jsx(IconCheckOutlineRegular, { size: 12 })
                    : _jsx(IconCopyOutlineRegular, { size: 12 }) })), items: object ? objectCopyMenuItems(labels) : valueCopyMenuItems(labels), onSelect: (mode) => {
                void onCopy(target, mode);
            }, onClose: onClose, getAnchorRect: () => buttonRef.current.getBoundingClientRect() })) }));
}
function isExpandableValue(value) {
    return typeof value === 'object' && value !== null && !(value instanceof Date);
}
function entriesOf(value) {
    if (Array.isArray(value)) {
        return value.map((item, index) => [String(index), item]);
    }
    return Object.keys(value).map(key => [
        key,
        value[key],
    ]);
}
function bracketOf(value) {
    return Array.isArray(value) ? ['[', ']'] : ['{', '}'];
}
function previewPrimitive(value) {
    if (value === null)
        return _jsx("span", { className: css.keywordValue, children: "null" });
    if (typeof value === 'string') {
        return _jsx("span", { className: css.stringValue, children: JSON.stringify(value) });
    }
    if (typeof value === 'number') {
        return _jsx("span", { className: css.numberValue, children: String(value) });
    }
    if (typeof value === 'boolean') {
        return _jsx("span", { className: css.keywordValue, children: String(value) });
    }
    if (typeof value === 'bigint') {
        return _jsx("span", { className: css.otherValue, children: value.toString() });
    }
    if (typeof value === 'undefined') {
        return _jsx("span", { className: css.otherValue, children: "undefined" });
    }
    if (typeof value === 'symbol') {
        return _jsx("span", { className: css.otherValue, children: value.description ?? 'Symbol' });
    }
    if (typeof value === 'function') {
        return _jsx("span", { className: css.otherValue, children: value.name || 'Function' });
    }
    return null;
}
function previewValue(value, depth) {
    if (!isExpandableValue(value))
        return previewPrimitive(value);
    const array = Array.isArray(value);
    const entries = entriesOf(value);
    const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT;
    const visible = entries.slice(0, limit);
    const [open, close] = bracketOf(value);
    return (_jsxs(_Fragment, { children: [_jsx("span", { className: css.punctuation, children: open }), depth >= PREVIEW_DEPTH_LIMIT
                ? _jsx("span", { className: css.previewEllipsis, children: "\u2026" })
                : visible.map(([key, item], index) => (_jsxs("span", { children: [index > 0 && _jsx("span", { className: css.punctuation, children: ", " }), !array && (_jsxs(_Fragment, { children: [_jsx("span", { className: css.previewProperty, children: key }), _jsx("span", { className: css.punctuation, children: ": " })] })), previewValue(item, depth + 1)] }, key))), depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && (_jsx("span", { className: css.previewEllipsis, children: ", \u2026" })), _jsx("span", { className: css.punctuation, children: close })] }));
}
function primitiveValue(value) {
    if (value === null)
        return _jsx("span", { className: css.keywordValue, children: "null" });
    if (typeof value === 'string') {
        return _jsx("span", { className: css.stringValue, children: JSON.stringify(value) });
    }
    if (typeof value === 'boolean') {
        return _jsx("span", { className: css.keywordValue, children: String(value) });
    }
    if (typeof value === 'number') {
        return _jsx("span", { className: css.numberValue, children: String(value) });
    }
    if (typeof value === 'bigint') {
        return _jsx("span", { className: css.numberValue, children: `${value.toString()}n` });
    }
    if (value instanceof Date) {
        return _jsx("span", { className: css.otherValue, children: value.toISOString() });
    }
    if (typeof value === 'function') {
        return _jsxs("span", { className: css.otherValue, children: ["function() ", '{ }'] });
    }
    if (typeof value === 'undefined') {
        return _jsx("span", { className: css.otherValue, children: "undefined" });
    }
    return _jsx("span", { className: css.otherValue, children: value.toString() });
}
function fieldText(field) {
    return field === '' ? '""' : field;
}
function pathId(path) {
    return path.map(part => (typeof part === 'number' ? `n${String(part)}` : `s${String(part.length)}:${part}`)).join('/');
}
function claimFocus(button) {
    button.focus();
}
function moveFocus(button, direction) {
    const tree = button.closest('[role="tree"]');
    /* v8 ignore next -- JsonTree attaches expander handlers only beneath its owning role=tree. */
    if (tree === null)
        return;
    const expanders = Array.from(tree.querySelectorAll('[data-json-expander]'));
    const current = expanders.indexOf(button);
    /* v8 ignore next -- the current expander is a member of the queried non-empty set. */
    if (current < 0 || expanders.length === 0)
        return;
    const next = (current + direction + expanders.length) % expanders.length;
    const nextExpander = expanders[next];
    /* v8 ignore next -- modulo over the non-empty expander set always resolves a member. */
    if (nextExpander !== undefined)
        claimFocus(nextExpander);
}
function NodeField({ field, expandable, onToggle, }) {
    if (field === undefined)
        return null;
    return (_jsxs("span", { className: clsx(css.label, expandable && css.clickableLabel), onClick: expandable ? onToggle : undefined, children: [fieldText(field), ":"] }));
}
function JsonString({ collapsedStringLines, stringWrapping, field, labels, lastElement, renderCopy, value, }) {
    const contentsId = useId();
    const contentRef = useRef(null);
    const rawRef = useRef(null);
    const [expanded, setExpanded] = useState(false);
    const [wrapped, setWrapped] = useState(false);
    const [truncated, setTruncated] = useState(false);
    useLayoutEffect(() => {
        if (expanded)
            return;
        const content = contentRef.current;
        const measure = () => {
            const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight);
            setTruncated(content.scrollHeight > lineHeight * collapsedStringLines);
        };
        measure();
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        return () => { observer.disconnect(); };
    }, [collapsedStringLines, expanded, field, lastElement, value]);
    useLayoutEffect(() => {
        if (!expanded)
            return;
        const raw = rawRef.current;
        // Keep raw text within the window and clipping ancestors outside the tree.
        // Capture scrolling because an ancestor can move the string without resizing it.
        const clips = [];
        const tree = raw.closest(`.${css.root}`);
        for (let parent = tree.parentElement; parent !== null; parent = parent.parentElement) {
            if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY))
                clips.push(parent);
        }
        const measure = () => {
            let top = 0;
            let bottom = window.innerHeight;
            for (const clip of clips) {
                const rect = clip.getBoundingClientRect();
                const style = getComputedStyle(clip);
                top = Math.max(top, rect.top + clip.clientTop);
                bottom = Math.min(bottom, rect.top + clip.clientTop + clip.clientHeight
                    - Number.parseFloat(style.paddingBottom));
            }
            const available = bottom - Math.max(top, raw.getBoundingClientRect().top);
            raw.style.maxHeight = `${Math.max(16, available - 4)}px`;
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        observer?.observe(raw);
        for (const clip of clips)
            observer?.observe(clip);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [expanded, value]);
    if (expanded) {
        const fieldId = `${contentsId}-field`;
        return (_jsxs("div", { className: css.stringField, "data-expanded": true, children: [field !== undefined && _jsxs("span", { id: fieldId, className: css.label, children: [fieldText(field), ":"] }), _jsx("pre", { ref: rawRef, id: contentsId, className: css.stringRaw, "data-wrap": wrapped, tabIndex: 0, "aria-labelledby": field === undefined ? undefined : fieldId, children: value }), !lastElement && _jsx("span", { className: css.punctuation, children: "," }), _jsxs("div", { className: css.stringActions, children: [stringWrapping !== undefined && (_jsx("button", { type: "button", className: css.actionButton, "aria-label": stringWrapping.label, title: stringWrapping.label, "aria-pressed": wrapped, "aria-controls": contentsId, onClick: () => {
                                const next = !wrapped;
                                setWrapped(next);
                                stringWrapping.setDefault(next);
                            }, children: _jsx(IconWrapLinesOutlineRegular, { size: 12 }) })), _jsx("button", { type: "button", className: css.actionButton, "aria-label": labels.collapseNode, title: labels.collapseNode, "aria-expanded": true, "aria-controls": contentsId, onClick: () => { setExpanded(false); }, children: _jsx("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "aria-hidden": "true", children: _jsx("path", { d: "M9.5 1.5V6.5H14.5M1.5 9.5H6.5V14.5" }) }) }), renderCopy?.(true)] })] }));
    }
    return (_jsxs(_Fragment, { children: [renderCopy?.(), _jsx("span", { className: css.stringField, "data-expanded": expanded, children: _jsxs("span", { ref: contentRef, id: contentsId, className: css.stringText, children: [truncated && (_jsx("span", { className: css.stringToggleSlot, children: _jsxs("button", { type: "button", className: css.stringToggle, "aria-label": labels.expandNode, "aria-expanded": false, "aria-controls": contentsId, onClick: () => {
                                    setWrapped(stringWrapping?.getDefault() ?? false);
                                    setExpanded(true);
                                }, children: [_jsx("span", { "aria-hidden": "true", children: "\u2026" }), labels.expandNode] }) })), field !== undefined && _jsxs("span", { className: css.label, children: [fieldText(field), ":"] }), primitiveValue(value), !lastElement && _jsx("span", { className: css.punctuation, children: "," })] }) })] }));
}
function JsonTreeNode({ collapsedStringLines, stringWrapping, field, initialExpanded, labels, lastElement, onClaimTabStop, onRowHover, path, renderCopy, tabStopId, value, }) {
    const contentsId = useId();
    const expanderRef = useRef(null);
    const [expanded, setExpanded] = useState(initialExpanded);
    const nodeId = pathId(path);
    const container = isExpandableValue(value);
    const entries = container ? entriesOf(value) : [];
    const expandable = entries.length > 0;
    const toggle = () => {
        setExpanded(current => !current);
        claimFocus(expanderRef.current);
    };
    const onExpanderKeyDown = (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            setExpanded(event.key === 'ArrowRight');
            return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            moveFocus(event.currentTarget, event.key === 'ArrowUp' ? -1 : 1);
        }
    };
    const row = (children, ariaExpanded) => (_jsxs("div", { className: css.row, role: "treeitem", "aria-expanded": ariaExpanded, onMouseOver: (event) => {
            event.stopPropagation();
            onRowHover(event.currentTarget, { path, value });
        }, children: [typeof value !== 'string' && renderCopy?.({ path, value }), children] }));
    if (typeof value === 'string') {
        return row(_jsx(JsonString, { collapsedStringLines: collapsedStringLines, stringWrapping: stringWrapping, field: field, value: value, labels: labels, lastElement: lastElement, renderCopy: renderCopy === undefined ? undefined : persistent => renderCopy({ path, value }, persistent) }));
    }
    if (!container) {
        return row((_jsxs(_Fragment, { children: [_jsx(NodeField, { field: field, expandable: false, onToggle: toggle }), primitiveValue(value), !lastElement && _jsx("span", { className: css.punctuation, children: "," })] })));
    }
    const [open, close] = bracketOf(value);
    if (!expandable) {
        return row((_jsxs(_Fragment, { children: [_jsx(NodeField, { field: field, expandable: false, onToggle: toggle }), _jsx("span", { className: css.punctuation, children: open }), _jsx("span", { className: css.punctuation, children: close }), !lastElement && _jsx("span", { className: css.punctuation, children: "," })] })));
    }
    return row((_jsxs(_Fragment, { children: [_jsx("span", { ref: expanderRef, className: clsx(css.expander, expanded ? css.collapseIcon : css.expandIcon), "data-json-expander": true, role: "button", "aria-label": expanded ? labels.collapseNode : labels.expandNode, "aria-expanded": expanded, "aria-controls": expanded ? contentsId : undefined, tabIndex: tabStopId === nodeId ? 0 : -1, onFocus: () => { onClaimTabStop(nodeId); }, onClick: toggle, onKeyDown: onExpanderKeyDown }), _jsxs("span", { className: css.summary, children: [_jsx(NodeField, { field: field, expandable: true, onToggle: toggle }), _jsx("span", { className: css.preview, children: previewValue(value, 0) }), !lastElement && _jsx("span", { className: css.punctuation, children: "," })] }), expanded && (_jsx("ul", { id: contentsId, role: "group", className: css.children, children: entries.map(([key, item], index) => (_jsx(JsonTreeNode, { collapsedStringLines: collapsedStringLines, stringWrapping: stringWrapping, field: key, value: item, path: [...path, Array.isArray(value) ? index : key], labels: labels, lastElement: index === entries.length - 1, initialExpanded: false, tabStopId: tabStopId, onClaimTabStop: onClaimTabStop, onRowHover: onRowHover, renderCopy: renderCopy }, key))) }))] })), expanded);
}
function formattedPath(path) {
    return path.reduce((result, part) => {
        if (typeof part === 'number')
            return `${result}[${String(part)}]`;
        return /^[A-Za-z_$][\w$]*$/.test(part)
            ? `${result}.${part}`
            : `${result}[${JSON.stringify(part)}]`;
    }, '$');
}
function copyText(target, mode) {
    if (mode === 'path')
        return formattedPath(target.path);
    if (mode === 'prettyJson')
        return JSON.stringify(target.value, null, 2);
    if (mode === 'json')
        return JSON.stringify(target.value);
    if (typeof target.value === 'string')
        return target.value;
    if (typeof target.value === 'undefined')
        return 'undefined';
    if (typeof target.value === 'bigint')
        return target.value.toString();
    if (typeof target.value === 'symbol')
        return target.value.description ?? 'Symbol';
    if (typeof target.value === 'function')
        return target.value.name || 'Function';
    return JSON.stringify(target.value);
}
/**
 * Render parsed JSON as a compact, keyboard-accessible inspector tree.
 * @param props - Parsed data, accessible label, and display options.
 * @returns A read-only JSON tree with an optionally fixed-open top level.
 */
export function JsonTree({ data, label, className, collapsedStringLines = 3, stringWrapping, copyable = true, expandTopLevel = true, labels, }) {
    const rootEntries = entriesOf(data);
    const firstExpandableIndex = rootEntries.findIndex(([, value]) => (isExpandableValue(value) && entriesOf(value).length > 0));
    const firstExpandableEntry = rootEntries[firstExpandableIndex];
    const initialTabStopId = expandTopLevel
        ? firstExpandableEntry === undefined
            ? null
            : pathId([Array.isArray(data) ? firstExpandableIndex : firstExpandableEntry[0]])
        : isExpandableValue(data) && rootEntries.length > 0 ? pathId([]) : null;
    const activeRowRef = useRef();
    const resetTimer = useRef();
    const copySequence = useRef(0);
    const [copyStore] = useState(createCopyStore);
    const [tabStopId, setTabStopId] = useState(initialTabStopId);
    const setActiveRow = (row) => {
        activeRowRef.current?.removeAttribute('data-json-copy-active');
        activeRowRef.current = row;
        row?.setAttribute('data-json-copy-active', '');
    };
    const clearCopyTarget = () => {
        copySequence.current += 1;
        if (resetTimer.current !== undefined)
            clearTimeout(resetTimer.current);
        setActiveRow(undefined);
        copyStore.set(undefined);
    };
    useEffect(() => () => {
        copySequence.current += 1;
        if (resetTimer.current !== undefined)
            clearTimeout(resetTimer.current);
        activeRowRef.current?.removeAttribute('data-json-copy-active');
    }, []);
    useEffect(() => {
        clearCopyTarget();
        setTabStopId(initialTabStopId);
    }, [data, expandTopLevel, initialTabStopId]);
    const handleRowHover = (row, target) => {
        if (!copyable || copyStore.get()?.menuOpen)
            return;
        if (activeRowRef.current === row)
            return;
        setActiveRow(row);
        copyStore.set({ id: pathId(target.path), target, state: 'idle', menuOpen: false });
    };
    const handleRootMouseOver = (event) => {
        if (!copyable || copyStore.get()?.menuOpen)
            return;
        /* v8 ignore next -- browser mouse events delivered through React target an Element. */
        if (!(event.target instanceof Element))
            return;
        if (event.target.closest('[data-json-copy-button]') === null)
            clearCopyTarget();
    };
    const copy = async (target, mode) => {
        const sequence = ++copySequence.current;
        const snapshot = {
            id: pathId(target.path), target, state: 'idle', menuOpen: false,
        };
        copyStore.set(snapshot);
        let state;
        try {
            await navigator.clipboard.writeText(copyText(target, mode));
            state = 'copied';
        }
        catch {
            state = 'failed';
        }
        const current = copyStore.get();
        if (sequence !== copySequence.current || current?.target !== target)
            return;
        copyStore.set({ ...current, state });
        if (resetTimer.current !== undefined)
            clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
            const current = copyStore.get();
            if (current?.target === target)
                copyStore.set({ ...current, state: 'idle' });
        }, 1_500);
    };
    const [rootOpen, rootClose] = bracketOf(data);
    const renderCopy = copyable ? (target, persistent = false) => (_jsx(JsonCopyAction, { store: copyStore, target: target, persistent: persistent, labels: labels, onCopy: copy, onClose: clearCopyTarget })) : undefined;
    return (_jsx("div", { className: clsx(css.root, className), style: { '--json-tree-collapsed-lines': collapsedStringLines }, onMouseOver: handleRootMouseOver, onMouseLeave: () => {
            if (!copyStore.get()?.menuOpen)
                clearCopyTarget();
        }, children: expandTopLevel
            ? (_jsxs("div", { className: css.expandedTopLevel, children: [_jsxs("div", { className: clsx(css.row, css.topLevelBracket), "data-json-root-row": true, onMouseOver: (event) => {
                            event.stopPropagation();
                            handleRowHover(event.currentTarget, { path: [], value: data });
                        }, children: [renderCopy?.({ path: [], value: data }), _jsx("span", { className: css.punctuation, children: rootOpen })] }), _jsx("div", { "aria-label": label, className: clsx(css.container, css.expandedTopLevelContainer), role: "tree", children: rootEntries.map(([key, value], index) => (_jsx(JsonTreeNode, { collapsedStringLines: collapsedStringLines, stringWrapping: stringWrapping, field: key, value: value, path: [Array.isArray(data) ? index : key], labels: labels, lastElement: index === rootEntries.length - 1, initialExpanded: false, tabStopId: tabStopId, onClaimTabStop: setTabStopId, onRowHover: handleRowHover, renderCopy: renderCopy }, key))) }), _jsx("div", { className: clsx(css.row, css.topLevelBracket), children: _jsx("span", { className: css.punctuation, children: rootClose }) })] }))
            : (_jsx("div", { "aria-label": label, className: css.container, role: "tree", children: _jsx(JsonTreeNode, { collapsedStringLines: collapsedStringLines, stringWrapping: stringWrapping, value: data, path: [], labels: labels, lastElement: true, initialExpanded: true, tabStopId: tabStopId, onClaimTabStop: setTabStopId, onRowHover: handleRowHover, renderCopy: renderCopy }) })) }));
}
//# sourceMappingURL=JsonTree.js.map