import {afterEach,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import {mountAgentLoopTestDependencies} from '@deepseek-ai/dsh-agent-loop-testkit'
import {SessionId} from '@deepseek-ai/dsh-session'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {unzipSync,strFromU8} from 'fflate'
import {mkdtemp,mkdir,readFile,rm,symlink} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {MockAdapter,textResponse} from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import JsonlPersistence from '../../../packages/session/session-persistence-jsonl/src/index.ts'
import {installModelSelectionProjection} from '../../../packages/api/session-controller/src/model-selection-projection.ts'
import LocalAttachments from '../../../packages/attachment/attachment-local/src/index.ts'
import {TestSessionQueryEngine} from '../../../packages/session-query/session-query/tests/test-service.ts'
import {translateVideoLines,writeVideoSessionArchive,exportVideoSession} from '../src/video-native.ts'
import type {VideoProjectBinding} from '../src/video-control-wire.d.ts'

const close:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const dispose of close.splice(0).reverse())await dispose()})
async function fixture(answer='{"lines":["你好","再见"]}'){
 const root=await mkdtemp(join(tmpdir(),'video-native-')),ctx=new Context();close.push(()=>rm(root,{recursive:true,force:true}));close.push(()=>ctx.fiber.dispose())
 await ctx.plugin(JsonlPersistence,{root:join(root,'sessions')});await mountAgentLoopTestDependencies(ctx);installModelSelectionProjection(ctx);await ctx.plugin(AgentLoop,{agents:[]})
 const adapter=new MockAdapter([textResponse(answer)]);ctx.effect(()=>ctx.llm.registerAdapter(['mock'],adapter))
 const parent=(await ctx.agents.create({sessionId:SessionId('video-parent'),meta:{cwd:root},agentOptions:{}})).agent
 parent.session.append('model/selection',{provider:'mock',model:'exact-model'})
 const binding:VideoProjectBinding={scope:{accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:parent.id},ownedScope:{accountId:'account',generation:1},hostGeneration:'h',lease:'lease',projectRoot:root}
 return{root,ctx,adapter,parent,binding}
}
it('translates in one logged native child and reuses its completed result without a second request',async()=>{
 const f=await fixture(),id='00000000-0000-4000-8000-000000000081',input={language:'zh-CN',lines:['Hello','Goodbye']},signal=new AbortController().signal
 const result=await translateVideoLines(f.ctx,f.binding,id,input,signal,()=>{})
 expect(result.lines).toEqual(['你好','再见']);expect(f.adapter.requests).toHaveLength(1)
 expect(await translateVideoLines(f.ctx,f.binding,id,input,signal,()=>{})).toEqual(result);expect(f.adapter.requests).toHaveLength(1)
 const handle=await f.ctx.sessionPersistence.open(SessionId('session-video-translation-'+id),'read')
 try{expect(handle.header.parentSession).toBe(f.parent.id);const {events}=await handle.read(0);expect(events.some(event=>event.type==='user/message'&&JSON.stringify(event.data).includes('Goodbye'))).toBe(true);expect(events.some(event=>event.type==='assistant/message')).toBe(true)}finally{await handle.close()}
 await expect(translateVideoLines(f.ctx,f.binding,id,{...input,lines:['Other']},signal,()=>{})).rejects.toThrow('VIDEO_TRANSLATION_CONFLICT')
})
it('keeps a malformed completed result and never silently reruns its paid translation',async()=>{
 const f=await fixture('{"lines":["only one"]}'),id='00000000-0000-4000-8000-000000000082',input={language:'zh-CN',lines:['Hello','Goodbye']},signal=new AbortController().signal
 await expect(translateVideoLines(f.ctx,f.binding,id,input,signal,()=>{})).rejects.toThrow('VIDEO_TRANSLATION_RESULT_INVALID')
 await expect(translateVideoLines(f.ctx,f.binding,id,input,signal,()=>{})).rejects.toThrow('VIDEO_TRANSLATION_RESULT_INVALID');expect(f.adapter.requests).toHaveLength(1)
})
it('does not dispatch again after a persisted translation intent has an unknown outcome',async()=>{
 const f=await fixture(),id='00000000-0000-4000-8000-000000000084'
 const handle=await f.ctx.agents.create({sessionId:SessionId('session-video-translation-'+id),parentAgent:f.parent,meta:{parentSession:f.parent.id,origin:'subagent',cwd:f.root},agentOptions:{}})
 await f.ctx.sessions.flush(handle.agent.session);await handle.dispose()
 await expect(translateVideoLines(f.ctx,f.binding,id,{language:'de',lines:['Hello']},new AbortController().signal,()=>{})).rejects.toThrow('VIDEO_TRANSLATION_OUTCOME_UNKNOWN');expect(f.adapter.requests).toHaveLength(0)
})
it('writes a streamed archive in the admitted project and rejects metadata junctions',async()=>{
 const f=await fixture(),id='00000000-0000-4000-8000-000000000083',signal=new AbortController().signal
 const archive=await writeVideoSessionArchive(f.root,id,new ReadableStream({start(controller){controller.enqueue(new Uint8Array([80,75,3,4]));controller.close()}}),signal,()=>{})
 expect(archive.relativePath).toMatch(/^\.film\/chat\//);expect(await readFile(join(f.root,archive.relativePath))).toEqual(Buffer.from([80,75,3,4]))
 const other=join(f.root,'other'),outside=join(f.root,'outside');await mkdir(other);await mkdir(outside);await symlink(outside,join(other,'.film'),process.platform==='win32'?'junction':'dir')
 await expect(writeVideoSessionArchive(other,id,new ReadableStream({start(controller){controller.close()}}),signal,()=>{})).rejects.toThrow('VIDEO_PATH_DENIED')
})
it('cancels a pending archive reader and never commits a partial archive',async()=>{
 const f=await fixture(),controller=new AbortController();let canceled=false
 const pending=writeVideoSessionArchive(f.root,'00000000-0000-4000-8000-000000000085',new ReadableStream({cancel(){canceled=true}}),controller.signal,()=>{})
 const rejected=expect(pending).rejects.toBeDefined();await new Promise(resolve=>setTimeout(resolve,20));controller.abort();await rejected
 expect(canceled).toBe(true);await expect(readFile(join(f.root,'.film/chat/studybuddy-native/session.zip'))).rejects.toThrow('ENOENT')
})
it('exports the actual persisted parent, translation child and referenced native file',async()=>{
 const f=await fixture(),signal=new AbortController().signal,id='00000000-0000-4000-8000-000000000086'
 await f.ctx.plugin(LocalAttachments,{dshHome:join(f.root,'attachments')});await f.ctx.plugin(TestSessionQueryEngine)
 const attachment=await f.ctx.attachments.saveFile({data:Buffer.from('reference content'),name:'context.txt'})
 f.parent.session.append('user/message',createUserMessage({content:[{type:'file',attachment}],source:{kind:'user'}}),{surfaceOp:'append'})
 await translateVideoLines(f.ctx,f.binding,id,{language:'zh',lines:['Hello','Goodbye']},signal,()=>{})
 const result=await exportVideoSession(f.ctx,f.binding,'00000000-0000-4000-8000-000000000087',signal,()=>{})
 const entries=unzipSync(await readFile(join(f.root,result.artifacts[0]!.relativePath))),names=Object.keys(entries)
 expect(names.some(name=>name.startsWith('subagents/session-video-translation-'+id+'/session'))).toBe(true)
 expect(names.some(name=>name.startsWith('session')&&name.endsWith('.jsonl'))).toBe(true)
 const file=names.find(name=>name.endsWith('/context.txt'));expect(file).toBeDefined();expect(strFromU8(entries[file!]!)).toBe('reference content')
 expect(f.adapter.requests).toHaveLength(1)
})
