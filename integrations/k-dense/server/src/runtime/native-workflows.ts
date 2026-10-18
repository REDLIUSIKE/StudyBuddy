/** Keep the lock-pinned workflow Worker; every child executes in an admitted native Session. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {parse} from 'acorn';
import {runWorkflowScript,validateWorkflowScript,type WorkflowScriptChildResult,type WorkflowScriptResult} from './workflow-engine.ts';
import {buildStructuredWorkflowScript} from './workflow-engine.ts';
import {normalizeWorkflowHostCommandParams} from './workflow-engine.ts';
import {classifyFilePath} from '../agent/bash-classifier.ts';
import {readGuardPolicy} from '../agent/guard-policy.ts';
import {listAgents,isExternalCliAgent} from '../agent/agent-files.ts';
import {resolvePaths} from '../projects.ts';
import {assertResearchPath} from './project-storage.ts';
import {isWithin} from '../sandbox-fs.ts';
import {NativeAdvancedWorkflows} from './native-advanced.ts';
import type {NativeChannel} from './native-channel.ts';

export const NativeWorkflowSchema={type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['run','inspect','cancel']},workflow:{anyOf:[{type:'boolean'},{type:'string'}]},workflowScript:{type:'string',maxLength:65536},tasks:{type:'array',items:{type:'object'}},chain:{type:'array',items:{type:'object'}},task:{type:'string'},args:{type:'object'},model:{type:'string'},context:{type:'string',enum:['fresh','profile']},async:{type:'boolean'},timeoutMs:{type:'integer',minimum:1,maximum:86400000},globalConcurrencyLimit:{type:'integer',minimum:1,maximum:20},operationId:{type:'string'}},required:['action']};
type Definition=ReturnType<NativeAdvancedWorkflows['freezeSpecialist']>;
interface Target {schemaVersion:1;rootSessionId:string;actorSessionId:string;workflowScript:string;args:Record<string,unknown>;definitions:Record<string,Definition>;timeoutMs:number;globalConcurrencyLimit:number;context:'fresh'|'profile'|null;model:string|null}
interface Receipt {operationId:string;parentSessionId:string;state:'running'|'completed'|'failed'|'unknown';text?:string;error?:string;result?:WorkflowScriptResult;children:{key:string;operationId:string;nativeSessionId?:string}[]}
interface Row {projectId:string;target:Target;signature:string;file:string;receipt:Receipt;controller:AbortController;settled:Promise<void>}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('RESEARCH_WORKFLOW_INPUT_INVALID');return value as Record<string,unknown>}
function identity(value:unknown):string {const hex=createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`}
function bounded(value:unknown,bytes=131072){if(Buffer.byteLength(JSON.stringify(value))>bytes)throw Error('RESEARCH_WORKFLOW_LIMIT')}
/** Static literals are exact; computed targets require freezing the enabled roster. */
function targets(script:string){const agents=new Set<string>(),models=new Set<string>();let dynamic=false;const literal=(node:Record<string,any>|undefined)=>node?.type==='Literal'&&typeof node.value==='string'?node.value:node?.type==='TemplateLiteral'&&node.expressions.length===0?node.quasis[0].value.cooked:undefined;const walk=(value:unknown)=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return}const node=value as Record<string,any>;if(node.type==='SpreadElement')dynamic=true;if(node.type==='Property'){const key=node.computed?literal(node.key):node.key.name??node.key.value;if(key==='agent'||key==='model'){const name=literal(node.value);if(typeof name==='string')(key==='agent'?agents:models).add(name);else dynamic=true}else if(node.computed&&key===undefined)dynamic=true}Object.values(node).forEach(walk)};walk(parse(script,{ecmaVersion:'latest',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:true}));return {agents,models,dynamic}}

