/** Real independent-service calls owned by the admitted local runtime. No gateway or wallet mediation. */
import path from 'node:path';import {createHash} from 'node:crypto';import {IndependentSearch,IndependentSearchParameters} from './independent-search.ts';import {NativeServiceCredentials} from './native-service-credentials.ts';
import {AutoDLJobs} from '../autodl/manager.ts';import {connectAutoDL} from '../autodl/ssh.ts';import {AutoDLApi} from '../autodl/api.ts';import type {AutoDLConnect} from '../autodl/types.ts';import {modalJobManager} from '../modal/manager.ts';import {resolvePaths} from '../projects.ts';import {atomicJson} from '../atomic-json.ts';import fs from 'node:fs';import {assertResearchPath} from './project-storage.ts';
import {IndependentServiceAdmissions} from './independent-service-admissions.ts';
export const independentServiceTools=[
 {name:'research_web_search',description:'Search public webpages through the web provider selected in Settings (Exa or Bocha). Uses the user’s own provider account; returns titles, links, summaries and sources.',parameters:IndependentSearchParameters},
 {name:'research_literature_search',description:'Search academic literature through the selected Paperclip or Metaso service. Metaso uses scope scholar, returns records and sources, and does not imply Paperclip full-text capabilities.',parameters:IndependentSearchParameters},
 {name:'research_compute',description:'Run owned scientific compute through selected Modal or AutoDL. Starting a GPU/remote job is chargeable in the user’s provider account and requires native confirmation. AutoDL creates a GPU instance, snapshots/uploads project files, executes with a time limit, retrieves logs/results and requests shutdown. Unknown creation is never retried. Inspect cleanup separately; shutdown-requested is not verified billing termination.',parameters:{type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['submit','list','status','logs','cancel','shutdown','reconcile']},jobId:{type:'string',maxLength:64},offset:{type:'integer',minimum:0},request:{type:'object',additionalProperties:true}},required:['action']}},
];
export class NativeIndependentServices {
 readonly search:IndependentSearch;readonly autodl:AutoDLJobs;
 private readonly admissions:IndependentServiceAdmissions;
 constructor(private readonly options:{store:NativeServiceCredentials;directory:string;current():boolean;searchFetch?:(url:string,init:RequestInit)=>Promise<Response>;autoDLApiFactory?:(token:string)=>AutoDLApi;autoDLConnect?:AutoDLConnect}){
  this.search=new IndependentSearch({store:options.store,receipts:path.join(options.directory,'search-receipts'),current:options.current,fetch:options.searchFetch});
  this.autodl=new AutoDLJobs({store:options.store,directory:path.join(options.directory,'autodl-jobs'),sandbox:project=>resolvePaths(project).sandbox,current:options.current,connect:options.autoDLConnect??connectAutoDL,api:options.autoDLApiFactory});
  this.admissions=new IndependentServiceAdmissions(path.join(options.directory,'compute-admissions'),options.store);
 }
 async invoke(projectId:string,sessionId:string,toolCallId:string,input:unknown,signal:AbortSignal):Promise<unknown>{
  signal.throwIfAborted();if(!this.options.current())throw Error('RESEARCH_CONTEXT_REVOKED');
  const row=input as {name?:unknown;arguments?:unknown};if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==2||!independentServiceTools.some(tool=>tool.name===row.name))throw Error('RESEARCH_SERVICE_TOOL_INVALID');
  if(row.name==='research_web_search'||row.name==='research_literature_search')return this.search.run(row.name==='research_web_search'?'web':'academic',row.arguments,{projectId,sessionId,toolCallId},signal);
  const args=row.arguments as {action?:unknown;request?:unknown;jobId?:unknown;offset?:unknown};if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['action','request','jobId','offset'].includes(key)))throw Error('RESEARCH_COMPUTE_INPUT_INVALID');
  if(args.action==='preflight'){const admission=this.admissions.prepare({projectId,sessionId,toolCallId},args.request);if(admission.provider==='autodl'){const prepared=this.autodl.prepare(projectId,sessionId,toolCallId,args.request);return {...admission,jobId:'autodl:'+prepared.id,inputFiles:prepared.inputs?.length??0,inputBytes:prepared.inputs?.reduce((sum,file)=>sum+file.bytes,0)??0};}return admission;}
  if(args.action==='list')return {selected:this.options.store.selection().compute,jobs:[...this.autodl.list(projectId).map(job=>({...job,jobId:'autodl:'+job.id,provider:'autodl'})),...modalJobManager.list(projectId).map(job=>({...job,jobId:'modal:'+job.id,provider:'modal'}))]};
  if(args.action==='submit'){
   if(args.jobId!==undefined||args.offset!==undefined)throw Error('RESEARCH_COMPUTE_INPUT_INVALID');
   const selected=this.admissions.require({projectId,sessionId,toolCallId},args.request);if(selected==='autodl'){const job=this.autodl.submit(projectId,sessionId,toolCallId,args.request);return {...job,provider:'autodl',jobId:'autodl:'+job.id,billing:'user-provider-account'};}
   this.options.store.secret('modalTokenId');this.options.store.secret('modalTokenSecret');
   if(!args.request||typeof args.request!=='object'||Array.isArray(args.request)||Object.keys(args.request).some(key=>!['command','instance','gpuCount','gpuFallback','image','environment','cache','filesIn','filesOut','timeoutSec','groupId','label'].includes(key)))throw Error('RESEARCH_COMPUTE_INPUT_INVALID');
   const receipt=path.join(this.options.directory,'modal-native-operations',createHash('sha256').update(JSON.stringify({projectId,sessionId,toolCallId})).digest('hex')+'.json');assertResearchPath(receipt);const signature=createHash('sha256').update(JSON.stringify(args.request)).digest('hex');
   if(fs.existsSync(receipt)){const old=JSON.parse(fs.readFileSync(receipt,'utf8'));if(old.signature!==signature)throw Error('RESEARCH_COMPUTE_OPERATION_CONFLICT');if(!old.jobId)throw Error('RESEARCH_COMPUTE_NOT_REPLAYABLE');const job=modalJobManager.get(projectId,old.jobId);return {...job,jobId:'modal:'+job.id,provider:'modal',billing:'user-provider-account'};}
   atomicJson(receipt,{signature,state:'pending'});const job=modalJobManager.submit(projectId,args.request as import('../modal/types.ts').ModalJobRequest,{sessionId,submittedBy:'lead'});atomicJson(receipt,{signature,state:'submitted',jobId:job.id});return {...job,jobId:'modal:'+job.id,provider:'modal',billing:'user-provider-account'};
  }
  if(typeof args.jobId!=='string'||!/^(autodl|modal):[a-f0-9-]{36}$/.test(args.jobId)||args.request!==undefined)throw Error('RESEARCH_COMPUTE_INPUT_INVALID');const [provider,id]=args.jobId.split(':') as ['autodl'|'modal',string];
  const job=provider==='autodl'?this.autodl.get(projectId,id):modalJobManager.get(projectId,id);
  if((provider==='autodl'?(job as import('../autodl/types.ts').AutoDLJob).sessionId:(job as import('../modal/types.ts').ModalJob).owner.sessionId)!==sessionId)throw Error('RESEARCH_COMPUTE_OWNER_REQUIRED');
  if(args.action==='status')return {provider,jobId:args.jobId,job};
  if(args.action==='logs'){if(provider==='autodl')return this.autodl.logs(projectId,id,(args.offset??0) as number);return modalJobManager.result(projectId,id);}
  if(args.action==='cancel'||args.action==='shutdown')return provider==='autodl'?(args.action==='cancel'?this.autodl.cancel(projectId,id):this.autodl.shutdown(projectId,id)):modalJobManager.cancel(projectId,id);
  if(args.action==='reconcile'&&provider==='autodl')return this.autodl.reconcile(projectId,id);
  throw Error('RESEARCH_COMPUTE_INPUT_INVALID');
 }
 async close(projectId?:string){await this.autodl.close(projectId);}
}
