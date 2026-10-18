import {skillArray,skillBoolean,skillChoice,skillExact,skillInteger,skillInvalid,skillNullableText,skillOpaqueId,skillRecord,skillSha256,skillText,skillTool,skillUuid,type SkillToolId} from "./skill-center.js";
import {parseSkillCopy,parseSkillDestination,type SkillCopyRequest,type SkillDestination} from "./skill-management.js";

export type SkillLibraryMetadata={sourceKind:"tool"|"local_folder"|"local_archive"|"hosted_package";sourceToolId:SkillToolId|null;declaredVersion:string|null;tags:string[]};
export type SkillLibraryMetadataRequest={operationId:string;instanceId:string;scanRevision:string;tags:string[]};
export type SkillLocalImportRequest={operationId:string;kind:"folder"|"archive"};
export type SkillLocalImportResult={selected:boolean;results:{name:string;status:"imported"|"already_present"|"failed";reasonCode:string|null;instanceId:string|null}[]};
export type SkillExportRequest={operationId:string;scanRevision:string;instanceIds:string[]};
export type SkillExportResult={selected:boolean;count:number};
export type SkillCopyPreflight={operationId:string;source:{instanceId:string;contentSha256:string};results:{target:SkillDestination;status:"ready"|"already_present"|"conflict"|"blocked";reasonCode:string|null}[]};
export type SkillWatchNotice={generation:string;reason:"changed"|"invalidated"};
export type SkillAiAction="enable"|"status"|"revoke";
export type SkillAiPlanView={id:string;sourceName:string;request:SkillCopyRequest;preview:SkillCopyPreflight;state:"pending"|"approved"|"executed"|"expired";expiresAt:number};
export type SkillAiSessionView={enabled:boolean;sessionId:string|null;plans:SkillAiPlanView[]};

export function parseSkillTags(value:unknown):string[]{
 const tags=skillArray(value,16,item=>{if(typeof item!=="string"||item!==item.trim()||!item.length||item.length>48||/[\u0000-\u001f\u007f-\u009f]/u.test(item))skillInvalid();return item;});
 if(new Set(tags).size!==tags.length)skillInvalid();return tags;
}
export function parseSkillLibraryMetadata(value:unknown):SkillLibraryMetadata{
 const v=skillRecord(value);skillExact(v,["sourceKind","sourceToolId","declaredVersion","tags"]);
 const sourceKind=skillChoice(v.sourceKind,["tool","local_folder","local_archive","hosted_package"]),sourceToolId=v.sourceToolId===null?null:skillTool(v.sourceToolId);
 if(sourceKind==="tool"?sourceToolId===null:(sourceKind==="local_folder"||sourceKind==="local_archive")&&sourceToolId!==null)skillInvalid();
 return {sourceKind,sourceToolId,declaredVersion:skillNullableText(v.declaredVersion,100),tags:parseSkillTags(v.tags)};
}
export function parseSkillLibraryMetadataRequest(value:unknown):SkillLibraryMetadataRequest{
 const v=skillRecord(value);skillExact(v,["operationId","instanceId","scanRevision","tags"]);return {operationId:skillUuid(v.operationId),instanceId:skillOpaqueId(v.instanceId),scanRevision:skillOpaqueId(v.scanRevision),tags:parseSkillTags(v.tags)};
}
export function parseSkillLocalImportRequest(value:unknown):SkillLocalImportRequest{const v=skillRecord(value);skillExact(v,["operationId","kind"]);return {operationId:skillUuid(v.operationId),kind:skillChoice(v.kind,["folder","archive"])};}
export function parseSkillLocalImportResult(value:unknown):SkillLocalImportResult{
 const v=skillRecord(value);skillExact(v,["selected","results"]);const selected=skillBoolean(v.selected),results=skillArray(v.results,20000,item=>{
  const r=skillRecord(item);skillExact(r,["name","status","reasonCode","instanceId"]);const status=skillChoice(r.status,["imported","already_present","failed"]),instanceId=r.instanceId===null?null:skillOpaqueId(r.instanceId);
  if(status!=="failed"&&instanceId===null)skillInvalid();return {name:skillText(r.name,300),status,reasonCode:skillNullableText(r.reasonCode,100),instanceId};
 });if(!selected&&results.length)skillInvalid();return {selected,results};
}
export function parseSkillExportRequest(value:unknown):SkillExportRequest{
 const v=skillRecord(value);skillExact(v,["operationId","scanRevision","instanceIds"]);const instanceIds=skillArray(v.instanceIds,2000,skillOpaqueId);if(!instanceIds.length||new Set(instanceIds).size!==instanceIds.length)skillInvalid();return {operationId:skillUuid(v.operationId),scanRevision:skillOpaqueId(v.scanRevision),instanceIds};
}
export function parseSkillExportResult(value:unknown):SkillExportResult{const v=skillRecord(value);skillExact(v,["selected","count"]);const selected=skillBoolean(v.selected),count=skillInteger(v.count,0,2000);if(!selected&&count!==0)skillInvalid();return {selected,count};}
export function parseSkillCopyPreflight(value:unknown):SkillCopyPreflight{
 const v=skillRecord(value);skillExact(v,["operationId","source","results"]);const s=skillRecord(v.source);skillExact(s,["instanceId","contentSha256"]);
 const results=skillArray(v.results,8,item=>{const r=skillRecord(item);skillExact(r,["target","status","reasonCode"]);return {target:parseSkillDestination(r.target),status:skillChoice(r.status,["ready","already_present","conflict","blocked"]),reasonCode:skillNullableText(r.reasonCode,100)};});
 if(!results.length||new Set(results.map(r=>`${r.target.toolId}:${r.target.scopeId}`)).size!==results.length)skillInvalid();return {operationId:skillUuid(v.operationId),source:{instanceId:skillOpaqueId(s.instanceId),contentSha256:skillSha256(s.contentSha256)},results};
}
export function parseSkillWatchNotice(value:unknown):SkillWatchNotice{const v=skillRecord(value);skillExact(v,["generation","reason"]);return {generation:skillOpaqueId(v.generation),reason:skillChoice(v.reason,["changed","invalidated"])};}
export function parseSkillAiPlanView(value:unknown):SkillAiPlanView{
 const v=skillRecord(value);skillExact(v,["id","sourceName","request","preview","state","expiresAt"]);const request=parseSkillCopy(v.request),preview=parseSkillCopyPreflight(v.preview);
 if(request.operationId!==preview.operationId||request.instanceId!==preview.source.instanceId||request.targets.length!==preview.results.length||request.targets.some(t=>!preview.results.some(r=>r.target.toolId===t.toolId&&r.target.scopeId===t.scopeId)))skillInvalid();
 return {id:skillOpaqueId(v.id),sourceName:skillText(v.sourceName,300),request,preview,state:skillChoice(v.state,["pending","approved","executed","expired"]),expiresAt:skillInteger(v.expiresAt)};
}
export function parseSkillAiSessionView(value:unknown):SkillAiSessionView{
 const v=skillRecord(value);skillExact(v,["enabled","sessionId","plans"]);const enabled=skillBoolean(v.enabled),sessionId=v.sessionId===null?null:skillUuid(v.sessionId),plans=skillArray(v.plans,100,parseSkillAiPlanView);
 if((enabled&&sessionId===null)||(!enabled&&(sessionId!==null||plans.length!==0))||new Set(plans.map(p=>p.id)).size!==plans.length)skillInvalid();return {enabled,sessionId,plans};
}
