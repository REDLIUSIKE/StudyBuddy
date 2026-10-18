import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The text preview's body: a file's content, or the reason it is not showing.
 *
 * Two sources meet here. The standard `useResource` hook gives the file's
 * metadata — its version — and this type's
 * own store holds the content it read through its face. Metadata changes reload
 * the current preview while automatic refresh is enabled. A failed metadata frame — the file gone, its
 * workspace unknown — takes the same bar's place over the pages already loaded,
 * with the same reload. The type's controls, viewer choice, wrap and reload, sit at the end of
 * the path row; the Sidebar's strip carries none of them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { FileTypeIcon, IconNowrapFillRegular, IconPauseOutlineRegular, IconPlayOutlineRegular, IconRefreshOutlineRegular, IconWrapFillRegular, Menu, PathLabel, Tooltip, classifyFileType, } from '@deepseek-ai/dsh-client-ui-primitives';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import { emptyFailureRecourse, failureLine } from "./failure-line.js";
import { LoadingIndicator } from "./LoadingIndicator.js";
import { hostFileOf } from "./rpc.js";
import { binaryDocumentPath, matchingDocumentPreviews } from "./document/registry.js";
import { unviewableBinaryPath } from "./document/unviewable.js";
import { PLAIN_BODY_ID } from "./text/index.js";
import { loadedPages, lastLineLoaded, scrollToLine } from "./text/lines.js";
import css from './TextPreview.module.css';
export { linesOf, loadedPages, lastLineLoaded, scrollToLine } from "./text/lines.js";
/**
 * The text type's body, registered under `sidebar.right.pane.tab` as `text`.
 * @param props - composed slot props.
 * @returns the content read so far with its controls, or a progress line.
 */
