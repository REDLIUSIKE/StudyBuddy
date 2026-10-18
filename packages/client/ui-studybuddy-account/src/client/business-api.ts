/** The UI receives fixed methods; neither login tokens nor endpoint selection enter this adapter. */
import type { StudyBuddyBusinessApi,BusinessOperationMap,EmbeddedLease,EmbeddedTheme,OwnedScope,
  ToolNavigationNotice } from '@studybuddy/contracts'
/** Fixed renderer preload methods; private consumer material is excluded. */
export interface AccountHost {
  status():Promise<{ phase:string;scope?:OwnedScope|null }>
  subscribe(listener:(state:{ phase:string;scope?:OwnedScope|null })=>void):()=>void
  subscribeNavigation?(listener:(notice:ToolNavigationNotice)=>void):()=>void
  business?: {
    invoke<K extends keyof BusinessOperationMap>(method: K, args: BusinessOperationMap[K]['args']): Promise<BusinessOperationMap[K]['result']>
  }
  embedded?: {
    acquire(target: 'personal_profile' | 'model_insights'): Promise<EmbeddedLease>
    release(lease: string): Promise<void>
    setTheme(lease: string, theme: EmbeddedTheme): Promise<void>
    subscribeInvalid?(listener: (lease: string) => void): () => void
  }
}
const methods: readonly (keyof StudyBuddyBusinessApi)[] = ['getNativeBuiltinCatalog', 'getNativeBuiltinSourceDetail',
  'refreshNativeBuiltinBalance', 'runNativeBuiltinDiagnostic', 'checkNativeUserSourceV3', 'saveNativeUserSourceV3',
  'resumeNativeUserSourceSaveV3', 'listNativeUserSourcesV3', 'listNativeBuiltinReadiness', 'resumeNativeBuiltinSource',
  'validateNativeBuiltinSource',
  'getAiAccountSummary', 'listAiUsage', 'getAiUsageDetail', 'listRechargeTiers', 'listRechargeCoupons',
  'createRechargeOrder', 'getActiveRechargeOrder', 'getRechargeOrder', 'cancelRechargeOrder', 'getReferralSummary',
  'listReferralRecords', 'checkNativeUserSource', 'saveNativeUserSource', 'resumeNativeUserSourceSave',
  'listNativeUserSources', 'pingNativeUserModel', 'testNativeUserModel', 'saveNativeUserModel',
  'resumeNativeUserModelSave', 'listNativeUserModelRegistrations', 'getNativeUserModels', 'addNativeUserModel',
  'updateNativeUserModel', 'deleteNativeUserModel', 'reorderNativeUserModels', 'listNativeConnectionUi',
  'getNativeToolUserApiUsage']
/** Read the already injected account preload.
 * @returns Current desktop preload, or undefined outside its supported environment. */
export function accountHost(): AccountHost | undefined {
  const host=Reflect.get(window,'studybuddy')
  return typeof host==='object'&&host!==null?host as AccountHost:undefined
}
/** Project only the formally declared public business operations.
 * @param host - Fixed desktop preload.
 * @returns Public method adapter whose unavailable calls reject explicitly. */
export function businessApi(host: AccountHost | undefined): StudyBuddyBusinessApi {
  const entries = methods.map(method => [method, (...args:
  BusinessOperationMap[typeof method]['args']) => host?.business ? host.business.invoke(method, args) :
    Promise.reject(new Error('BUSINESS_UNAVAILABLE'))])
  // Every original method has its corresponding fixed invoke call.
  return Object.fromEntries(entries) as StudyBuddyBusinessApi
}
