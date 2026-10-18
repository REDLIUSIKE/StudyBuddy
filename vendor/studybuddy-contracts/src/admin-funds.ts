export type FundsState="complete"|"partial"|"unavailable"|"failed"|"stale";
export type CnyAmount=string;
export type FundsAuthority={kind:"wallet_projection";generation:string;quotaPerBaseUnitExact:string;readTier:"db"|"redis"}|{kind:"official_balance";bindingVersion:string}|{kind:"native_evidence";evidenceVersion:string};
export type SourceStamp={instanceId:string;contractVersion:"studybuddy-funds-v1";snapshotId:string;watermark:string|null;observedAt:string;effectiveFrom:string|null;effectiveToExclusive:string|null;authority:FundsAuthority};
export type MoneyMetric={currency:"CNY";amount:CnyAmount|null;state:FundsState;source:SourceStamp|null;confirmedCount:number|null;pendingCount:number|null;scopeId:string;reasonCode:string|null};
export type FundsScope={instanceId:string;scopeId:string;mappingDigest:string;members:readonly{studyBuddyUserId:string;upstreamUserId:string;revision:string}[]};
export type LocalDayWindow={localDate:string;timeZone:"Asia/Shanghai";start:string;endExclusive:string};
export type FundsOverview={availablePool:MoneyMetric;cumulativePaid:MoneyMetric;cumulativeCredited:MoneyMetric;todayPaidCredited:MoneyMetric;todayFinalCharge:MoneyMetric;todayReversal:MoneyMetric;confirmedPlatformCost:MoneyMetric;supplierAvailable:MoneyMetric;rechargeStartedAt:string|null;remainingComposition:"unavailable"|"verified";unresolvedCaseCount:number|null};
export type FundsCapability={state:"verified"|"unavailable"|"unverified";reasonCode:string|null};
export type FundingBalanceSnapshot={accountId:string;provider:"deepseek"|"kimi";region:"cn";currency:"CNY";bindingVersion:string;available:string|null;cash:string|null;grant:string|null;officialCallable:boolean|null;successAt:string|null;attemptAt:string;queryState:"pending"|"success"|"failed"|"stale";errorCode:string|null};
export type FundingAccount={id:string;label:string;bindingState:"verified"|"invalid"|"unverified";connections:readonly{id:string;label:string;state:"verified"|"invalid"|"unverified"}[];balance:FundingBalanceSnapshot};
export type FundsPoolRow={studyBuddyUserId:string;upstreamUserId:string;available:MoneyMetric;cumulativePaid:MoneyMetric;cumulativeCredited:MoneyMetric;cumulativeFinalCharge:MoneyMetric};
export type FundsCostAuthority={provider:string;model:string;connection:string;funding:string;terminalUsageReference:string;priceVersion:string;priceWindowReference:string};
export type FundsEvidenceDomain="payment"|"wallet_event"|"settlement"|"cost";
export type FundsEvidenceRecord={domain:FundsEvidenceDomain;sourceId:string;entityId:string;studyBuddyUserId:string;effectiveAt:string|null;confirmedAt:string;sourceVersion:string;amount:string|null;currency:"CNY";state:FundsState;actualWalletDelta:string|null;costAuthority:FundsCostAuthority|null;creditedAmount:string|null;orderStatus:string};
export type FundsEvidencePage={items:readonly FundsEvidenceRecord[];cursor:string|null;source:SourceStamp;capabilities:Record<FundsEvidenceDomain,FundsCapability>};
export const FUNDS_METRICS=["availablePool","cumulativePaid","cumulativeCredited","todayPaidCredited","todayFinalCharge","todayReversal","confirmedPlatformCost"] as const;
export type FundsSourceSnapshot={contractVersion:"studybuddy-funds-v1";instanceId:string;snapshotId:string;scopeId:string;mappingDigest:string;metrics:Pick<FundsOverview,typeof FUNDS_METRICS[number]>;rechargeStartedAt:string|null;pool:{rows:readonly FundsPoolRow[];cursor:string|null};capabilities:{wallet:FundsCapability;topup:FundsCapability;evidence:FundsCapability};evidence:FundsEvidencePage};
export type FundingAlertConfig={accountId:string;version:string;currency:"CNY";minimum:string;target:string;enabled:boolean};
export type ReserveEstimate={state:"available"|"unavailable";days:string|null;completeDays:readonly string[];platformOnly:true;reasonCode:string|null};
export type AlertEvaluation={currentRisk:"normal"|"low"|"cash_debt"|"not_callable"|"unknown";previousRisk:string|null;consecutiveFreshRecoveries:number;transition:"opened"|"recovered"|"unchanged";showReminder:boolean};
export type FundsAccountDetail=FundingAccount&{config:FundingAlertConfig|null;risk:AlertEvaluation;reserve:ReserveEstimate};
export type FundsCaseProgress="pending"|"processing"|"needs_evidence"|"resolved";
export type FundsCase={id:string;identity:string;instanceId:string;localDate:string;domain:FundsEvidenceDomain;entityId:string;rule:string;version:string;state:FundsCaseProgress;reasonCode:string;evidenceDigest:string;sourceObservedAt:string;detectedAt:string;updatedAt:string;closedAt:string|null;amount:string|null;relatedCaseId:string|null};
export type FundsCaseNote={id:string;actor:string;body:string;progress:FundsCaseProgress;at:string};
export type FundsCaseFilters={state?:FundsCaseProgress;domain?:FundsEvidenceDomain;localDate?:string;entityId?:string};
export type FundsCasesPage={caseBatchId:string;sourceBatchId:string;scopeId:string;sourceObservedAt:string|null;queriedAt:string;rows:readonly FundsCase[];cursor:string|null;totalCount:number;filters:FundsCaseFilters};
export type FundsTask={taskId:string;state:"pending"|"success"|"failed";errorCode:string|null};
export type FundsRecheckView=FundsTask&{caseVersion:string;requestedAt:string;checkedAt:string|null;expiresAt:string};
export type FundsCaseDetail={case:FundsCase;notes:readonly FundsCaseNote[];notesTotal:number;notesTruncated:boolean;
 rechecks:readonly FundsRecheckView[];canResolve:boolean;resolveReason:string|null;resolveRecheckId:string|null;
 sourceBatchId:string|null;evidence:FundsEvidencePage|null;evidenceTruncated:boolean;merchantStatement:FundsCapability};
