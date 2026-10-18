import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { OwnedScope, ToolNavigationNotice } from '@studybuddy/contracts'
import { preloadPages } from '@deepseek-ai/dsh-client-ui-primitives'
import {brandString} from '@deepseek-ai/dsh-brand'
import type {SessionId} from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {SkillSafetyGuidance} from './SkillSafetyGuidance.tsx'
import { ToolCenterController, type ToolsSurfaceHost } from './tool-center-controller.ts'
import { ToolsPresentation } from './ToolsPresentation.ts'
import { ToolCenterPanel, ToolsPanelIcon } from './ToolCenterPanel.tsx'
import { zh, en, type ToolLocaleKey } from './locales.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'studybuddy.tools': ToolLocaleKey
  }
}
export interface ToolFace {
  laboratory?:boolean
  hooks: { tools: ToolCenterController }
  desktop: boolean
  attach(container: HTMLElement): () => void
  retry(): Promise<void>
}
interface Host {
  tools?: ToolsSurfaceHost
  status(): Promise<{ phase: string; scope?: OwnedScope | null }>
  subscribe(listener: (state: { phase: string; scope?: OwnedScope | null }) => void): () => void
  subscribeNavigation?(listener:(notice:ToolNavigationNotice)=>void):()=>void
}
const PANEL_ID = 'studybuddy.tools' as MainPanelId
export const inject = ['slots', 'locale', 'layout', 'theme', 'uiWorkspace']
/** Register through the owning declarations; disposing awaits native presentation quiescence. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('studybuddy.tools', { zh, en }), 'studybuddy tools dictionaries')
  ctx.slots.inject('conversation.hero.guidance',()=>ctx.slots.register({name:'conversation.hero.guidance',locale:'studybuddy.tools'},SkillSafetyGuidance))
  const t = ctx.locale.bind('studybuddy.tools'),
    host = Reflect.get(window, 'studybuddy') as Host | undefined
  const controller = new ToolCenterController(host?.tools),
    presentation = new ToolsPresentation(controller)
  const face: ToolFace = {
    hooks: { tools: controller },
    desktop: !!host?.tools,
    attach: presentation.attach,
    retry: controller.retry,
  }
  let disposed = false
  const syncTheme = () => {
    if (!disposed) void controller.setTheme({ ...presentation.theme(), mode: ctx.theme.getTheme().active.colorScheme })
  }
  ctx.effect(() => {
    let revision = 0, stopPreload: (() => void) | undefined
    const adopt = (state: { phase: string; scope?: OwnedScope | null }) => {
      if (disposed) return
      const scope = state.phase === 'authenticated' ? state.scope ?? null : null, previous = controller.getSnapshot().scope
      const changed = previous?.accountId !== scope?.accountId || previous?.generation !== scope?.generation
      controller.setScope(scope)
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) void controller.acquire()
      if (changed) {
        stopPreload?.(); stopPreload = undefined
        if (scope && host?.tools) stopPreload = preloadPages([{ id: 'tools', priority: 10, prepare: controller.acquire }])
      }
    }
    const off = host?.subscribe((state) => {
        ++revision
        adopt(state)
      }),
      initial = revision
    void host
      ?.status()
      .then((state) => {
        if (initial === revision) adopt(state)
      })
      .catch(() => {
        if (initial === revision) adopt({ phase: 'error' })
      })
    let themedLease: string | null = null
    const stopTheme = controller.subscribe(() => {
      const lease = controller.getSnapshot().lease?.lease ?? null
      if (lease !== themedLease) {
        themedLease = lease
        syncTheme()
      }
    })
    return () => {
      stopPreload?.()
      off?.()
      stopTheme()
    }
  }, 'studybuddy tools account lifecycle')
  ctx.on('theme/change', syncTheme)
  ctx.effect(
    () => async () => {
      disposed = true
      presentation.dispose()
      await controller.dispose()
    },
    'studybuddy tools disposal',
  )
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: PANEL_ID, locale: 'studybuddy.tools', inject: () => face },
      ToolCenterPanel,
    ),
  )
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel'), locale: 'studybuddy.tools' },
      ToolsPanelIcon,
    ),
  )
  registerLaboratory(ctx, host)
}
function registerLaboratory(ctx:Context,host:Host|undefined):void{
  const original=host?.tools
  const carrier:ToolsSurfaceHost|undefined=original?{
    acquire:()=>original.acquire('labs'),release:id=>original.release(id),resize:(id,bounds)=>original.resize(id,bounds),
    setVisible:(id,visible)=>original.setVisible(id,visible),setTheme:(id,theme)=>original.setTheme(id,theme),subscribeInvalid:listener=>original.subscribeInvalid(listener),
  }:undefined
  const controller=new ToolCenterController(carrier),presentation=new ToolsPresentation(controller)
  const face:ToolFace={laboratory:true,hooks:{tools:controller},desktop:!!original,attach:presentation.attach,retry:controller.retry}
  const t=ctx.locale.bind('studybuddy.tools')
  let disposed=false
  const syncTheme=()=>{if(!disposed)void controller.setTheme({...presentation.theme(),mode:ctx.theme.getTheme().active.colorScheme})}
  ctx.effect(()=>{
    let revision=0,stopPreload:(()=>void)|undefined
    const adopt=(state:{phase:string;scope?:OwnedScope|null})=>{
      if(disposed)return
      const scope=state.phase==='authenticated'?(state.scope??null):null,previous=controller.getSnapshot().scope
      const changed=previous?.accountId!==scope?.accountId||previous?.generation!==scope?.generation
      controller.setScope(scope)
      if(changed){stopPreload?.();stopPreload=undefined;if(scope&&carrier)stopPreload=preloadPages([{id:'labs',priority:45,prepare:controller.acquire}])}
    }
    const off=host?.subscribe(state=>{++revision;adopt(state)}),initial=revision
    void host?.status().then(state=>{if(initial===revision)adopt(state)}).catch(()=>{if(initial===revision)adopt({phase:'error'})})
    let lease:string|null=null
    const stopTheme=controller.subscribe(()=>{const next=controller.getSnapshot().lease?.lease??null;if(next!==lease){lease=next;syncTheme()}})
    const stopNavigation=host?.subscribeNavigation?.(notice=>{
      const scope=controller.getSnapshot().scope
      if(disposed||scope?.accountId!==notice.scope.accountId||scope.generation!==notice.scope.generation)return
      if(notice.target==='tools'){ctx.get('settingsNavigation')?.close();ctx.layout.selectPanel(PANEL_ID)}
      else if(notice.target==='skill-safety'){ctx.get('settingsNavigation')?.close();ctx.uiWorkspace.openSession(brandString<SessionId>(notice.sessionId))}
    })
    return()=>{stopPreload?.();off?.();stopTheme();stopNavigation?.()}
  },'studybuddy laboratory account lifecycle')
  ctx.on('theme/change',syncTheme)
  ctx.effect(()=>async()=>{disposed=true;presentation.dispose();await controller.dispose()},'studybuddy laboratory disposal')
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'labs',order:25,label:()=>t('labsPanel'),locale:'studybuddy.tools',inject:()=>face},ToolCenterPanel))
}
