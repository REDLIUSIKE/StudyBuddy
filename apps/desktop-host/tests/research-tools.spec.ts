import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { NativeResearchTools } from '../src/research-tools.ts'
import type { ResearchToolRpc } from '../src/research-tool-rpc.ts'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { bindScopeParent } from '@deepseek-ai/dsh-scope'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanups.splice(0)) await dispose() })
async function setup(root = process.cwd(), skills = false,services=false,scientific=false) {
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx); await ctx.plugin(AgentLoop, { agents: [] })
  if (skills) await ctx.plugin(SkillRegistry)
  const parent = await ctx.agents.create({ sessionId: SessionId('research-parent'), meta: { cwd: root }, agentOptions: {} })
  const ordinary = await ctx.agents.create({ sessionId: SessionId('ordinary-parent'), meta: { cwd: root }, agentOptions: {} })
  const binding = { scope: { accountId: 'account', generation: 1 }, hostGeneration: '22222222-2222-4222-8222-222222222222',
    projectId: 'study', workspaceId: 'workspace', sessionId: parent.agent.id, lease: '33333333-3333-4333-8333-333333333333', authorizedRoots: [root] }
  let current = true
  const ordinarySearch=vi.fn(async()=>({sources:[],truncated:false}));if(services)ctx.tools.register({name:'web_search',description:'Native web search',parameters:{type:'object',properties:{queries:{type:'array',items:{type:'string'}}},required:['queries']},output:{schema:{type:'object',additionalProperties:true},render:()=>[]},execute:ordinarySearch})
  const rpc = { invoke: vi.fn<ResearchToolRpc['invoke']>(async (_context, operation) => operation === 'catalog'
    ? { tools: [...['notebook', 'notebook_search', 'add_pdf_annotation', 'list_pdf_annotations', 'remove_pdf_annotation'],...(services?['research_web_search','research_literature_search','research_compute']:[]),...(scientific?['scientific_result']:[])].map(name => ({ name, description: name, parameters: { type: 'object', additionalProperties:true,properties: { title: { type: 'string' } } } })) }
    : operation === 'guard' ? { verdict: { kind: 'protected' }, destructiveConfirm: true } : operation==='services'?{provider:'bocha',sources:[{url:'https://source.test/p',title:'Source',summary:'Observed summary'}]}:{ content: [{ type: 'text', text: 'Recorded once' }] }) }
  const tools = new NativeResearchTools(ctx, rpc as never, () => current)
  await tools.mount(binding)
  return { ctx, parent: parent.agent, ordinary: ordinary.agent, tools, rpc,ordinarySearch, revoke: () => { current = false } }
}
it('routes the actual native web_search to the selected independent service only inside the admitted research scope',async()=>{
 const f=await setup(process.cwd(),false,true),call=(agent:typeof f.parent)=>f.ctx.tools.execute({name:'web_search',callId:ToolCallId('selected-search-a'),agent,arguments:{queries:['science']},signal:new AbortController().signal});
 expect(await call(f.parent)).toMatchObject({isError:false});expect(f.ordinarySearch).not.toHaveBeenCalled();expect(f.rpc.invoke.mock.calls.some(row=>row[1]==='services')).toBe(true);expect(await call(f.ordinary)).toMatchObject({isError:false});expect(f.ordinarySearch).toHaveBeenCalledOnce();await f.tools.unmount();await call(f.parent);expect(f.ordinarySearch).toHaveBeenCalledTimes(2);
});
it('freezes compute configuration and denies allocation without a native approval answerer',async()=>{
 const f=await setup(process.cwd(),false,true),base=f.rpc.invoke.getMockImplementation()!;
 f.rpc.invoke.mockImplementation(async(...args)=>args[1]==='services'?{provider:'autodl'}:base(...args));
 const result=await f.ctx.tools.execute({name:'research_compute',callId:ToolCallId('compute-confirmation-a'),agent:f.parent,arguments:{action:'submit',request:{command:'python3 research.py'}},signal:new AbortController().signal});
 expect(result.isError).toBe(true);expect(JSON.stringify(result.content)).toContain('AutoDL');expect(f.rpc.invoke.mock.calls.filter(row=>row[1]==='services')).toHaveLength(1);expect(f.rpc.invoke.mock.calls.find(row=>row[1]==='services')?.[3]).toMatchObject({name:'research_compute',arguments:{action:'preflight'}});
});
it('registers source tools only in the actual admitted native Agent scope', async () => {
  const f = await setup()
  const invoke = (agent: typeof f.parent) => f.ctx.tools.execute({ name: 'notebook', callId: ToolCallId('call-a'), agent, arguments: { title: 'Observed result' }, signal: new AbortController().signal })
  expect((await invoke(f.parent)).isError).toBe(false)
  expect((await invoke(f.ordinary)).isError).toBe(true)
  expect(f.rpc.invoke.mock.calls.filter(call => call[1] === 'notebook')).toHaveLength(1)
  await f.tools.unmount(); expect((await invoke(f.parent)).isError).toBe(true)
})
it('persists original scientific cards as tool-private metadata and keeps descendant result links in the actual source Session',async()=>{
 const f=await setup(process.cwd(),false,false,true),original=f.rpc.invoke.getMockImplementation()!;
 const card={schemaVersion:1,kind:'table',title:'Observed',columns:[{key:'value',label:'Value'}],rows:[[7]]};
 f.rpc.invoke.mockImplementation(async(...args)=>args[1]==='advanced'?{content:[{type:'text',text:'Observed'}],details:{scientificResult:card}}:original(...args));
 const result=await f.ctx.tools.execute({name:'scientific_result',callId:ToolCallId('scientific-a'),agent:f.parent,arguments:{title:'Observed'},signal:new AbortController().signal});
 expect(result).toMatchObject({isError:false,meta:{scientificResult:card}});
 const child=(await f.parent.ctx.agents.create({sessionId:SessionId('research-result-child'),parentAgent:f.parent,meta:{cwd:process.cwd()},agentOptions:{}})).agent;bindScopeParent(child,f.parent);
 await f.ctx.tools.execute({name:'notebook',callId:ToolCallId('notebook-child'),agent:child,arguments:{title:'Observed',results:[{toolCallId:'scientific-a'},{toolCallId:'other-call',sessionId:f.parent.id}]},signal:new AbortController().signal});
 const call=f.rpc.invoke.mock.calls.find(row=>row[2]==='notebook-child');expect(call?.[3]).toMatchObject({results:[{toolCallId:'scientific-a',sessionId:child.id},{toolCallId:'other-call',sessionId:f.parent.id}]});
});
it('blocks a protected native write before its body and fences a revoked project', async () => {
  const f = await setup(), body = vi.fn(async () => ({ written: true }))
  f.parent.ctx.tools.register({ name: 'write', description: 'Write', parameters: { type: 'object', properties: { file_path: { type: 'string' } } },
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: 'Written' }] }, execute: body })
  const invoke = () => f.ctx.tools.execute({ name: 'write', callId: ToolCallId('call-b'), agent: f.parent, arguments: { file_path: 'user_data/raw.csv' }, signal: new AbortController().signal })
  expect((await invoke()).isError).toBe(true); expect(body).not.toHaveBeenCalled()
  f.revoke(); expect((await invoke()).isError).toBe(true); expect(body).not.toHaveBeenCalled()
})
it('admits actual descendant research tools and keeps the raw-data guard on their scope chain', async () => {
  const f = await setup(), body = vi.fn(async () => ({ written: true }))
  const child = (await f.parent.ctx.agents.create({ sessionId: SessionId('research-child'), parentAgent: f.parent, meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  const grandchild = (await child.ctx.agents.create({ sessionId: SessionId('research-grandchild'), parentAgent: child, meta: { cwd: process.cwd() }, agentOptions: {} })).agent
  // The native delegation composer joins these scope layers independently
  // from the registry's parentAgent ownership relation.
  bindScopeParent(child, f.parent); bindScopeParent(grandchild, child)
  f.parent.ctx.tools.register({ name: 'write', description: 'Write', parameters: { type: 'object', properties: { file_path: { type: 'string' } } },
    output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: 'Written' }] }, execute: body })
  const invoke = (name: string, args: object) => f.ctx.tools.execute({ name, callId: ToolCallId('child-call-a'), agent: grandchild, arguments: args, signal: new AbortController().signal })
  const recorded = await invoke('notebook', { title: 'Observed descendant result' })
  expect(recorded, JSON.stringify(recorded)).toMatchObject({ isError: false })
  expect((await invoke('write', { file_path: 'user_data/raw.csv' })).isError).toBe(true)
  expect(body).not.toHaveBeenCalled()
  f.revoke(); expect((await invoke('notebook', { title: 'Late descendant result' })).isError).toBe(true)
})
it('uses the existing native Skill registry for enabled project skills without exposing them to another Agent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-skill-')), folder = join(root, '.pi/skills/research-example')
  await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'SKILL.md'), '---\nname: research-example\ndescription: Review supplied scientific records\n---\nUse only observed data.\n')
  cleanups.unshift(async () => { await rm(root, { recursive: true, force: true }) })
  const f = await setup(root, true)
  const list = (agent: typeof f.parent) => new Promise<string[]>((resolve, reject) => {
    agent.ctx.inject(['skills'], scoped => { void scoped.skills.list({ cwd: root, scope: agent }).then(skills => resolve(skills.map(skill => skill.name)), reject) })
  })
  expect(await list(f.parent)).toContain('research-example')
  expect(await list(f.ordinary)).not.toContain('research-example')
})