export type FundsPoolPage={batchId:string;cursor:string|null;rows:readonly FundsPoolRow[];scopeId:string;currency:"CNY";sourceObservedAt:string|null};
export type FundsUserDetail={batchId:string;scopeId:string;row:FundsPoolRow;evidence:FundsEvidencePage;evidenceTruncated:boolean;
 remainingComposition:"unavailable";inFlight:"unavailable";reversal:"unavailable"};
export type FundsTrendResponse={batchId:string;scopeId:string;mappingDigest:string;rows:readonly{
 localDate:string;todayPaidCredited:MoneyMetric;todayFinalCharge:MoneyMetric;todayReversal:MoneyMetric;confirmedPlatformCost:MoneyMetric}[]};
export type FundsOverviewResponse={instanceId:string;batchId:string|null;localDate:string;overview:FundsOverview;accounts:readonly FundsAccountDetail[];capabilities:{wallet:FundsCapability;topup:FundsCapability;evidence:FundsCapability};capturedAt:string|null;scopeLabel:string;sourceError:string|null};

export function fundsMetricAt(metric:MoneyMetric,now:number):MoneyMetric{
 const age=now-Date.parse(metric.source?.observedAt??"");
 return (metric.state==="complete"||metric.state==="partial")&&(!Number.isFinite(age)||age<0||age>=900000)?{...metric,state:"stale",reasonCode:"FUNDS_SNAPSHOT_STALE"}:metric;
}
export function fundingBalanceAt(balance:FundingBalanceSnapshot,now:number):FundingBalanceSnapshot{
 const age=now-Date.parse(balance.successAt??"");
 return balance.queryState==="success"&&(!Number.isFinite(age)||age<0||age>=900000)?{...balance,queryState:"stale",errorCode:"FUNDING_SNAPSHOT_STALE"}:balance;
}
export function fundingTargetGap(account:FundingAccount,config:FundingAlertConfig|null,now:number):string|null{
 if(config===null||account.bindingState!=="verified"||fundingBalanceAt(account.balance,now).queryState!=="success"||account.balance.available===null)return null;
 const values=[cnyAmount(config.target),cnyAmount(account.balance.available)];
 const places=Math.max(...values.map(value=>(value.split(".")[1]??"").length));
 const units=(value:string)=>{const [whole="0",fraction=""]=value.replace(/^-/u,"").split(".");return (value.startsWith("-")?-1n:1n)*(BigInt(whole)*10n**BigInt(places)+BigInt((fraction+"0".repeat(places)).slice(0,places)||"0"))};
 const gap=units(values[0]!)-units(values[1]!);if(gap<=0n)return"0";
 const digits=gap.toString().padStart(places+1,"0");
 return places===0?digits:(digits.slice(0,-places)+"."+digits.slice(-places)).replace(/\.?0+$/u,"");
}

