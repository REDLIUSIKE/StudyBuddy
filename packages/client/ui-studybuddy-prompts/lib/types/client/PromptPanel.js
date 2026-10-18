import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, FileText, LoaderCircle, Pencil, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PromptPanel.module.css';
export function PromptEntry({ useGlobalPanel, toggle, t }) {
    const open = useGlobalPanel(key => key === 'studybuddy.prompts');
    return _jsx(Tooltip, { label: t('title'), side: "bottom", delayMs: 400, children: _jsx("button", { type: "button", className: css.entry, "aria-label": t('title'), "aria-expanded": open, "data-active": open || undefined, onClick: toggle, children: _jsx(FileText, { size: 17 }) }) });
}
export function PromptCard({ row, busy, copy, edit, publish, t }) {
    return _jsxs("article", { className: css.card, "data-prompt-id": row.id, children: [_jsxs("button", { type: "button", className: css.copy, "aria-label": row.title, onClick: () => { copy(row.body); }, children: [_jsx("h3", { children: row.title }), _jsx("p", { children: row.body })] }), row.owned && _jsxs("div", { className: css.cardActions, children: [_jsx(Tooltip, { label: t('edit'), side: "bottom", children: _jsx("button", { type: "button", "aria-label": t('edit'), onClick: edit, disabled: busy, children: _jsx(Pencil, { size: 14 }) }) }), _jsx(Tooltip, { label: busy ? t('publishing') : t('upload'), side: "bottom", children: _jsx("button", { type: "button", "aria-label": t('upload'), onClick: publish, disabled: busy, children: busy ? _jsx(LoaderCircle, { size: 14, className: css.spin }) : _jsx(Upload, { size: 14 }) }) })] })] });
}
export function PromptFeedback({ feedback, t }) {
    if (!feedback)
        return null;
    return _jsxs("div", { className: css.feedback, role: feedback === 'copyError' ? 'alert' : 'status', children: [feedback === 'copyError' ? _jsx(X, { size: 18 }) : _jsx(Check, { size: 18 }), _jsxs("span", { children: [_jsx("strong", { children: t(feedback) }), feedback === 'copied' && _jsx("small", { children: t('copiedHint') })] })] });
}
function errorKey(code) {
    if (code === 'AUTH_REQUIRED')
        return 'error.auth';
    if (code === 'NETWORK_UNAVAILABLE')
        return 'error.network';
    if (code === 'PROMPT_REVISION_CONFLICT' || code === 'PROMPT_REQUEST_CONFLICT')
        return 'error.conflict';
    if (code === 'PROMPT_LIBRARY_FULL')
        return 'error.full';
    return 'error.request';
}
export function PromptPanel({ useStore, usePrompts, actions, close, add, edit, copy, save, publish, loadMine, loadSquare, t }) {
    const view = useStore(state => state), state = usePrompts(value => value);
    const [invalid, setInvalid] = useState(false);
    const scroll = useRef(null);
    useLayoutEffect(() => {
        if (view.tab !== 'square' || !view.reveal || !scroll.current)
            return;
        const card = scroll.current.querySelector('[data-prompt-id="' + view.reveal + '"]');
        if (card)
            scroll.current.scrollTop = card.offsetTop - scroll.current.offsetTop;
    }, [view.tab, view.reveal, state.publicItems]);
    useEffect(() => {
        setInvalid(false);
    }, [view.editor?.id, state.scope]);
    useEffect(() => {
        if (view.tab !== 'square')
            return;
        const timer = setTimeout(() => { loadSquare(view.query, 1); }, 200);
        return () => { clearTimeout(timer); };
    }, [view.tab, view.query, loadSquare]);
    const query = view.query.toLocaleLowerCase();
    const rows = (view.tab === 'mine' ? state.items : state.publicItems).filter(row => (row.title + '\n' + row.body).toLocaleLowerCase().includes(query));
    const loading = state.busy.some(key => key === 'mine' || key.startsWith('square:'));
    const saveBusy = state.busy.includes('save');
    return _jsxs("section", { className: css.panel, "aria-label": t('title'), "data-prompt-manager": true, children: [_jsxs("header", { className: css.header, children: [_jsx("h2", { children: t('title') }), _jsx("button", { type: "button", className: css.icon, "aria-label": t('close'), onClick: close, children: _jsx(X, { size: 18 }) })] }), _jsx("div", { className: css.tabs, role: "tablist", "aria-label": t('title'), children: ['mine', 'square'].map(tab => _jsx("button", { type: "button", role: "tab", "aria-selected": view.tab === tab, onClick: () => { actions.selectTab(tab); }, children: t(tab) }, tab)) }), _jsx("p", { className: css.hint, children: t('hint') }), _jsxs("div", { className: css.search, children: [_jsx(Search, { size: 15 }), _jsx("input", { "aria-label": t('search'), placeholder: t('search'), maxLength: 200, value: view.query, onChange: event => { actions.query(event.target.value); } }), _jsx("button", { type: "button", className: css.icon, "aria-label": t('refresh'), disabled: loading, onClick: () => { if (view.tab === 'mine')
                            loadMine();
                        else
                            loadSquare(view.query, 1); }, children: _jsx(RefreshCw, { size: 14 }) })] }), state.error && _jsxs("div", { className: css.error, role: "alert", children: [_jsx("span", { children: t(errorKey(state.error)) }), (state.failureKind === 'mine' || state.failureKind === 'square') && _jsx("button", { type: "button", onClick: () => { if (state.failureKind === 'mine')
                            loadMine();
                        else
                            loadSquare(view.query, 1); }, children: t('retry') })] }), _jsx("div", { className: css.scroll, ref: scroll, children: view.editor ? _jsxs("form", { className: css.editor, onSubmit: event => {
                        event.preventDefault();
                        if (!view.editor?.title.trim() || !view.editor.body.trim()) {
                            setInvalid(true);
                            return;
                        }
                        void save(view.editor).catch(() => { });
                    }, children: [_jsxs("label", { children: [t('formTitle'), _jsx("input", { autoFocus: true, maxLength: 120, placeholder: t('titlePlaceholder'), value: view.editor.title, onChange: event => { actions.updateDraft('title', event.target.value); } })] }), _jsxs("label", { children: [t('formBody'), _jsx("textarea", { placeholder: t('bodyPlaceholder'), value: view.editor.body, onChange: event => { actions.updateDraft('body', event.target.value); } })] }), invalid && _jsx("p", { role: "alert", className: css.error, children: t('required') }), _jsxs("div", { className: css.formActions, children: [_jsx("button", { type: "button", disabled: saveBusy, onClick: () => { actions.edit(null); }, children: t('cancel') }), _jsx("button", { className: css.primary, disabled: saveBusy, type: "submit", children: t(saveBusy ? 'saving' : 'save') })] })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: css.grid, children: [view.tab === 'mine' && _jsxs("button", { type: "button", className: css.add, onClick: add, children: [_jsx("span", { children: _jsx(Plus, { size: 21 }) }), _jsx("strong", { children: t('add') }), _jsx("small", { children: t('addHint') })] }), rows.map(row => _jsx(PromptCard, { row: row, busy: state.busy.includes('publish:' + row.sourceId), copy: copy, edit: () => { edit(row); }, publish: () => { publish(row); }, t: t }, row.id))] }), loading && _jsx("p", { className: css.empty, role: "status", children: t('loading') }), !loading && rows.length === 0 && _jsxs("div", { className: css.empty, children: [_jsx(FileText, { size: 27 }), _jsx("strong", { children: t(view.query ? 'noResults' : view.tab === 'mine' ? 'emptyMine' : 'emptySquare') }), !view.query && _jsx("p", { children: t(view.tab === 'mine' ? 'emptyMineHint' : 'emptySquareHint') })] }), view.tab === 'square' && state.hasMore && _jsx("button", { className: css.more, type: "button", disabled: loading || state.squareQuery !== view.query, onClick: () => { loadSquare(view.query, state.squarePage + 1); }, children: t('more') })] }) }), _jsx(PromptFeedback, { feedback: view.feedback, t: t })] });
}
//# sourceMappingURL=PromptPanel.js.map