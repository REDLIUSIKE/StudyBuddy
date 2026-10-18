/** Source definitions are adapted to the actual native delegation service, with no Pi model runtime. */
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {listAgents,settingsPinnedModels,isExternalCliAgent,agentMemoryFile} from '../agent/agent-files.ts';
import {resolvePaths} from '../projects.ts';import {assertResearchPath} from './project-storage.ts';import type {NativeChannel} from './native-channel.ts';
import {readNativeCompositionPresets} from '../api/native-compositions.ts';
import {defaultSystemPromptMode,defaultInheritProjectContext,defaultInheritSkills} from './workflow-engine.ts';
export const NativeSpecialistSchema={type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['start','inspect','transcript','cancel','steer']},agent:{type:'string'},task:{type:'string'},model:{type:'string'},operationId:{type:'string'},message:{type:'string'}},required:['action']};
export const NativeFusionSchema={type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['list','compose','inspect','cancel']},prompt:{type:'string'},preset:{type:'string'},models:{type:'array',items:{type:'string'},minItems:1,maxItems:8},judge:{type:'string'},operationId:{type:'string'}},required:['action']};
function operationId(projectId:string,sessionId:string,callId:string){const hex=createHash('sha256').update(JSON.stringify([projectId,sessionId,callId])).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;}
function record(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RESEARCH_SPECIALIST_INPUT_INVALID');return value as Record<string,unknown>;}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
/** The intent and frozen definition precede dispatch. A lost start is observed, never replayed. */
export class NativeAdvancedWorkflows {
 private readonly pending=new Map<string,{signature:string;value:Promise<unknown>}>();
 private readonly callers=new Map<string,NativeAdvancedWorkflows>();
 constructor(private readonly channel:Pick<NativeChannel,'current'|'request'>){}
 private current(){if(!this.channel.current())throw Error('RESEARCH_CONTEXT_REVOKED');}
 /** Keep the root admission while recording the actual, Host-validated nested caller. */
 forCaller(rootSessionId:string,callerSessionId:string):NativeAdvancedWorkflows {
  if(rootSessionId===callerSessionId)return this;
  const key=JSON.stringify([rootSessionId,callerSessionId]),existing=this.callers.get(key);if(existing)return existing;
  if(this.callers.size>=1024)throw Error('RESEARCH_SPECIALIST_CALLER_LIMIT');
  const scoped=new NativeAdvancedWorkflows({current:()=>this.channel.current(),request:(project,operation,input,signal)=>this.channel.request(project,operation,operation==='advanced'?{action:'for-caller',callerSessionId,input}:input,signal,rootSessionId)});this.callers.set(key,scoped);return scoped;
 }
 /** Read the original saved definition without creating a native Agent or issuing a model request. */
 freezeSpecialist(projectId:string,args:Record<string,unknown>,id:string=randomUUID()) {
  this.current();const paths=resolvePaths(projectId);
  const agent=listAgents(paths).find(agent=>agent.name===args.agent);if(!agent||agent.enabled===false)throw Error('RESEARCH_SPECIALIST_UNAVAILABLE');if(isExternalCliAgent(agent))throw Error('RESEARCH_SPECIALIST_EXTERNAL_RUNNER_REQUIRES_NATIVE_ADAPTER');
  const pins=settingsPinnedModels(paths),modelRef=String(args.model??pins.byAgent.get(agent.name)??agent.model??pins.defaultModel??'')||null;
  let persona=agent.systemPrompt;
  if(agent.memory){const memory=agentMemoryFile(paths,agent.memory);assertResearchPath(memory);try{if(fs.statSync(memory).size>32768)throw Error('RESEARCH_SPECIALIST_MEMORY_LIMIT');persona+='\n\nExisting specialist memory (authored context, not fresh evidence):\n'+fs.readFileSync(memory,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
  return {action:'start',operationId:id,label:agent.name,prompt:args.task,persona,modelRef,reasoningEffort:agent.thinking||null,tools:agent.tools?agent.tools.split(',').map(name=>name.trim()).filter(Boolean):null,inheritParentContext:agent.extra?.defaultContext==='fork',systemPromptMode:agent.systemPromptMode??defaultSystemPromptMode(agent.name),inheritProjectContext:agent.inheritProjectContext??defaultInheritProjectContext(agent.name),inheritSkills:agent.inheritSkills??defaultInheritSkills(),maxTokens:4000};
 }
 async fleetSessions(projectId:string){
  this.current();const result=await this.channel.request(projectId,'journal-sessions',null,new AbortController().signal);this.current();
  if(!result||typeof result!=='object'||!('projectId'in result)||result.projectId!==projectId||!('sessions'in result)||!Array.isArray(result.sessions)||result.sessions.length>1024)throw Error('RESEARCH_SPECIALIST_SESSION_DENIED');
  const seen=new Set<string>(),sessions:{id:string;name:string}[]=[];
  for(const row of result.sessions){if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||row.id.length>200||seen.has(row.id)||typeof row.label!=='string'||row.label.length>120)throw Error('RESEARCH_SPECIALIST_SESSION_DENIED');seen.add(row.id);if(row.parentSessionId===undefined||row.parentSessionId===null)sessions.push({id:row.id,name:row.label})}
  return {sessions};
 }
 async fleet(projectId:string,sessionId:string){
  this.current();if(!(await this.fleetSessions(projectId)).sessions.some(row=>row.id===sessionId))throw Error('RESEARCH_SPECIALIST_SESSION_DENIED');
  const directory=path.join(resolvePaths(projectId).kadyDir,'native-specialists');assertResearchPath(directory);
  const saved:{id:string;label:string}[]=[];let bytes=0;
  if(fs.existsSync(directory)){
   const entries=fs.readdirSync(directory,{withFileTypes:true});if(entries.length>5000)throw Error('RESEARCH_SPECIALIST_STORE_LIMIT');
   for(const entry of entries){const file=path.join(directory,entry.name);assertResearchPath(file);if(!entry.isFile()||!entry.name.endsWith('.json')||!uuid.test(entry.name.slice(0,-5)))throw Error('RESEARCH_SPECIALIST_RECEIPT_INVALID');const size=fs.statSync(file).size;bytes+=size;if(size>524288||bytes>8388608)throw Error('RESEARCH_SPECIALIST_STORE_LIMIT');const row=JSON.parse(fs.readFileSync(file,'utf8'));if(row.schemaVersion!==1||typeof row.sessionId!=='string'||!['admitting','accepted'].includes(row.state)||row.input?.operationId!==entry.name.slice(0,-5)||typeof row.input?.label!=='string')throw Error('RESEARCH_SPECIALIST_RECEIPT_INVALID');if(row.sessionId===sessionId)saved.push({id:row.input.operationId,label:row.input.label})}
  }
  const runs:{id:string;kind:string;label:string;state:string;children:never[]}[]=[];
  for(const row of saved.slice(0,200)){
   let state='unknown';try{const observed=await this.specialist(projectId,sessionId,'fleet-'+row.id,{action:'inspect',operationId:row.id}) as Record<string,unknown>;if(observed.operationId!==row.id||observed.parentSessionId!==sessionId||typeof observed.nativeSessionId!=='string'||!['admitting','running','completed','failed','unknown'].includes(String(observed.state)))throw Error('RESEARCH_SPECIALIST_RECEIPT_INVALID');state=String(observed.state)}catch(error){this.current();if((error as Error).message==='RESEARCH_SPECIALIST_RECEIPT_INVALID')throw error;}
   runs.push({id:row.id,kind:'native-specialist',label:row.label,state,children:[]});
  }
  this.current();return {text:runs.length?runs.map(row=>`${row.label}: ${row.state}`).join('\n'):'No native specialists in this conversation.',asyncSnapshot:{runs,omitted:{runs:Math.max(0,saved.length-runs.length),children:0,byteLimitExceeded:false}}};
 }
 async fleetControl(projectId:string,sessionId:string,callId:string,action:string,value:unknown){
  const input=record(value);if(!['transcript','steer','stop','resume'].includes(action)||Object.keys(input).some(key=>!['runId','message','index'].includes(key))||typeof input.runId!=='string'||!uuid.test(input.runId)||input.index!==undefined||['steer','resume'].includes(action)&&(typeof input.message!=='string'||!input.message.trim()||input.message.length>16000))throw Error('RESEARCH_SPECIALIST_INPUT_INVALID');
  if(!(await this.fleet(projectId,sessionId)).asyncSnapshot.runs.some(row=>row.id===input.runId))throw Error('RESEARCH_SPECIALIST_RUN_DENIED');
  const command=action==='transcript'?{action:'transcript',operationId:input.runId}:action==='stop'?{action:'cancel',operationId:input.runId}:{action:'steer',operationId:input.runId,message:input.message};
  const result=await this.specialist(projectId,sessionId,callId,command) as Record<string,unknown>;
  return {text:action==='transcript'?typeof result.text==='string'?result.text:'Native transcript is unavailable.':action==='stop'?'Stop requested for the existing native specialist.':'Message delivered to the existing native specialist.'};
 }
 async fusion(projectId:string,sessionId:string,callId:string,value:unknown){
  this.current();const args=record(value);if(Object.keys(args).some(key=>!['action','prompt','preset','models','judge','operationId'].includes(key)))throw Error('RESEARCH_COMPOSITION_INPUT_INVALID')
  if(args.action==='list'){if(Object.keys(args).length!==1)throw Error('RESEARCH_COMPOSITION_INPUT_INVALID');return readNativeCompositionPresets(projectId).state}
  if(args.preset!==undefined&&(typeof args.preset!=='string'||!uuid.test(args.preset)||args.models!==undefined||args.judge!==undefined))throw Error('RESEARCH_COMPOSITION_INPUT_INVALID');const preset=args.preset===undefined?undefined:readNativeCompositionPresets(projectId).state.presets.find(row=>row.id===args.preset);if(args.preset!==undefined&&!preset)throw Error('RESEARCH_COMPOSITION_PRESET_UNAVAILABLE')
  const input=args.action==='compose'?{action:'compose',operationId:operationId(projectId,sessionId,callId),prompt:args.prompt,models:preset?.models??args.models,judge:preset?.judge??args.judge}:['inspect','cancel'].includes(String(args.action))&&typeof args.operationId==='string'&&uuid.test(args.operationId)?{action:args.action==='cancel'?'composition-cancel':'composition-inspect',operationId:args.operationId}:null
  if(!input)throw Error('RESEARCH_COMPOSITION_INPUT_INVALID');const result=await this.channel.request(projectId,'advanced',input,new AbortController().signal,sessionId);this.current();return result
 }
 async specialist(projectId:string,sessionId:string,callId:string,value:unknown):Promise<unknown>{
  this.current();const args=record(value);if(Object.keys(args).some(key=>!['action','agent','task','model','operationId','message'].includes(key)))throw Error('RESEARCH_SPECIALIST_INPUT_INVALID');
  if(args.action!=='start'){
   if(!['inspect','transcript','cancel','steer'].includes(String(args.action))||typeof args.operationId!=='string'||!uuid.test(args.operationId))throw Error('RESEARCH_SPECIALIST_INPUT_INVALID');
   const input=args.action==='steer'?{action:'steer',operationId:args.operationId,requestId:operationId(projectId,sessionId,callId),message:args.message}:{action:args.action,operationId:args.operationId};
   const result=await this.channel.request(projectId,'advanced',input,new AbortController().signal,sessionId);this.current();return result;
  }
  if(typeof args.agent!=='string'||typeof args.task!=='string'||!args.task.trim()||args.task.length>65536||args.model!==undefined&&typeof args.model!=='string')throw Error('RESEARCH_SPECIALIST_INPUT_INVALID');
  const id=operationId(projectId,sessionId,callId),signature=JSON.stringify(args),previous=this.pending.get(id);
  if(previous){if(previous.signature!==signature)throw Error('RESEARCH_SPECIALIST_OPERATION_CONFLICT');return previous.value;}
  const promise=this.start(projectId,sessionId,id,args,signature).finally(()=>{if(this.pending.get(id)?.value===promise)this.pending.delete(id)});this.pending.set(id,{signature,value:promise});return promise;
 }
 private async start(projectId:string,sessionId:string,id:string,args:Record<string,unknown>,signature:string){
  const paths=resolvePaths(projectId),directory=path.join(paths.kadyDir,'native-specialists'),file=path.join(directory,id+'.json');assertResearchPath(file);
  try{const stat=fs.statSync(file);if(stat.size>524288)throw Error('RESEARCH_SPECIALIST_RECEIPT_INVALID');const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.signature!==signature||saved.sessionId!==sessionId)throw Error('RESEARCH_SPECIALIST_OPERATION_CONFLICT');if(saved.state==='accepted')return saved.result;throw Error('RESEARCH_SPECIALIST_OUTCOME_UNCONFIRMED');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const input=this.freezeSpecialist(projectId,args,id);
  this.current();assertResearchPath(directory);fs.mkdirSync(directory,{recursive:true});assertResearchPath(file);fs.writeFileSync(file,JSON.stringify({schemaVersion:1,sessionId,signature,state:'admitting',input})+'\n',{flag:'wx',mode:0o600});
  const result=await this.channel.request(projectId,'advanced',input,new AbortController().signal,sessionId);this.current();assertResearchPath(file);const temporary=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify({schemaVersion:1,sessionId,signature,state:'accepted',input,result})+'\n',{flag:'wx',mode:0o600});fs.renameSync(temporary,file);return result;
 }
}
