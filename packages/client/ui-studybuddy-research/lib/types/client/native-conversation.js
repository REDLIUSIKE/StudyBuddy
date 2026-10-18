import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import css from './ResearchPanel.module.css';
import { Button, SurfaceVisibilityProvider } from '@deepseek-ai/dsh-client-ui-primitives';
import { ResearchGuide } from "./ResearchGuide.js";
/** @param props - Retained references and native-column geometry. @returns Persistent native project Conversations. */
export function ResearchConversations({ useViews, useGeometry, usePage, usePanelInfo, SessionProvider, renderSlot, applyIntent, t }) {
    const { views, selectionError } = useViews(state => state), geometry = useGeometry(state => state), active = usePanelInfo(state => state.activePanelId === 'studybuddy.research');
    const page = usePage(state => state);
    const rect = geometry.bounds, shown = active && geometry.visible && rect !== null;
    return _jsxs("div", { className: css.nativeOverlay, hidden: !shown, "aria-hidden": !shown, style: rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined, children: [selectionError ? _jsx("p", { className: css.empty, role: "alert", children: t('nativeUnavailable') }) : null, _jsx(ResearchGuide, { t: t, visible: shown && !!page.scope && !page.errorCode && !selectionError && !views.some(view => view.selected) }, `${page.scope?.accountId ?? ''}:${page.scope?.generation ?? 0}`), views.map(view => _jsxs("div", { className: css.conversation, hidden: !view.selected, "data-research-conversation": view.sessionId, children: [view.intents.map(intent => _jsxs("div", { className: css.intent, children: [_jsxs("span", { title: intent.text, children: [t('prepared'), " \u00B7 ", intent.text.slice(0, 48)] }), _jsx(Button, { onClick: () => { void applyIntent(intent.id); }, children: t('applyPrepared') })] }, intent.id)), _jsx(SurfaceVisibilityProvider, { visible: shown && view.selected, children: _jsx(SessionProvider, { session: view.reference, children: renderSlot('studybuddy.research.conversation', {}) }) })] }, view.sessionId))] });
}
/** @param props - Framework native Session hooks and factory renderer. @returns Existing embedded Conversation content. */
export function NativeConversation({ renderFactorySlot, useSession }) {
    const opened = useSession(session => session.openState === 'open');
    return _jsx("div", { className: css.nativeBody, children: renderFactorySlot('conversation.content', { variant: 'embedded', phase: opened ? 'active' : 'settling', hero: false }) });
}
//# sourceMappingURL=native-conversation.js.map