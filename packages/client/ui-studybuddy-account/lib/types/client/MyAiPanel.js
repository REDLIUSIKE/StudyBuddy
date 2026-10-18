import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Harness main panel owns only view state; facts arrive through selector-hook shares. */
import { useEffect, useRef } from 'react';
import { IconUserOutlineRegular, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { SourcesPanel } from "./SourcesPanel.js";
import { SourceEditor } from "./SourceEditor.js";
import { ErrorNotice } from "./ErrorNotice.js";
import css from './MyAiPanel.module.css';
function ProfileView({ useProfile, attachProfile, retryProfile, t }) {
    const state = useProfile(value => value), container = useRef(null);
    useEffect(() => container.current ? attachProfile(container.current) : undefined, [attachProfile]);
    return _jsxs(_Fragment, { children: [_jsx(ErrorNotice, { code: state.errorCode, t: t, retry: () => { void retryProfile(); } }), state.busy && _jsx("p", { role: "status", children: t('connectingProfile') }), _jsx("div", { className: css.profile, ref: container })] });
}
function ModelInsightsView({ useModelInsights, attachModelInsights, retryModelInsights, t }) {
    const state = useModelInsights(value => value), container = useRef(null);
    useEffect(() => container.current ? attachModelInsights(container.current) : undefined, [attachModelInsights]);
    return _jsxs(_Fragment, { children: [_jsx(ErrorNotice, { code: state.errorCode, t: t, retry: () => { void retryModelInsights(); } }), state.busy && _jsx("p", { role: "status", children: t('connectingModels') }), _jsx("div", { className: css.profile, ref: container })] });
}
export function MyAiPanel(props) {
    const { t, useStore, actions, useAccount, useSource, source, activate, renderSlot } = props;
    const view = useStore(state => state), account = useAccount(state => state), sources = useSource(state => state);
    const tab = view.tab;
    return _jsxs("div", { className: css.panel, "data-studybuddy-my-ai": true, children: [_jsx("header", { className: css.header, children: _jsx("h1", { children: t('panel') }) }), _jsx("div", { className: css.tabs, children: _jsx(SegmentedTabs, { label: t('panel'), items: [{ value: 'profile', label: t('profile'), id: 'sb-profile-tab', panelId: 'sb-my-ai-content' }, { value: 'sources', label: t('sources'), id: 'sb-sources-tab', panelId: 'sb-my-ai-content' }, { value: 'models', label: t('modelInsights'), id: 'sb-models-tab', panelId: 'sb-my-ai-content' }, { value: 'leaderboard', label: t('leaderboard'), id: 'sb-leaderboard-tab', panelId: 'sb-my-ai-content' }], value: tab, onChange: value => { actions.selectTab(value); activate(value); } }) }), _jsx("div", { className: css.body, id: "sb-my-ai-content", role: "tabpanel", "aria-labelledby": 'sb-' + tab + '-tab', children: !account.scope ? _jsx("p", { className: css.empty, children: t('authenticationRequired') }) : tab === 'profile' ? _jsx(ProfileView, { ...props }) : tab === 'models' ? _jsx(ModelInsightsView, { ...props }) : tab === 'leaderboard' ? renderSlot('studybuddy.my-ai.leaderboard', {}) : _jsx(SourcesPanel, { state: sources, actions: source, t: t, openEditor: () => actions.setSourceEditorOpen(true) }, account.scope.accountId + ':' + account.scope.generation) }), _jsx(SourceEditor, { state: view.sourceEditorOpen ? sources : { ...sources, draft: null }, actions: source, t: t, onClose: () => { source.clearDraft(); actions.setSourceEditorOpen(false); } }, account.scope ? account.scope.accountId + ':' + account.scope.generation : 'signed-out')] });
}
export function AccountPanelIcon({ size }) { return _jsx(IconUserOutlineRegular, { size: size }); }
//# sourceMappingURL=MyAiPanel.js.map