function invalid():never{throw new TypeError("FUNDS_CONTRACT_INVALID")}
export function fundsRecord(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(value===null || typeof value!=="object" || Array.isArray(value) || Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const item=value as Record<string,unknown>;
 if(Object.keys(item).length!==keys.length || keys.some(key=>!Object.hasOwn(item,key)))invalid();return item;
}
export function fundsText(value:unknown):string{if(typeof value!=="string" || value.length===0 || value.length>256 || /[\u0000-\u001f]/.test(value))invalid();return value}
export function fundsChoice<T extends string>(value:unknown,values:readonly T[]):T{if(typeof value!=="string" || !values.includes(value as T))invalid();return value as T}
export function cnyAmount(value:unknown):string{if(typeof value!=="string" || value.length>128 || !/^-?(0|[1-9]\d*)(?:\.\d+)?$/.test(value))invalid();return value}
function nullableText(value:unknown){return value===null?null:fundsText(value)}
function nullableAmount(value:unknown){return value===null?null:cnyAmount(value)}
function instant(value:unknown):string{const text=fundsText(value);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0,19)!==text.slice(0,19))invalid();return text}
function nullableInstant(value:unknown){return value===null?null:instant(value)}
function count(value:unknown):number|null{if(value===null)return null;if(typeof value!=="number" || !Number.isSafeInteger(value) || value<0)invalid();return value}
function nullableBoolean(value:unknown){if(value===null)return null;if(typeof value!=="boolean")invalid();return value}
function list(value:unknown):unknown[]{if(!Array.isArray(value) || value.length>10000)invalid();return value}

export function parseFundsStamp(value:unknown,expectedInstanceId:string):SourceStamp{
 const s=fundsRecord(value,["instanceId","contractVersion","snapshotId","watermark","observedAt","effectiveFrom","effectiveToExclusive","authority"]);
 if(s.instanceId!==expectedInstanceId || s.contractVersion!=="studybuddy-funds-v1")invalid();
 if(s.authority===null || typeof s.authority!=="object")invalid();
 const kind=(s.authority as Record<string,unknown>).kind;let authority:FundsAuthority;
 if(kind==="wallet_projection"){
  const a=fundsRecord(s.authority,["kind","generation","quotaPerBaseUnitExact","readTier"]);
  const generation=fundsText(a.generation),scale=cnyAmount(a.quotaPerBaseUnitExact);
  if(!/^[1-9]\d*$/.test(generation) || !/^[1-9]\d*$/.test(scale))invalid();
  authority={kind,generation,quotaPerBaseUnitExact:scale,readTier:fundsChoice(a.readTier,["db","redis"])};
 }else if(kind==="official_balance"){const a=fundsRecord(s.authority,["kind","bindingVersion"]);authority={kind,bindingVersion:fundsText(a.bindingVersion)}}
 else if(kind==="native_evidence"){const a=fundsRecord(s.authority,["kind","evidenceVersion"]);if(a.evidenceVersion!=="native-cny-topup-v1")invalid();authority={kind,evidenceVersion:a.evidenceVersion}}else invalid();
 return {instanceId:expectedInstanceId,contractVersion:"studybuddy-funds-v1",snapshotId:fundsText(s.snapshotId),watermark:nullableText(s.watermark),observedAt:instant(s.observedAt),effectiveFrom:nullableInstant(s.effectiveFrom),effectiveToExclusive:nullableInstant(s.effectiveToExclusive),authority};
}

