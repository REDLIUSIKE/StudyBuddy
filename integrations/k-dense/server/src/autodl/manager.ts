/** Owned AutoDL jobs: durable create identity, exact file snapshots, observed output and explicit cleanup. */
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';
import {atomicJson} from '../atomic-json.ts';import {assertResearchPath} from '../runtime/project-storage.ts';import {NativeServiceCredentials} from '../runtime/native-service-credentials.ts';
import {AutoDLApi} from './api.ts';import type {AutoDLConnect,AutoDLJob,AutoDLJobRequest,AutoDLRemote} from './types.ts';
interface Options {store:NativeServiceCredentials;directory:string;sandbox(projectId:string):string;current():boolean;connect:AutoDLConnect;api?(token:string):AutoDLApi}
const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;
function relativeFile(value:unknown):string {if(typeof value!=='string'||value.length>2048||value.includes('\\')||value.includes('\0')||value.includes(':')||value.startsWith('/')||value.split('/').some(part=>!part||part==='.'||part==='..'||['.kady','.pi','.studybuddy'].includes(part)))throw Error('AUTODL_PATH_DENIED');return value;}
function digest(file:string):{bytes:number;sha256:string}{assertResearchPath(file);const fd=fs.openSync(file,'r'),hash=createHash('sha256'),buffer=Buffer.alloc(1048576);let bytes=0;try{for(;;){const read=fs.readSync(fd,buffer,0,buffer.length,null);if(!read)break;bytes+=read;hash.update(buffer.subarray(0,read));}return {bytes,sha256:hash.digest('hex')};}finally{fs.closeSync(fd);}}
function validate(input:unknown):AutoDLJobRequest {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['instance','command','filesIn','filesOut','timeoutSec'].includes(key)))throw Error('AUTODL_JOB_INPUT_INVALID');
 const x=input as AutoDLJobRequest,s=x.instance;if(!s||typeof s!=='object'||Object.keys(s).some(key=>!['gpuSpec','gpuCount','image','cudaMin','diskGB','regions'].includes(key))||!/^[-a-zA-Z0-9]{1,128}$/.test(s.gpuSpec)||!/^[-a-zA-Z0-9]{1,128}$/.test(s.image)||!Number.isInteger(s.gpuCount)||s.gpuCount<1||s.gpuCount>4||!Number.isInteger(s.diskGB)||s.diskGB<0||s.diskGB>500||!Number.isInteger(s.cudaMin)||s.cudaMin<1||s.cudaMin>999||s.regions!==undefined&&(!Array.isArray(s.regions)||s.regions.length>16||s.regions.some(item=>typeof item!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(item))))throw Error('AUTODL_GPU_INPUT_INVALID');
 if(typeof x.command!=='string'||!x.command.trim()||x.command.length>32768||x.command.includes('\0')||!Number.isInteger(x.timeoutSec)||x.timeoutSec<1||x.timeoutSec>86400||!Array.isArray(x.filesIn)||!Array.isArray(x.filesOut)||x.filesIn.length>512||x.filesOut.length>512)throw Error('AUTODL_JOB_INPUT_INVALID');
 x.filesIn.forEach(relativeFile);x.filesOut.forEach(relativeFile);return structuredClone(x);
}
export class AutoDLJobs {
 private readonly active=new Map<string,{controller:AbortController;promise:Promise<void>;remote?:AutoDLRemote}>();
 constructor(private readonly options:Options){assertResearchPath(options.directory);fs.mkdirSync(options.directory,{recursive:true});}
 private file(id:string):string{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('AUTODL_JOB_NOT_FOUND');const file=path.join(this.options.directory,id,'job.json');assertResearchPath(file);return file;}
 private save(job:AutoDLJob){atomicJson(this.file(job.id),job);}
 get(projectId:string,id:string):AutoDLJob {this.requireCurrent();let job:AutoDLJob;try{job=JSON.parse(fs.readFileSync(this.file(id),'utf8'));}catch{throw Error('AUTODL_JOB_NOT_FOUND');}if(job.schemaVersion!==1||job.id!==id||job.projectId!==projectId)throw Error('AUTODL_JOB_NOT_FOUND');return job;}
 list(projectId:string):AutoDLJob[]{this.requireCurrent();return fs.readdirSync(this.options.directory).filter(id=>/^[a-f0-9-]{36}$/.test(id)).map(id=>{try{return this.get(projectId,id)}catch{return undefined}}).filter((job):job is AutoDLJob=>!!job).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 prepare(projectId:string,sessionId:string,operationId:string,input:unknown):AutoDLJob {
  this.requireCurrent();if(![projectId,sessionId,operationId].every(value=>idPattern.test(value)))throw Error('AUTODL_OWNER_INVALID');const spec=validate(input);
  const previous=this.list(projectId).find(job=>job.sessionId===sessionId&&job.operationId===operationId);if(previous){if(JSON.stringify(previous.request)!==JSON.stringify(spec))throw Error('AUTODL_OPERATION_CONFLICT');return previous;}
  if(this.options.store.selection().compute!=='autodl')throw Error('AUTODL_NOT_SELECTED');const token=this.options.store.secret('autodlToken'),sandbox=this.options.sandbox(projectId);assertResearchPath(sandbox);
  // Validate input paths before a chargeable instance request. Missing input cannot allocate GPU.
  for(const name of spec.filesIn){const file=path.join(sandbox,name);assertResearchPath(file);if(!fs.existsSync(file))throw Error('AUTODL_INPUT_MISSING');}
  const job:AutoDLJob={schemaVersion:1,id:randomUUID(),projectId,sessionId,operationId,request:spec,state:'awaiting-approval',cleanup:'not-created',createdAt:new Date().toISOString()};this.save(job);try{this.snapshot(job,sandbox);}catch(error){job.state='failed';job.cleanup='not-created';job.error='AUTODL_INPUT_PREPARATION_FAILED';this.save(job);throw error;}return structuredClone(job);
 }
 submit(projectId:string,sessionId:string,operationId:string,input:unknown):AutoDLJob {
  const job=this.prepare(projectId,sessionId,operationId,input);if(job.state!=='awaiting-approval')return job;const token=this.options.store.secret('autodlToken'),sandbox=this.options.sandbox(projectId);
  const files=(job.inputs??[]).map(item=>{const local=path.join(this.options.directory,job.id,'inputs',item.path),actual=digest(local);if(actual.bytes!==item.bytes||actual.sha256!==item.sha256)throw Error('AUTODL_INPUT_SNAPSHOT_CHANGED');return {local,remote:item.path};});
  job.state='creating';job.cleanup='pending';this.save(job);
  const controller=new AbortController(),row={controller,promise:Promise.resolve() as Promise<void>,remote:undefined as AutoDLRemote|undefined};this.active.set(job.id,row);
  const timer=setTimeout(()=>controller.abort(),(job.request.timeoutSec+600)*1000);timer.unref();row.promise=this.run(job,sandbox,token,row,files).finally(()=>{clearTimeout(timer);this.active.delete(job.id)});row.promise.catch(()=>{});return structuredClone(job);
 }
 private async run(job:AutoDLJob,sandbox:string,token:string,row:{controller:AbortController;remote?:AutoDLRemote},files:{local:string;remote:string}[]){
  const api=this.options.api?.(token)??new AutoDLApi(token),signal=row.controller.signal;let remote:AutoDLRemote|undefined;
  try{
   this.requireCurrent();signal.throwIfAborted();
   job.instanceId=await api.create(job.request.instance,'StudyBuddy-'+job.id,signal);job.state='preparing';this.save(job);
   const deadline=Date.now()+300000;while(await api.status(job.instanceId,signal)!=='running'){if(Date.now()>deadline)throw Error('AUTODL_START_TIMEOUT');await delay(2000,undefined,{signal});this.requireCurrent();}
   const snapshot=await api.snapshot(job.instanceId,signal);remote=await this.options.connect(snapshot,{jobId:job.id,fingerprint:job.hostFingerprint,saveFingerprint:fingerprint=>{job.hostFingerprint=fingerprint;this.save(job)},signal});row.remote=remote;
   await remote.upload(files,signal);this.requireCurrent();signal.throwIfAborted();job.state='running';this.save(job);
   job.exitCode=await remote.execute({command:job.request.command,timeoutSec:job.request.timeoutSec},(stream,chunk)=>this.log(job,stream,chunk),signal);job.state='collecting';this.save(job);
   job.outputs=await remote.download(job.request.filesOut,path.join(sandbox,'results','autodl-'+job.id),signal);job.state=job.exitCode===0?'succeeded':'failed';if(job.exitCode!==0)job.error='AUTODL_COMMAND_FAILED';
  }catch(error){job.state=signal.aborted?'cancelled':job.instanceId?'failed':'unknown';job.error=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'AUTODL_JOB_FAILED';
   if(remote&&signal.aborted){try{await remote.cancel(AbortSignal.timeout(15000));job.outputs=await remote.download(job.request.filesOut,path.join(sandbox,'results','autodl-'+job.id),AbortSignal.timeout(30000));}catch{job.error='AUTODL_CANCEL_OR_RESULT_PENDING';}}
  }finally{
   // A successful power_off response is acceptance, not a fabricated terminal billing/status fact.
   if(job.instanceId){try{await api.powerOff(job.instanceId,AbortSignal.timeout(25000));job.cleanup='shutdown-requested';}catch{job.cleanup='shutdown-failed';}}
   else job.cleanup='instance-unknown';remote?.close();job.finishedAt=new Date().toISOString();this.save(job);
  }
 }
 private snapshot(job:AutoDLJob,sandbox:string):{local:string;remote:string}[]{
  const inputs:{local:string;remote:string}[]=[],seen=new Set<string>();job.inputs=[];let bytes=0;
  const visit=(name:string)=>{relativeFile(name);if(seen.has(name))return;seen.add(name);const file=path.join(sandbox,name);assertResearchPath(file);const info=fs.lstatSync(file);if(info.isDirectory()){for(const child of fs.readdirSync(file))visit(name+'/'+child);return;}if(!info.isFile()||inputs.length>=4096||(bytes+=info.size)>1073741824)throw Error('AUTODL_INPUT_LIMIT');const target=path.join(this.options.directory,job.id,'inputs',name);assertResearchPath(target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);assertResearchPath(file);const copied=digest(target);job.inputs!.push({path:name,...copied});inputs.push({local:target,remote:name});};job.request.filesIn.forEach(visit);this.save(job);return inputs;
 }
 private log(job:AutoDLJob,stream:'stdout'|'stderr',chunk:Buffer){const file=path.join(this.options.directory,job.id,'log.txt');assertResearchPath(file);const size=fs.existsSync(file)?fs.statSync(file).size:0;if(size<16777216)fs.appendFileSync(file,Buffer.concat([Buffer.from(stream==='stderr'?'[stderr] ':''),chunk]).subarray(0,16777216-size));}
 logs(projectId:string,id:string,offset:number){this.get(projectId,id);if(!Number.isSafeInteger(offset)||offset<0)throw Error('AUTODL_LOG_CURSOR_INVALID');const file=path.join(this.options.directory,id,'log.txt');assertResearchPath(file);if(!fs.existsSync(file))return {text:'',nextOffset:offset};const fd=fs.openSync(file,'r');try{const buf=Buffer.alloc(65536),count=fs.readSync(fd,buf,0,buf.length,offset);return {text:buf.subarray(0,count).toString('utf8'),nextOffset:offset+count};}finally{fs.closeSync(fd);}}
 async settled(id:string){await this.active.get(id)?.promise;}
 async cancel(projectId:string,id:string):Promise<AutoDLJob>{const job=this.get(projectId,id),row=this.active.get(id);if(job.state==='awaiting-approval'){job.state='cancelled';job.cleanup='not-created';this.save(job);return job;}if(row){row.controller.abort();await row.promise;return this.get(projectId,id);}if(job.instanceId&&job.cleanup!=='shutdown-requested')return this.shutdown(projectId,id);return job;}
 async shutdown(projectId:string,id:string):Promise<AutoDLJob>{const job=this.get(projectId,id);if(this.active.has(id))return this.cancel(projectId,id);if(!job.instanceId)throw Error('AUTODL_INSTANCE_RECONCILIATION_REQUIRED');const api=this.options.api?.(this.options.store.secret('autodlToken'))??new AutoDLApi(this.options.store.secret('autodlToken'));try{await api.powerOff(job.instanceId,AbortSignal.timeout(25000));job.cleanup='shutdown-requested';}catch{job.cleanup='shutdown-failed';this.save(job);throw Error('AUTODL_SHUTDOWN_FAILED');}this.save(job);return job;}
 async reconcile(projectId:string,id:string){const job=this.get(projectId,id);if(this.active.has(id))throw Error('AUTODL_JOB_ACTIVE');if(job.instanceId)return this.shutdown(projectId,id);const api=this.options.api?.(this.options.store.secret('autodlToken'))??new AutoDLApi(this.options.store.secret('autodlToken')),matches:string[]=[];for(let page=1;page<=20;page++){const result=await api.list(page,AbortSignal.timeout(25000));for(const instance of result.list)if(instance.name==='StudyBuddy-'+job.id&&/^pro-[a-zA-Z0-9-]{1,100}$/.test(instance.uuid))matches.push(instance.uuid);if(page>=result.max_page)break;}if(matches.length!==1)throw Error('AUTODL_INSTANCE_RECONCILIATION_REQUIRED');job.instanceId=matches[0];this.save(job);return this.shutdown(projectId,id);}
 async close(projectId?:string){const rows:Promise<void>[]=[];for(const [id,row] of this.active){const job=JSON.parse(fs.readFileSync(this.file(id),'utf8')) as AutoDLJob;if(!projectId||job.projectId===projectId){row.controller.abort();rows.push(row.promise);}}await Promise.allSettled(rows);}
 private requireCurrent(){if(!this.options.current())throw Error('RESEARCH_CONTEXT_REVOKED');assertResearchPath(this.options.directory);}
}
