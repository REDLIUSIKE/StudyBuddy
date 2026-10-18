import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Searchable editable shortcut reference and its General Settings row. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconCloseOutlineRegular, IconRefreshOutlineRegular, Modal, ShortcutKeys, Tooltip, Toast, focusWithoutRing, isBehindModal, rankByName } from '@deepseek-ai/dsh-client-ui-primitives';
import { ShortcutEditor } from "./Editor.js";
import { ShortcutIcon } from "./Icons.js";
import { shortcutFailure, shortcutReadFailure } from "./feedback.js";
import css from './Reference.module.css';
/** Core reference positions are independent of labels and plugin registration order. */
const coreActionOrder = new Map([
    'shortcuts.open',
    'session.new',
    'sidebar.left.toggle',
    'session.search',
    'workspace.add',
    'session.rename',
    'session.fork',
    'session.archive',
    'settings.open',
    'workspace.openLocal',
    'sidebar.right.toggle',
    'workspace.files',
    'browser.new',
    'terminal.new',
    'pane.split',
    'pane.fullscreen.toggle',
    'page.refresh',
    'page.close',
].map((id, index) => [id, index]));
/**
 * Render the General Settings action that opens the shortcut reference.
 * @param props - shared dialog action and localized labels.
 * @returns the settings row.
 */
export function ShortcutsRow({ actions, t, useCatalog }) {
    const shortcut = useCatalog(rows => rows.find(row => row.id === 'shortcuts.open'));
    return _jsxs("div", { className: css.setting, children: [_jsxs("div", { className: css.settingText, children: [_jsx("div", { className: css.settingTitle, children: t('settings') }), _jsx("p", { className: css.settingDescription, children: t('description') })] }), _jsx(Tooltip, { disabled: !shortcut?.keys.length, label: t('global-hint'), shortcutKeys: shortcut?.keys, children: _jsx("button", { className: css.button, type: "button", "aria-label": t('view'), "aria-keyshortcuts": shortcut?.aria, onClick: () => { actions.open(); }, children: t('view') }) })] });
}
/**
 * Render core actions in product order, then other commands by ID within each group. Search relevance takes precedence.
 * @param props - root store, effective catalog, and localized copy.
 * @returns the single reference dialog when open.
 */
