import { expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AigcBridge } from '../src/studybuddy/aigc-bridge.ts'
import { accountAigcDirectory } from '../src/studybuddy/aigc-data.ts'
it('writes one native association before admission, rejects foreign roots and fences an account rotation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-bridge-')), scope = { accountId: 'a', generation: 1 }, owner = { scope, hostGeneration: '00000000-0000-4000-8000-000000000004' }
  const project = join(accountAigcDirectory(root, 'a'), 'workspaces', 'story'); await mkdir(project, { recursive: true })
  let current = true; const commands: string[] = []
  const bridge = new AigcBridge({ userDataRoot: root, isCurrent: () => current, hostContext: () => owner,
    command: async (action, data: any) => { commands.push(action); return action === 'bind' ? { ...data, workspaceId: 'workspace-a' } : null } })
  try {
    const a = await bridge.bind(scope, project), b = await bridge.bind(scope, project)
    expect(a.sessionId).toBe(b.sessionId); expect(commands).toEqual(['scope', 'bind', 'tools'])
    await expect(bridge.bind(scope, root)).rejects.toThrow('AIGC_PROJECT_INVALID')
    current = false; expect(() => bridge.bound(scope, a)).toThrow('AIGC_SCOPE_REVOKED')
  } finally { await bridge.revoke(); await rm(root, { recursive: true, force: true }) }
})

