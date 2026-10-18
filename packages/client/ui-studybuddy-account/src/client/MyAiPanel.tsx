/** Harness main panel owns only view state; facts arrive through selector-hook shares. */
import {useEffect,useRef} from 'react'
import {IconUserOutlineRegular,SegmentedTabs} from '@deepseek-ai/dsh-client-ui-primitives'
import type {InjectFace,PropsLocale,PropsRuntime,PropsStore,PropsRenderSlots} from '@deepseek-ai/dsh-client-ui-slots'
import type {AccountFace} from './face.ts'
import type {createMyAiViewStore} from './view-store.ts'
import {SourcesPanel} from './SourcesPanel.tsx'
import {SourceEditor} from './SourceEditor.tsx'
import {ErrorNotice} from './ErrorNotice.tsx'
import css from './MyAiPanel.module.css'
type SharedProps=PropsLocale<'studybuddy.account'>&InjectFace<AccountFace>&PropsStore<ReturnType<typeof createMyAiViewStore>>
export type MyAiPanelProps=PropsRuntime<'main'>&PropsRenderSlots<'studybuddy.my-ai.leaderboard'>&SharedProps
function ProfileView({useProfile,attachProfile,retryProfile,t}:Pick<MyAiPanelProps,'useProfile'|'attachProfile'|'retryProfile'|'t'>){
  const state=useProfile(value=>value),container=useRef<HTMLDivElement>(null)
  useEffect(()=>container.current?attachProfile(container.current):undefined,[attachProfile])
  return <><ErrorNotice code={state.errorCode} t={t} retry={()=>{void retryProfile()}}/>{state.busy&&<p role="status">{t('connectingProfile')}</p>}<div className={css.profile} ref={container}/></>
}
function ModelInsightsView({useModelInsights,attachModelInsights,retryModelInsights,t}:Pick<MyAiPanelProps,'useModelInsights'|'attachModelInsights'|'retryModelInsights'|'t'>){
  const state=useModelInsights(value=>value),container=useRef<HTMLDivElement>(null)
  useEffect(()=>container.current?attachModelInsights(container.current):undefined,[attachModelInsights])
  return <><ErrorNotice code={state.errorCode} t={t} retry={()=>{void retryModelInsights()}}/>{state.busy&&<p role="status">{t('connectingModels')}</p>}<div className={css.profile} ref={container}/></>
}
export function MyAiPanel(props:MyAiPanelProps){
  const {t,useStore,actions,useAccount,useSource,source,activate,renderSlot}=props
  const view=useStore(state=>state),account=useAccount(state=>state),sources=useSource(state=>state)
  const tab=view.tab
  return <div className={css.panel} data-studybuddy-my-ai>
    <header className={css.header}><h1>{t('panel')}</h1></header>
    <div className={css.tabs}><SegmentedTabs label={t('panel')} items={[{value:'profile',label:t('profile'),id:'sb-profile-tab',panelId:'sb-my-ai-content'},{value:'sources',label:t('sources'),id:'sb-sources-tab',panelId:'sb-my-ai-content'},{value:'models',label:t('modelInsights'),id:'sb-models-tab',panelId:'sb-my-ai-content'},{value:'leaderboard',label:t('leaderboard'),id:'sb-leaderboard-tab',panelId:'sb-my-ai-content'}]} value={tab} onChange={value=>{actions.selectTab(value);activate(value)}}/></div>
    <div className={css.body} id="sb-my-ai-content" role="tabpanel" aria-labelledby={'sb-'+tab+'-tab'}>
      {!account.scope?<p className={css.empty}>{t('authenticationRequired')}</p>:tab==='profile'?<ProfileView {...props}/>:tab==='models'?<ModelInsightsView {...props}/>:tab==='leaderboard'?renderSlot('studybuddy.my-ai.leaderboard',{}):<SourcesPanel key={account.scope.accountId+':'+account.scope.generation} state={sources} actions={source} t={t} openEditor={()=>actions.setSourceEditorOpen(true)}/>}
    </div>
    <SourceEditor key={account.scope?account.scope.accountId+':'+account.scope.generation:'signed-out'} state={view.sourceEditorOpen?sources:{...sources,draft:null}} actions={source} t={t} onClose={()=>{source.clearDraft();actions.setSourceEditorOpen(false)}}/>
  </div>
}
export function AccountPanelIcon({size}:PropsRuntime<'sidebar.panellist'>){return <IconUserOutlineRegular size={size}/>}
