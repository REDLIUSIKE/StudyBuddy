import {expect,it} from 'vitest'
import * as capabilities from '../../src/capabilities/index.ts'
import {fixture,owner,documentAdapter} from './fixture.ts'
import {NativeVideoTools} from '../../src/video-editing-tools.ts'
import {NativeAigcTools} from '../../src/aigc-tools.ts'
import {capabilityContext} from '../../src/capabilities/context.ts'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import {NativeResearchTools} from '../../src/research-tools.ts'
import * as safetyTools from '@deepseek-ai/dsh-skill-safety-assistant/tools'
import {PtcRuntime,type PtcRunRequest,type PtcRunResult,type PtcRunSpec} from '@deepseek-ai/dsh-ptc-runtime'
class PresentationRuntime extends PtcRuntime{
 readonly language='typescript';readonly isolation='fixture'
 resolve(request:PtcRunRequest):PtcRunSpec{return{...request,cwd:request.cwd??process.cwd(),timeoutMs:request.timeoutMs??120000}}
 run(_request:PtcRunRequest):Promise<PtcRunResult>{return Promise.resolve({logs:[]})}
}
it('video and ordinary native conversations retain capability entry tools under their existing guards',async()=>{
 const f=await fixture()
 try{
  await f.ctx.plugin(capabilities,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}})
  f.ctx.capabilities.registry.register(documentAdapter())
  const native=new NativeVideoTools(f.ctx,{current:()=>true,invoke:async()=>({})})
  await native.mount({accountGeneration:'generation',workspaceId:'video-workspace',projectId:'film-a',sessionId:f.agent.id})
  for(const agent of [f.agent,f.other]){
   const result=await f.call('creative_project',{action:'create',moduleId:'novel',title:'脚本'},agent)
   expect(result.isError,JSON.stringify(result)).toBe(false)
   expect((await f.call('creative_novel_writeChapter',{text:'汽车宣传片'},agent)).isError).toBe(false)
  }
  const remove=f.other.ctx.tools.restrict({allow:[]})
  expect((await f.call('creative_project',{action:'list-modules'},f.other)).isError).toBe(true);remove()
 }finally{await f.close()}
})
it('named native Workspaces retain their membership, caller and original Session header',async()=>{
 const f=await fixture()
 try{
  f.ctx.provide('sessionPersistence',{list:async()=>[],open:async()=>{throw Error('No persisted body requested')},stat:async()=>undefined} as never)
  await f.ctx.plugin(WorkspaceRegistry);const workspace=await f.ctx.workspaceRegistry.create(process.cwd(),'汽车项目');await workspace.attachSession(f.other.id)
  const header=structuredClone(f.other.session.header),callers:string[]=[]
  await f.ctx.plugin(capabilities,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async context=>{expect(context.caller.workspaceId).toBe(workspace.id);callers.push(context.agent.id)}})
  f.ctx.capabilities.registry.register(documentAdapter())
  expect((await f.call('creative_project',{action:'create',moduleId:'novel',title:'正文'},f.other)).isError).toBe(false)
  expect((await f.call('creative_novel_writeChapter',{text:'正文'},f.other)).isError).toBe(false);expect(callers).toEqual([f.other.id,f.other.id]);expect(f.other.session.header).toEqual(header)
 }finally{await f.close()}
})
it('AIGC scopes keep the same actual Agent when calling another registered domain',async()=>{
 const f=await fixture(),actors:string[]=[]
 try{
  await f.ctx.plugin(capabilities,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async context=>{actors.push(context.agent.id);expect(context.agent.id).toBe(context.caller.callerSessionId)}})
  f.ctx.capabilities.registry.register(documentAdapter())
  const tools=new NativeAigcTools(f.ctx,{invoke:async(_binding,_caller,op)=>op==='catalog'?{tools:[]}:op==='resources'?{text:'resources'}:{}},()=>true,id=>id===f.other.id)
  await tools.mount({...owner,projectId:'aigc-'+'a'.repeat(48),workspaceId:'aigc-workspace',sessionId:f.other.id,lease:'00000000-0000-4000-8000-000000000003',authorizedRoot:process.cwd()},f.other)
  expect((await f.call('creative_project',{action:'create',moduleId:'novel',title:'脚本'},f.other)).isError).toBe(false)
  expect((await f.call('creative_novel_writeChapter',{text:'剪辑脚本'},f.other)).isError).toBe(false);expect(actors).toEqual([f.other.id,f.other.id])
  expect(capabilityContext(f.ctx,owner,{agent:f.other,callId:'verify',signal:new AbortController().signal}).agent).toBe(f.other)
 }finally{await f.close()}
})
it('research conversations retain the shared tools and their admitted native project',async()=>{
 const f=await fixture()
 try{
  await f.ctx.plugin(capabilities,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}});f.ctx.capabilities.registry.register(documentAdapter())
  const tools=new NativeResearchTools(f.ctx,{invoke:async(_binding:unknown,operation:string)=>operation==='catalog'?{tools:['notebook','notebook_search','add_pdf_annotation','list_pdf_annotations','remove_pdf_annotation'].map(name=>({name,description:name,parameters:{type:'object',properties:{},additionalProperties:false}}))}:{}} as unknown as ConstructorParameters<typeof NativeResearchTools>[1],()=>true)
  await tools.mount({...owner,sessionId:f.other.id,projectId:'study',workspaceId:'research-workspace',lease:'33333333-3333-4333-8333-333333333333',authorizedRoots:[process.cwd()]})
  expect((await f.call('creative_project',{action:'create',moduleId:'novel',title:'研究脚本'},f.other)).isError).toBe(false)
  expect((await f.call('creative_novel_writeChapter',{text:'正文'},f.other)).isError).toBe(false);await tools.unmount()
 }finally{await f.close()}
})
it('native and PTC tool presentation expose creative capabilities while dedicated Skill safety still denies them',async()=>{
 const f=await fixture()
 try{
  await f.ctx.plugin(capabilities,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}})
  await f.ctx.plugin(PresentationRuntime);f.agent.ctx.tools.presentAs('ptc')
  const assembly=await f.ctx.systemPrompt.assemble({scope:f.agent})
  expect(assembly.tools.map(tool=>tool.name)).toEqual(['run_code']);expect(assembly.sections.find(section=>section.name==='tools:sdk')?.text).toContain('creative_project')
  expect((await f.call('creative_project',{action:'list-modules'},f.agent)).isError).toBe(true)
  expect((await f.call('creative_project',{action:'list-modules'},f.other)).isError).toBe(false)
  f.other.ctx.provide('skillSafety',{} as never);await f.other.ctx.plugin(safetyTools)
  expect((await f.call('creative_project',{action:'list-modules'},f.other)).isError).toBe(true)
 }finally{await f.close()}
})
