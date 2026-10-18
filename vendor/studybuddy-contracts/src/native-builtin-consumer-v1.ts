/** Built-in consumer authority is independent of every external ToolId.
 * Codecs check syntax and internal consistency, never mint or refresh authority.
 * Private material must stay on native/Main/Host channels, outside renderer DTOs. */
import type {NativeProtocol} from './native-tools.js';
import type {OwnedScope} from './harness-account.js';

export const NATIVE_BUILTIN_CONSUMER_ID='studybuddy_harness' as const;
export const NATIVE_BUILTIN_CONSUMER_VERSION='1' as const;
export const NATIVE_BUILTIN_REQUEST_TICKET_HEADER='X-StudyBuddy-Request-Ticket' as const;
export const NATIVE_BUILTIN_GATEWAY_PROVIDERS=['deepseek','kimi','hunyuan','zhipu','minimax','mimo'] as const;
export type NativeBuiltinGatewayProviderId=typeof NATIVE_BUILTIN_GATEWAY_PROVIDERS[number];
export type NativeBuiltinProviderId=NativeBuiltinGatewayProviderId|'openai'|'anthropic';
export type NativeBuiltinFundingSource='user_api'|'platform';
export type NativeBuiltinModelAuthorityV1=Readonly<{
  logicalModelId:string;providerId:NativeBuiltinProviderId;exactModelId:string;displayName:string;
  protocol:NativeProtocol;contextWindow:number;maxOutputTokens:number|null;capabilityFlags:readonly string[];
  evidenceSha256:string;membershipRevision:string;capabilityRevision:string;adapterRevision:string;
  priceAuthorityRevision:string|null;availability:'available';
}>;
export type NativeBuiltinSourceV1=Readonly<{
  backendInstanceId:string;accountOwner:string;sourceId:string;localRef:string;
  providerId:NativeBuiltinGatewayProviderId;credentialReference:string;credentialRevision:string;baseUrl:string;
}>;
export type NativeBuiltinConsumerScopeV1=NativeBuiltinSourceV1&Readonly<{
  deviceId:string;protocol:NativeProtocol;consumerId:typeof NATIVE_BUILTIN_CONSUMER_ID;
  consumerVersion:typeof NATIVE_BUILTIN_CONSUMER_VERSION;fundingSource:NativeBuiltinFundingSource;
}>;
export type NativeBuiltinSourceGrantV1=Readonly<{
  schemaVersion:1;grantRevision:string;catalogRevision:string;scope:NativeBuiltinConsumerScopeV1;
  allowedModels:readonly NativeBuiltinModelAuthorityV1[];
}>;
export type NativeBuiltinBindingV1=Readonly<{
  schemaVersion:1;userId:number;tokenId:number;connectionId:string;operationId:string;
  grant:NativeBuiltinSourceGrantV1;policyRevision:string;tokenGroup:string;
  /** Personal Key directories use 0/0 for no expiry; old positive timestamps are history, not a Key lifetime. */
  pendingExpiresAt:number;authorityExpiresAt:number;state:'pending'|'active'|'revoked';hostCatalogVersion:string|null;
}>;
/** Server-only managed actor: client claims never substitute for account lookup. */
export type NativeBuiltinServiceActorV1=Readonly<{
  schemaVersion:1;userId:number;expectedUsername:string;expectedManagedMarker:string;
}>;
export type NativePrivateCredentialReceiptV1=Readonly<{
  schemaVersion:1;source:NativeBuiltinSourceV1;state:'synced'|'revoked';operationId:string;
}>;
export type NativeBuiltinRequestPurposeV1='chat'|'validation'|'diagnostic';
export type NativeBuiltinRequestReceiptV1=Readonly<{
  schemaVersion:1;operationId:string;requestId:string;purpose:NativeBuiltinRequestPurposeV1;
  requestTicket:string|null;expiresAt:number;state:'prepared'|'dispatch_started'|'terminal';
}>;
export type NativeBuiltinSelectionRefV1=Readonly<{
  routeId:string;sourceId:string;localRef:string;providerId:NativeBuiltinProviderId;exactModelId:string;
  protocol:NativeProtocol;connectionId:string;credentialRevision:string;grantRevision:string;
  fundingSource:NativeBuiltinFundingSource;
}>;
export type NativeBuiltinGatewayRouteV1=Readonly<{
  mode:'gateway';routeId:string;displayName:string;gatewayOrigin:string;apiKey:string;binding:NativeBuiltinBindingV1;
}>;
/** Local direct authority is issued by the owned native store. No domestic
 * Source/Binding/Token is created for these credentials. */