/** Workflow intent/outcomes are authored local metadata; usage and billing remain native/gateway authority. */
export class NativeResearchWorkflows {
 private readonly rows=new Map<string,Row>();
 private readonly pending=new Map<string,Promise<Receipt>>();
 constructor(private readonly channel:NativeChannel,private readonly advanced:NativeAdvancedWorkflows){}
 private current(){if(!this.channel.current())throw Error('RESEARCH_CONTEXT_REVOKED')}
 private async request(projectId:string,root:string,actor:string,input:unknown,signal=new AbortController().signal){this.current();signal.throwIfAborted();const result=await this.channel.request(projectId,'advanced',root===actor?input:{action:'for-caller',callerSessionId:actor,input},signal,root);this.current();signal.throwIfAborted();return result}
 /** Freeze definitions and exact native capabilities before scheduling; this performs no model requests. */
 async prepare(projectId:string,sessionId:string,callId:string,value:unknown,actorSessionId=sessionId){
  this.current();const input=record(value),paths=resolvePaths(projectId);let script:string;
  const sourceCount=['workflowScript','tasks','chain','workflow'].filter(key=>input[key]!==undefined).length;
  if(sourceCount!==1)throw Error('RESEARCH_WORKFLOW_SOURCE_REQUIRED');
  if(typeof input.workflowScript==='string')script=input.workflowScript;
  else if(input.tasks!==undefined||input.chain!==undefined)script=buildStructuredWorkflowScript(input.tasks!==undefined?'tasks':'chain',input.tasks??input.chain,typeof input.task==='string'?input.task:undefined);
  else if(typeof input.workflow==='string'){
   const file=path.resolve(paths.sandbox,input.workflow);
   if(file===paths.sandbox||!isWithin(paths.sandbox,file))throw Error('RESEARCH_WORKFLOW_PATH_DENIED');assertResearchPath(file);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw Error('RESEARCH_WORKFLOW_SOURCE_INVALID');script=fs.readFileSync(file,'utf8');
  }else if(input.workflow===true){const result=record(await this.request(projectId,sessionId,actorSessionId,{action:'reply-workflow',callId}));if(typeof result.workflowScript!=='string')throw Error('RESEARCH_WORKFLOW_REPLY_REQUIRED');script=result.workflowScript}
  else throw Error('RESEARCH_WORKFLOW_SOURCE_REQUIRED');
  if(!script.trim()||Buffer.byteLength(script)>65536||input.model!==undefined&&typeof input.model!=='string'||input.context!==undefined&&!['fresh','profile'].includes(String(input.context)))throw Error('RESEARCH_WORKFLOW_INPUT_INVALID');
  const agents=listAgents(paths).filter(agent=>agent.enabled!==false&&!isExternalCliAgent(agent)),available=new Set(agents.map(agent=>agent.name));
  const validation=validateWorkflowScript(script,{maxSubagentSpawnsPerRun:64,agentNameError:name=>available.has(name)?undefined:'Enabled native specialist is required.'});if(!validation.ok)throw Error('RESEARCH_WORKFLOW_SCRIPT_INVALID: '+validation.errors.map(error=>error.message).join('; ').slice(0,2048));
  const definitions:Record<string,Definition>={},used=targets(script);
  for(const agent of agents.filter(agent=>used.dynamic||used.agents.has(agent.name))){
   const variants=[undefined,...(input.model===undefined?used.models:[])];
   for(const model of variants){
   const raw=this.advanced.freezeSpecialist(projectId,{agent:agent.name,task:'Frozen workflow child',...(model===undefined&&input.model===undefined?{}:{model:model??input.model})});if(input.context!==undefined)raw.inheritParentContext=input.context==='profile';
   const frozen=record(await this.request(projectId,sessionId,actorSessionId,{action:'freeze-specialist',input:raw}));if(typeof frozen.modelRef!=='string'||!Array.isArray(frozen.tools)||frozen.label!==agent.name)throw Error('RESEARCH_WORKFLOW_FROZEN_INVALID');definitions[model===undefined?agent.name:agent.name+'\t'+model]=frozen as unknown as Definition;
   }
  }
  const args=input.args===undefined?{}:record(input.args),timeoutMs=input.timeoutMs??86400000,globalConcurrencyLimit=input.globalConcurrencyLimit??20;
  if(!Number.isSafeInteger(timeoutMs)||Number(timeoutMs)<1||Number(timeoutMs)>86400000||!Number.isSafeInteger(globalConcurrencyLimit)||Number(globalConcurrencyLimit)<1||Number(globalConcurrencyLimit)>20)throw Error('RESEARCH_WORKFLOW_INPUT_INVALID');
  const target:Target={schemaVersion:1,rootSessionId:sessionId,actorSessionId,workflowScript:script,args:structuredClone(args),definitions,timeoutMs:Number(timeoutMs),globalConcurrencyLimit:Number(globalConcurrencyLimit),context:input.context as 'fresh'|'profile'|undefined??null,model:typeof input.model==='string'?input.model:null};bounded(target);
  const models=[...new Set(Object.values(definitions).map(row=>row.modelRef))];
  if(!models.length){const raw={action:'start',operationId:randomUUID(),label:'Workflow source',prompt:'No model work',persona:'',modelRef:input.model??null,reasoningEffort:null,tools:[],inheritParentContext:false,maxTokens:1};const frozen=record(await this.request(projectId,sessionId,actorSessionId,{action:'freeze-specialist',input:raw}));if(typeof frozen.modelRef!=='string')throw Error('RESEARCH_WORKFLOW_FROZEN_INVALID');models.push(frozen.modelRef)}
  return {model:models.join(' · '),workflowScript:script,target};
 }
 private parseTarget(value:unknown,sessionId:string,actorSessionId:string):Target {
  const target=record(value);if(Object.keys(target).sort().join(',')!=='actorSessionId,args,context,definitions,globalConcurrencyLimit,model,rootSessionId,schemaVersion,timeoutMs,workflowScript'||target.schemaVersion!==1||target.rootSessionId!==sessionId||target.actorSessionId!==actorSessionId||typeof target.workflowScript!=='string'||!target.workflowScript.trim()||target.workflowScript.length>65536||!Number.isSafeInteger(target.timeoutMs)||Number(target.timeoutMs)<1||Number(target.timeoutMs)>86400000||!Number.isSafeInteger(target.globalConcurrencyLimit)||Number(target.globalConcurrencyLimit)<1||Number(target.globalConcurrencyLimit)>20||target.context!==null&&!['fresh','profile'].includes(String(target.context))||target.model!==null&&typeof target.model!=='string')throw Error('RESEARCH_WORKFLOW_FROZEN_INVALID');record(target.args);record(target.definitions);bounded(target);return structuredClone(target) as unknown as Target;
 }
 private file(projectId:string,id:string){if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId)||!uuid.test(id))throw Error('RESEARCH_WORKFLOW_INPUT_INVALID');const directory=path.join(resolvePaths(projectId).kadyDir,'native-workflows');assertResearchPath(directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,id+'.json');assertResearchPath(file);return file}
 private save(row:Row){this.current();assertResearchPath(row.file);const text=JSON.stringify({schemaVersion:1,target:row.target,signature:row.signature,receipt:row.receipt})+'\n';if(Buffer.byteLength(text)>1048576)throw Error('RESEARCH_WORKFLOW_RECEIPT_LIMIT');const temporary=row.file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,text,{flag:'wx',mode:0o600});assertResearchPath(row.file);fs.renameSync(temporary,row.file)}
 /** Private start-frozen is never in the model catalog; uncertain operations cannot be submitted twice. */
 async invoke(projectId:string,sessionId:string,callId:string,value:unknown,actorSessionId=sessionId):Promise<Receipt|Awaited<ReturnType<NativeResearchWorkflows['prepare']>>>{
  this.current();const args=record(value),action=args.action;
  if(action==='prepare')return this.prepare(projectId,sessionId,callId,args.target,actorSessionId);
  if(action==='run'){const {action:_action,...data}=args,prepared=await this.prepare(projectId,sessionId,callId,data,actorSessionId);return this.start(projectId,sessionId,actorSessionId,identity([projectId,actorSessionId,callId]),prepared.target)}
  if(action==='start-frozen'){if(Object.keys(args).sort().join(',')!=='action,operationId,target'||typeof args.operationId!=='string'||!uuid.test(args.operationId))throw Error('RESEARCH_WORKFLOW_INPUT_INVALID');return this.start(projectId,sessionId,actorSessionId,args.operationId,this.parseTarget(args.target,sessionId,actorSessionId))}
  if(!['inspect','cancel'].includes(String(action))||Object.keys(args).length!==2||typeof args.operationId!=='string'||!uuid.test(args.operationId))throw Error('RESEARCH_WORKFLOW_INPUT_INVALID');
  const id=args.operationId,row=this.rows.get(id);if(row&&(row.projectId!==projectId||row.target.rootSessionId!==sessionId||row.target.actorSessionId!==actorSessionId))throw Error('RESEARCH_WORKFLOW_OWNER_DENIED');
  if(action==='cancel'&&row){row.controller.abort();await row.settled;return structuredClone(row.receipt)}
  if(row)return structuredClone(row.receipt);
  const file=this.file(projectId,id),stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1048576)throw Error('RESEARCH_WORKFLOW_RECEIPT_INVALID');const saved=record(JSON.parse(fs.readFileSync(file,'utf8'))),target=this.parseTarget(saved.target,sessionId,actorSessionId),receipt=record(saved.receipt);
  if(saved.schemaVersion!==1||receipt.operationId!==id||receipt.parentSessionId!==actorSessionId||!['running','completed','failed','unknown'].includes(String(receipt.state)))throw Error('RESEARCH_WORKFLOW_RECEIPT_INVALID');
  return {...receipt,...(receipt.state==='running'?{state:'unknown',error:'RESEARCH_WORKFLOW_OUTCOME_UNCONFIRMED'}:{})} as unknown as Receipt;
 }
 private async start(projectId:string,root:string,actor:string,id:string,target:Target):Promise<Receipt>{
  const signature=JSON.stringify(target),existing=this.rows.get(id);if(existing){if(existing.projectId!==projectId||existing.signature!==signature)throw Error('RESEARCH_WORKFLOW_OPERATION_CONFLICT');return structuredClone(existing.receipt)}
  const file=this.file(projectId,id);if(fs.existsSync(file)){const saved=record(JSON.parse(fs.readFileSync(file,'utf8')));if(saved.signature!==signature)throw Error('RESEARCH_WORKFLOW_OPERATION_CONFLICT');return this.invoke(projectId,root,'observe:'+id,{action:'inspect',operationId:id},actor) as Promise<Receipt>}
  const pending=this.pending.get(id);if(pending)return pending;
  const row:Row={projectId,target:structuredClone(target),signature,file,controller:new AbortController(),receipt:{operationId:id,parentSessionId:actor,state:'running',children:[]},settled:Promise.resolve()};
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,target:row.target,signature,receipt:row.receipt})+'\n',{flag:'wx',mode:0o600});this.rows.set(id,row);
  const deadline=setTimeout(()=>row.controller.abort(),target.timeoutMs);deadline.unref();
  row.settled=this.execute(row).then(result=>{row.receipt.result=result;row.receipt.text=JSON.stringify(result.value).slice(0,65536);row.receipt.state='completed';this.save(row)},error=>{row.receipt.state=row.controller.signal.aborted?'failed':String((error as Error).message).includes('OUTCOME_UNCONFIRMED')?'unknown':'failed';row.receipt.error=(error instanceof Error?error.message:'RESEARCH_WORKFLOW_FAILED').slice(0,2048);if(error&&typeof error==='object'&&'partial'in error)row.receipt.result={...record(error.partial),value:null} as unknown as WorkflowScriptResult;if(this.channel.current())this.save(row)}).catch(()=>{row.receipt.state='unknown'}).finally(()=>clearTimeout(deadline));
  return structuredClone(row.receipt);
 }
 private async execute(row:Row):Promise<WorkflowScriptResult>{
  const target=row.target,children=new Map<string,{id:string;definition:Definition}>(),pause=(signal:AbortSignal)=>new Promise<void>(resolve=>{const timer=setTimeout(done,200);function done(){signal.removeEventListener('abort',done);clearTimeout(timer);resolve()}signal.addEventListener('abort',done,{once:true})});
  const observe=async(key:string,signal:AbortSignal):Promise<WorkflowScriptChildResult>=>{
   const child=children.get(key)??[...children.values()].find(row=>row.id===key);if(!child)throw Error('RESEARCH_WORKFLOW_CHILD_NOT_FOUND');
   const receipt=record(await this.request(row.projectId,target.rootSessionId,target.actorSessionId,{action:'inspect',operationId:child.id},signal));
   return {key,agent:child.definition.label,runId:typeof receipt.nativeSessionId==='string'?receipt.nativeSessionId:undefined,ok:receipt.state==='completed',...(receipt.state==='running'?{state:'running' as const}:{}),output:typeof receipt.text==='string'?receipt.text:'',...(receipt.state==='failed'||receipt.state==='unknown'?{error:typeof receipt.error==='string'?receipt.error:'RESEARCH_WORKFLOW_OUTCOME_UNCONFIRMED'}:{}),artifactPaths:[]};
  };
  const result=await runWorkflowScript({script:target.workflowScript,args:target.args,processCwd:resolvePaths(row.projectId).sandbox,workflowRunId:row.receipt.operationId,timeoutMs:target.timeoutMs,globalConcurrencyLimit:target.globalConcurrencyLimit,signal:row.controller.signal,
   launch:async(key,params,signal)=>{
    this.current();if(typeof params.agent!=='string'||typeof params.task!=='string'||!params.task.trim()||params.task.length>65536)throw Error('RESEARCH_WORKFLOW_CHILD_INVALID');
    const unsupported=Object.keys(params).filter(key=>!['agent','task','model','context','phase','label','lane','async','timeoutMs','maxRuntimeMs'].includes(key));if(unsupported.length)throw Error('RESEARCH_WORKFLOW_NATIVE_CONTROL_UNAVAILABLE: '+unsupported.join(','));
    const base=target.definitions[params.agent],definition=target.model!==null||params.model===undefined||params.model===base?.modelRef?base:target.definitions[params.agent+'\t'+params.model];if(!definition||target.model===null&&params.model!==undefined&&params.model!==definition.modelRef||target.context===null&&params.context!==undefined&&(params.context==='fork')!==definition.inheritParentContext)throw Error('RESEARCH_WORKFLOW_FROZEN_TARGET_CONFLICT');
    const id=identity([row.receipt.operationId,key]),prior=children.get(key);if(prior)throw Error('RESEARCH_WORKFLOW_CHILD_OPERATION_CONFLICT');if(children.size>=64)throw Error('RESEARCH_WORKFLOW_FANOUT_LIMIT');children.set(key,{id,definition});const childRow:{key:string;operationId:string;nativeSessionId?:string}={key,operationId:id};row.receipt.children.push(childRow);this.save(row);
    const started=record(await this.request(row.projectId,target.rootSessionId,target.actorSessionId,{...definition,operationId:id,prompt:params.task},signal));
    childRow.nativeSessionId=typeof started.nativeSessionId==='string'?started.nativeSessionId:undefined;this.save(row);
    if(started.state==='unknown')throw Error('RESEARCH_WORKFLOW_OUTCOME_UNCONFIRMED');
    if(params.async===true)return observe(key,signal);
    try{
     if(['completed','failed'].includes(String(started.state)))return {key,agent:definition.label,runId:String(started.nativeSessionId),ok:started.state==='completed',output:typeof started.text==='string'?started.text:'',...(started.state==='failed'?{error:String(started.error??'Native child failed')}:{ }),artifactPaths:[]};
     for(;;){signal.throwIfAborted();const observed=await observe(key,signal);if(observed.state!=='running')return observed;await new Promise<void>(resolve=>{const timer=setTimeout(done,200);function done(){signal.removeEventListener('abort',done);clearTimeout(timer);resolve()}signal.addEventListener('abort',done,{once:true})})}
    }finally{if(signal.aborted&&this.channel.current())await this.request(row.projectId,target.rootSessionId,target.actorSessionId,{action:'cancel',operationId:id}).catch(()=>undefined)}
   },status:observe,
   steer:async(key,message,_options,signal)=>{const child=children.get(key);if(!child)throw Error('RESEARCH_WORKFLOW_CHILD_NOT_FOUND');await this.request(row.projectId,target.rootSessionId,target.actorSessionId,{action:'steer',operationId:child.id,requestId:identity([row.receipt.operationId,key,message]),message},signal);return {key,state:'delivered'}},
   host:async(key,value,signal)=>{
    const params=normalizeWorkflowHostCommandParams(value),root=resolvePaths(row.projectId).sandbox;
    const destination=params.output===undefined?path.join(root,'.kady','native-workflows',row.receipt.operationId+'.'+key+'.log'):path.resolve(root,params.output);
    if(!isWithin(root,destination))throw Error('RESEARCH_WORKFLOW_OUTPUT_DENIED');assertResearchPath(destination);
    if(params.output!==undefined){const policy=readGuardPolicy(root),verdict=classifyFilePath(destination,{sandboxRoot:root,protectedGlobs:[...policy.protectedPaths,'.kady/**','.studybuddy/**']});if(verdict.kind==='protected')throw Error('RESEARCH_WORKFLOW_OUTPUT_DENIED')}
    const stat=fs.existsSync(destination)?fs.lstatSync(destination):undefined;if(stat&&(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1))throw Error('RESEARCH_WORKFLOW_OUTPUT_DENIED');
    const id=identity([row.receipt.operationId,key,'host']),invoke=(input:unknown,active?:AbortSignal)=>this.request(row.projectId,target.rootSessionId,target.actorSessionId,{action:'workflow-host',input},active);
    let receipt=record(await invoke({action:'start',operationId:id,command:params.command,timeoutMs:params.timeoutMs},signal));
    try{while(receipt.state==='running'){signal.throwIfAborted();await pause(signal);receipt=record(await invoke({action:'inspect',operationId:id},signal))}}
    finally{if(signal.aborted&&this.channel.current())await invoke({action:'cancel',operationId:id}).catch(()=>undefined)}
    if(receipt.state==='unknown')throw Error('RESEARCH_WORKFLOW_HOST_OUTCOME_UNCONFIRMED');
    if(!receipt.result)return {key,kind:'command',ok:false,state:receipt.timedOut===true?'timed-out':receipt.aborted===true||receipt.state==='cancelled'?'stopped':'failed',exitCode:null,stdout:'',stderr:'',outputPath:'',durationMs:typeof receipt.durationMs==='number'?receipt.durationMs:0,error:'Native canonical process result is unavailable; output and exit status were not inferred.'};
    const result=record(receipt.result),stdout=record(result.stdout),stderr=record(result.stderr);if(result.kind!=='foreground'||typeof stdout.text!=='string'||typeof stderr.text!=='string'||!(result.exitCode===null||Number.isInteger(result.exitCode)))throw Error('RESEARCH_WORKFLOW_HOST_RESULT_INVALID');
    this.current();assertResearchPath(destination);fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});assertResearchPath(destination);const temporary=destination+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,stdout.text+stderr.text,{flag:'wx',mode:0o600});this.current();assertResearchPath(destination);fs.renameSync(temporary,destination);
    return {key,kind:'command',ok:receipt.state==='completed',state:receipt.state==='completed'?'passed':result.timedOut===true?'timed-out':result.aborted===true?'stopped':'failed',exitCode:result.exitCode as number|null,stdout:stdout.text,stderr:stderr.text,outputPath:destination,durationMs:typeof receipt.durationMs==='number'?receipt.durationMs:0,nativeObservation:{operationId:id,stdoutTruncated:stdout.truncated===true,stderrTruncated:stderr.truncated===true,limitations:'Output is the native shell preview; truncated output is not a complete process capture.'}};
   },
  });
  // An explicit async launch is a launch receipt. Keep the workflow running
  // until each original native child reaches a terminal observation.
  for(const child of result.children.filter(child=>child.state==='running')){
   for(;;){row.controller.signal.throwIfAborted();const terminal=await observe(child.key,row.controller.signal);if(terminal.state!=='running'){Object.assign(child,terminal);delete child.state;if(!terminal.ok)throw Error(terminal.error??'RESEARCH_WORKFLOW_CHILD_FAILED');break}await new Promise<void>(resolve=>{const timer=setTimeout(done,200);function done(){row.controller.signal.removeEventListener('abort',done);clearTimeout(timer);resolve()}row.controller.signal.addEventListener('abort',done,{once:true})})}
  }
  return result;
 }
 async settled(id:string):Promise<void>{await this.rows.get(id)?.settled}
 async close(projectId?:string):Promise<void>{const rows=[...this.rows.values()].filter(row=>projectId===undefined||row.projectId===projectId);for(const row of rows)row.controller.abort();await Promise.all(rows.map(row=>row.settled));for(const row of rows)this.rows.delete(row.receipt.operationId)}
}
