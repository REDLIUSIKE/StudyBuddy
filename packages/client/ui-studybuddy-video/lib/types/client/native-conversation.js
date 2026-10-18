import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, SurfaceVisibilityProvider } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './VideoPanel.module.css';
/** Retain each project's real SessionProvider and conceal input when its page is hidden. */
export function VideoConversations({ useViews, useGeometry, usePage, usePanelInfo, SessionProvider, renderSlot, applyReference, t }) {
    const { views } = useViews(value => value), geometry = useGeometry(value => value), page = usePage(value => value);
    const active = usePanelInfo(value => value.activePanelId === 'studybuddy.video');
    const rect = geometry.bounds, shown = active && geometry.visible && !!rect && !!page.lease && !page.errorCode;
    return _jsxs("div", { className: css.nativeOverlay, hidden: !shown, "aria-hidden": !shown, style: rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined, children: [!views.some(view => view.selected) ? _jsx("p", { className: css.empty, children: t('empty') }) : null, views.map(view => _jsxs("div", { className: css.conversation, hidden: !view.selected, children: [view.references.map(reference => _jsxs("div", { className: css.reference, children: [_jsx("span", { title: reference.text, children: reference.text }), _jsx(Button, { onClick: () => { void applyReference(reference.id); }, children: t('applyReference') })] }, reference.id)), _jsx(SurfaceVisibilityProvider, { visible: shown && view.selected, children: _jsx(SessionProvider, { session: view.reference, children: renderSlot('studybuddy.video.conversation', {}) }) })] }, view.sessionId))] });
}
export function NativeVideoConversation({ renderFactorySlot, useSession }) {
    const opened = useSession(session => session.openState === 'open');
    return _jsx("div", { className: css.nativeBody, children: renderFactorySlot('conversation.content', { variant: 'embedded', phase: opened ? 'active' : 'settling', hero: false }) });
}
//# sourceMappingURL=native-conversation.js.map