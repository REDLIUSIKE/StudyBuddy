import { afterEach,it,expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {MockAdapter,textResponse} from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { NativeVideoTools } from '../src/video-editing-tools.ts'
import type { VideoScope } from '../src/video-domain-types.ts'
const contexts:Context[]=[]
afterEach(async()=>{for(const ctx of contexts.splice(0))await ctx.fiber.dispose()})
async function fixture(result:unknown={revision:'after',document:'original'}){
 const ctx=new Context();contexts.push(ctx)
 await mountAgentLoopTestDependencies(ctx);await ctx.plugin(AgentLoop,{agents:[]})
 const parent=await ctx.agents.create({sessionId:SessionId('session-video-00000000-0000-4000-8000-000000000001'),meta:{cwd:process.cwd()},agentOptions:{}})
 const ordinary=await ctx.agents.create({sessionId:SessionId('ordinary-session'),meta:{cwd:process.cwd()},agentOptions:{}})
 const scope:VideoScope={accountGeneration:'a1',workspaceId:'w1',projectId:'p1',sessionId:parent.agent.id}
 let current=true
 const requests:Array<{scope:VideoScope,operation:string,input:unknown}>=[]
 const tools=new NativeVideoTools(ctx,{current:()=>current,invoke:async(binding,operation,_callId,input)=>{requests.push({scope:binding,operation,input});return result}})
 await tools.mount(scope)
 const invoke=(agent:typeof parent.agent,name:string,args:Record<string,unknown>)=>ctx.tools.execute({name,callId:ToolCallId('video-call'),agent,arguments:args,signal:new AbortController().signal})
 return{ctx,parent:parent.agent,ordinary:ordinary.agent,scope,tools,requests,invoke,revoke:()=>{current=false}}
}
it.each(['video_media_choices','video_get'])('%s accepts its native list result through the real tool output validator',async name=>{
 const choices=name==='video_media_choices'?[{authorityRef:'native-reference',operation:'image',modelId:'exact-image',label:'Native image',parameters:{sizes:['1K']}}]:[{title:'Native voice',voice:'voice-id'}]
 const f=await fixture(choices),args=name==='video_media_choices'?{}:{operation:'voice',authorityRef:'native-reference',requestId:'00000000-0000-4000-8000-000000000080',input:{}}
 const result=await f.invoke(f.parent,name,args)
 expect(result.isError).toBe(false);expect(result.value).toEqual(choices)
 expect(result.content).toEqual([{type:'text',text:JSON.stringify(choices)}])
 expect(f.requests).toHaveLength(1)
})
it('transcribes admitted project speech through the domain tool and rejects forged scope fields',async()=>{
 const f=await fixture()
 expect((await f.invoke(f.parent,'video_transcribe',{src:'assets/voice.wav'})).isError).toBe(false)
 expect(f.requests[0]).toMatchObject({operation:'transcribe',input:{src:'assets/voice.wav'}})
 expect((await f.invoke(f.parent,'video_transcribe',{src:'assets/voice.wav',accountGeneration:'forged'})).isError).toBe(true)
 expect(f.requests).toHaveLength(1)
})
it('translates subtitles through the domain and rejects the generic media translation route',async()=>{
 const f=await fixture()
 expect((await f.invoke(f.parent,'video_translate',{language:'zh'})).isError).toBe(false)
 expect(f.requests[0]).toMatchObject({operation:'translate',input:{language:'zh'}})
 expect((await f.invoke(f.parent,'video_get',{operation:'translate',authorityRef:'fake',requestId:'00000000-0000-4000-8000-000000000090',input:{}})).isError).toBe(true)
})

it('registers video tools only in their admitted native Session and disposes them',async()=>{
 const f=await fixture()
 expect((await f.invoke(f.parent,'video_read_project',{})).isError).toBe(false)
 expect((await f.invoke(f.ordinary,'video_read_project',{})).isError).toBe(true)
 expect(f.requests).toHaveLength(1);expect(f.requests[0]?.scope).toEqual(f.scope)
 await f.tools.unmount()
 expect((await f.invoke(f.parent,'video_read_project',{})).isError).toBe(true)
})
it('carries expected revision through the real tool executor and rejects forged scope fields',async()=>{
 const f=await fixture()
 expect((await f.invoke(f.parent,'video_edit',{expectedRevision:'before',edit:{kind:'replace-file',relativePath:'film.html',text:'<html></html>'}})).isError).toBe(false)
 expect(f.requests[0]).toMatchObject({operation:'applyEdit',input:{expectedRevision:'before'}})
 expect((await f.invoke(f.parent,'video_read_project',{accountGeneration:'another'})).isError).toBe(true)
 expect(f.requests).toHaveLength(1)
})
it('rejectsMutationOutsideRevisionTool without disabling ordinary Sessions',async()=>{
 const f=await fixture();let writes=0
 f.ctx.tools.register({name:'write',description:'write file',parameters:{type:'object',properties:{file_path:{type:'string'}},required:['file_path']},output:{schema:{type:'object'},render:()=>[{type:'text',text:'written'}]},presentCall:()=>({card:'generic',title:'write',kind:'execute'}),execute:async()=>{writes++;return{ok:true}}})
 expect((await f.invoke(f.parent,'write',{file_path:'film.html'})).isError).toBe(true)
 expect(writes).toBe(0)
 expect((await f.invoke(f.ordinary,'write',{file_path:'other.html'})).isError).toBe(false)
 expect(writes).toBe(1)
})
it('revocation rejects video tool execution before native dispatch',async()=>{
 const f=await fixture();f.revoke()
 expect((await f.invoke(f.parent,'video_read_project',{})).isError).toBe(true)
 expect(f.requests).toHaveLength(0)
})
it('a later third-party mutation tool cannot bypass video revisions',async()=>{
 const f=await fixture();let writes=0
 f.ctx.tools.register({name:'third_party_mutation',description:'external document mutation',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[{type:'text',text:'changed'}]},execute:async()=>{writes++;return{ok:true}}})
 expect((await f.invoke(f.parent,'third_party_mutation',{})).isError).toBe(true);expect(writes).toBe(0)
 expect((await f.invoke(f.ordinary,'third_party_mutation',{})).isError).toBe(false);expect(writes).toBe(1)
 f.parent.ctx.tools.register({name:'scoped_third_party_mutation',description:'scoped external mutation',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[{type:'text',text:'changed'}]},execute:async()=>{writes++;return{ok:true}}})
 expect((await f.invoke(f.parent,'scoped_third_party_mutation',{})).isError).toBe(true);expect(writes).toBe(1)
})
it('keeps the video mutation guard after tools unmount while ordinary Sessions keep working',async()=>{
 const f=await fixture();let writes=0
 f.ctx.tools.register({name:'write',description:'write file',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},execute:async()=>{writes++;return{ok:true}}})
 await f.tools.unmount()
 expect((await f.invoke(f.parent,'write',{})).isError).toBe(true)
 expect((await f.invoke(f.ordinary,'write',{})).isError).toBe(false);expect(writes).toBe(1)
})
it('blocks a cold video Session and its child before any model request, until that project is admitted',async()=>{
 const ctx=new Context();contexts.push(ctx);await mountAgentLoopTestDependencies(ctx);await ctx.plugin(AgentLoop,{agents:[]})
 const adapter=new MockAdapter([textResponse('ordinary response')]);ctx.effect(()=>ctx.llm.registerAdapter(['mock'],adapter))
 new NativeVideoTools(ctx,{current:()=>false,invoke:async()=>{throw Error('must not dispatch')}})
 const root=SessionId('session-video-00000000-0000-4000-8000-000000000002')
 const options={provider:'mock',model:'test-model'}
 const parent=(await ctx.agents.create({sessionId:root,meta:{cwd:process.cwd()},agentOptions:options})).agent
 const child=(await ctx.agents.create({sessionId:SessionId('session-video-translation-00000000-0000-4000-8000-000000000003'),parentAgent:parent,meta:{cwd:process.cwd(),parentSession:root,origin:'subagent'},agentOptions:options})).agent
 const ordinary=(await ctx.agents.create({sessionId:SessionId('ordinary-cold'),meta:{cwd:process.cwd()},agentOptions:options})).agent
 for(const actor of [parent,child]){actor.followup(createUserMessage({content:[{type:'text',text:'continue'}],source:{kind:'user'}}));await actor.whenIdle()}
 expect(adapter.requests).toHaveLength(0)
 ordinary.followup(createUserMessage({content:[{type:'text',text:'continue'}],source:{kind:'user'}}));await ordinary.whenIdle()
 expect(adapter.requests).toHaveLength(1)
})