export type NativeBuiltinLocalGrantV1=Readonly<{
  schemaVersion:1;grantRevision:string;catalogRevision:string;accountOwner:string;deviceId:string;
  sourceId:string;localRef:string;connectionId:string;credentialRevision:string;protocol:NativeProtocol;
  authorityExpiresAt:number;allowedModels:readonly NativeBuiltinModelAuthorityV1[];
}>;
export type NativeBuiltinLocalDirectRouteV1=Readonly<{
  mode:'local_direct';routeId:string;displayName:string;baseUrl:string;apiKey:string;grant:NativeBuiltinLocalGrantV1;
}>;
export type NativeBuiltinPreparedRouteV1=NativeBuiltinGatewayRouteV1|NativeBuiltinLocalDirectRouteV1;
export type NativeBuiltinHostContextV1=Readonly<{scope:OwnedScope;hostGeneration:string}>;
export type NativeBuiltinCatalogApplyV1=Readonly<{
  schemaVersion:1;operationId:string;scope:OwnedScope;hostGeneration:string;
  catalogVersion:string;catalogDigest:string;routes:readonly NativeBuiltinPreparedRouteV1[];
}>;
export type NativeBuiltinCatalogAppliedV1=Readonly<{
  schemaVersion:1;operationId:string;scope:OwnedScope;hostGeneration:string;
  catalogVersion:string;catalogDigest:string;applied:readonly NativeBuiltinSelectionRefV1[];
}>;
export type NativeBuiltinPhaseV1='registered'|'credential_sync'|'grant_prepare'|'grant_apply'|'grant_confirm'|'validation'|'host_apply'|'ready';
export type NativeBuiltinReadinessV1=Readonly<{
  schemaVersion:1;operationId:string;localRef:string;sourceRevision:string;
  state:'pending'|'ready'|'failed'|'unsupported';phase:NativeBuiltinPhaseV1;
  catalogVersion:string|null;catalogDigest:string|null;hostApplied:NativeBuiltinCatalogAppliedV1|null;
  appliedModels:readonly NativeBuiltinSelectionRefV1[];errorCode:string|null;
}>;
export type NativeBuiltinPreparedSourceV1=Readonly<{
  schemaVersion:1;operationId:string;localRef:string;sourceRevision:string;routes:readonly NativeBuiltinPreparedRouteV1[];
}>;
export type NativeBuiltinRequestFreezeV1=Readonly<{
  schemaVersion:1;scope:OwnedScope;hostGeneration:string;catalogVersion:string;catalogDigest:string;
  selection:NativeBuiltinSelectionRefV1;authority:NativeBuiltinModelAuthorityV1;
  clientRequestId:string;sessionId:string|null;purpose:NativeBuiltinRequestPurposeV1;
}>;
export type NativeBuiltinFrozenRequestV1=Readonly<{
  schemaVersion:1;clientRequestId:string;selection:NativeBuiltinSelectionRefV1;authority:NativeBuiltinModelAuthorityV1;
  sessionId:string|null;purpose:NativeBuiltinRequestPurposeV1;requestReceipt:NativeBuiltinRequestReceiptV1|null;
}>;
/** Closed private capability map. These operations are not Renderer IPC. */
export interface NativeBuiltinPrivateApi {
  getNativeBuiltinCatalog():Promise<import('./native-user-source-v3.js').NativeBuiltinPublicCatalogV1>;
  getBuiltinSourceDetail(localRef:string):Promise<NativeBuiltinSourceDetailV1>;
  refreshBuiltinBalance(localRef:string):Promise<NativeBuiltinBalanceReceiptV1>;
  prepareBuiltinSource(operationId:string,hostContext:NativeBuiltinHostContextV1):Promise<NativeBuiltinReadinessV1>;
  resumeBuiltinSource(operationId:string,hostContext:NativeBuiltinHostContextV1):Promise<NativeBuiltinReadinessV1>;
  getBuiltinSourceMaterial(operationId:string,hostContext:NativeBuiltinHostContextV1):Promise<NativeBuiltinPreparedSourceV1>;
  acknowledgeBuiltinCatalog(ack:NativeBuiltinCatalogAppliedV1):Promise<NativeBuiltinReadinessV1>;
  listBuiltinReadiness(hostContext:NativeBuiltinHostContextV1):Promise<readonly NativeBuiltinReadinessV1[]>;
  revokeBuiltinSource(localRef:string):Promise<void>;
  prepareBuiltinKeyRequest(request:NativeBuiltinRequestFreezeV1):Promise<NativeBuiltinFrozenRequestV1>;
  acknowledgeBuiltinLocalValidation(proof:NativeBuiltinLocalValidationV1):Promise<NativeBuiltinReadinessV1>;
}
export type NativeBuiltinPrivateOperationMap={
  [K in keyof NativeBuiltinPrivateApi]:NativeBuiltinPrivateApi[K] extends (...args:infer A)=>Promise<infer R>?Readonly<{args:A;result:R}>:never;
};
/** Native authenticated business API bodies. Source ids and upstream actors
 * are loaded by the backend, never accepted from these clients. */
export type NativeBuiltinSourceSyncRequestV1=Readonly<{
  schemaVersion:1;operationId:string;localRef:string;localRevision:string;sourceRevision:string;inventoryRevision:string;
  providerId:NativeBuiltinGatewayProviderId;baseUrl:string;apiKey:string;expectedCredentialRevision:string|null;
  candidateModelIds:readonly string[];
}>;
export type NativeBuiltinSourceOperationV1=Readonly<{schemaVersion:1;operationId:string;localRef:string;sourceRevision:string}>;
export type NativeBuiltinConnectionOperationV1=NativeBuiltinSourceOperationV1&Readonly<{protocol:NativeProtocol}>;
/** One explicit owned model is admitted per consumer preparation. Inventory
 * candidateModelIds are discovery facts and cannot imply paid validation. */
export type NativeBuiltinPrepareRequestV1=NativeBuiltinConnectionOperationV1&Readonly<{exactModelId:string}>;
export type NativeBuiltinConfirmRequestV1=NativeBuiltinConnectionOperationV1&Readonly<{hostApplied:NativeBuiltinCatalogAppliedV1}>;
export type NativeBuiltinRequestPrepareV1=NativeBuiltinConnectionOperationV1&Readonly<{
  clientRequestId:string;exactModelId:string;purpose:NativeBuiltinRequestPurposeV1;sessionId:string|null;
}>;
export type NativeBuiltinUsageCursorV1=Readonly<{createdAt:number;requestId:string}>;
export type NativeBuiltinTerminalUsageV1=Readonly<{
  inputTokens:number;outputTokens:number;inputTotalTokens:number|null;cacheReadTokens:number|null;
  cacheWriteTokens:number|null;reasoningTokens:number|null;cacheWrite5mTokens:number|null;cacheWrite1hTokens:number|null;
}>;
export type NativeBuiltinUsageRecordV1=Readonly<{
  schemaVersion:1;projectionVersion:1;requestId:string;operationId:string;purpose:NativeBuiltinRequestPurposeV1;
  scope:NativeBuiltinConsumerScopeV1;catalogRevision:string;grantRevision:string;connectionId:string;policyRevision:string;
  exactModelId:string;membershipRevision:string;capabilityRevision:string;adapterRevision:string;priceAuthorityRevision:string|null;
  providerResponseId:string;returnedModel:string;outcome:'completed'|'incomplete'|'refused'|'failed'|'contract_invalid'|'unknown';
  usage:NativeBuiltinTerminalUsageV1|null;createdAt:number;
}>;
export type NativeBuiltinUsagePageV1=Readonly<{records:readonly NativeBuiltinUsageRecordV1[];nextCursor:NativeBuiltinUsageCursorV1|null}>;
export type NativeBuiltinSourceBalanceV1=Readonly<{
  state:'success'|'stale'|'error'|'unsupported';checkedAt:number;lastSuccessAt:number|null;
  currencies:readonly Readonly<{currency:string;available:string;cash:string|null;grant:string|null}>[];
  plan:null;classification:'account_balance'|'unknown';errorCode:string|null;officialUrl:string;
}>;
export type NativeBuiltinBalanceReceiptV1=Readonly<{
  schemaVersion:1;source:NativeBuiltinSourceV1;operationId:string;balance:NativeBuiltinSourceBalanceV1;
}>;
export type NativeBuiltinCatalogPublishV1=Readonly<{schemaVersion:1;readiness:NativeBuiltinReadinessV1}>;
export type NativeBuiltinValidationRequestV1=Readonly<{
  schemaVersion:1;operationId:string;selection:NativeBuiltinSelectionRefV1;clientRequestId:string;
  purpose:'validation'|'diagnostic';prompt:string;
}>;
export type NativeBuiltinLocalValidationV1=Readonly<{
  schemaVersion:1;operationId:string;clientRequestId:string;scope:OwnedScope;hostGeneration:string;
  catalogVersion:string;catalogDigest:string;selection:NativeBuiltinSelectionRefV1;
  providerResponseId:string;returnedModel:string;outcome:'completed'|'incomplete'|'refused'|'failed'|'contract_invalid'|'unknown';
  usageOrigin:'provider_terminal';usage:NativeBuiltinTerminalUsageV1|null;
}>;
export type NativeBuiltinValidationResultV1=Readonly<{
  schemaVersion:1;operationId:string;clientRequestId:string;selection:NativeBuiltinSelectionRefV1;
  purpose:'validation'|'diagnostic';providerResponseId:string|null;returnedModel:string|null;
  outcome:NativeBuiltinUsageRecordV1['outcome'];usageOrigin:'provider_terminal'|'unknown';usage:NativeBuiltinTerminalUsageV1|null;
  firstVisibleTextMs:number|null;dispatchToTerminalMs:number|null;errorCode:string|null;
}>;
export type NativeBuiltinSourceDetailV1=Readonly<{
  schemaVersion:1;localRef:string;readiness:NativeBuiltinReadinessV1|null;
  balance:NativeBuiltinBalanceReceiptV1|null;lastDiagnostics:readonly NativeBuiltinValidationResultV1[];
}>;

