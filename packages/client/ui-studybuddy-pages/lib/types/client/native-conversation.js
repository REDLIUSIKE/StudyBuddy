import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button, IconBranchOutlineRegular, IconPlayOutlineRegular, IconRightUpOutlineRegular, IconSparkleRegular, SurfaceVisibilityProvider } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useState } from 'react';
import css from './NativeConversation.module.css';
export function AigcConversations({ useAigcViews, usePanelInfo, SessionProvider, renderSlot, t }) {
    const state = useAigcViews(value => value), active = usePanelInfo(value => value.activePanelId === 'studybuddy.aigc');
    const shown = active && state.geometry.visible && !!state.geometry.bounds, bounds = state.geometry.bounds;
    const asking = !!state.interactionId;
    const inlineQuestion = shown && state.views.some(view => view.selected && view.sessionId === state.interactionSessionId);
    const questionDialog = asking && !inlineQuestion;
    return _jsxs("div", { className: questionDialog ? css.questionOverlay : css.overlay, hidden: !shown && !asking, "aria-hidden": !shown && !asking, style: !questionDialog && bounds ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : undefined, children: [state.errorCode ? _jsx("p", { role: "alert", children: t('nativeUnavailable') }) : null, state.views.map(view => _jsx("div", { className: questionDialog && state.interactionSessionId === view.sessionId ? css.questionHost : css.view, hidden: questionDialog ? state.interactionSessionId !== view.sessionId : !view.selected, "data-aigc-project": view.projectId, "data-aigc-workspace": view.workspaceId, "data-aigc-session": view.sessionId, children: _jsx(SurfaceVisibilityProvider, { visible: asking ? state.interactionSessionId === view.sessionId : shown && view.selected, children: _jsx(SessionProvider, { session: view.reference, children: asking && state.interactionSessionId === view.sessionId
                            ? renderSlot('studybuddy.aigc.question', { interactionId: state.interactionId, presentation: inlineQuestion ? 'inline' : 'floating' })
                            : renderSlot('studybuddy.aigc.conversation', {}) }) }) }, view.sessionId))] });
}
function NoQuestionHistory(_props) { return null; }
export function AigcQuestion({ useSession, interactionId, presentation, readyInteraction, renderFactorySlot, t }) {
    const session = useSession(value => value);
    const [failed, setFailed] = useState(false);
    useEffect(() => { if (session?.openState === 'open')
        void readyInteraction(interactionId).catch(() => { setFailed(true); }); }, [session?.openState, interactionId, readyInteraction]);
    const content = failed ? _jsx("p", { role: "alert", children: t('nativeUnavailable') }) : renderFactorySlot('conversation.content', { variant: 'embedded', phase: session?.openState === 'open' ? 'active' : 'settling', hero: false }, presentation === 'inline' ? undefined : { slots: { views: NoQuestionHistory } });
    if (presentation === 'inline')
        return _jsx("div", { className: css.body, children: content });
    return _jsx("section", { className: css.questionView, "aria-label": t('nativeQuestion'), children: content });
}
export function AigcConversation({ useSession, renderFactorySlot, renderSlot }) {
    const opened = useSession(value => value.openState === 'open');
    const unused = useSession(value => value.blank && !value.promptAttempted && !value.running);
    return _jsxs("div", { className: css.body, children: [opened && unused ? renderSlot('studybuddy.aigc.welcome', {}) : null, renderFactorySlot('conversation.content', { variant: 'embedded', phase: opened ? 'active' : 'settling', hero: false })] });
}
const suggestions = [
    { label: 'welcomeCanvas', detail: 'welcomeCanvasDescription', prompt: 'welcomeCanvasPrompt', Icon: IconBranchOutlineRegular },
    { label: 'welcomeStory', detail: 'welcomeStoryDescription', prompt: 'welcomeStoryPrompt', Icon: IconPlayOutlineRegular },
    { label: 'welcomeImage', detail: 'welcomeImageDescription', prompt: 'welcomeImagePrompt', Icon: IconSparkleRegular },
];
/** The original welcome content fills the actual native Session draft, without dispatching it. */
export function AigcWelcome({ sessionId, useInput, inputActions, focusInput, t }) {
    const editable = useInput(state => state.phase === 'plain');
    return _jsxs("section", { className: css.welcome, "aria-label": t('welcomeTitle'), children: [_jsxs("header", { className: css.welcomeHeader, children: [_jsx("span", { className: css.welcomeIcon, children: _jsx(IconSparkleRegular, { size: 28 }) }), _jsxs("div", { children: [_jsx("p", { className: css.welcomeLabel, children: t('welcome') }), _jsx("h3", { children: t('welcomeTitle') })] })] }), _jsx("p", { className: css.welcomeDescription, children: t('welcomeDescription') }), _jsx("div", { className: css.welcomeSuggestions, children: suggestions.map(({ label, detail, prompt, Icon }) => _jsxs(Button, { className: css.welcomeSuggestion, disabled: !editable, "aria-label": t('welcomeFill') + t(label), onClick: () => { inputActions.setDraft(t(prompt)); inputActions.persistDraft(); focusInput(sessionId); }, children: [_jsx(Icon, { size: 19 }), _jsxs("span", { className: css.suggestionContent, children: [_jsx("strong", { children: t(label) }), _jsx("span", { children: t(detail) })] }), _jsx(IconRightUpOutlineRegular, { size: 15 })] }, label)) }), _jsx("p", { className: css.welcomeHint, children: t('welcomeHint') })] });
}
//# sourceMappingURL=native-conversation.js.map