import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The file tree's body: the session's workspace root, listed one level at a time.
 *
 * Everything the tree keeps lives in its store, keyed by tab; everything it asks
 * for goes through its injected face. The component itself only decides what to
 * draw for each absolute path and what a click means: a directory toggles, a
 * file opens through the owner's `tabActions` for a `file:` viewer to claim, and
 * anything else is shown but refuses to open. The header uses the shared
 * PathLabel for the root, followed by reload and workspace directory actions.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import clsx from 'clsx';
import { FileTypeIcon, IconFolderCloseRegular, IconFolderOpenRegular, IconRefreshOutlineRegular, Tooltip, classifyFileType, IconPauseOutlineRegular, IconPlayOutlineRegular, PathLabel, } from '@deepseek-ai/dsh-client-ui-primitives';
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path';
import { childPath } from "./face.js";
import css from './FilesBody.module.css';
/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/**
 * Order one level's entries for display: directories first, then everything
 * else, each group by name. The endpoint's order is a listing fact; this is the
 * reader's.
 * @param entries - the listing as the endpoint returned it.
 * @returns a new array, directories first, then by name within each group.
 */
export function orderEntries(entries) {
    return [...entries].sort((left, right) => {
        const group = Number(right.type === 'directory') - Number(left.type === 'directory');
        return group !== 0 ? group : byName.compare(left.name, right.name);
    });
}
/**
 * Say why a directory could not be listed, in terms of the directory.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show under the directory.
 */
