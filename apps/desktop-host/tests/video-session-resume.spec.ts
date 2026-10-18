import {expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import {mountAgentLoopTestDependencies} from '@deepseek-ai/dsh-agent-loop-testkit'
import {SessionId} from '@deepseek-ai/dsh-session'
import {createUserMessage} from '@deepseek-ai/dsh-llm'
import {mkdtemp,mkdir,realpath,rename,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import JsonlPersistence from '../../../packages/session/session-persistence-jsonl/src/index.ts'
import LocalFileSystem from '../../../packages/fs/fs-local/src/index.ts'
import WorkingDirectory from '../../../packages/session/working-directory/src/index.ts'
import {MockAdapter,textResponse} from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import {NativeVideoTools} from '../src/video-editing-tools.ts'

it('restores a moved project Session from JSONL, keeps its history and blocks requests until admission',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'video-resume-'))),before=join(directory,'original'),after=join(directory,'renamed'),id=SessionId('session-video-00000000-0000-4000-8000-000000000021')
 await mkdir(before)
 const contexts:Context[]=[],options={provider:'mock',model:'exact-test-model'}
 const start=async()=>{const ctx=new Context();contexts.push(ctx);await ctx.plugin(JsonlPersistence,{root:join(directory,'sessions')});await mountAgentLoopTestDependencies(ctx);await ctx.plugin(LocalFileSystem,{cwd:directory});await ctx.plugin(WorkingDirectory,{});await ctx.plugin(AgentLoop,{agents:[]});return ctx}
 try{
  const first=await start(),created=await first.agents.create({sessionId:id,meta:{cwd:before},agentOptions:options})
  created.agent.session.append('user/message',createUserMessage({content:[{type:'text',text:'original project request'}],source:{kind:'user'}}),{surfaceOp:'append'})
  await first.sessions.flush(created.agent.session);await first.fiber.dispose();await rename(before,after)
  const resumed=await start(),adapter=new MockAdapter([textResponse('continued project')]);resumed.effect(()=>resumed.llm.registerAdapter(['mock'],adapter))
  let admitted=false
  const tools=new NativeVideoTools(resumed,{current:()=>admitted,invoke:async()=>({})})
  const handle=await resumed.agents.resume({resumeSessionId:id,agentOptions:options}),actor=handle.agent
  await resumed.workingDirectory.set(actor,after)
  actor.followup(createUserMessage({content:[{type:'text',text:'before admission'}],source:{kind:'user'}}));await actor.whenIdle();expect(adapter.requests).toHaveLength(0)
  admitted=true;await tools.mount({accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:id})
  actor.followup(createUserMessage({content:[{type:'text',text:'after admission'}],source:{kind:'user'}}));await actor.whenIdle()
  expect(adapter.requests).toHaveLength(1);expect(actor.session.header.cwd).toBe(before);expect(resumed.workingDirectory.get(actor.session)).toBe(after)
  expect(actor.session.snapshotEvents().some(event=>event.type==='user/message'&&JSON.stringify(event.data).includes('original project request'))).toBe(true)
  expect(actor.session.snapshotEvents().some(event=>event.type==='working-directory/change'&&event.data.cwd===after)).toBe(true)
  await resumed.sessions.flush(actor.session);await handle.dispose()
 }finally{await Promise.all(contexts.map(ctx=>ctx.fiber.dispose()));await rm(directory,{recursive:true,force:true})}
})