export function parseFundsMetric(value:unknown,instanceId:string):MoneyMetric{
 const m=fundsRecord(value,["currency","amount","state","source","confirmedCount","pendingCount","scopeId","reasonCode"]);if(m.currency!=="CNY")invalid();
 const state=fundsChoice(m.state,["complete","partial","unavailable","failed","stale"]),amount=nullableAmount(m.amount),source=m.source===null?null:parseFundsStamp(m.source,instanceId);
 const confirmedCount=count(m.confirmedCount),pendingCount=count(m.pendingCount);
 if(state==="complete" && (amount===null || source?.watermark==null || confirmedCount===null || pendingCount!==0))invalid();
 if(state==="unavailable" && amount!==null)invalid();
 return{currency:"CNY",amount,state,source,confirmedCount,pendingCount,scopeId:fundsText(m.scopeId),reasonCode:nullableText(m.reasonCode)};
}
function capability(value:unknown):FundsCapability{const c=fundsRecord(value,["state","reasonCode"]);return{state:fundsChoice(c.state,["verified","unavailable","unverified"]),reasonCode:nullableText(c.reasonCode)}}

export function parseFundingAccount(value:unknown):FundingAccount{
 const a=fundsRecord(value,["id","label","bindingState","connections","balance"]), b=fundsRecord(a.balance,["accountId","provider","region","currency","bindingVersion","available","cash","grant","officialCallable","successAt","attemptAt","queryState","errorCode"]);
 const id=fundsText(a.id);if(b.accountId!==id || b.currency!=="CNY" || b.region!=="cn")invalid();
 const balance:FundingBalanceSnapshot={accountId:id,provider:fundsChoice(b.provider,["deepseek","kimi"]),region:"cn",currency:"CNY",bindingVersion:fundsText(b.bindingVersion),available:nullableAmount(b.available),cash:nullableAmount(b.cash),grant:nullableAmount(b.grant),officialCallable:nullableBoolean(b.officialCallable),successAt:nullableInstant(b.successAt),attemptAt:instant(b.attemptAt),queryState:fundsChoice(b.queryState,["pending","success","failed","stale"]),errorCode:nullableText(b.errorCode)};
 if(balance.queryState==="success" && (balance.successAt===null || balance.available===null || balance.cash===null || balance.grant===null))invalid();
 const connections=list(a.connections).map(value=>{const c=fundsRecord(value,["id","label","state"]);return{id:fundsText(c.id),label:fundsText(c.label),state:fundsChoice(c.state,["verified","invalid","unverified"])}});
 if(new Set(connections.map(c=>c.id)).size!==connections.length)invalid();
 return{id,label:fundsText(a.label),bindingState:fundsChoice(a.bindingState,["verified","invalid","unverified"]),connections,balance};
}

