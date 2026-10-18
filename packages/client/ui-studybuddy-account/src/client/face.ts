/** One account domain shared by the panel and global wallet contribution. */
import type { StudyBuddyAccountController } from './account-controller.ts'
import type { SourceController } from './source-controller.ts'
import type { UsageController } from './usage-controller.ts'
import type { RechargeController } from './recharge-controller.ts'
import type { ProfileController } from './profile-controller.ts'
import type { MyAiTab } from './view-store.ts'
/** Account UI controllers and localized actions retained within their current owned scope. */
export interface AccountFace {
  hooks:{
    account:StudyBuddyAccountController
    source:SourceController
    usage:UsageController
    recharge:RechargeController
    profile:ProfileController
    modelInsights:ProfileController
  }
  source: Pick<SourceController,
    'load' | 'createDraft' | 'editSource' | 'editDraft' | 'check' | 'save' | 'detectAndSave' | 'resume' | 'resumeLegacy' | 'remove' | 'rename' | 'reorder' | 'clearDraft' | 'ping' | 'probe' | 'loadDetail' | 'resumeBuiltin' | 'validateBuiltin' | 'refreshBalance' | 'diagnostic'>
  usage:Pick<UsageController,'loadPlatform'|'loadPlatformDetail'|'loadOwn'|'nextOwn'|'closeDetail'>
  recharge:Pick<RechargeController,'load'|'create'|'retryCreation'|'query'|'cancel'|'coupons'|'referrals'>
  refreshSummary():Promise<void>
  activate(tab:MyAiTab):void
  openRecharge():void
  openMyAi(tab:MyAiTab):void
  attachProfile(container:HTMLElement):()=>void
  retryProfile():Promise<void>
  attachModelInsights(container:HTMLElement):()=>void
  retryModelInsights():Promise<void>
}
