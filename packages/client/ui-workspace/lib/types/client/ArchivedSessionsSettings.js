import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Discover and restore archived records through the existing current-Host registry. */
import { useState } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { workspaceDisplayTitle } from '@deepseek-ai/dsh-api-workspace-controller/default-workspace';
import css from './ArchivedSessionsSettings.module.css';
/** Show the complete archive set, including cold rows whose display metadata is not yet available. */
export function ArchivedSessionsSettings({ useSessions, useWorkspaces, unarchiveSession, t }) {
    const sessions = useSessions(state => state), workspaces = useWorkspaces(state => state);
    const [query, setQuery] = useState(''), [busy, setBusy] = useState(null);
    const [notice, setNotice] = useState(null);
    const normalized = query.trim().toLocaleLowerCase();
    const rows = workspaces.archivedSessionIds.map(id => ({ id, title: sessions.byId[id]?.displayTitle || id,
        workspace: workspaces.items.find(workspace => workspace.sessionIds.includes(id)) }))
        .filter(row => !normalized || row.title.toLocaleLowerCase().includes(normalized) || row.id.toLocaleLowerCase().includes(normalized));
    const loading = sessions.phase !== 'ready' || workspaces.phase !== 'ready';
    const restore = async (id) => {
        if (busy !== null)
            return;
        setBusy(id);
        setNotice(null);
        try {
            await unarchiveSession(id);
            setNotice('restored');
        }
        catch {
            setNotice('failed');
        }
        finally {
            setBusy(null);
        }
    };
    return _jsxs("section", { className: css.root, "data-workspace-archived-settings": true, children: [_jsx("h2", { children: t('archive.settings') }), _jsx(Input, { "aria-label": t('archive.search'), placeholder: t('archive.search'), value: query, onChange: event => { setQuery(event.target.value); } }), loading && _jsx("p", { role: "status", children: t('loading') }), workspaces.error && _jsx("p", { role: "alert", children: workspaces.error.message }), notice === 'failed' && _jsx("p", { role: "alert", children: t('archive.restoreFailed') }), notice === 'restored' && _jsx("p", { role: "status", children: t('archive.restored') }), !loading && !workspaces.error && rows.length === 0 && _jsx("p", { className: css.empty, children: t(normalized ? 'empty.noMatches' : 'empty.noneArchived') }), _jsx("ul", { className: css.list, children: rows.map(row => _jsxs("li", { className: css.row, children: [_jsxs("div", { className: css.metadata, children: [_jsx("span", { className: css.title, children: row.title }), _jsx("span", { className: css.workspace, children: row.workspace ? workspaceDisplayTitle(row.workspace.title, t('workspace.defaultName')) : t('group.ungrouped') })] }), _jsx(Button, { size: "sm", variant: "outline", disabled: busy !== null, "aria-busy": busy === row.id, "aria-label": t('archive.restoreNamed', { title: row.title }), onClick: () => { void restore(row.id); }, children: t('menu.unarchiveSession') })] }, row.id)) })] });
}
//# sourceMappingURL=ArchivedSessionsSettings.js.map