export function failureLine(t, failure) {
    switch (failure.code) {
        case 'workspace-file/not-found': return t('error.notFound');
        case 'workspace-file/outside-workspace': return t('error.outsideWorkspace');
        case 'workspace-file/not-directory': return t('error.notDirectory');
        // Carrier and unclassified host failures reach the reader as themselves:
        // this tree knows nothing useful to add to a transport-level message.
        default: return t('error.unavailable', { message: failure.message });
    }
}
/** One entry's row, and its children when it is an expanded directory. */
function Entry({ parent, entry, tree }) {
    const path = childPath(parent, entry.name);
    if (entry.type === 'directory') {
        const expanded = tree.state.expanded.includes(path);
        return (_jsxs("li", { className: css.item, "data-files-entry": "directory", "data-files-path": path, children: [_jsxs("button", { type: "button", className: css.row, "aria-expanded": expanded, onClick: () => { tree.onToggle(parent, path); }, children: [expanded ? _jsx(IconFolderOpenRegular, { className: css.icon }) : _jsx(IconFolderCloseRegular, { className: css.icon }), _jsx("span", { className: css.name, children: entry.name })] }), expanded && _jsx("ul", { className: css.level, children: _jsx(Level, { path: path, tree: tree }) })] }));
    }
    if (entry.type === 'file') {
        return (_jsx("li", { className: css.item, "data-files-entry": "file", "data-files-path": path, children: _jsxs("button", { type: "button", className: css.row, onClick: () => { tree.onOpen(path); }, children: [_jsx(FileTypeIcon, { kind: classifyFileType(entry.name), size: 16, className: css.fileIcon }), _jsx("span", { className: css.name, children: entry.name })] }) }));
    }
    return (_jsx("li", { className: css.item, "data-files-entry": "other", "data-files-path": path, children: _jsx("span", { className: clsx(css.row, css.other), "aria-disabled": "true", title: tree.t('entry.other'), children: _jsx("span", { className: css.name, children: entry.name }) }) }));
}
/** One directory's rows: its state while listing, its entries once listed. */
function Level({ path, tree }) {
    const { state, t } = tree;
    const level = state.levels[path];
    if (level === undefined || level.kind === 'loading') {
        return _jsx("li", { className: css.note, "data-files-row": "loading", children: t('loading') });
    }
    if (level.kind === 'failed') {
        return (_jsx("li", { className: css.note, "data-files-row": "failed", "data-files-code": level.failure.code, children: failureLine(t, level.failure) }));
    }
    const entries = orderEntries(level.level.entries);
    return (_jsxs(_Fragment, { children: [level.failure !== undefined && _jsx("li", { className: css.note, "data-files-row": "failed", children: failureLine(t, level.failure) }), entries.length === 0 && _jsx("li", { className: css.note, "data-files-row": "empty", children: t('empty') }), entries.map(entry => _jsx(Entry, { parent: path, entry: entry, tree: tree }, entry.name)), level.level.truncated && _jsx("li", { className: css.note, "data-files-row": "truncated", children: t('truncated') })] }));
}
/** The file tree's body: the workspace root and whatever the reader has opened under it. */
export function FilesBody({ useTabInfo, sessionId, useSessions, useStore, actions, start, refresh, setAutoRefresh, toggle, t, renderSlot, }) {
    const { tab } = useTabInfo();
    useEffect(() => tab.actions.bindCommands({ refresh: () => { refresh(tab.id); } }), [tab.actions, tab.id, refresh]);
    const { signal, actions: tabActions } = tab;
    const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd);
    const state = useStore(store => store.byTab[tab.id]);
    const bodyRef = useRef(null);
    const scrollTopRef = useRef(0);
    // Come back where the reader was: loaded levels outlive the body in the
    // store, so a remounted tree lays out at its full height before this runs
    // and the stored offset re-lands exactly. A fresh tree stores 0.
    const seeded = state !== undefined;
    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (seeded && body !== null) {
            body.scrollTop = state.scrollTop;
            scrollTopRef.current = body.scrollTop;
        }
    }, [seeded]);
    // Scrolling only moves the ref; the store hears about it once, on unmount,
    // so a scroll neither re-renders the tree nor writes after the owner's
    // abort has forgotten the bucket.
    useEffect(() => () => {
        if (seeded && !signal.aborted)
            actions.scrolled(tab.id, scrollTopRef.current);
    }, [seeded, signal, tab.id, actions]);
    useEffect(() => {
        // A bucket gone because the record aborted must not be re-seeded by a
        // component that has not unmounted yet.
        if (state !== undefined || cwd === undefined || signal.aborted)
            return;
        start(tab.id, cwd, signal);
    }, [state, cwd, tab.id, signal, start]);
    if (cwd === undefined) {
        return (_jsx("div", { className: css.status, "data-files-state": "no-workspace", children: _jsx("p", { className: css.statusLine, children: t('noWorkspace') }) }));
    }
    if (state === undefined)
        return null;
    const tree = {
        state,
        onToggle: (parent, path) => { toggle(tab.id, parent, path, state.expanded, signal); },
        // Every row is under the tree's root, so its address is session-relative.
        onOpen: (path) => { tabActions.openResource(fileAddressFor(sessionId, state.root, path)); },
        t,
    };
    const reload = () => {
        refresh(tab.id);
    };
    return (_jsxs("div", { className: css.root, "data-files-state": "tree", "data-files-root": state.root, children: [_jsxs("div", { className: css.header, children: [_jsx(PathLabel, { path: state.root, className: css.path, "data-files-path": true }), _jsx("span", { hidden: true, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('autoRefresh'), "aria-pressed": state.autoRefresh, "data-files-auto-refresh": true, title: t(state.autoRefresh ? 'autoRefresh.disable' : 'autoRefresh.enable'), onClick: () => { setAutoRefresh(tab.id, !state.autoRefresh); }, children: state.autoRefresh ? _jsx(IconPauseOutlineRegular, {}) : _jsx(IconPlayOutlineRegular, {}) }) }), _jsx(Tooltip, { label: t('reload'), shortcutKeys: tab.refreshShortcut?.keys, side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('reload'), "aria-keyshortcuts": tab.refreshShortcut?.aria, "data-files-reload": true, onClick: reload, children: _jsx(IconRefreshOutlineRegular, {}) }) }), renderSlot('sidebar.right.tab.files.actions', {
                        absolutePath: state.root,
                    })] }), _jsx("div", { ref: bodyRef, className: css.body, "data-files-body": true, onScroll: (event) => { scrollTopRef.current = event.currentTarget.scrollTop; }, children: _jsx("ul", { className: css.level, children: _jsx(Level, { path: state.root, tree: tree }) }) })] }));
}
//# sourceMappingURL=FilesBody.js.map