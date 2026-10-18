/** Wire validation reuses the existing StudyBuddy parsers; no model or price fallback. */
import * as contracts from '@studybuddy/contracts'
import type { BusinessOperationMap } from '@studybuddy/contracts'

export function parseBusinessResult<K extends keyof BusinessOperationMap>(method: K, value: unknown): BusinessOperationMap[K]['result'] {
  let result:unknown
  switch (method) {
    case 'getNativeBuiltinCatalog': result = contracts.parseNativeBuiltinPublicCatalogV1(value); break
    case 'getNativeBuiltinSourceDetail': result = contracts.parseNativeBuiltinSourceDetailV1(value); break
    case 'refreshNativeBuiltinBalance': result = contracts.parseNativeBuiltinBalanceReceiptV1(value); break
    case 'runNativeBuiltinDiagnostic': result = contracts.parseNativeBuiltinValidationResultV1(value); break
    case 'checkNativeUserSourceV3': result = contracts.parseNativeUserSourceCheckV3(value); break
    case 'saveNativeUserSourceV3': case 'resumeNativeUserSourceSaveV3': result = contracts.parseNativeUserSourceSaveResultV3(value); break
    case 'listNativeUserSourcesV3': result = contracts.parseNativeUserSourcesV3(value); break
    case 'listNativeBuiltinReadiness': if (!Array.isArray(value)) throw new TypeError('BUILTIN_READINESS_INVALID')
      result = value.map(contracts.parseNativeBuiltinReadinessV1); break
    case 'resumeNativeBuiltinSource': case 'validateNativeBuiltinSource': result = contracts.parseNativeBuiltinReadinessV1(value); break
    case 'getAiAccountSummary': result = contracts.parseAiAccountSummary(value); break
    case 'listAiUsage': result = contracts.parseAiUsagePage(value); break
    case 'getAiUsageDetail': result = contracts.parseAiUsageDetail(value); break
    case 'listRechargeTiers': result = contracts.parseRechargeTierList(value, 2); break
    case 'listRechargeCoupons': result = contracts.parseRechargeCouponPage(value); break
    case 'createRechargeOrder': case 'getRechargeOrder': case 'cancelRechargeOrder': result = contracts.parseRechargeOrderView(value); break
    case 'getActiveRechargeOrder': result = value === null ? null : contracts.parseRechargeOrderView(value); break
    case 'getReferralSummary': result = contracts.parseReferralSummaryView(value); break
    case 'listReferralRecords': result = contracts.parseReferralRecordPage(value); break
    case 'checkNativeUserSource': result = contracts.parseNativeUserSourceCheckV2(value); break
    case 'saveNativeUserSource': case 'resumeNativeUserSourceSave': result = contracts.parseNativeUserSourceSaveResultV2(value); break
    case 'listNativeUserSources': result = contracts.parseNativeUserSourcesV2(value); break
    case 'testNativeUserModel': result = contracts.parseNativeUserModelProbeResultV1(value); break
    case 'saveNativeUserModel': case 'resumeNativeUserModelSave': result = contracts.parseNativeUserModelSaveResultV1(value); break
    case 'listNativeConnectionUi': if (!Array.isArray(value)) throw new TypeError('NATIVE_CONNECTION_INVALID')
      result = value.map(row => row?.schemaVersion === 3 ? contracts.parseNativeUserSourceConnectionViewV3(row) : connectionV2(row)); break
    case 'getNativeToolUserApiUsage': result = typeof value === 'object' && value !== null && 'schemaVersion' in value &&
      value.schemaVersion === 3 ? contracts.parseNativeToolUsagePageV3(value) : contracts.parseNativeToolUsagePageV2(value); break
    case 'getNativeUserModels': if (!Array.isArray(value)) throw new TypeError('NATIVE_MODELS_INVALID'); result = value.map(model); break
    case 'addNativeUserModel': result = model(value); break
    case 'updateNativeUserModel': result = value === null ? null : model(value); break
    case 'deleteNativeUserModel': case 'reorderNativeUserModels':
      if (typeof value !== 'boolean') throw new TypeError('NATIVE_MODELS_INVALID'); result = value; break
    case 'pingNativeUserModel': {
      if (!value || typeof value !== 'object' || !('success' in value) || typeof value.success !== 'boolean' ||
        !('latencyMs' in value) || !Number.isSafeInteger(value.latencyMs) || !('url' in value) || typeof value.url !== 'string' ||
        !('errorCode' in value) || (value.errorCode !== null &&
          typeof value.errorCode !== 'string')) throw new TypeError('NATIVE_PING_INVALID')
      result = value; break
    }
    case 'listNativeUserModelRegistrations': {
      if (!Array.isArray(value)) throw new TypeError('NATIVE_REGISTRATIONS_INVALID')
      result = value.map((row) => {
        if (!row || typeof row !== 'object' || typeof row.localRef !== 'string' || !['unregistered',
          'pending', 'active'].includes(row.state)) throw new TypeError('NATIVE_REGISTRATIONS_INVALID'); return {
          ...row,
          registration: row.registration === null ? null : contracts.parseNativeUserModelRegistrationV1(row.registration),
        }
      }); break
    }
    default: throw new TypeError('BUSINESS_OPERATION_DENIED')
  }
  // A closed method selects its matching parser above; this assertion joins the mapped return type.
  return result as BusinessOperationMap[K]['result']
}
function connectionV2(value:unknown):contracts.NativeToolConnectionViewV2 {
  if(!value||typeof value!=='object')throw new TypeError('NATIVE_CONNECTION_INVALID')
  const row=value as Record<string,unknown>
  if(row.schemaVersion!==2||typeof row.toolId!=='string'||typeof row.state!=='string'||!['available','pending',
    'connected','conflict','unavailable','revocation_pending'].includes(row.state)
    ||row.protocol!==null&&!['openai_responses','openai_chat_completions','anthropic_messages'].includes(String(row.protocol))
    ||row.fundingSource!==null&&row.fundingSource!=='platform'&&row.fundingSource!=='user_api'
    ||['appliedLogicalModelId','appliedExactModelId','errorCode'].some(key=>row[key]!==null&&
      typeof row[key]!=='string'))throw new TypeError('NATIVE_CONNECTION_INVALID')
  return { schemaVersion:2,toolId:contracts.getNativeToolDefinition(row.toolId).id,state:
    row.state as contracts.NativeToolConnectionViewV2['state'],protocol:
      row.protocol as contracts.NativeToolConnectionViewV2['protocol'],fundingSource:row.fundingSource,
  appliedLogicalModelId:row.appliedLogicalModelId as string|null,appliedExactModelId:
          row.appliedExactModelId as string|null,errorCode:row.errorCode as string|null,authority:
            row.authority===null?null:contracts.parseNativeToolAuthorityV2(row.authority) }
}
function model(value:unknown):contracts.ModelConfig {
  if(!value||typeof value!=='object'||!('internalId'in value)||typeof value.internalId!=='string'||!('name'in value)||
    typeof value.name!=='string'||!('baseUrl'in value)||typeof value.baseUrl!=='string'||!('apiKey'in value)||
      typeof value.apiKey!=='string')throw new TypeError('NATIVE_MODELS_INVALID')
  const result=value as contracts.ModelConfig&{ type?:contracts.ModelConfig['modelType'] }
  const { type,...row }=result
  return type===undefined?row:{ ...row,modelType:type }
}