export function TextPreview({ useTabInfo, useResource, useStore, actions, loadPage, reloadPages, loadAll, reloadAll, prepareRenderer, useDocumentPreviews, renderSlot, t, addResource, setResources, }) {
    const { tab } = useTabInfo();
    const { navigation, signal } = tab;
    const meta = useResource(tab.contentId);
    const canRead = meta.status !== 'none';
    const file = useMemo(() => hostFileOf(tab.contentId), [tab.contentId]);
    const state = useStore(s => s.byTab[tab.id]);
    const definitions = useDocumentPreviews(value => value);
    const unviewable = useMemo(() => unviewableBinaryPath(file.path), [file.path]);
    const candidates = useMemo(() => {
        const matched = matchingDocumentPreviews(definitions, file.path);
        if (matched.length > 0 && binaryDocumentPath(definitions, file.path))
            return matched;
        if (matched.length === 0 && unviewable)
            return matched;
        const fallback = definitions.find(definition => definition.id === PLAIN_BODY_ID);
        return fallback === undefined ? matched : [...matched, fallback];
    }, [definitions, file.path, unviewable]);
    const selected = candidates.find(candidate => candidate.id === state?.rendererId) ?? candidates[0];
    const mode = selected?.loading;
    const contentRendererId = mode === 'renderer' ? selected?.id : undefined;
    const current = (state?.mode ?? 'text-pages') === mode && state?.contentRendererId === contentRendererId ? state : undefined;
    const add = useCallback((address) => {
        addResource(tab.id, address, signal);
    }, [addResource, tab.id, signal]);
    const set = useCallback((addresses) => {
        setResources(tab.id, [tab.contentId, ...addresses], signal);
    }, [setResources, tab.id, tab.contentId, signal]);
    useEffect(() => {
        set([]);
    }, [set, selected?.id]);
    const bodyRef = useRef(null);
    const scrollportRef = useRef(null);
    const storedScrollTopRef = useRef(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const absolutePath = meta.value?.absolutePath ?? current?.complete?.absolutePath;
    const displayPath = absolutePath ?? file.path;
    // Contributions that hand the file to the Host wait for its Host path.
    const fileOwner = absolutePath === undefined ? undefined : { absolutePath };
    // Every tab of this type is a `file` resource address, so its params are the
    // `file` type's; the union is narrowed on the one field read, not validated.
    const line = navigation.params !== undefined && 'line' in navigation.params ? navigation.params.line : undefined;
    const pages = current?.pages;
    const loaded = useMemo(() => loadedPages(pages ?? {}), [pages]);
    const loadedThrough = lastLineLoaded(loaded);
    const hasContent = mode === 'renderer' ? current?.version !== undefined : loaded.length > 0 || current?.complete !== undefined;
    storedScrollTopRef.current = state?.scrollTop ?? 0;
    const bindBody = useCallback((body) => {
        const previous = bodyRef.current;
        bodyRef.current = body;
        if (scrollportRef.current === null || scrollportRef.current === previous)
            scrollportRef.current = body;
    }, []);
    const bindScrollport = useCallback((scrollport) => {
        const next = scrollport ?? bodyRef.current;
        scrollportRef.current = next;
        if (next !== null)
            next.scrollTop = storedScrollTopRef.current;
    }, []);
    // First mount reads the first page; a body coming back to a tab with content
    // reads nothing, because the store outlives the body.
    const started = current !== undefined;
    useEffect(() => {
        if (started || !canRead || mode === undefined || selected === undefined)
            return;
        if (mode === 'text-pages')
            loadPage(tab.id, file, 1, signal, meta.value?.version);
        else if (mode === 'bytes-complete')
            loadAll(tab.id, file, signal, meta.value?.version);
        else
            prepareRenderer(tab.id, signal, selected.id, meta.value?.version);
    }, [started, tab.id, file, signal, loadPage, loadAll, prepareRenderer, canRead, mode, selected, meta.value?.version]);
    // Come back where the reader was once there is content to scroll: on a remount,
    // after a reload rebuilt the content, or after the selected renderer changed.
    // Scroll writes preserve both identities, so they never re-land.
    useEffect(() => {
        const body = scrollportRef.current;
        if (hasContent && body !== null && state !== undefined)
            body.scrollTop = state.scrollTop;
    }, [hasContent, selected?.id]);
    // Answer a navigation once: a line the pages do not reach yet loads the next
    // page (again, until the pages cover it or the file ends); a line they hold
    // is scrolled to and marked. The store remembers the answer, so a remount
    // restores the reader's place instead.
    useEffect(() => {
        const body = scrollportRef.current;
        if (current === undefined || body === null || current.revision === navigation.revision)
            return;
        if (line === undefined || mode !== 'text-pages') {
            actions.navigated(tab.id, navigation.revision);
            return;
        }
        if (line > loadedThrough && !current.eof) {
            if (!current.loading && current.failure === undefined && canRead) {
                loadPage(tab.id, file, loadedThrough + 1, signal, meta.value?.version);
            }
            return;
        }
        const landed = scrollToLine(body, line);
        if (!landed && line <= loadedThrough)
            return;
        actions.navigated(tab.id, navigation.revision);
        // Recorded here as well as by the scroll event, so the store holds the
        // landing before any later navigation reads it.
        actions.scrolled(tab.id, body.scrollTop);
    }, [
        navigation.revision, line, loadedThrough, current?.eof, current?.loading, current?.failure, started,
        selected?.id, mode, file, canRead, meta.value?.version,
    ]);
    const rendererReload = useCallback(() => {
        if (canRead && selected !== undefined)
            prepareRenderer(tab.id, signal, selected.id, meta.value?.version, true);
    }, [canRead, prepareRenderer, tab.id, signal, selected?.id, meta.value?.version]);
    const observedVersion = meta.value?.version;
    const changed = (current?.version !== undefined && observedVersion !== undefined
        && observedVersion !== current.version && observedVersion !== current.observedVersion)
        || state?.resourcesDirty === true;
    const reload = useCallback(() => {
        if (!canRead)
            return;
        if (mode === 'text-pages')
            reloadPages(tab.id, file, signal, observedVersion);
        else if (mode === 'bytes-complete')
            reloadAll(tab.id, file, signal, observedVersion);
        else
            rendererReload();
    }, [canRead, mode, reloadPages, reloadAll, rendererReload, tab.id, file, signal, observedVersion]);
    useEffect(() => tab.actions.bindCommands({ refresh: reload }), [tab.actions, reload]);
    useEffect(() => {
        if (state?.autoRefresh && changed && current !== undefined && !current.loading && meta.status === 'live')
            reload();
    }, [state?.autoRefresh, changed, current?.loading, meta.status, reload]);
    const content = useMemo(() => {
        if (mode === 'renderer') {
            if (current === undefined)
                return undefined;
            const revision = current.loadRevision;
            return { kind: 'renderer', revision, reload: rendererReload,
                failed: () => { actions.rendererFailed(tab.id, revision); },
                loaded: (version) => { actions.rendered(tab.id, revision, version); } };
        }
        if (mode === 'bytes-complete') {
            return current?.complete === undefined ? undefined : {
                kind: 'bytes', data: current.complete.data,
            };
        }
        if (current === undefined || loaded.length === 0)
            return undefined;
        return { kind: 'text', pages: loaded, text: loaded.filter(page => page.lines > 0).map(page => page.text).join('\n'), eof: current.eof };
    }, [mode, loaded, current?.complete, current?.eof, current?.loadRevision, rendererReload, actions, tab.id]);
    // A known binary suffix with no matching renderer never reads: no plain-text
    // fallback, no viewer control, only the path, the unsupported line, and the
    // contributions that hand the file to the Host.
    if (selected === undefined && unviewable) {
        const { name: unsupportedName } = pathPartsOf(displayPath);
        return (_jsxs("div", { className: css.preview, "data-textpreview-state": "unsupported", "data-textpreview-url": tab.contentId, children: [_jsxs("div", { className: css.header, children: [_jsx(PathLabel, { path: displayPath, className: css.path, "data-textpreview-path": true }), fileOwner !== undefined && renderSlot('sidebar.right.tab.document.actions', fileOwner)] }), _jsx("div", { className: css.body, "data-textpreview-body": true, children: _jsxs("div", { className: css.empty, "data-textpreview-unsupported": true, children: [_jsx(FileTypeIcon, { kind: classifyFileType(unsupportedName), size: 36, className: css.emptyIcon }), _jsx("p", { className: css.emptyLine, children: t('unsupportedFile') }), fileOwner !== undefined && renderSlot('sidebar.right.tab.document.unpreviewable', fileOwner)] }) })] }));
    }
    if (state === undefined || selected === undefined) {
        return (_jsx("div", { className: css.status, "data-textpreview-state": "loading", children: meta.status === 'none'
                ? _jsx("p", { className: css.statusLine, children: t('resourceUnavailable') })
                : _jsx(LoadingIndicator, { label: t('loading') }) }));
    }
    const next = loadedThrough + 1;
    const { name } = pathPartsOf(displayPath);
    const loadNext = () => {
        if (!canRead || current?.loading || current?.eof)
            return;
        loadPage(tab.id, file, next, signal, meta.value?.version);
    };
    return (_jsxs("div", { className: css.preview, "data-textpreview-state": "text", "data-textpreview-url": tab.contentId, "data-document-preview": selected.id, children: [meta.failure !== undefined && hasContent
                ? (_jsxs("p", { className: css.changed, "data-textpreview-meta-failed": meta.failure.code, children: [_jsx("span", { children: failureLine(t, meta.failure) }), _jsx("button", { type: "button", className: css.action, "data-textpreview-reload-now": true, onClick: reload, children: t('reloadNow') })] }))
                : changed && (_jsxs("p", { className: css.changed, "data-textpreview-changed": true, children: [_jsx("span", { children: t('changed') }), _jsx("button", { type: "button", className: css.action, "data-textpreview-reload-now": true, onClick: reload, children: t('reloadNow') })] })), _jsxs("div", { className: css.header, children: [_jsx(PathLabel, { path: displayPath, className: css.path, "data-textpreview-path": true }), candidates.length > 1
                        && (_jsx(Menu, { open: menuOpen, anchor: (_jsx("button", { type: "button", className: clsx(css.tool, css.viewerTool), "aria-label": t('openWith'), title: selected.title(), "data-document-viewer-menu": true, onClick: () => { setMenuOpen(value => !value); }, children: selected.title() })), items: candidates.map(candidate => ({ id: candidate.id, label: candidate.title() })), selectedId: selected.id, onSelect: (id) => { actions.selected(tab.id, id); setMenuOpen(false); }, onClose: () => { setMenuOpen(false); }, align: "end", portal: true, dense: true })), selected.wrap === true && (_jsx(Tooltip, { label: t(state.wrap ? 'wrap.disable' : 'wrap.enable'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-pressed": state.wrap, "aria-label": t('wrap.aria'), "data-textpreview-tool": "wrap", onClick: () => { actions.toggledWrap(tab.id); }, children: state.wrap ? _jsx(IconNowrapFillRegular, {}) : _jsx(IconWrapFillRegular, {}) }) })), content !== undefined && renderSlot('sidebar.right.tab.document.action', { content }, { entryKey: selected.id, hookContext: useTabInfo }), _jsx("span", { hidden: true, children: _jsx(Tooltip, { label: t(state.autoRefresh ? 'autoRefresh.disable' : 'autoRefresh.enable'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('autoRefresh'), "aria-pressed": state.autoRefresh, "data-textpreview-tool": "auto-refresh", onClick: () => { actions.toggledAutoRefresh(tab.id); }, children: state.autoRefresh ? _jsx(IconPauseOutlineRegular, {}) : _jsx(IconPlayOutlineRegular, {}) }) }) }), _jsx(Tooltip, { label: t('reload'), shortcutKeys: tab.refreshShortcut?.keys, side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('reload'), "data-textpreview-tool": "reload", "aria-keyshortcuts": tab.refreshShortcut?.aria, onClick: reload, children: _jsx(IconRefreshOutlineRegular, {}) }) }), fileOwner !== undefined && renderSlot('sidebar.right.tab.document.actions', fileOwner)] }), _jsxs("div", { ref: bindBody, className: clsx(css.body, state.wrap && css.wrap), "data-textpreview-body": true, "data-textpreview-wrap": state.wrap ? '' : undefined, onScrollCapture: (event) => {
                    const body = scrollportRef.current;
                    /* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
                    if (body === null)
                        return;
                    if (event.target !== body)
                        return;
                    actions.scrolled(tab.id, body.scrollTop);
                    if (mode === 'text-pages' && current?.failure === undefined && body.clientHeight > 0
                        && body.scrollTop + body.clientHeight >= body.scrollHeight - 1)
                        loadNext();
                }, children: [mode !== 'renderer' && !hasContent && current?.failure === undefined && (_jsx(LoadingIndicator, { label: t('loading') })), content !== undefined && renderSlot('sidebar.right.tab.document', {
                        resourceAddress: tab.contentId, content, wrap: state.wrap, scrollportRef: bindScrollport,
                        addResource: add, setResources: set,
                    }, {
                        entryKey: selected.id, hookContext: useTabInfo,
                        fallback: _jsx("p", { className: css.statusLine, children: t('rendererUnavailable', { name: selected.title() }) }),
                    }), current?.failure !== undefined && (hasContent
                        ? (_jsxs("p", { className: css.statusLine, "data-textpreview-failed": current.failure.code, children: [_jsx("span", { children: failureLine(t, current.failure) }), _jsx("button", { type: "button", className: css.action, "data-textpreview-retry": true, onClick: loadNext, children: t('retry') })] }))
                        : (_jsxs("div", { className: css.empty, "data-textpreview-failed": current.failure.code, children: [_jsx(FileTypeIcon, { kind: classifyFileType(name), size: 36, className: css.emptyIcon }), _jsx("p", { className: css.emptyLine, children: failureLine(t, current.failure) }), emptyFailureRecourse(current.failure) === 'open' && fileOwner !== undefined
                                    && renderSlot('sidebar.right.tab.document.unpreviewable', fileOwner), emptyFailureRecourse(current.failure) === 'retry' && (_jsxs("button", { type: "button", className: css.retry, "data-textpreview-retry": true, onClick: reload, children: [_jsx(IconRefreshOutlineRegular, { size: 14 }), t('retry')] }))] }))), mode === 'text-pages' && current !== undefined && loaded.length > 0 && !current.eof && current.failure === undefined && (_jsx("button", { type: "button", className: css.more, disabled: current.loading, "data-textpreview-more": true, onClick: loadNext, children: current.loading ? _jsx(LoadingIndicator, { inline: true, label: t('loading') }) : t('loadMore') }))] })] }));
}
//# sourceMappingURL=TextPreview.js.map