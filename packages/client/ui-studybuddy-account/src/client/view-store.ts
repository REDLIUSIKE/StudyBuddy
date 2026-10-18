/** Registration stores contain view state only; business facts remain in Controllers. */
import {defineStore} from '@deepseek-ai/dsh-client-store'
export type MyAiTab='profile'|'sources'|'models'|'leaderboard'
interface ViewState {tab:MyAiTab;walletOpen:boolean;rechargeOpen:boolean;sourceEditorOpen:boolean;usageKind:'platform'|'user_api'}
export function createMyAiViewStore(){return defineStore({
  init:():ViewState=>({tab:'profile',walletOpen:false,rechargeOpen:false,sourceEditorOpen:false,usageKind:'platform'}),
  actions:{
    selectTab:(draft:ViewState,tab:MyAiTab)=>{draft.tab=tab},
    setWalletOpen:(draft:ViewState,open:boolean)=>{draft.walletOpen=open},
    setRechargeOpen:(draft:ViewState,open:boolean)=>{draft.rechargeOpen=open;draft.walletOpen=false},
    setSourceEditorOpen:(draft:ViewState,open:boolean)=>{draft.sourceEditorOpen=open},
    setUsageKind:(draft:ViewState,kind:ViewState['usageKind'])=>{draft.usageKind=kind},
    resetForScope:(draft:ViewState)=>Object.assign(draft,{tab:'profile',walletOpen:false,rechargeOpen:false,sourceEditorOpen:false,usageKind:'platform'}),
  },
})}