export function parseFundsEvidence(value:unknown,instanceId:string):FundsEvidencePage{
 const e=fundsRecord(value,["items","cursor","source","capabilities"]),caps=fundsRecord(e.capabilities,["payment","wallet_event","settlement","cost"]);
 const source=parseFundsStamp(e.source,instanceId);
 const capabilities={payment:capability(caps.payment),wallet_event:capability(caps.wallet_event),settlement:capability(caps.settlement),cost:capability(caps.cost)};
 if(source.authority.kind!=="native_evidence" || source.authority.evidenceVersion!=="native-cny-topup-v1" ||
  ["wallet_event","settlement","cost"].some(domain=>capabilities[domain as FundsEvidenceDomain].state!=="unavailable") ||
  (capabilities.payment.state==="verified" && source.watermark===null))invalid();
 const items=list(e.items).map(value=>{
  const r=fundsRecord(value,["domain","sourceId","entityId","studyBuddyUserId","effectiveAt","confirmedAt","sourceVersion","amount","currency","state","actualWalletDelta","costAuthority","creditedAmount","orderStatus"]);
  if(r.currency!=="CNY")invalid();const domain=fundsChoice(r.domain,["payment","wallet_event","settlement","cost"]);
  if(domain!=="payment" || r.actualWalletDelta!==null || r.costAuthority!==null)invalid();
  let costAuthority:FundsCostAuthority|null=null;
  if(r.costAuthority!==null){const a=fundsRecord(r.costAuthority,["provider","model","connection","funding","terminalUsageReference","priceVersion","priceWindowReference"]);costAuthority={provider:fundsText(a.provider),model:fundsText(a.model),connection:fundsText(a.connection),funding:fundsText(a.funding),terminalUsageReference:fundsText(a.terminalUsageReference),priceVersion:fundsText(a.priceVersion),priceWindowReference:fundsText(a.priceWindowReference)}}
  const state=fundsChoice(r.state,["complete","partial","unavailable","failed","stale"]),effectiveAt=nullableInstant(r.effectiveAt),amount=nullableAmount(r.amount);
  if(state==="complete" && (effectiveAt===null || amount===null || capabilities[domain].state!=="verified"))invalid();
  // This first native evidence version proves payment only.
  if(state==="complete" && source.authority.kind==="native_evidence" && source.authority.evidenceVersion==="native-cny-topup-v1" && domain!=="payment")invalid();
  return{domain,sourceId:fundsText(r.sourceId),entityId:fundsText(r.entityId),studyBuddyUserId:fundsText(r.studyBuddyUserId),effectiveAt,confirmedAt:instant(r.confirmedAt),sourceVersion:fundsText(r.sourceVersion),amount,currency:"CNY" as const,state,actualWalletDelta:nullableAmount(r.actualWalletDelta),costAuthority,creditedAmount:nullableAmount(r.creditedAmount),orderStatus:typeof r.orderStatus==="string"?r.orderStatus:invalid()};
 });
 if(new Set(items.map(r=>r.domain+":"+r.sourceId)).size!==items.length)invalid();
 return{items,cursor:nullableText(e.cursor),source,capabilities};
}