export function ShortcutReference({ useStore, actions, useCatalog, useConfig, useFixedCatalog, platform, runtime, edit, recording, describeBinding, t, }) {
    const { open, query, focusRequest } = useStore(state => state);
    const catalog = useCatalog(value => value);
    const config = useConfig(value => value);
    const fixedCatalog = useFixedCatalog(value => value);
    const [target, setTarget] = useState(null);
    const [resetRevision, setResetRevision] = useState(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState(null);
    const mounted = useRef(true);
    const search = useRef(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const dismissToast = useCallback(() => { setToast(null); }, []);
    const notify = useCallback((text, error = false) => {
        setToast((previous) => {
            if (error && previous?.error && previous.text === text)
                return previous;
            return { text, error, seq: (previous?.seq ?? 0) + 1 };
        });
    }, []);
    useEffect(() => {
        if (open && config.status === 'unreadable')
            notify(shortcutReadFailure(config, runtime, t), true);
    }, [open, config, runtime, notify, t]);
    const closeEditor = () => {
        setTarget(null);
        const dialog = search.current?.closest('[role="dialog"]');
        /* v8 ignore next -- Editor callbacks run while its reference dialog and search input are mounted. */
        if (dialog != null)
            focusWithoutRing(dialog, { preventScroll: true });
    };
    const closeReference = () => {
        if (busy)
            return;
        /* v8 ignore next -- The confirmation modal blocks the reference's close control. */
        if (resetRevision !== null)
            setResetRevision(null);
        else if (target !== null)
            closeEditor();
        else
            actions.close();
    };
    useEffect(() => { if (!open)
        setResetRevision(null); }, [open]);
    const persist = async (...args) => {
        setBusy(true);
        const result = await edit(...args);
        if (mounted.current)
            setBusy(false);
        return result;
    };
    const resetAll = async () => {
        /* v8 ignore next -- The reset control is accessible only while its confirmation is open. */
        if (resetRevision === null)
            return;
        const result = await persist({ type: 'reset-all' }, resetRevision);
        if (!mounted.current)
            return;
        if (result.status === 'saved' || result.status === 'stale')
            setResetRevision(null);
        notify(result.status === 'saved' ? t('reset-saved')
            : result.status === 'write-failed' ? t('reset-failed') : shortcutFailure(result, catalog, t, runtime), result.status !== 'saved');
    };
    const editorProps = { useCatalog, useConfig, useFixedCatalog, platform, runtime, edit: persist, recording, describeBinding, t,
        onClose: closeEditor,
        onSaved: () => { notify(t('saved')); closeEditor(); },
        onError: (message) => { notify(message, true); } };
    useLayoutEffect(() => {
        const input = search.current;
        if (open && input !== null && !isBehindModal(input))
            focusWithoutRing(input);
    }, [open, focusRequest]);
    // Stop stays after the other fixed input actions.
    const entries = [
        ...catalog.map(row => ({
            ...row,
            names: [...row.aliases, row.keys.filter(key => key !== '+').join('+'), row.keys.filter(key => key !== '+').join(''), row.aria ?? '', row.aria?.replace('Meta', 'Cmd') ?? ''],
            group: 'application',
        })),
        ...fixedCatalog.map(row => ({ ...row, names: [row.id, row.keys.join(' ')] })),
    ].sort((left, right) => Number(left.id === 'response.stop') - Number(right.id === 'response.stop')
        || (coreActionOrder.get(left.id) ?? coreActionOrder.size) - (coreActionOrder.get(right.id) ?? coreActionOrder.size)
        || Number(left.id > right.id) - Number(left.id < right.id));
    const ranked = rankByName(entries.flatMap(row => row.names.map(name => ({ name, label: row.label, row }))), query.trim());
    const matches = [...new Set(ranked.map(match => match.row))];
    const modifiedCount = Object.keys(config.document.profiles[`${runtime}:${platform}`] ?? {}).length;
    useLayoutEffect(() => {
        const input = search.current;
        if (open && resetRevision === null && modifiedCount === 0 && document.activeElement === document.body && input !== null) {
            focusWithoutRing(input);
        }
    }, [open, resetRevision, modifiedCount]);
    return _jsxs(_Fragment, { children: [_jsx(Modal, { open: open, onClose: closeReference, title: t('title'), headless: true, shortcutModal: "shortcuts", className: css.dialog, children: _jsxs("div", { className: css.contents, onPointerDownCapture: (event) => {
                        if (target === null || busy || !(event.target instanceof Element) || event.target.closest('button, input, a, [contenteditable="true"], [role="group"]') !== null)
                            return;
                        event.preventDefault();
                        closeEditor();
                    }, children: [_jsxs("header", { className: css.header, children: [_jsx("h2", { className: css.title, children: t('title') }), _jsx("button", { type: "button", className: css.close, "aria-label": t('close'), disabled: busy, onClick: closeReference, children: _jsx(IconCloseOutlineRegular, { size: 14 }) })] }), _jsx("div", { className: css.searchRow, children: _jsxs("div", { className: css.searchField, role: "search", "aria-label": t('search'), children: [_jsxs("svg", { className: css.searchIcon, width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M10.28 5.86536C10.28 3.41381 8.29245 1.42644 5.84094 1.42627C3.38929 1.42627 1.40186 3.4137 1.40186 5.86536C1.40203 8.31686 3.38939 10.3044 5.84094 10.3044C8.29234 10.3043 10.2799 8.31676 10.28 5.86536ZM11.4174 5.86536C11.4172 8.94498 8.92057 11.4416 5.84094 11.4418C2.76117 11.4418 0.263843 8.94509 0.263672 5.86536C0.263672 2.78548 2.76106 0.288086 5.84094 0.288086C8.92067 0.288258 11.4174 2.78559 11.4174 5.86536Z", fill: "currentColor" }), _jsx("path", { d: "M13.7372 12.9078L12.9323 13.7127L9.9732 10.7536L10.7781 9.94867L13.7372 12.9078Z", fill: "currentColor" })] }), _jsx("input", { ref: search, "data-modal-autofocus": true, className: css.search, type: "search", "aria-label": t('search'), placeholder: t('search'), value: query, onChange: (event) => { actions.search(event.target.value); } }), query !== '' && _jsx("button", { type: "button", className: css.clearSearch, "aria-label": t('clear-search'), onClick: () => { actions.search(''); search.current?.focus(); }, children: _jsx(IconCloseOutlineRegular, { size: 10 }) })] }) }), _jsxs("div", { className: css.list, "aria-busy": config.status === 'loading', children: [['application', 'input', 'menus', 'approval'].map((group) => {
                                    const rows = matches.filter(row => row.group === group);
                                    if (rows.length === 0)
                                        return null;
                                    return _jsxs("section", { "aria-label": t(group), children: [group !== 'application' && _jsx("h3", { className: css.group, children: t(group) }), _jsx("ul", { className: css.rows, children: rows.map(row => _jsxs("li", { className: css.row, children: ['modified' in row && target?.id !== row.id && _jsx("button", { type: "button", className: css.rowButton, "aria-label": t('edit-label', { command: row.label }), disabled: busy || config.status !== 'ready', onClick: () => { setTarget(row); } }), _jsx("span", { className: css.commandLabel, children: row.label }), _jsx("span", { className: css.binding, children: 'modified' in row
                                                                ? target?.id === row.id
                                                                    ? _jsx(ShortcutEditor, { target: row, ...editorProps }, row.id)
                                                                    : _jsxs(_Fragment, { children: [_jsx("span", { className: css.rowActions, children: _jsx(ShortcutIcon, { kind: "edit" }) }), row.keys.length === 0 ? _jsx("span", { className: css.unbound, children: t('unbound') }) : _jsx(ShortcutKeys, { keys: row.keys, className: css.keyBadge })] })
                                                                : _jsx(ShortcutKeys, { keys: row.keys, className: css.fixedKeyBadge }) })] }, row.id)) })] }, group);
                                }), matches.length === 0 && _jsx("p", { className: css.hint, role: "status", children: t('empty') })] }), _jsxs("footer", { className: css.footer, children: [_jsxs("button", { type: "button", className: css.resetAll, disabled: busy || config.status !== 'ready' || modifiedCount === 0, onClick: (event) => { event.currentTarget.focus(); setTarget(null); setResetRevision(config.revision); }, children: [_jsx(IconRefreshOutlineRegular, { size: 12 }), t('reset-all')] }), modifiedCount > 0 && _jsx("span", { className: css.modifiedCount, children: t('modified-count', { count: modifiedCount }) })] })] }) }), _jsx(Modal, { open: open && resetRevision !== null, title: t('reset-title'), description: t('reset-description'), closeLabel: t('close-confirmation'), onClose: () => { if (!busy)
                    setResetRevision(null); }, footer: _jsxs(_Fragment, { children: [_jsx(Button, { "data-modal-autofocus": true, disabled: busy, onClick: () => { setResetRevision(null); }, children: t('cancel') }), _jsx(Button, { variant: "primary", disabled: busy || config.status !== 'ready', onClick: () => { void resetAll(); }, children: t('reset') })] }) }), toast !== null && _jsx(Toast, { text: toast.text, onDone: dismissToast, icon: _jsx(ShortcutIcon, { kind: toast.error ? 'error' : 'success', className: toast.error ? css.toastError : css.toastSuccess }) }, toast.seq)] });
}
//# sourceMappingURL=Reference.js.map