const PROTOCOLS:readonly NativeProtocol[]=['openai_responses','openai_chat_completions','anthropic_messages'];
const PHASES:readonly NativeBuiltinPhaseV1[]=['registered','credential_sync','grant_prepare','grant_apply','grant_confirm','validation','host_apply','ready'];
const CAPABILITIES=['thinking','always_thinking','image_in','video_in','audio_in','tool_use','dynamically_loaded_tools'];
const MODEL_KEYS=['logicalModelId','providerId','exactModelId','displayName','protocol','contextWindow','maxOutputTokens','capabilityFlags','evidenceSha256','membershipRevision','capabilityRevision','adapterRevision','priceAuthorityRevision','availability'];
const SOURCE_KEYS=['backendInstanceId','accountOwner','sourceId','localRef','providerId','credentialReference','credentialRevision','baseUrl'];
const SCOPE_KEYS=[...SOURCE_KEYS,'deviceId','protocol','consumerId','consumerVersion','fundingSource'];
const REF_KEYS=['routeId','sourceId','localRef','providerId','exactModelId','protocol','connectionId','credentialRevision','grantRevision','fundingSource'];
function invalid():never{throw new TypeError('NATIVE_BUILTIN_CONSUMER_V1_INVALID');}
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(value===null||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)invalid();
  const descriptors=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(value);
  if(actual.length!==keys.length||actual.some(k=>typeof k!=='string'||!keys.includes(k)||!Object.hasOwn(descriptors[k]!,'value')))invalid();
  return value as Record<string,unknown>;
}
function text(value:unknown,max=128):string{
  if(typeof value!=='string'||value.length===0||value.length>max||value.trim()!==value||/\p{Cc}/u.test(value))invalid();return value;
}
function id(value:unknown):string{const result=text(value);if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(result))invalid();return result;}
function uuid(value:unknown):string{const result=text(value);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result))invalid();return result;}
function digest(value:unknown):string{const result=text(value);if(!/^[0-9a-f]{64}$/.test(result))invalid();return result;}
function positive(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)invalid();return value;}
function count(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)invalid();return value;}
function nullable<T>(value:unknown,parse:(v:unknown)=>T):T|null{return value===null?null:parse(value);}
function protocol(value:unknown):NativeProtocol{if(!PROTOCOLS.includes(value as NativeProtocol))invalid();return value as NativeProtocol;}
function provider(value:unknown,local=false):NativeBuiltinProviderId{
  if(!NATIVE_BUILTIN_GATEWAY_PROVIDERS.includes(value as NativeBuiltinGatewayProviderId)&&!(local&&(value==='openai'||value==='anthropic')))invalid();
  return value as NativeBuiltinProviderId;
}
function funding(value:unknown):NativeBuiltinFundingSource{if(value!=='user_api'&&value!=='platform')invalid();return value;}
/** HTTPS syntax only. Exact provider endpoint authority is checked server-side. */
function endpoint(value:unknown,originOnly=false):string{
  const result=text(value,512);
  type Parsed={origin:string;hostname:string;protocol:string;pathname:string;username:string;password:string;search:string;hash:string;port:string};
  const URLClass=(globalThis as typeof globalThis&{URL:new(value:string)=>Parsed}).URL;
  let url:Parsed;try{url=new URLClass(result);}catch{return invalid();}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port||!url.hostname.includes('.')
    ||/^\d+(\.\d+){3}$/.test(url.hostname)||url.hostname.includes(':')||/(^|\.)(localhost|local|internal)$/.test(url.hostname)
    ||result.includes('%')||result.includes('\\')||result.endsWith('/')||originOnly&&result!==url.origin
    ||result!==url.origin+ (url.pathname==='/'?'':url.pathname))invalid();return result;
}
/** A documentation link is not a dispatch endpoint. Preserve official anchors
 * and trailing slashes while still rejecting credentials and unsafe schemes. */
