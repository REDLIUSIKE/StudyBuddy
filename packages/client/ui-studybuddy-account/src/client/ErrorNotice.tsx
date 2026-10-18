/** Errors report an actionable state while keeping private diagnostics out of the page. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountLocaleKey } from './locales.ts'
import css from './MyAiPanel.module.css'
export function ErrorNotice({ code,t,retry }:{ code:string|null;t:(key:AccountLocaleKey)=>string;retry?:()=>void }){
  if(!code)return null
  const key:AccountLocaleKey=code==='NATIVE_SAVE_JOURNAL_MISSING'?'saveJournalMissing':code==='NATIVE_SOURCE_FIELDS_REQUIRED'?'sourceFieldsRequired':code==='NATIVE_VERIFICATION_REQUIRED'?'verifyFirst':code==='NATIVE_SAVE_RECOVERY_REQUIRED'||code==='NATIVE_RESULT_UNKNOWN'?'pending':code==='NATIVE_USAGE_BINDING_CHANGED'?'recordMismatch':code==='AUTH_REQUIRED'||code==='ACCOUNT_SCOPE_CHANGED'?'authenticationRequired':code==='BUSINESS_UNAVAILABLE'?'unavailable':code==='RECHARGE_PAYMENT_CLOSED'?'paymentClosed':code==='RECHARGE_CREATION_PENDING'?'creationPending':'error'
  return <div className={css.error} role="alert"><span>{t(key)}</span>{retry&&<Button size="sm" variant="outline" onClick={retry}>{t('retry')}</Button>}</div>
}
