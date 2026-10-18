import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Settings and My AI share the same account-scoped source and validation controller. */
import { useEffect, useState } from 'react';
import { SourcesPanel } from "./SourcesPanel.js";
import { SourceEditor } from "./SourceEditor.js";
import css from './MyAiPanel.module.css';
/** Keep the existing Models navigation entry while using the actual chat source authority. */
export function ModelsSettings({ t, useAccount, useSource, source, activate }) {
    const account = useAccount(state => state), sources = useSource(state => state);
    const [editorOpen, setEditorOpen] = useState(false);
    useEffect(() => { activate('sources'); }, [activate, account.scope?.accountId, account.scope?.generation]);
    const identity = account.scope ? account.scope.accountId + ':' + account.scope.generation : 'signed-out';
    return _jsxs("div", { className: css.modelSettings, "data-studybuddy-model-settings": true, children: [_jsx("h2", { children: t('modelSettings') }), !account.scope ? _jsx("p", { children: t('authenticationRequired') }) : _jsxs(_Fragment, { children: [_jsx(SourcesPanel, { state: sources, actions: source, t: t, openEditor: () => setEditorOpen(true) }, identity), _jsx(SourceEditor, { state: editorOpen ? sources : { ...sources, draft: null }, actions: source, t: t, onClose: () => { source.clearDraft(); setEditorOpen(false); } }, identity + ':editor')] })] });
}
//# sourceMappingURL=ModelsSettings.js.map