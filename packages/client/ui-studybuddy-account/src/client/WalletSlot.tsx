/** One global wallet and recharge dialog over the same account Controller and view store. */
import type { InjectFace,PropsLocale,PropsRuntime,PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountFace } from './face.ts'
import type { createMyAiViewStore } from './view-store.ts'
import { WalletButton } from './WalletButton.tsx'
import { RechargeDialog } from './RechargeDialog.tsx'
export type WalletSlotProps=PropsRuntime<'shell.actions'>&PropsLocale<'studybuddy.account'>&InjectFace<AccountFace>&PropsStore<ReturnType<typeof createMyAiViewStore>>
export function WalletSlot({ t,useAccount,useRecharge,useStore,actions,openRecharge,recharge }:WalletSlotProps){
  const open=useStore(value=>value.rechargeOpen),state=useRecharge(value=>value),account=useAccount(value=>value)
  return <>
    <WalletButton t={t} useAccount={useAccount} openRecharge={openRecharge}/>
    <RechargeDialog t={t} state={state} account={account} actions={recharge} open={open}
      onClose={()=>{ actions.setRechargeOpen(false) }}/>
  </>
}
