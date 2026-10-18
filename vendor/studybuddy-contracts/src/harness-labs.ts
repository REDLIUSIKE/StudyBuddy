/** Original Codex UI facts and the three parameter-free laboratory operations. */
import type {ToolsPageHost} from './harness-tools.js';
export type CodexChineseLayerStatus = 'unavailable'|'resource_available'|'not_configured'|'configured'|'restart_required'|'conflict'|'error';
export type CodexChineseView = {
  ui:{status:CodexChineseLayerStatus;errorCode?:string};
  package:{status:'available'|'unsupported'|'unavailable';version?:string;downloadBytes?:number;errorCode?:string};
  canRestore:boolean;
  runtime?:{status:'stopped'|'running'|'unknown';processCount?:number};
  installation?:{packageVersion:string;appVersion:string};
  diagnostic?:{phase:string;httpStatus?:number;operationId:string};
  completion?:'applied'|'restored';
};
export interface HarnessLabsApi {
  getCodexChineseStatus():Promise<CodexChineseView>;
  applyCodexChinese():Promise<CodexChineseView>;
  restoreCodexChinese():Promise<CodexChineseView>;
  startSkillSafetyAssistant(input:{requestId:string}):Promise<SkillSafetySessionView>;
  getSkillSafetyScannerStatus():Promise<SkillSafetyScannerView>;
  prepareSkillSafetyScanner(input:{requestId:string}):Promise<SkillSafetyScannerView>;
  cancelSkillSafetyScannerPreparation(input:{requestId:string}):Promise<void>;
}
/** Keyless Labs-only results; resource paths and model actions are not page capabilities. */
export type SkillSafetySessionView = {workspaceId:string;sessionId:string};
export type SkillSafetyScannerView = {state:'missing'|'downloading'|'ready'|'failed';scannerVersion:'2.2.2';receivedBytes:number;totalBytes:number;code?:string};
export const HARNESS_SKILL_SAFETY_LABS_METHODS = ['startSkillSafetyAssistant','getSkillSafetyScannerStatus','prepareSkillSafetyScanner','cancelSkillSafetyScannerPreparation'] as const;
export type SkillSafetyLabsMethod = typeof HARNESS_SKILL_SAFETY_LABS_METHODS[number];
/** Validate result bytes without permitting URLs, paths or credentials. */
export function parseSkillSafetySessionView(value:unknown):SkillSafetySessionView{
  const row=record(value,['workspaceId','sessionId']);
  for(const name of ['workspaceId','sessionId'])if(typeof row[name]!=='string'||! /^[A-Za-z0-9_-]{1,256}$/.test(row[name] as string))fail();
  return row as SkillSafetySessionView;
}
/** HTTP completion alone does not assert verified readiness. */
export function parseSkillSafetyScannerView(value:unknown):SkillSafetyScannerView{
  const row=record(value,['state','scannerVersion','receivedBytes','totalBytes'],['code']);
  oneOf(row.state,['missing','downloading','ready','failed']);oneOf(row.scannerVersion,['2.2.2']);integer(row.receivedBytes,1024**3);integer(row.totalBytes,1024**3);
  if((row.receivedBytes as number)>(row.totalBytes as number)||row.totalBytes===0)fail();
  if(Object.hasOwn(row,'code')&&(typeof row.code!=='string'||! /^SKILL_SAFETY_[A-Z_]{1,64}$/.test(row.code)))fail();
  return row as SkillSafetyScannerView;
}
export type LabsPageHost = Pick<ToolsPageHost,'state'|'subscribeState'|'navigate'> & {api:HarnessLabsApi};
export const HARNESS_LABS_METHODS = ['getCodexChineseStatus','applyCodexChinese','restoreCodexChinese',...HARNESS_SKILL_SAFETY_LABS_METHODS] as const;
export type ToolSurfaceTarget = 'tools'|'labs';
const fail = ():never=>{throw new TypeError('CODEX_CHINESE_VIEW_INVALID');};
function record(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail();
  const row=value as Record<string,unknown>;
  if(required.some(key=>!Object.hasOwn(row,key))||Object.keys(row).some(key=>!required.includes(key)&&!optional.includes(key)))return fail();
  return row;
}
const oneOf=(value:unknown,allowed:readonly string[]):void=>{if(typeof value!=='string'||!allowed.includes(value))fail();};
const integer=(value:unknown,max:number):void=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>max)fail();};
const version=(value:unknown):void=>{if(typeof value!=='string'||!/^\d{1,8}(?:\.\d{1,8}){1,3}$/u.test(value))fail();};
function code(row:Record<string,unknown>):void{if(Object.hasOwn(row,'errorCode')&&(typeof row.errorCode!=='string'||!/^CODEX_(?:UI|CHINESE)_[A-Z_]{1,64}$/u.test(row.errorCode)))fail();}
/** @param value Untrusted native result. @returns Original UI facts with no extra fields or configuration contents. */
export function parseCodexChineseView(value:unknown):CodexChineseView{
  const row=record(value,['ui','package','canRestore'],['runtime','installation','diagnostic','completion']);
  const ui=record(row.ui,['status'],['errorCode']),pkg=record(row.package,['status'],['errorCode','version','downloadBytes']);
  oneOf(ui.status,['unavailable','resource_available','not_configured','configured','restart_required','conflict','error']);code(ui);
  oneOf(pkg.status,['available','unsupported','unavailable']);code(pkg);
  if(Object.hasOwn(pkg,'version'))version(pkg.version);
  if(Object.hasOwn(pkg,'downloadBytes'))integer(pkg.downloadBytes,Number.MAX_SAFE_INTEGER);
  if(typeof row.canRestore!=='boolean')fail();
  if(Object.hasOwn(row,'runtime')){const runtime=record(row.runtime,['status'],['processCount']);oneOf(runtime.status,['stopped','running','unknown']);if(Object.hasOwn(runtime,'processCount'))integer(runtime.processCount,4294967295);}
  if(Object.hasOwn(row,'installation')){const installed=record(row.installation,['packageVersion','appVersion']);version(installed.packageVersion);version(installed.appVersion);}
  if(Object.hasOwn(row,'diagnostic')){
    const diagnostic=record(row.diagnostic,['phase','operationId'],['httpStatus']);
    oneOf(diagnostic.phase,['initialization','legacy_rule_retirement','installation_binding','process_guard','configuration_read','catalog_trust','catalog_download','catalog_verification','version_match','package_download','package_verification','resource_verification','resource_preparation','resource_backup','resource_replacement','resource_readback','locale_configuration','configuration_restore']);
    if(typeof diagnostic.operationId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/u.test(diagnostic.operationId))fail();
    if(Object.hasOwn(diagnostic,'httpStatus')){integer(diagnostic.httpStatus,599);if((diagnostic.httpStatus as number)<100)fail();}
  }
  if(Object.hasOwn(row,'completion'))oneOf(row.completion,['applied','restored']);
  return row as CodexChineseView;
}
