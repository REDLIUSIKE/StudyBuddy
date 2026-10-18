/** StudyBuddy research entry, retained guest and actual native Conversation assembly. */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { EmbeddedPagePresentation, observeEmbeddedSurface, preloadPages } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EmbeddedPageHost, EmbeddedPageScope, EmbeddedPageSnapshot, SurfaceProjection } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import { ResearchPageController, type ResearchViewSnapshot } from './research-controller.ts'
import { ResearchPanel, ResearchPanelIcon } from './ResearchPanel.tsx'
import { ResearchConversations, NativeConversation } from './native-conversation.tsx'
import { zh, en, type ResearchLocaleKey } from './locales.ts'
import { observeResearchActivation } from './research-navigation.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'studybuddy.research': ResearchLocaleKey }
  interface SlotMap { 'studybuddy.research.conversation': { kind: 'single'; scope: 'session'; owner: Record<never, never> } }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' { interface SessionReferenceSourceMap { researchView: unknown } }
interface Host {
  research?: Omit<EmbeddedPageHost<'research'>, 'acquire'> & { acquire(): ReturnType<EmbeddedPageHost<'research'>['acquire']>; subscribeAction(listener: (value: unknown) => void): () => void; acknowledgeIntent(id: string): Promise<void> }
  status(): Promise<{ phase: string; scope?: EmbeddedPageScope | null }>
  subscribe(listener: (state: { phase: string; scope?: EmbeddedPageScope | null }) => void): () => void
}
export interface ResearchPanelFace {
  hooks: { page: HostObservable<EmbeddedPageSnapshot> }
  desktop: boolean
  attachGuest(container: HTMLElement): () => void
  attachNative(container: HTMLElement): () => void
  retry(): Promise<void>
}
export interface ResearchOverlayFace { hooks: { views: HostObservable<ResearchViewSnapshot>; geometry: HostObservable<SurfaceProjection>; page: HostObservable<EmbeddedPageSnapshot> }; applyIntent(id: string): Promise<void> }
export const inject = ['slots', 'locale', 'layout', 'theme', 'sessions', 'conversation']
/** @param ctx - Original browser plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => observeResearchActivation(ctx.layout.panelInfo, () => { ctx.layout.collapseSidebar() }))
  ctx.effect(() => ctx.locale.register('studybuddy.research', { zh, en }))
  const t = ctx.locale.bind('studybuddy.research'), host = Reflect.get(window, 'studybuddy') as Host | undefined, surface = host?.research
  const controller = new ResearchPageController(surface && { ...surface, acquire: () => surface.acquire() },
    id => ctx.sessions.retain(brandString<SessionId>(id), { source: 'researchView' }))
  const presentation = new EmbeddedPagePresentation(controller.page, () => t('title'))
  let geometry: SurfaceProjection = { bounds: null, visible: false }
  const geometryListeners = new Set<() => void>()
  const geometrySource: HostObservable<SurfaceProjection> = { getSnapshot: () => geometry, subscribe: listener => { geometryListeners.add(listener); return () => { geometryListeners.delete(listener) } } }
  const setGeometry = (next: SurfaceProjection) => {
    if (JSON.stringify(geometry) === JSON.stringify(next)) return
    geometry = next; for (const listener of geometryListeners) { try { listener() } catch { console.error('Research geometry observer failed') } }
  }
  const panel: ResearchPanelFace = { hooks: { page: controller.page }, desktop: !!surface, attachGuest: presentation.attach, retry: controller.page.retry,
    attachNative: element => {
      const stop = observeEmbeddedSurface(element, projection => {
        // Native menus hide only the web guest; the native form stays mounted and visible.
        setGeometry({ bounds: projection.bounds, visible: element.isConnected && !!projection.bounds && projection.bounds.width > 0 && projection.bounds.height > 0 })
      })
      return () => { stop(); setGeometry({ bounds: null, visible: false }) }
    } }
  const applyIntent = async (intentId: string): Promise<void> => {
    const view = controller.getSnapshot().views.find(row => row.intents.some(intent => intent.id === intentId)), intent = view?.intents.find(item => item.id === intentId)
    if (!view || !intent || !surface) return
    try {
      const binding = await view.reference.ready
      if (!controller.getSnapshot().views.some(row => row.reference === view.reference && row.intents.some(item => item.id === intentId))) return
      const input = ctx.conversation.input.for(binding.ctx)
      const result = ctx.conversation.input.requestDraftInitialization(binding, { prompt: intent.text, clearPreviousDraft: false })
      if (result !== 'applied') { input.notify('info', t('draftPreserved')); return }
      for (const path of intent.references) {
        const state = input.state.getSnapshot(), token = formatFileMention({ path, kind: 'file' }, false)
        if (token === undefined || !input.insertReference({ source: 'reference', ref: token, label: path.split('/').at(-1)!, appearance: 'file', clipboardText: token }, { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev })) { input.notify('error', t('referenceFailed')); return }
      }
      await surface.acknowledgeIntent(intentId); controller.acknowledgeIntent(intentId)
      if (controller.getSnapshot().views.some(row => row.reference === view.reference && row.selected) && ctx.layout.panelInfo.getSnapshot().activePanelId === 'studybuddy.research') input.focus()
    } catch { if (controller.getSnapshot().views.some(row => row.reference === view.reference)) controller.page.reportFailure('RESEARCH_SESSION_OPEN_FAILED') }
  }
  const overlay: ResearchOverlayFace = { hooks: { views: controller, geometry: geometrySource, page: controller.page }, applyIntent }
  const id = 'studybuddy.research' as MainPanelId
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'studybuddy.research', inject: () => panel }, ResearchPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: 55, label: () => t('title'), locale: 'studybuddy.research' }, ResearchPanelIcon))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'studybuddy.research.sessions', locale: 'studybuddy.research',
    children: { 'studybuddy.research.conversation': { kind: 'single', scope: 'session' } }, inject: () => overlay }, ResearchConversations))
  ctx.slots.inject('studybuddy.research.conversation', () => ctx.slots.register({ name: 'studybuddy.research.conversation' }, NativeConversation))
  ctx.effect(() => {
    let revision = 0, stopPreload: (() => void) | undefined
    const adopt = (state: { phase: string; scope?: EmbeddedPageScope | null }) => {
      const scope = state.phase === 'authenticated' ? state.scope ?? null : null, previous = controller.page.getSnapshot().scope
      const changed = previous?.accountId !== scope?.accountId || previous?.generation !== scope?.generation
      controller.setScope(scope)
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === id) void controller.page.acquire()
      if (changed) { stopPreload?.(); stopPreload = scope && surface ? preloadPages([{ id: 'research', priority: 60, prepare: presentation.prepare }]) : undefined }
    }
    const stop = host?.subscribe(state => { ++revision; adopt(state) }), initial = revision
    void host?.status().then(state => { if (initial === revision) adopt(state) }).catch(() => { if (initial === revision) adopt({ phase: 'error' }) })
    const action = surface?.subscribeAction(value => {
      if (!controller.accept(value) || !value || typeof value !== 'object' || !('action' in value) || !value.action || typeof value.action !== 'object') return
      const request = value.action as Record<string, unknown>, data = 'data' in value && value.data && typeof value.data === 'object' ? value.data : undefined
      if (request.kind === 'draft' && data && 'preparedIntentId' in data && typeof data.preparedIntentId === 'string') { void applyIntent(data.preparedIntentId); return }
      const view = controller.getSnapshot().views.find(row => data && 'sessionId' in data ? row.sessionId === data.sessionId : row.selected)
      if (!view) return
      void view.reference.ready.then(binding => {
        if (!controller.getSnapshot().views.some(row => row.reference === view.reference)) return
        const input = ctx.conversation.input.for(binding.ctx)
        if (request.kind === 'show-models') {
          if (ctx.layout.panelInfo.getSnapshot().activePanelId !== 'studybuddy.research') return
          input.focus()
          if (!ctx.get('commandUi')?.openPopup('model', { sessionId: binding.session.sessionId })) input.notify('info', t('modelHint'))
          return
        }
        const paths = request.kind === 'reference' ? [request.path] : []
        for (const path of paths) if (typeof path === 'string') {
          const state = input.state.getSnapshot(), token = formatFileMention({ path, kind: 'file' }, false)
          if (token === undefined) { input.notify('error', t('referenceFailed')); continue }
          if (!input.insertReference({ source: 'reference', ref: token, label: path.split('/').at(-1)!, appearance: 'file', clipboardText: token }, { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev })) input.notify('error', t('referenceFailed'))
        }
      }).catch(() => { controller.page.reportFailure('RESEARCH_SESSION_OPEN_FAILED') })
    })
    return () => { stopPreload?.(); stop?.(); action?.() }
  })
  ctx.on('theme/change', () => { void controller.page.setTheme({ ...presentation.theme(), mode: ctx.theme.getTheme().active.colorScheme }) })
  ctx.effect(() => () => { presentation.dispose(); controller.dispose(); geometryListeners.clear() })
}