function officialLink(value:unknown):string{
  const result=text(value,2048);
  type Parsed={protocol:string;hostname:string;username:string;password:string;port:string};
  const URLClass=(globalThis as typeof globalThis&{URL:new(value:string)=>Parsed}).URL;
  let url:Parsed;try{url=new URLClass(result);}catch{return invalid();}
  if(!result.startsWith('https://')||url.protocol!=='https:'||url.username||url.password||url.port
    ||!url.hostname.includes('.')||/^\d+(\.\d+){3}$/.test(url.hostname)||url.hostname.includes(':')
    ||/(^|\.)(localhost|local|internal)$/.test(url.hostname)||result.includes('\\'))invalid();return result;
}
function list(value:unknown,max=256,allowEmpty=false):unknown[]{
  if(!Array.isArray(value)||value.length>max||!allowEmpty&&value.length===0)invalid();
  // Reject sparse arrays and accessors before invoking element codecs.
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(value).length!==value.length+1)invalid();
  for(let i=0;i<value.length;i++){const d=descriptors[String(i)];if(d===undefined||!Object.hasOwn(d,'value'))invalid();}
  return value;
}
function ownedScope(value:unknown):OwnedScope{
  const r=record(value,['accountId','generation']);
  if(typeof r.generation!=='number'||!Number.isSafeInteger(r.generation)||r.generation<0)invalid();
  return {accountId:id(r.accountId),generation:r.generation};
}
export function parseNativeBuiltinModelAuthorityV1(value:unknown):NativeBuiltinModelAuthorityV1{
  const r=record(value,MODEL_KEYS);if(r.availability!=='available')invalid();
  const contextWindow=positive(r.contextWindow),maxOutputTokens=nullable(r.maxOutputTokens,positive);
  if(maxOutputTokens!==null&&maxOutputTokens>contextWindow)invalid();
  const capabilityFlags=list(r.capabilityFlags,32,true).map(id);
  if(new Set(capabilityFlags).size!==capabilityFlags.length||capabilityFlags.some(f=>!CAPABILITIES.includes(f)))invalid();
  return {logicalModelId:id(r.logicalModelId),providerId:provider(r.providerId,true),exactModelId:id(r.exactModelId),displayName:text(r.displayName,256),
    protocol:protocol(r.protocol),contextWindow,maxOutputTokens,capabilityFlags,evidenceSha256:digest(r.evidenceSha256),
    membershipRevision:id(r.membershipRevision),capabilityRevision:id(r.capabilityRevision),adapterRevision:id(r.adapterRevision),
    priceAuthorityRevision:nullable(r.priceAuthorityRevision,id),availability:'available'};
}
export function parseNativeBuiltinSourceV1(value:unknown):NativeBuiltinSourceV1{
  const r=record(value,SOURCE_KEYS);
  return {backendInstanceId:id(r.backendInstanceId),accountOwner:uuid(r.accountOwner),sourceId:uuid(r.sourceId),localRef:id(r.localRef),
    providerId:provider(r.providerId) as NativeBuiltinGatewayProviderId,credentialReference:id(r.credentialReference),credentialRevision:id(r.credentialRevision),baseUrl:endpoint(r.baseUrl)};
}
export function parseNativeBuiltinConsumerScopeV1(value:unknown):NativeBuiltinConsumerScopeV1{
  const r=record(value,SCOPE_KEYS),source=parseNativeBuiltinSourceV1(Object.fromEntries(SOURCE_KEYS.map(k=>[k,r[k]])));
  if(r.consumerId!==NATIVE_BUILTIN_CONSUMER_ID||r.consumerVersion!==NATIVE_BUILTIN_CONSUMER_VERSION)invalid();
  return {...source,deviceId:uuid(r.deviceId),protocol:protocol(r.protocol),consumerId:NATIVE_BUILTIN_CONSUMER_ID,
    consumerVersion:NATIVE_BUILTIN_CONSUMER_VERSION,fundingSource:funding(r.fundingSource)};
}
function exactModels(value:unknown,providerId:NativeBuiltinProviderId,wire:NativeProtocol,sourceFunding:NativeBuiltinFundingSource):NativeBuiltinModelAuthorityV1[]{
  const result=list(value,64).map(parseNativeBuiltinModelAuthorityV1),exact=new Set<string>(),logical=new Set<string>();
  for(const m of result){if(m.providerId!==providerId||m.protocol!==wire||exact.has(m.exactModelId)||logical.has(m.logicalModelId)
    ||sourceFunding==='platform'&&m.priceAuthorityRevision===null)invalid();exact.add(m.exactModelId);logical.add(m.logicalModelId);}
  return result;
}
export function parseNativeBuiltinSourceGrantV1(value:unknown):NativeBuiltinSourceGrantV1{
  const r=record(value,['schemaVersion','grantRevision','catalogRevision','scope','allowedModels']);if(r.schemaVersion!==1)invalid();
  const scope=parseNativeBuiltinConsumerScopeV1(r.scope);
  return {schemaVersion:1,grantRevision:digest(r.grantRevision),catalogRevision:id(r.catalogRevision),scope,
    allowedModels:exactModels(r.allowedModels,scope.providerId,scope.protocol,scope.fundingSource)};
}
export function parseNativeBuiltinBindingV1(value:unknown):NativeBuiltinBindingV1{
  const r=record(value,['schemaVersion','userId','tokenId','connectionId','operationId','grant','policyRevision','tokenGroup','pendingExpiresAt','authorityExpiresAt','state','hostCatalogVersion']);
  if(r.schemaVersion!==1||!['pending','active','revoked'].includes(r.state as string))invalid();
  const grant=parseNativeBuiltinSourceGrantV1(r.grant);
  const permanent=grant.scope.fundingSource==='user_api'&&r.pendingExpiresAt===0&&r.authorityExpiresAt===0;
  const pendingExpiresAt=permanent?0:positive(r.pendingExpiresAt),authorityExpiresAt=permanent?0:positive(r.authorityExpiresAt);
  if(!permanent&&authorityExpiresAt<=pendingExpiresAt)invalid();
  return {schemaVersion:1,userId:positive(r.userId),tokenId:positive(r.tokenId),connectionId:uuid(r.connectionId),operationId:uuid(r.operationId),
    grant,policyRevision:id(r.policyRevision),tokenGroup:id(r.tokenGroup),pendingExpiresAt,authorityExpiresAt,
    state:r.state as NativeBuiltinBindingV1['state'],hostCatalogVersion:nullable(r.hostCatalogVersion,id)};
}
export function parseNativePrivateCredentialReceiptV1(value:unknown):NativePrivateCredentialReceiptV1{
  const r=record(value,['schemaVersion','source','state','operationId']);if(r.schemaVersion!==1||r.state!=='synced'&&r.state!=='revoked')invalid();
  return {schemaVersion:1,source:parseNativeBuiltinSourceV1(r.source),state:r.state,operationId:uuid(r.operationId)};
}
export function parseNativeBuiltinRequestReceiptV1(value:unknown):NativeBuiltinRequestReceiptV1{
  const r=record(value,['schemaVersion','operationId','requestId','purpose','requestTicket','expiresAt','state']);
  if(r.schemaVersion!==1||!['chat','validation','diagnostic'].includes(r.purpose as string)||!['prepared','dispatch_started','terminal'].includes(r.state as string))invalid();
  const requestTicket=nullable(r.requestTicket,value=>text(value,512));
  if(r.state!=='prepared'&&requestTicket!==null)invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),requestId:id(r.requestId),purpose:r.purpose as NativeBuiltinRequestPurposeV1,
    requestTicket,expiresAt:positive(r.expiresAt),state:r.state as NativeBuiltinRequestReceiptV1['state']};
}
export function parseNativeBuiltinSelectionRefV1(value:unknown):NativeBuiltinSelectionRefV1{
  const r=record(value,REF_KEYS);
  return {routeId:id(r.routeId),sourceId:uuid(r.sourceId),localRef:id(r.localRef),providerId:provider(r.providerId,true),exactModelId:id(r.exactModelId),
    protocol:protocol(r.protocol),connectionId:uuid(r.connectionId),credentialRevision:id(r.credentialRevision),grantRevision:digest(r.grantRevision),fundingSource:funding(r.fundingSource)};
}
function refs(value:unknown):NativeBuiltinSelectionRefV1[]{
  const result=list(value,1024,true).map(parseNativeBuiltinSelectionRefV1),seen=new Set<string>();
  for(const r of result){const key=JSON.stringify([r.routeId,r.exactModelId]);if(seen.has(key))invalid();seen.add(key);}return result;
}
export function parseNativeBuiltinLocalGrantV1(value:unknown):NativeBuiltinLocalGrantV1{
  const r=record(value,['schemaVersion','grantRevision','catalogRevision','accountOwner','deviceId','sourceId','localRef','connectionId','credentialRevision','protocol','authorityExpiresAt','allowedModels']);
  if(r.schemaVersion!==1)invalid();const wire=protocol(r.protocol),models=list(r.allowedModels,64).map(parseNativeBuiltinModelAuthorityV1),first=models[0]!;
  if(first.providerId!=='openai'&&first.providerId!=='anthropic'||models.some(m=>m.priceAuthorityRevision!==null))invalid();
  return {schemaVersion:1,grantRevision:digest(r.grantRevision),catalogRevision:id(r.catalogRevision),accountOwner:uuid(r.accountOwner),deviceId:uuid(r.deviceId),
    sourceId:uuid(r.sourceId),localRef:id(r.localRef),connectionId:uuid(r.connectionId),credentialRevision:id(r.credentialRevision),protocol:wire,authorityExpiresAt:count(r.authorityExpiresAt),
    allowedModels:exactModels(models,first.providerId,wire,'user_api')};
}
export function parseNativeBuiltinPreparedRouteV1(value:unknown):NativeBuiltinPreparedRouteV1{
  if(value===null||typeof value!=='object')invalid();const descriptors=Object.getOwnPropertyDescriptors(value);
  if(!Object.hasOwn(descriptors.mode??{},'value'))invalid();
  if(descriptors.mode!.value==='gateway'){
    const r=record(value,['mode','routeId','displayName','gatewayOrigin','apiKey','binding']),binding=parseNativeBuiltinBindingV1(r.binding);
    if(binding.state!=='active')invalid();
    return {mode:'gateway',routeId:id(r.routeId),displayName:text(r.displayName,256),gatewayOrigin:endpoint(r.gatewayOrigin,true),apiKey:text(r.apiKey,4096),binding};
  }
  const r=record(value,['mode','routeId','displayName','baseUrl','apiKey','grant']);if(r.mode!=='local_direct')invalid();
  return {mode:'local_direct',routeId:id(r.routeId),displayName:text(r.displayName,256),baseUrl:endpoint(r.baseUrl),apiKey:text(r.apiKey,4096),grant:parseNativeBuiltinLocalGrantV1(r.grant)};
}
export function parseNativeBuiltinHostContextV1(value:unknown):NativeBuiltinHostContextV1{
  const r=record(value,['scope','hostGeneration']);return {scope:ownedScope(r.scope),hostGeneration:uuid(r.hostGeneration)};
}
export function parseNativeBuiltinCatalogApplyV1(value:unknown):NativeBuiltinCatalogApplyV1{
  const r=record(value,['schemaVersion','operationId','scope','hostGeneration','catalogVersion','catalogDigest','routes']);if(r.schemaVersion!==1)invalid();
  const scope=ownedScope(r.scope),routes=list(r.routes,3).map(parseNativeBuiltinPreparedRouteV1),seen=new Set<string>(),sources=new Set<string>();
  for(const route of routes){const owner=route.mode==='gateway'?route.binding.grant.scope.accountOwner:route.grant.accountOwner;
    const localRef=route.mode==='gateway'?route.binding.grant.scope.localRef:route.grant.localRef;
    if(owner!==scope.accountId||seen.has(route.routeId))invalid();seen.add(route.routeId);sources.add(localRef);}
  if(sources.size!==1)invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),scope,hostGeneration:uuid(r.hostGeneration),catalogVersion:id(r.catalogVersion),catalogDigest:digest(r.catalogDigest),routes};
}
export function parseNativeBuiltinCatalogAppliedV1(value:unknown):NativeBuiltinCatalogAppliedV1{
  const r=record(value,['schemaVersion','operationId','scope','hostGeneration','catalogVersion','catalogDigest','applied']);if(r.schemaVersion!==1)invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),scope:ownedScope(r.scope),hostGeneration:uuid(r.hostGeneration),catalogVersion:id(r.catalogVersion),catalogDigest:digest(r.catalogDigest),applied:refs(r.applied)};
}
export function parseNativeBuiltinReadinessV1(value:unknown):NativeBuiltinReadinessV1{
  const r=record(value,['schemaVersion','operationId','localRef','sourceRevision','state','phase','catalogVersion','catalogDigest','hostApplied','appliedModels','errorCode']);
  if(r.schemaVersion!==1||!['pending','ready','failed','unsupported'].includes(r.state as string)||!PHASES.includes(r.phase as NativeBuiltinPhaseV1))invalid();
  const operationId=uuid(r.operationId),localRef=id(r.localRef),appliedModels=refs(r.appliedModels),hostApplied=nullable(r.hostApplied,parseNativeBuiltinCatalogAppliedV1);
  const catalogVersion=nullable(r.catalogVersion,id),catalogDigest=nullable(r.catalogDigest,digest),errorCode=nullable(r.errorCode,id);
  if((catalogVersion===null)!==(catalogDigest===null)||appliedModels.some(m=>m.localRef!==localRef)
    ||(r.state==='failed'||r.state==='unsupported')&&errorCode===null||r.state==='pending'&&r.phase==='ready')invalid();
  if(r.state==='ready'){
    if(r.phase!=='ready'||errorCode!==null||appliedModels.length===0||hostApplied===null||hostApplied.operationId!==operationId
      ||hostApplied.catalogVersion!==catalogVersion||hostApplied.catalogDigest!==catalogDigest)invalid();
    const applied=new Set(hostApplied.applied.map(m=>canonical(m)));
    if(appliedModels.some(m=>!applied.has(canonical(m))))invalid();
  }
  return {schemaVersion:1,operationId,localRef,sourceRevision:digest(r.sourceRevision),state:r.state as NativeBuiltinReadinessV1['state'],phase:r.phase as NativeBuiltinPhaseV1,
    catalogVersion,catalogDigest,hostApplied,appliedModels,errorCode};
}
function canonical(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  const record=value as Record<string,unknown>;
  return '{'+Object.keys(record).sort().map(k=>JSON.stringify(k)+':'+canonical(record[k])).join(',')+'}';
}
/** Cross-language hash payload: grantRevision is self-referential and excluded;
 * displayName is presentation. Every other exact authority field is retained. */
