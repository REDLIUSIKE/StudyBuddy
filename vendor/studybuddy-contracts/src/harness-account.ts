/** Fixed account capabilities shared by the private desktop carrier and account plugin. */
import type { AiAccountSummary, AiUsagePage, AiUsageDetail } from './ai-account.js';
import type { RechargeTier, RechargeCouponPage, RechargeOrderView, ReferralSummaryView, ReferralRecordPage } from './referral-recharge.js';
import type { NativeUserSourceDraftV2, NativeUserSourceCheckV2, NativeUserSourceSaveRequestV2, NativeUserSourceSaveResultV2, NativeUserSourceViewV2 } from './native-user-sources.js';
import type { NativeUserModelDraftV1, NativeUserModelProbeResultV1, NativeUserModelSaveRequestV1, NativeUserModelSaveResultV1 } from './native-user-models.js';
import type { ModelConfig, NativeModelCreateInput, NativeModelUpdateInput, NativeDraftPing, NativeModelRegistrationView } from './native-model-management.js';
import type { NativeToolId } from './native-tools.js';
import type { NativeToolUsageCursorV2, NativeToolUsagePageV2 } from './native-tool-connection-v2.js';
import type { NativeToolUsagePageV3 } from './native-source-grants-v3.js';
import type { NativeConnectionUiView } from './native-source-ui-v3.js';
import type { NativeBuiltinReadinessV1, NativeBuiltinSourceDetailV1, NativeBuiltinBalanceReceiptV1, NativeBuiltinValidationRequestV1, NativeBuiltinValidationResultV1 } from './native-builtin-consumer-v1.js';
import type { NativeUserSourcePrivateApiV3, NativeBuiltinPublicCatalogV1 } from './native-user-source-v3.js';

export type OwnedScope = Readonly<{accountId:string;generation:number}>;
export type EmbeddedLease = Readonly<{lease:string;partition:string;entryUrl:string;scope:OwnedScope}>;
export type EmbeddedTheme = Readonly<{mode:'light'|'dark';variables:Readonly<Record<string,string>>}>;
export interface CloudAccountApi {
  getAiAccountSummary():Promise<AiAccountSummary>;
  listAiUsage(page?:number,pageSize?:number):Promise<AiUsagePage>;
  getAiUsageDetail(usageId:string):Promise<AiUsageDetail>;
  listRechargeTiers():Promise<RechargeTier[]>;
  listRechargeCoupons(page?:number):Promise<RechargeCouponPage>;
  createRechargeOrder(tierCode:RechargeTier['tierCode'],couponIds:string[],idempotencyKey:string):Promise<RechargeOrderView>;
  getActiveRechargeOrder():Promise<RechargeOrderView|null>;
  getRechargeOrder(orderId:string):Promise<RechargeOrderView>;
  cancelRechargeOrder(orderId:string):Promise<RechargeOrderView>;
  getReferralSummary():Promise<ReferralSummaryView>;
  listReferralRecords(page?:number):Promise<ReferralRecordPage>;
}
export interface NativeAccountApi extends NativeUserSourcePrivateApiV3 {
  getNativeBuiltinCatalog():Promise<NativeBuiltinPublicCatalogV1>;
  getNativeBuiltinSourceDetail(localRef:string):Promise<NativeBuiltinSourceDetailV1>;
  refreshNativeBuiltinBalance(localRef:string):Promise<NativeBuiltinBalanceReceiptV1>;
  runNativeBuiltinDiagnostic(request:NativeBuiltinValidationRequestV1):Promise<NativeBuiltinValidationResultV1>;
  listNativeBuiltinReadiness():Promise<readonly NativeBuiltinReadinessV1[]>;
  resumeNativeBuiltinSource(operationId:string):Promise<NativeBuiltinReadinessV1>;
  validateNativeBuiltinSource(operationId:string):Promise<NativeBuiltinReadinessV1>;
  checkNativeUserSource(draft:NativeUserSourceDraftV2):Promise<NativeUserSourceCheckV2>;
  saveNativeUserSource(request:NativeUserSourceSaveRequestV2):Promise<NativeUserSourceSaveResultV2>;
  resumeNativeUserSourceSave(operationId:string):Promise<NativeUserSourceSaveResultV2>;
  listNativeUserSources():Promise<NativeUserSourceViewV2[]>;
  pingNativeUserModel(baseUrl:string,anthropicUrl:string|null):Promise<NativeDraftPing>;
  testNativeUserModel(draft:NativeUserModelDraftV1,prompt?:string):Promise<NativeUserModelProbeResultV1>;
  saveNativeUserModel(request:NativeUserModelSaveRequestV1):Promise<NativeUserModelSaveResultV1>;
  resumeNativeUserModelSave(operationId:string):Promise<NativeUserModelSaveResultV1>;
  listNativeUserModelRegistrations():Promise<NativeModelRegistrationView[]>;
  getNativeUserModels():Promise<ModelConfig[]>;
  addNativeUserModel(input:NativeModelCreateInput):Promise<ModelConfig>;
  updateNativeUserModel(id:string,input:NativeModelUpdateInput):Promise<ModelConfig|null>;
  deleteNativeUserModel(id:string):Promise<boolean>;
  reorderNativeUserModels(ids:string[]):Promise<boolean>;
  listNativeConnectionUi():Promise<NativeConnectionUiView[]>;
  getNativeToolUserApiUsage(toolId:NativeToolId,cursor:NativeToolUsageCursorV2,limit:number):Promise<NativeToolUsagePageV2|NativeToolUsagePageV3>;
}
export interface StudyBuddyBusinessApi extends CloudAccountApi,NativeAccountApi {}
export type HarnessOperations<T> = {[K in keyof T]:T[K] extends (...args:infer A)=>infer R ? Readonly<{args:A;result:Awaited<R>}>:never};
export type BusinessOperationMap=HarnessOperations<StudyBuddyBusinessApi>;
export type NativeOperationMap=HarnessOperations<NativeAccountApi>;
