import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import * as module from '../src/runtime/native-workflows.ts';
import {resolvePaths} from '../src/projects.ts';
import {writeProjectAgent} from '../src/agent/agent-files.ts';
import {NativeAdvancedWorkflows} from '../src/runtime/native-advanced.ts';
const roots:string[]=[];
afterEach(()=>{vi.unstubAllEnvs();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true})});
async function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-workflow-'));roots.push(root);vi.stubEnv('KADY_PROJECTS_ROOT',root);vi.stubEnv('KADY_RUNTIME_PROFILE','studybuddy');
 const paths=resolvePaths('study');fs.mkdirSync(paths.sandbox,{recursive:true});writeProjectAgent(paths,'science-worker',{systemPrompt:'Authored research',description:'fixture',model:'native/exact',tools:'read,notebook',inheritProjectContext:false,inheritSkills:false});
 const request=vi.fn(async(_project:string,operation:string,input:any)=>{
  if(operation!=='advanced')throw Error('UNEXPECTED_NON_NATIVE_OPERATION');
  if(input.action==='workflow-host')return {operationId:input.input.operationId,callerSessionId:'session-root',state:'completed',durationMs:2,result:{kind:'foreground',cwd:paths.sandbox,exitCode:0,signal:null,timedOut:false,aborted:false,timeoutMs:1000,stdout:{text:'Native command output',truncated:false},stderr:{text:'',truncated:false}}};
  if(input.action==='freeze-specialist')return {...input.input,modelRef:'native/exact',tools:['read','notebook']};
  const record=input.action==='for-caller'?input.input:input;
  if(record.action==='start')return {operationId:record.operationId,parentSessionId:'session-root',nativeSessionId:'session-'+record.operationId,state:'completed',text:record.prompt};
  if(record.action==='inspect')return {operationId:record.operationId,parentSessionId:'session-root',nativeSessionId:'session-'+record.operationId,state:'completed',text:'observed'};
  throw Error('UNEXPECTED_NATIVE_ACTION');
 });
 const channel={current:()=>true,request,events:async function*(){}};
 const constructor=(module as Record<string,any>).NativeResearchWorkflows;if(!constructor)throw Error('NATIVE_RESEARCH_WORKFLOW_NOT_IMPLEMENTED');
 return {paths,request,owner:new constructor(channel,new NativeAdvancedWorkflows(channel))};
}
it('runs the original isolated worker for parallel tasks and named sequential outputs with frozen native children',async()=>{
 const f=await fixture(),target=await f.owner.prepare('study','session-root','prepare-a',{chain:[{agent:'science-worker',task:'first',as:'initial'},{parallel:[{agent:'science-worker',task:'left {outputs.initial}'},{agent:'science-worker',task:'right {previous}'}]}]});
 writeProjectAgent(f.paths,'science-worker',{description:'changed',systemPrompt:'changed',model:'wrong/model'});
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await f.owner.invoke('study','session-root','run-a',{action:'start-frozen',operationId:id,target:target.target});await f.owner.settled(id);
 const receipt=await f.owner.invoke('study','session-root','inspect-a',{action:'inspect',operationId:id});expect(receipt.state).toBe('completed');
 const starts=f.request.mock.calls.filter(row=>(row[2] as any).action==='start');expect(starts).toHaveLength(3);expect(starts.map(row=>(row[2] as any).prompt)).toEqual(['first','left first','right first']);expect(starts.every(row=>(row[2] as any).modelRef==='native/exact'&&(row[2] as any).persona==='Authored research')).toBe(true);
 await f.owner.close();
});
it('keeps original runs.host syntax while calling native command control and preserving an owned output file',async()=>{
 const f=await fixture(),target=await f.owner.prepare('study','session-root','prepare-host',{workflowScript:'return await runs.host("check", {kind:"command", command:"Write-Output 7", timeoutMs:1000, output:"derived/check.log"});'}),id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 await f.owner.invoke('study','session-root','host-run',{action:'start-frozen',operationId:id,target:target.target});await f.owner.settled(id);const receipt=await f.owner.invoke('study','session-root','host-inspect',{action:'inspect',operationId:id});expect(receipt.state).toBe('completed');expect(receipt.result.value).toMatchObject({ok:true,state:'passed',exitCode:0,stdout:'Native command output'});expect(fs.readFileSync(path.join(f.paths.sandbox,'derived/check.log'),'utf8')).toBe('Native command output');expect(f.request.mock.calls.some(row=>(row[2] as any).action==='workflow-host')).toBe(true);await f.owner.close();
});
it('freezes a fresh scheduled context over saved fork defaults and conflicting child context controls',async()=>{
 const f=await fixture();writeProjectAgent(f.paths,'science-worker',{description:'fork',systemPrompt:'Authored research',model:'native/exact',extra:{defaultContext:'fork'}});
 const target=await f.owner.prepare('study','session-root','fresh-prepare',{workflowScript:'return await runs.run("one", {agent:"science-worker",task:"read",context:"fork"});',context:'fresh'}),id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 await f.owner.invoke('study','session-root','fresh-run',{action:'start-frozen',operationId:id,target:target.target});await f.owner.settled(id);const receipt=await f.owner.invoke('study','session-root','fresh-inspect',{action:'inspect',operationId:id});expect(receipt.state).toBe('completed');const start=f.request.mock.calls.find(row=>(row[2] as any).action==='start');expect((start?.[2] as any).inheritParentContext).toBe(false);await f.owner.close();
});
it('preserves original script sandbox isolation and blocks paid replay after process recovery',async()=>{
 const f=await fixture(),target=await f.owner.prepare('study','session-root','prepare-b',{workflowScript:'return {process: typeof process, require: typeof require};'}),id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await f.owner.invoke('study','session-root','run-b',{action:'start-frozen',operationId:id,target:target.target});await f.owner.settled(id);const receipt=await f.owner.invoke('study','session-root','inspect-b',{action:'inspect',operationId:id});expect(receipt.result.value).toEqual({process:'undefined',require:'undefined'});
 const before=f.request.mock.calls.length;await f.owner.invoke('study','session-root','retry-b',{action:'start-frozen',operationId:id,target:target.target});expect(f.request).toHaveBeenCalledTimes(before);await f.owner.close();
});
