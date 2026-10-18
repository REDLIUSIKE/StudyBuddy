import { parseSkillPackageIdentity, skillArray, skillBoolean, skillChoice, skillExact, skillInvalid, skillNullableText, skillOpaqueId, skillRecord, skillSha256, skillText, skillTool, skillUuid, type SkillPackageIdentity, type SkillScope, type SkillToolId } from "./skill-center.js";
import {parseSkillLibraryMetadata,type SkillLibraryMetadata} from "./skill-library.js";
export type SkillDestination = { toolId: SkillToolId; scopeId: string };
export type SkillToolView = { toolId: SkillToolId; displayName: string; installed: boolean; adapterState: "verified" | "pending" | "unavailable"; reasonCode: string | null; executorId: string; destinations: SkillDestination[]; destinationLabels?: Record<string,{scope:"user"|"project";displayName:string}> };
export type SkillRecognition = "pending" | "recognized" | "failed";
export type SkillRuntime = "unverified" | "passed" | "failed";
export type SkillInstanceView = { instanceId: string; scopeId: string; displayName: string; contentSha256: string; toolId: SkillToolId; scope: SkillScope; description: string | null; managed: boolean; listingId: string | null; package: SkillPackageIdentity | null; compatibility: { state: "compatible" | "pending" | "incompatible"; reasonCode: string | null }; recognition: SkillRecognition; runtime: SkillRuntime;library?:SkillLibraryMetadata };
export type SkillAuthorizedProjectView={scopeId:string;displayName:string};
export type SkillInventorySnapshot = { revision: string; instances: SkillInstanceView[]; tools: SkillToolView[]; scanErrors: { toolId: SkillToolId; scopeId: string | null; code: string }[];projects?:SkillAuthorizedProjectView[] };
type OperationBase = { operationId: string; targets: SkillDestination[]; conflictPolicy: "keep" | "replace_confirmed" };
export type SkillCopyRequest = OperationBase & { instanceId: string; scanRevision: string; mode: "copy" | "link" };
export type SkillInstallRequest = OperationBase & { listingId: string; expectedPublicationId: string };
export type SkillManageRequest = OperationBase & { instanceId: string; scanRevision: string; action: "import" | "enable" | "disable" | "remove" | "update"; expectedPublicationId: string | null };
export type SkillTargetOperationResult = { target: SkillDestination; status: "copied" | "linked" | "already_present" | "conflict" | "failed" | "blocked" | "cancelled" | "imported" | "removed" | "disabled"; reasonCode: string | null; instanceId: string | null; recognition: SkillRecognition; runtime: SkillRuntime };
export type SkillOperationResult = { operationId: string; results: SkillTargetOperationResult[] };
export function parseSkillDestination(value: unknown): SkillDestination { const v = skillRecord(value); skillExact(v, ["toolId", "scopeId"]); return { toolId: skillTool(v.toolId), scopeId: skillOpaqueId(v.scopeId) }; }
function targets(value: unknown): SkillDestination[] { const result = skillArray(value, 8, parseSkillDestination); if (!result.length || new Set(result.map(t => `${t.toolId}:${t.scopeId}`)).size !== result.length) skillInvalid(); return result; }
function base(v: Record<string, unknown>): OperationBase { return { operationId: skillUuid(v.operationId), targets: targets(v.targets), conflictPolicy: skillChoice(v.conflictPolicy, ["keep", "replace_confirmed"]) }; }
export function parseSkillCopy(value: unknown): SkillCopyRequest { const v = skillRecord(value); skillExact(v, ["operationId", "instanceId", "scanRevision", "targets", "mode", "conflictPolicy"]); return { ...base(v), instanceId: skillOpaqueId(v.instanceId), scanRevision: skillOpaqueId(v.scanRevision), mode: skillChoice(v.mode, ["copy", "link"]) }; }
export function parseSkillInstall(value: unknown): SkillInstallRequest { const v = skillRecord(value); skillExact(v, ["operationId", "listingId", "expectedPublicationId", "targets", "conflictPolicy"]); return { ...base(v), listingId: skillUuid(v.listingId), expectedPublicationId: skillUuid(v.expectedPublicationId) }; }
export function parseSkillManage(value: unknown): SkillManageRequest { const v = skillRecord(value); skillExact(v, ["operationId", "instanceId", "scanRevision", "action", "targets", "expectedPublicationId", "conflictPolicy"]); const action = skillChoice(v.action, ["import", "enable", "disable", "remove", "update"]), expectedPublicationId = v.expectedPublicationId === null ? null : skillUuid(v.expectedPublicationId); if (action === "update" && expectedPublicationId === null) skillInvalid(); return { ...base(v), instanceId: skillOpaqueId(v.instanceId), scanRevision: skillOpaqueId(v.scanRevision), action, expectedPublicationId }; }
export function parseSkillInstance(value: unknown): SkillInstanceView {
  const v = skillRecord(value); skillExact(v, ["instanceId", "scopeId", "displayName", "contentSha256", "toolId", "scope", "description", "managed", "listingId", "package", "compatibility", "recognition", "runtime","library"]);
  const c = skillRecord(v.compatibility); skillExact(c, ["state", "reasonCode"]);
  return { instanceId: skillOpaqueId(v.instanceId), scopeId: skillOpaqueId(v.scopeId), displayName: skillText(v.displayName, 300), contentSha256: skillSha256(v.contentSha256), toolId: skillTool(v.toolId), scope: skillChoice(v.scope, ["user", "project", "builtin", "hub"]), description: skillNullableText(v.description, 1024), managed: skillBoolean(v.managed), listingId: v.listingId === null ? null : skillUuid(v.listingId), package: v.package === null ? null : parseSkillPackageIdentity(v.package), compatibility: { state: skillChoice(c.state, ["compatible", "pending", "incompatible"]), reasonCode: skillNullableText(c.reasonCode, 100) }, recognition: skillChoice(v.recognition, ["pending", "recognized", "failed"]), runtime: skillChoice(v.runtime, ["unverified", "passed", "failed"]),...(v.library===undefined?{}:{library:parseSkillLibraryMetadata(v.library)}) };
}
function parseSkillToolView(item:unknown):SkillToolView {
 const t=skillRecord(item);skillExact(t,["toolId","displayName","installed","adapterState","reasonCode","executorId","destinations","destinationLabels"]);
 const state=skillChoice(t.adapterState,["verified","pending","unavailable"]),toolId=skillTool(t.toolId),destinations=skillArray(t.destinations,32,parseSkillDestination);
 if(destinations.some(d=>d.toolId!==toolId)||(state!=="verified"&&destinations.length)||new Set(destinations.map(d=>d.scopeId)).size!==destinations.length)skillInvalid();
 const base:SkillToolView={toolId,displayName:skillText(t.displayName,100),installed:skillBoolean(t.installed),adapterState:state,reasonCode:skillNullableText(t.reasonCode,100),executorId:skillOpaqueId(t.executorId),destinations};
 if(t.destinationLabels!==undefined){
  const raw=skillRecord(t.destinationLabels),labels:NonNullable<SkillToolView["destinationLabels"]>={};
  if(Object.keys(raw).length!==destinations.length)skillInvalid();
  for(const [id,value] of Object.entries(raw)){
   if(!destinations.some(d=>d.scopeId===id))skillInvalid();const label=skillRecord(value);skillExact(label,["scope","displayName"]);
   const displayName=skillText(label.displayName,100);if(/[\\/:\u0000-\u001f]/u.test(displayName))skillInvalid();
   labels[id]={scope:skillChoice(label.scope,["user","project"]),displayName};
  }
  base.destinationLabels=labels;
 }
 return base;
}
export function parseSkillSnapshot(value: unknown): SkillInventorySnapshot {
  const v = skillRecord(value); skillExact(v, ["revision", "instances", "tools", "scanErrors","projects"]);
  const instances = skillArray(v.instances, 20000, parseSkillInstance); if (new Set(instances.map(i => i.instanceId)).size !== instances.length) skillInvalid();
  const projects=v.projects===undefined?undefined:skillArray(v.projects,2000,item=>{const p=skillRecord(item);skillExact(p,["scopeId","displayName"]);const displayName=skillText(p.displayName,100);if(/[\\/:\u0000-\u001f]/u.test(displayName))skillInvalid();return {scopeId:skillOpaqueId(p.scopeId),displayName};});if(projects&&new Set(projects.map(p=>p.scopeId)).size!==projects.length)skillInvalid();
  return { revision: skillOpaqueId(v.revision), instances, tools: skillArray(v.tools, 8, parseSkillToolView), scanErrors: skillArray(v.scanErrors, 200, item => { const e = skillRecord(item); skillExact(e, ["toolId", "scopeId", "code"]); return { toolId: skillTool(e.toolId), scopeId: e.scopeId === null ? null : skillOpaqueId(e.scopeId), code: skillText(e.code, 100) }; }),...(projects===undefined?{}:{projects}) };
}
export function parseSkillOperationResult(value: unknown): SkillOperationResult { const v = skillRecord(value); skillExact(v, ["operationId", "results"]); return { operationId: skillUuid(v.operationId), results: skillArray(v.results, 8, item => { const r = skillRecord(item); skillExact(r, ["target", "status", "reasonCode", "instanceId", "recognition", "runtime"]); return { target: parseSkillDestination(r.target), status: skillChoice(r.status, ["copied", "linked", "already_present", "conflict", "failed", "blocked", "cancelled", "imported", "removed", "disabled"]), reasonCode: skillNullableText(r.reasonCode, 100), instanceId: r.instanceId === null ? null : skillOpaqueId(r.instanceId), recognition: skillChoice(r.recognition, ["pending", "recognized", "failed"]), runtime: skillChoice(r.runtime, ["unverified", "passed", "failed"]) }; }) }; }