it('waits for a visible native root question surface before asking from a helper child', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-question-owner-')), scope = { accountId: 'a', generation: 1 }, owner = { scope, hostGeneration: '00000000-0000-4000-8000-000000000004' }
  const commands: any[] = [], visible = Promise.withResolvers<void>(); let shown: any, closed = false
  const bridge = new AigcBridge({ userDataRoot: root, isCurrent: () => true, hostContext: () => owner, command: async (action, data: any) => {
    commands.push({ action, data }); if (action === 'bind') return { ...data, workspaceId: 'helper' }
    if (action === 'native' && data.operation === 'temporary') return { sessionId: data.input.id, nativeSessionId: 'session-' + data.input.id }
    return { answer: 'Yes' }
  } })
  try {
    const setPresenter = Reflect.get(bridge, 'setQuestionPresenter') as (show: (context: unknown) => Promise<() => void>) => void
    expect(typeof setPresenter).toBe('function')
    setPresenter.call(bridge, async context => { shown = context; await visible.promise; return () => { closed = true } })
    const id = '00000000-0000-4000-8000-000000000005', opened = await bridge.temporaryCommand(scope, { action: 'open', id, systemPrompt: 'Configure', tools: [] }, new AbortController().signal) as any
    const pending = bridge.question(scope, { directory: opened.directory, sessionId: opened.nativeSessionId, callId: 'ask-a', question: { title: 'Confirm', question: 'Continue?' } }, new AbortController().signal)
    await expect.poll(() => shown).toBeDefined()
    expect(shown.sessionId).not.toBe(opened.nativeSessionId)
    expect(commands.filter(row => row.action === 'native' && row.data.operation === 'question')).toHaveLength(0)
    visible.resolve(); await expect(pending).resolves.toMatchObject({ answer: 'Yes' }); expect(closed).toBe(true)
  } finally { await bridge.revoke(); await rm(root, { recursive: true, force: true }) }
})
it('routes a home prompt and its project attachments to the exact bound native chat and rejects path escapes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-intake-')), scope = { accountId: 'a', generation: 1 }, owner = { scope, hostGeneration: '00000000-0000-4000-8000-000000000004' }
  const project = join(accountAigcDirectory(root, 'a'), 'workspaces', 'story'); await mkdir(project, { recursive: true }); await writeFile(join(project, 'brief.txt'), 'brief')
  const submissions: any[] = []
  const bridge = new AigcBridge({ userDataRoot: root, isCurrent: () => true, hostContext: () => owner, nativeModel: async () => ({ provider: 'native-provider', model: 'exact-model', capabilityFlags: [] }),
    command: async (action, data: any) => { if (action === 'submit') submissions.push(data); return action === 'bind' ? { ...data, workspaceId: 'workspace-a' } : { accepted: true } } })
  try {
    const context = await bridge.bind(scope, project), requestId = '00000000-0000-4000-8000-000000000005'
    await bridge.submit(scope, { directory: project, sessionId: context.sessionId, requestId, prompt: 'Read brief', providerId: 'gateway', modelId: 'exact-model', attachments: [{ name: 'Brief', path: 'brief.txt', mimeType: 'text/plain' }] })
    expect(submissions).toHaveLength(1); expect(submissions[0]).toMatchObject({ context, requestId, selection: { provider: 'native-provider', model: 'exact-model' } })
    expect(submissions[0].content.map((part: any) => part.text).join('\n')).toContain('brief.txt')
    await expect(bridge.submit(scope, { directory: project, sessionId: context.sessionId, requestId, prompt: 'Read', providerId: 'gateway', modelId: 'exact-model', attachments: [{ name: 'Outside', path: '../../outside.txt', mimeType: 'text/plain' }] })).rejects.toThrow('AIGC_REFERENCE_INVALID')
    expect(submissions).toHaveLength(1)
  } finally { await bridge.revoke(); await rm(root, { recursive: true, force: true }) }
})
it('backgroundQuestionRoutesToOrigin without changing to the editor root',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aigc-capability-question-')),scope={accountId:'a',generation:1},owner={scope,hostGeneration:'00000000-0000-4000-8000-000000000004'},project=join(accountAigcDirectory(root,'a'),'workspaces','story');await mkdir(project,{recursive:true})
 const commands:any[]=[],caller={...owner,callerSessionId:'session-video-00000000-0000-4000-8000-000000000007',workspaceId:null,toolCallId:'cross-call'}
 const bridge=new AigcBridge({userDataRoot:root,isCurrent:()=>true,hostContext:()=>owner,command:async(action,data:any)=>{commands.push({action,data});return action==='bind'?{...data,workspaceId:'aigc-workspace'}:{answer:'Yes'}}})
 try{
  const context=await bridge.bind(scope,project,undefined,false)
  const invoke=async()=>bridge.question(scope,{directory:project,sessionId:caller.callerSessionId,callId:caller.toolCallId,question:{title:'确认',question:'继续？'}},new AbortController().signal)
  expect(await bridge.invokeCapability(caller,context,'execute',{name:'ask',arguments:{}},invoke,new AbortController().signal)).toMatchObject({answer:'Yes'})
  expect(commands.find(row=>row.action==='native')?.data).toMatchObject({caller,input:{sessionId:caller.callerSessionId,callId:caller.toolCallId}})
  await expect(invoke()).rejects.toThrow('AIGC_CALL_UNAVAILABLE')
 }finally{await bridge.revoke();await rm(root,{recursive:true,force:true})}
})
it('retains an asynchronous origin grant and rejects budget requests after its release',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aigc-origin-')),scope={accountId:'a',generation:1},owner={scope,hostGeneration:'00000000-0000-4000-8000-000000000004'},project=join(accountAigcDirectory(root,'a'),'workspaces','story');await mkdir(project,{recursive:true})
 const checked:any[]=[],released:string[]=[],caller={...owner,callerSessionId:'session-video-00000000-0000-4000-8000-000000000007',workspaceId:null,toolCallId:'generation-call'}
 const bridge=new AigcBridge({userDataRoot:root,isCurrent:()=>true,hostContext:()=>owner,command:async(action,data:any)=>action==='bind'?{...data,workspaceId:'aigc-workspace'}:null,budget:async(origin,input)=>{checked.push({origin,input});return{allowed:true}},releaseCaller:async(_scope,grant)=>{released.push(grant)}})
 try{
  const context=await bridge.bind(scope,project,undefined,false),hold=bridge.retainCapabilityCaller(caller,context)
  let packet:any
  await bridge.invokeCapability(caller,context,'execute',{name:'nodeTools',arguments:{}},async(_scope,input)=>{packet=input;return{}},new AbortController().signal)
  expect(packet.nativeCaller).toEqual(hold.origin)
  const request={requestId:'00000000-0000-4000-8000-000000000008',modelId:'fixture-model',fundingSource:'platform',capabilityCaller:hold.origin}
  await expect(bridge.budget(scope,request,new AbortController().signal)).resolves.toEqual({allowed:true});expect(checked[0].origin).toEqual(caller)
  await hold.release();expect(released).toEqual([hold.origin.grantRef])
  await expect(bridge.budget(scope,request,new AbortController().signal)).rejects.toThrow('AIGC_CALL_UNAVAILABLE')
 }finally{await bridge.revoke();await rm(root,{recursive:true,force:true})}
})