export function parseFundsSource(value:unknown,instanceId:string):FundsSourceSnapshot{
 const s=fundsRecord(value,["contractVersion","instanceId","snapshotId","scopeId","mappingDigest","metrics","rechargeStartedAt","pool","capabilities","evidence"]);
 if(s.contractVersion!=="studybuddy-funds-v1" || s.instanceId!==instanceId)invalid();
 const scopeId=fundsText(s.scopeId),snapshotId=fundsText(s.snapshotId),m=fundsRecord(s.metrics,FUNDS_METRICS);
 const parsed=FUNDS_METRICS.map(key=>[key,parseFundsMetric(m[key],instanceId)] as const);
 for(const [,metric] of parsed){if(metric.scopeId!==scopeId || (metric.source!==null && metric.source.snapshotId!==snapshotId))invalid()}
 const metrics=Object.fromEntries(parsed) as FundsSourceSnapshot["metrics"];
 for(const key of ["todayFinalCharge","todayReversal","confirmedPlatformCost"] as const)if(metrics[key].amount!==null || metrics[key].state!=="unavailable")invalid();
 if(metrics.availablePool.amount!==null && (metrics.availablePool.source?.authority.kind!=="wallet_projection" || metrics.availablePool.source.authority.readTier!=="db"))invalid();
 for(const key of ["cumulativePaid","cumulativeCredited","todayPaidCredited"] as const)if(metrics[key].amount!==null && metrics[key].source?.authority.kind!=="native_evidence")invalid();
 const p=fundsRecord(s.pool,["rows","cursor"]),rows=list(p.rows).map(value=>{
  const r=fundsRecord(value,["studyBuddyUserId","upstreamUserId","available","cumulativePaid","cumulativeCredited","cumulativeFinalCharge"]);
  const available=parseFundsMetric(r.available,instanceId),cumulativePaid=parseFundsMetric(r.cumulativePaid,instanceId),cumulativeCredited=parseFundsMetric(r.cumulativeCredited,instanceId),cumulativeFinalCharge=parseFundsMetric(r.cumulativeFinalCharge,instanceId);
  if(cumulativeFinalCharge.amount!==null || cumulativeFinalCharge.state!=="unavailable")invalid();
  if(available.amount!==null && (available.source?.authority.kind!=="wallet_projection" || available.source.authority.readTier!=="db"))invalid();
  for(const metric of [cumulativePaid,cumulativeCredited])if(metric.amount!==null && metric.source?.authority.kind!=="native_evidence")invalid();
  for(const metric of [available,cumulativePaid,cumulativeCredited,cumulativeFinalCharge])if(metric.scopeId!==scopeId || (metric.source!==null && metric.source.snapshotId!==snapshotId))invalid();
  const upstreamUserId=fundsText(r.upstreamUserId);if(!/^[1-9]\d*$/.test(upstreamUserId))invalid();return{studyBuddyUserId:fundsText(r.studyBuddyUserId),upstreamUserId,available,cumulativePaid,cumulativeCredited,cumulativeFinalCharge};
 });
 if(new Set(rows.map(r=>r.studyBuddyUserId)).size!==rows.length || new Set(rows.map(r=>r.upstreamUserId)).size!==rows.length)invalid();
 const c=fundsRecord(s.capabilities,["wallet","topup","evidence"]),evidence=parseFundsEvidence(s.evidence,instanceId);if(evidence.source.snapshotId!==snapshotId)invalid();
 return{contractVersion:"studybuddy-funds-v1",instanceId,snapshotId,scopeId,mappingDigest:fundsText(s.mappingDigest),metrics,rechargeStartedAt:nullableInstant(s.rechargeStartedAt),pool:{rows,cursor:nullableText(p.cursor)},capabilities:{wallet:capability(c.wallet),topup:capability(c.topup),evidence:capability(c.evidence)},evidence};
}
export function parseFundsCase(value:unknown):FundsCase {
 const r=fundsRecord(value,["id","identity","instanceId","localDate","domain","entityId","rule","version","state","reasonCode","evidenceDigest","sourceObservedAt","detectedAt","updatedAt","closedAt","amount","relatedCaseId"]);
 const localDate=fundsText(r.localDate);if(!/^\d{4}-\d\d-\d\d$/u.test(localDate) || !Number.isFinite(Date.parse(localDate+"T00:00:00Z")) || new Date(localDate+"T00:00:00Z").toISOString().slice(0,10)!==localDate)invalid();
 return {id:fundsText(r.id),identity:fundsText(r.identity),instanceId:fundsText(r.instanceId),localDate,domain:fundsChoice(r.domain,["payment","wallet_event","settlement","cost"]),entityId:fundsText(r.entityId),rule:fundsText(r.rule),version:fundsText(r.version),state:fundsChoice(r.state,["pending","processing","needs_evidence","resolved"]),reasonCode:fundsText(r.reasonCode),evidenceDigest:fundsText(r.evidenceDigest),sourceObservedAt:instant(r.sourceObservedAt),detectedAt:instant(r.detectedAt),updatedAt:instant(r.updatedAt),closedAt:nullableInstant(r.closedAt),amount:nullableAmount(r.amount),relatedCaseId:nullableText(r.relatedCaseId)};
}
export function parseFundsCaseFilters(value:unknown):FundsCaseFilters {
 if(value===null || typeof value!=="object" || Array.isArray(value))invalid();const keys=Object.keys(value);
 if(keys.some(key=>!["state","domain","localDate","entityId"].includes(key)))invalid();
 const r=fundsRecord(value,keys),result:FundsCaseFilters={};
 if(r.state!==undefined)result.state=fundsChoice(r.state,["pending","processing","needs_evidence","resolved"]);
 if(r.domain!==undefined)result.domain=fundsChoice(r.domain,["payment","wallet_event","settlement","cost"]);
 if(r.localDate!==undefined){const date=fundsText(r.localDate);if(!/^\d{4}-\d\d-\d\d$/u.test(date) || !Number.isFinite(Date.parse(date+"T00:00:00Z")) || new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)invalid();result.localDate=date}
 if(r.entityId!==undefined)result.entityId=fundsText(r.entityId);return result;
}
