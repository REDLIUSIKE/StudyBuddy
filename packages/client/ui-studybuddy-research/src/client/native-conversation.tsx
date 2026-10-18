/** Reuse the native factory under independently retained project SessionProviders. */
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ResearchOverlayFace } from './index.ts'
import css from './ResearchPanel.module.css'
import { Button, SurfaceVisibilityProvider } from '@deepseek-ai/dsh-client-ui-primitives'
import { ResearchGuide } from './ResearchGuide.tsx'
type OverlayProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'studybuddy.research.conversation'> & PropsLocale<'studybuddy.research'> & InjectFace<ResearchOverlayFace>
/** @param props - Retained references and native-column geometry. @returns Persistent native project Conversations. */
export function ResearchConversations({ useViews, useGeometry, usePage, usePanelInfo, SessionProvider, renderSlot, applyIntent, t }: OverlayProps) {
  const { views, selectionError } = useViews(state => state), geometry = useGeometry(state => state), active = usePanelInfo(state => state.activePanelId === 'studybuddy.research')
  const page = usePage(state => state)
  const rect = geometry.bounds, shown = active && geometry.visible && rect !== null
  return <div className={css.nativeOverlay} hidden={!shown} aria-hidden={!shown}
    style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined}>
    {selectionError ? <p className={css.empty} role="alert">{t('nativeUnavailable')}</p> : null}
    <ResearchGuide key={`${page.scope?.accountId ?? ''}:${page.scope?.generation ?? 0}`} t={t}
      visible={shown && !!page.scope && !page.errorCode && !selectionError && !views.some(view => view.selected)} />
    {views.map(view => <div className={css.conversation} hidden={!view.selected} key={view.sessionId} data-research-conversation={view.sessionId}>
      {view.intents.map(intent => <div className={css.intent} key={intent.id}>
        <span title={intent.text}>{t('prepared')} · {intent.text.slice(0, 48)}</span>
        <Button onClick={() => { void applyIntent(intent.id) }}>{t('applyPrepared')}</Button>
      </div>)}
      <SurfaceVisibilityProvider visible={shown && view.selected}><SessionProvider session={view.reference}>{renderSlot('studybuddy.research.conversation', {})}</SessionProvider></SurfaceVisibilityProvider>
    </div>)}
  </div>
}
/** @param props - Framework native Session hooks and factory renderer. @returns Existing embedded Conversation content. */
export function NativeConversation({ renderFactorySlot, useSession }: PropsRuntime<'studybuddy.research.conversation'> & PropsRenderFactories) {
  const opened = useSession(session => session.openState === 'open')
  return <div className={css.nativeBody}>
    {renderFactorySlot('conversation.content', { variant: 'embedded', phase: opened ? 'active' : 'settling', hero: false })}
  </div>
}
