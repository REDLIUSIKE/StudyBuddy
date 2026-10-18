/** One global balance action opens the retained recharge flow directly. */
import { Button,IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { moneyText,type AccountSnapshot } from './account-controller.ts'
import type { AccountLocaleKey } from './locales.ts'
import css from './WalletButton.module.css'
export function WalletButton({ useAccount,openRecharge,t }:{
  useAccount:SnapshotSelectorHook<AccountSnapshot>
  openRecharge:()=>void
  t:(key:AccountLocaleKey)=>string
}){
  const state=useAccount(value=>value)
  return <Button size="sm" variant="ghost" className={css.trigger} disabled={state.scope===null} title={state.stale||state.status==='error'?t('stale'):t('recharge')} onClick={openRecharge}>
    <span className={css.label}>{t('wallet')}</span><span className={css.amount}>{moneyText(state.summary?.availableBalance)}</span><IconChevronDownOutlineRegular size={12}/>
  </Button>
}
