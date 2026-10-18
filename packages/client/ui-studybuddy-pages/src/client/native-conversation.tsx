/** The existing floating assistant rectangle hosts the actual native Conversation factory. */
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { Button, IconBranchOutlineRegular, IconPlayOutlineRegular, IconRightUpOutlineRegular, IconSparkleRegular, SurfaceVisibilityProvider } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import type { AigcOverlayFace, AigcQuestionFace, AigcWelcomeFace } from './index.ts'
import css from './NativeConversation.module.css'
type Props = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'studybuddy.aigc.conversation' | 'studybuddy.aigc.question'> & PropsLocale<'studybuddy.pages'> & InjectFace<AigcOverlayFace>
export function AigcConversations({ useAigcViews, usePanelInfo, SessionProvider, renderSlot, t }: Props) {
  const state = useAigcViews(value => value), active = usePanelInfo(value => value.activePanelId === 'studybuddy.aigc')
  const shown = active && state.geometry.visible && !!state.geometry.bounds, bounds = state.geometry.bounds
  const asking = !!state.interactionId
  const inlineQuestion = shown && state.views.some(view => view.selected && view.sessionId === state.interactionSessionId)
  const questionDialog = asking && !inlineQuestion
  return <div className={questionDialog ? css.questionOverlay : css.overlay} hidden={!shown && !asking} aria-hidden={!shown && !asking} style={!questionDialog && bounds ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } : undefined}>
    {state.errorCode ? <p role="alert">{t('nativeUnavailable')}</p> : null}
    {state.views.map(view => <div className={questionDialog && state.interactionSessionId === view.sessionId ? css.questionHost : css.view} hidden={questionDialog ? state.interactionSessionId !== view.sessionId : !view.selected} key={view.sessionId} data-aigc-project={view.projectId} data-aigc-workspace={view.workspaceId} data-aigc-session={view.sessionId}>
      <SurfaceVisibilityProvider visible={asking ? state.interactionSessionId === view.sessionId : shown && view.selected}><SessionProvider session={view.reference}>{asking && state.interactionSessionId === view.sessionId
        ? renderSlot('studybuddy.aigc.question', { interactionId: state.interactionId!, presentation: inlineQuestion ? 'inline' : 'floating' })
        : renderSlot('studybuddy.aigc.conversation', {})}</SessionProvider></SurfaceVisibilityProvider>
    </div>)}
  </div>
}
function NoQuestionHistory(_props: ConversationViewsProps) { return null }
export function AigcQuestion({ useSession, interactionId, presentation, readyInteraction, renderFactorySlot, t }: PropsRuntime<'studybuddy.aigc.question'> & PropsRenderFactories & PropsLocale<'studybuddy.pages'> & InjectFace<AigcQuestionFace>) {
  const session = useSession(value => value)
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (session?.openState === 'open') void readyInteraction(interactionId).catch(() => { setFailed(true) }) }, [session?.openState, interactionId, readyInteraction])
  const content = failed ? <p role="alert">{t('nativeUnavailable')}</p> : renderFactorySlot('conversation.content',
    { variant: 'embedded', phase: session?.openState === 'open' ? 'active' : 'settling', hero: false },
    presentation === 'inline' ? undefined : { slots: { views: NoQuestionHistory } })
  if (presentation === 'inline') return <div className={css.body}>{content}</div>
  return <section className={css.questionView} aria-label={t('nativeQuestion')}>{content}</section>
}
export function AigcConversation({ useSession, renderFactorySlot, renderSlot }: PropsRuntime<'studybuddy.aigc.conversation'> & PropsRenderFactories & PropsRenderSlots<'studybuddy.aigc.welcome'>) {
  const opened = useSession(value => value.openState === 'open')
  const unused = useSession(value => value.blank && !value.promptAttempted && !value.running)
  return <div className={css.body}>{opened && unused ? renderSlot('studybuddy.aigc.welcome', {}) : null}{renderFactorySlot('conversation.content', { variant: 'embedded', phase: opened ? 'active' : 'settling', hero: false })}</div>
}
const suggestions = [
  { label: 'welcomeCanvas', detail: 'welcomeCanvasDescription', prompt: 'welcomeCanvasPrompt', Icon: IconBranchOutlineRegular },
  { label: 'welcomeStory', detail: 'welcomeStoryDescription', prompt: 'welcomeStoryPrompt', Icon: IconPlayOutlineRegular },
  { label: 'welcomeImage', detail: 'welcomeImageDescription', prompt: 'welcomeImagePrompt', Icon: IconSparkleRegular },
] as const
/** The original welcome content fills the actual native Session draft, without dispatching it. */
export function AigcWelcome({ sessionId, useInput, inputActions, focusInput, t }: PropsRuntime<'studybuddy.aigc.welcome'> & PropsLocale<'studybuddy.pages'> & InjectFace<AigcWelcomeFace>) {
  const editable = useInput(state => state.phase === 'plain')
  return <section className={css.welcome} aria-label={t('welcomeTitle')}>
    <header className={css.welcomeHeader}><span className={css.welcomeIcon}><IconSparkleRegular size={28} /></span><div><p className={css.welcomeLabel}>{t('welcome')}</p><h3>{t('welcomeTitle')}</h3></div></header>
    <p className={css.welcomeDescription}>{t('welcomeDescription')}</p>
    <div className={css.welcomeSuggestions}>{suggestions.map(({ label, detail, prompt, Icon }) => <Button key={label} className={css.welcomeSuggestion} disabled={!editable} aria-label={t('welcomeFill') + t(label)} onClick={() => { inputActions.setDraft(t(prompt)); inputActions.persistDraft(); focusInput(sessionId) }}>
      <Icon size={19} /><span className={css.suggestionContent}><strong>{t(label)}</strong><span>{t(detail)}</span></span><IconRightUpOutlineRegular size={15} />
    </Button>)}</div>
    <p className={css.welcomeHint}>{t('welcomeHint')}</p>
  </section>
}