export function canonicalNativeBuiltinGrantPayloadV1(value:unknown):string{
  const g=parseNativeBuiltinSourceGrantV1(value);
  const allowedModels=g.allowedModels.map(({displayName:_,...m})=>({...m,capabilityFlags:[...m.capabilityFlags].sort()}))
    .sort((a,b)=>a.exactModelId<b.exactModelId?-1:a.exactModelId>b.exactModelId?1:0);
  return canonical({schemaVersion:1,catalogRevision:g.catalogRevision,scope:g.scope,allowedModels});
}
/** Catalog digest binds the complete private snapshot, including its material;
 * only the SHA-256 acknowledgement crosses into public state. Never log this. */
export function canonicalNativeBuiltinCatalogPayloadV1(value:unknown):string{
  const apply=parseNativeBuiltinCatalogApplyV1(value);
  return canonical({schemaVersion:1,operationId:apply.operationId,scope:apply.scope,hostGeneration:apply.hostGeneration,
    catalogVersion:apply.catalogVersion,routes:[...apply.routes].sort((a,b)=>a.routeId<b.routeId?-1:a.routeId>b.routeId?1:0)});
}
export function parseNativeBuiltinPreparedSourceV1(value:unknown):NativeBuiltinPreparedSourceV1{
  const r=record(value,['schemaVersion','operationId','localRef','sourceRevision','routes']);if(r.schemaVersion!==1)invalid();
  const operationId=uuid(r.operationId),localRef=id(r.localRef),routes=list(r.routes,3).map(parseNativeBuiltinPreparedRouteV1),seen=new Set<string>();
  for(const route of routes){const ref=route.mode==='gateway'?route.binding.grant.scope.localRef:route.grant.localRef;
    if(ref!==localRef||seen.has(route.routeId))invalid();seen.add(route.routeId);}
  return {schemaVersion:1,operationId,localRef,sourceRevision:digest(r.sourceRevision),routes};
}
export function parseNativeBuiltinRequestFreezeV1(value:unknown):NativeBuiltinRequestFreezeV1{
  const r=record(value,['schemaVersion','scope','hostGeneration','catalogVersion','catalogDigest','selection','authority','clientRequestId','sessionId','purpose']);
  if(r.schemaVersion!==1||!['chat','validation','diagnostic'].includes(r.purpose as string))invalid();
  const selection=parseNativeBuiltinSelectionRefV1(r.selection),authority=parseNativeBuiltinModelAuthorityV1(r.authority),sessionId=nullable(r.sessionId,id);
  if(selection.providerId!==authority.providerId||selection.exactModelId!==authority.exactModelId||selection.protocol!==authority.protocol
    ||selection.fundingSource==='platform'&&authority.priceAuthorityRevision===null||r.purpose==='chat'&&sessionId===null)invalid();
  return {schemaVersion:1,scope:ownedScope(r.scope),hostGeneration:uuid(r.hostGeneration),catalogVersion:id(r.catalogVersion),catalogDigest:digest(r.catalogDigest),
    selection,authority,clientRequestId:uuid(r.clientRequestId),sessionId,purpose:r.purpose as NativeBuiltinRequestPurposeV1};
}
export function parseNativeBuiltinFrozenRequestV1(value:unknown):NativeBuiltinFrozenRequestV1{
  const r=record(value,['schemaVersion','clientRequestId','selection','authority','sessionId','purpose','requestReceipt']);
  const freeze=parseNativeBuiltinRequestFreezeV1({schemaVersion:r.schemaVersion,scope:{accountId:'syntax-only',generation:0},
    hostGeneration:'00000000-0000-4000-8000-000000000000',catalogVersion:'syntax-only',catalogDigest:'0'.repeat(64),
    selection:r.selection,authority:r.authority,clientRequestId:r.clientRequestId,sessionId:r.sessionId,purpose:r.purpose});
  const requestReceipt=nullable(r.requestReceipt,parseNativeBuiltinRequestReceiptV1),local=freeze.selection.providerId==='openai'||freeze.selection.providerId==='anthropic';
  if(local?(requestReceipt!==null||freeze.selection.fundingSource!=='user_api'):(requestReceipt!==null&&(requestReceipt.requestId!==freeze.clientRequestId||requestReceipt.purpose!==freeze.purpose)))invalid();
  return {schemaVersion:1,clientRequestId:freeze.clientRequestId,selection:freeze.selection,authority:freeze.authority,sessionId:freeze.sessionId,purpose:freeze.purpose,requestReceipt};
}
export function parseNativeBuiltinSourceSyncRequestV1(value:unknown):NativeBuiltinSourceSyncRequestV1{
  const r=record(value,['schemaVersion','operationId','localRef','localRevision','sourceRevision','inventoryRevision','providerId','baseUrl','apiKey','expectedCredentialRevision','candidateModelIds']);
  if(r.schemaVersion!==1)invalid();const candidateModelIds=list(r.candidateModelIds,256).map(id);
  if(new Set(candidateModelIds).size!==candidateModelIds.length)invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),localRef:id(r.localRef),localRevision:digest(r.localRevision),sourceRevision:digest(r.sourceRevision),inventoryRevision:digest(r.inventoryRevision),
    providerId:provider(r.providerId) as NativeBuiltinGatewayProviderId,baseUrl:endpoint(r.baseUrl),apiKey:text(r.apiKey,4096),expectedCredentialRevision:nullable(r.expectedCredentialRevision,id),candidateModelIds};
}
function sourceOperation(r:Record<string,unknown>):NativeBuiltinSourceOperationV1{
  if(r.schemaVersion!==1)invalid();return {schemaVersion:1,operationId:uuid(r.operationId),localRef:id(r.localRef),sourceRevision:digest(r.sourceRevision)};
}
export function parseNativeBuiltinSourceOperationV1(value:unknown):NativeBuiltinSourceOperationV1{
  return sourceOperation(record(value,['schemaVersion','operationId','localRef','sourceRevision']));
}
export function parseNativeBuiltinConnectionOperationV1(value:unknown):NativeBuiltinConnectionOperationV1{
  const r=record(value,['schemaVersion','operationId','localRef','sourceRevision','protocol']);return {...sourceOperation(r),protocol:protocol(r.protocol)};
}
export function parseNativeBuiltinPrepareRequestV1(value:unknown):NativeBuiltinPrepareRequestV1{
  const r=record(value,['schemaVersion','operationId','localRef','sourceRevision','protocol','exactModelId']);
  return {...sourceOperation(r),protocol:protocol(r.protocol),exactModelId:id(r.exactModelId)};
}
export function parseNativeBuiltinConfirmRequestV1(value:unknown):NativeBuiltinConfirmRequestV1{
  const r=record(value,['schemaVersion','operationId','localRef','sourceRevision','protocol','hostApplied']),operation=sourceOperation(r),hostApplied=parseNativeBuiltinCatalogAppliedV1(r.hostApplied);
  if(hostApplied.operationId!==operation.operationId)invalid();return {...operation,protocol:protocol(r.protocol),hostApplied};
}
export function parseNativeBuiltinRequestPrepareV1(value:unknown):NativeBuiltinRequestPrepareV1{
  const r=record(value,['schemaVersion','operationId','localRef','sourceRevision','protocol','clientRequestId','exactModelId','purpose','sessionId']);
  if(!['chat','validation','diagnostic'].includes(r.purpose as string))invalid();const sessionId=nullable(r.sessionId,id);
  if(r.purpose==='chat'&&sessionId===null)invalid();
  return {...sourceOperation(r),protocol:protocol(r.protocol),clientRequestId:uuid(r.clientRequestId),exactModelId:id(r.exactModelId),purpose:r.purpose as NativeBuiltinRequestPurposeV1,sessionId};
}
const USAGE_KEYS=['inputTokens','outputTokens','inputTotalTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','cacheWrite5mTokens','cacheWrite1hTokens'] as const;
function terminalUsage(value:unknown,wire:NativeProtocol):NativeBuiltinTerminalUsageV1{
  const r=record(value,USAGE_KEYS);
  const result={inputTokens:count(r.inputTokens),outputTokens:count(r.outputTokens),inputTotalTokens:nullable(r.inputTotalTokens,count),
    cacheReadTokens:nullable(r.cacheReadTokens,count),cacheWriteTokens:nullable(r.cacheWriteTokens,count),reasoningTokens:nullable(r.reasoningTokens,count),
    cacheWrite5mTokens:nullable(r.cacheWrite5mTokens,count),cacheWrite1hTokens:nullable(r.cacheWrite1hTokens,count)};
  if(result.reasoningTokens!==null&&result.reasoningTokens>result.outputTokens
    ||wire!=='anthropic_messages'&&(result.inputTotalTokens!==null&&result.inputTotalTokens!==result.inputTokens||result.cacheReadTokens!==null&&result.cacheReadTokens>result.inputTokens)
    ||wire==='anthropic_messages'&&result.inputTotalTokens!==null&&(result.cacheReadTokens===null||result.cacheWriteTokens===null||!Number.isSafeInteger(result.inputTokens+result.cacheReadTokens+result.cacheWriteTokens)||result.inputTotalTokens!==result.inputTokens+result.cacheReadTokens+result.cacheWriteTokens)
    ||result.cacheWrite5mTokens!==null&&result.cacheWrite1hTokens!==null&&result.cacheWriteTokens!==null&&result.cacheWrite5mTokens+result.cacheWrite1hTokens!==result.cacheWriteTokens)invalid();
  return result;
}
export function parseNativeBuiltinUsageRecordV1(value:unknown):NativeBuiltinUsageRecordV1{
  const r=record(value,['schemaVersion','projectionVersion','requestId','operationId','purpose','scope','catalogRevision','grantRevision','connectionId','policyRevision','exactModelId','membershipRevision','capabilityRevision','adapterRevision','priceAuthorityRevision','providerResponseId','returnedModel','outcome','usage','createdAt']);
  if(r.schemaVersion!==1||r.projectionVersion!==1||!['chat','validation','diagnostic'].includes(r.purpose as string)||!['completed','incomplete','refused','failed','contract_invalid','unknown'].includes(r.outcome as string))invalid();
  const scope=parseNativeBuiltinConsumerScopeV1(r.scope),usage=nullable(r.usage,v=>terminalUsage(v,scope.protocol)),exactModelId=id(r.exactModelId),returnedModel=r.returnedModel===''?'':id(r.returnedModel);
  if(usage!==null&&(returnedModel!==exactModelId||r.outcome==='contract_invalid')||scope.fundingSource==='platform'&&r.priceAuthorityRevision===null)invalid();
  return {schemaVersion:1,projectionVersion:1,requestId:id(r.requestId),operationId:uuid(r.operationId),purpose:r.purpose as NativeBuiltinRequestPurposeV1,scope,
    catalogRevision:id(r.catalogRevision),grantRevision:digest(r.grantRevision),connectionId:uuid(r.connectionId),policyRevision:id(r.policyRevision),exactModelId,
    membershipRevision:id(r.membershipRevision),capabilityRevision:id(r.capabilityRevision),adapterRevision:id(r.adapterRevision),priceAuthorityRevision:nullable(r.priceAuthorityRevision,id),
    providerResponseId:r.providerResponseId===''?'':text(r.providerResponseId,256),returnedModel,outcome:r.outcome as NativeBuiltinUsageRecordV1['outcome'],usage,createdAt:positive(r.createdAt)};
}
export function parseNativeBuiltinUsageCursorV1(value:unknown):NativeBuiltinUsageCursorV1{
  const r=record(value,['createdAt','requestId']);return {createdAt:positive(r.createdAt),requestId:id(r.requestId)};
}
export function parseNativeBuiltinUsagePageV1(value:unknown):NativeBuiltinUsagePageV1{
  const r=record(value,['records','nextCursor']),records=list(r.records,100,true).map(parseNativeBuiltinUsageRecordV1),seen=new Set<string>();
  for(let i=0;i<records.length;i++){const row=records[i]!,prior=records[i-1];
    if(seen.has(row.requestId)||prior&&(row.createdAt>prior.createdAt||row.createdAt===prior.createdAt&&row.requestId>=prior.requestId))invalid();seen.add(row.requestId);}
  const nextCursor=nullable(r.nextCursor,parseNativeBuiltinUsageCursorV1),last=records.at(-1);
  if(nextCursor!==null&&(last===undefined||last.requestId!==nextCursor.requestId||last.createdAt!==nextCursor.createdAt))invalid();return {records,nextCursor};
}
function decimal(value:unknown):string{const result=text(value,96);if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result)||/^-0(?:\.0+)?$/.test(result))invalid();return result;}
export function parseNativeBuiltinSourceBalanceV1(value:unknown):NativeBuiltinSourceBalanceV1{
  const r=record(value,['state','checkedAt','lastSuccessAt','currencies','plan','classification','errorCode','officialUrl']);
  if(!['success','stale','error','unsupported'].includes(r.state as string)||r.plan!==null||r.classification!=='account_balance'&&r.classification!=='unknown')invalid();
  const currencies=list(r.currencies,16,true).map(value=>{const c=record(value,['currency','available','cash','grant']),currency=text(c.currency,3);
    if(!/^[A-Z]{3}$/.test(currency))invalid();return {currency,available:decimal(c.available),cash:nullable(c.cash,decimal),grant:nullable(c.grant,decimal)};});
  const lastSuccessAt=nullable(r.lastSuccessAt,positive),checkedAt=positive(r.checkedAt),errorCode=nullable(r.errorCode,id);
  if(new Set(currencies.map(c=>c.currency)).size!==currencies.length||lastSuccessAt!==null&&lastSuccessAt>checkedAt
    ||r.state==='success'&&(lastSuccessAt!==checkedAt||currencies.length===0||errorCode!==null||r.classification!=='account_balance')
    ||r.state==='stale'&&(lastSuccessAt===null||currencies.length===0||errorCode===null)
    ||(r.state==='error'||r.state==='unsupported')&&(lastSuccessAt!==null||currencies.length!==0||errorCode===null))invalid();
  return {state:r.state as NativeBuiltinSourceBalanceV1['state'],checkedAt,lastSuccessAt,currencies,plan:null,classification:r.classification,errorCode,officialUrl:officialLink(r.officialUrl)};
}
export function parseNativeBuiltinBalanceReceiptV1(value:unknown):NativeBuiltinBalanceReceiptV1{
  const r=record(value,['schemaVersion','source','operationId','balance']);if(r.schemaVersion!==1)invalid();
  return {schemaVersion:1,source:parseNativeBuiltinSourceV1(r.source),operationId:uuid(r.operationId),balance:parseNativeBuiltinSourceBalanceV1(r.balance)};
}
export function parseNativeBuiltinCatalogPublishV1(value:unknown):NativeBuiltinCatalogPublishV1{
  const r=record(value,['schemaVersion','readiness']),readiness=parseNativeBuiltinReadinessV1(r.readiness);
  if(r.schemaVersion!==1||readiness.state!=='ready')invalid();return {schemaVersion:1,readiness};
}
export function parseNativeBuiltinValidationRequestV1(value:unknown):NativeBuiltinValidationRequestV1{
  const r=record(value,['schemaVersion','operationId','selection','clientRequestId','purpose','prompt']);
  if(r.schemaVersion!==1||r.purpose!=='validation'&&r.purpose!=='diagnostic')invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),selection:parseNativeBuiltinSelectionRefV1(r.selection),clientRequestId:uuid(r.clientRequestId),purpose:r.purpose,prompt:text(r.prompt,512)};
}
export function parseNativeBuiltinLocalValidationV1(value:unknown):NativeBuiltinLocalValidationV1{
  const r=record(value,['schemaVersion','operationId','clientRequestId','scope','hostGeneration','catalogVersion','catalogDigest','selection','providerResponseId','returnedModel','outcome','usageOrigin','usage']);
  if(r.schemaVersion!==1||r.usageOrigin!=='provider_terminal'||!['completed','incomplete','refused','failed','contract_invalid','unknown'].includes(r.outcome as string))invalid();
  const selection=parseNativeBuiltinSelectionRefV1(r.selection),returnedModel=id(r.returnedModel),usage=nullable(r.usage,v=>terminalUsage(v,selection.protocol));
  if(selection.providerId!=='openai'&&selection.providerId!=='anthropic'||selection.fundingSource!=='user_api'||usage!==null&&returnedModel!==selection.exactModelId)invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),clientRequestId:uuid(r.clientRequestId),scope:ownedScope(r.scope),hostGeneration:uuid(r.hostGeneration),catalogVersion:id(r.catalogVersion),catalogDigest:digest(r.catalogDigest),
    selection,providerResponseId:text(r.providerResponseId,256),returnedModel,outcome:r.outcome as NativeBuiltinLocalValidationV1['outcome'],usageOrigin:'provider_terminal',usage};
}
export function parseNativeBuiltinValidationResultV1(value:unknown):NativeBuiltinValidationResultV1{
  const r=record(value,['schemaVersion','operationId','clientRequestId','selection','purpose','providerResponseId','returnedModel','outcome','usageOrigin','usage','firstVisibleTextMs','dispatchToTerminalMs','errorCode']);
  if(r.schemaVersion!==1||r.purpose!=='validation'&&r.purpose!=='diagnostic'||!['completed','incomplete','refused','failed','contract_invalid','unknown'].includes(r.outcome as string)
    ||r.usageOrigin!=='provider_terminal'&&r.usageOrigin!=='unknown')invalid();
  const selection=parseNativeBuiltinSelectionRefV1(r.selection),providerResponseId=nullable(r.providerResponseId,v=>text(v,256)),
    returnedModel=nullable(r.returnedModel,id),usage=nullable(r.usage,v=>terminalUsage(v,selection.protocol));
  const firstVisibleTextMs=nullable(r.firstVisibleTextMs,count),dispatchToTerminalMs=nullable(r.dispatchToTerminalMs,count);
  if(usage!==null&&(r.usageOrigin!=='provider_terminal'||providerResponseId===null||returnedModel!==selection.exactModelId)
    ||firstVisibleTextMs!==null&&dispatchToTerminalMs!==null&&firstVisibleTextMs>dispatchToTerminalMs)invalid();
  return {schemaVersion:1,operationId:uuid(r.operationId),clientRequestId:uuid(r.clientRequestId),selection,purpose:r.purpose,
    providerResponseId,returnedModel,outcome:r.outcome as NativeBuiltinUsageRecordV1['outcome'],usageOrigin:r.usageOrigin,usage,firstVisibleTextMs,dispatchToTerminalMs,errorCode:nullable(r.errorCode,id)};
}
export function parseNativeBuiltinSourceDetailV1(value:unknown):NativeBuiltinSourceDetailV1{
  const r=record(value,['schemaVersion','localRef','readiness','balance','lastDiagnostics']);if(r.schemaVersion!==1)invalid();
  const localRef=id(r.localRef),readiness=nullable(r.readiness,parseNativeBuiltinReadinessV1),
    balance=nullable(r.balance,parseNativeBuiltinBalanceReceiptV1),lastDiagnostics=list(r.lastDiagnostics,3,true).map(parseNativeBuiltinValidationResultV1);
  if(readiness!==null&&readiness.localRef!==localRef||balance!==null&&balance.source.localRef!==localRef
    ||lastDiagnostics.some(d=>d.selection.localRef!==localRef))invalid();
  return {schemaVersion:1,localRef,readiness,balance,lastDiagnostics};
}
