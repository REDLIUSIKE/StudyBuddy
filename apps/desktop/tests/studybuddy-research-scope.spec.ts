import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ResearchBridge } from '../src/studybuddy/research-bridge.ts'
import { accountResearchDirectory } from '../src/studybuddy/research-runtime.ts'

it('persists one native Session identity per project and rejects a stale generation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-binding-')), scope = { accountId: 'synthetic-a', generation: 1 }, hostGeneration = randomUUID()
  const folder = join(accountResearchDirectory(root, scope.accountId), 'projects/study')
  await mkdir(join(folder, 'sandbox'), { recursive: true }); await writeFile(join(folder, 'project.json'), JSON.stringify({ id: 'study' }))
  let live = true; const calls: unknown[] = []
  const create = () => new ResearchBridge({ userDataRoot: root, isCurrent: () => live, hostContext: () => ({ scope, hostGeneration }),
    command: async (action, data) => {
      calls.push({ action, data })
      if (action === 'bind') return { ...(data as object), workspaceId: 'workspace-study' }
      return null
    } })
  try {
    const first = create(), [a, b] = await Promise.all([first.bind(scope, 'study'), first.bind(scope, 'study')])
    expect(a.sessionId).toBe(b.sessionId); expect(calls.filter((row: unknown) => (row as { action: string }).action === 'bind')).toHaveLength(1)
    const reopened = await create().bind(scope, 'study'); expect(reopened.sessionId).toBe(a.sessionId)
    expect(JSON.parse(await readFile(join(folder, '.studybuddy-native.json'), 'utf8'))).toEqual({ schemaVersion: 1, sessionId: a.sessionId })
    live = false; await expect(first.bind(scope, 'study')).rejects.toThrow('RESEARCH_SCOPE_REVOKED')
    await expect(first.bind({ ...scope, accountId: 'synthetic-b' }, 'study')).rejects.toThrow('RESEARCH_SCOPE_REVOKED')
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('refuses unknown and linked project roots before issuing a native bind', async () => {
  const root = await mkdtemp(join(tmpdir(), 'research-binding-')), other = await mkdtemp(join(tmpdir(), 'research-other-'))
  const scope = { accountId: 'synthetic-a', generation: 1 }, projects = join(accountResearchDirectory(root, scope.accountId), 'projects')
  await mkdir(projects, { recursive: true }); await mkdir(join(other, 'sandbox')); await writeFile(join(other, 'project.json'), '{"id":"linked"}')
  const linked = join(projects, 'linked'); await symlink(other, linked, process.platform === 'win32' ? 'junction' : 'dir')
  let dispatched = 0
  const bridge = new ResearchBridge({ userDataRoot: root, isCurrent: () => true, hostContext: () => ({ scope, hostGeneration: randomUUID() }), command: async () => { dispatched++; return null } })
  try {
    await expect(bridge.bind(scope, 'missing')).rejects.toThrow(); await expect(bridge.bind(scope, 'linked')).rejects.toThrow('RESEARCH_PATH_DENIED')
    await expect(bridge.bind(scope, '../foreign')).rejects.toThrow('RESEARCH_PROJECT_INVALID'); expect(dispatched).toBe(0)
  } finally { await unlink(linked); await rm(root, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }) }
})
it('routes an exported child through its owned root binding without adding a child chat',async()=>{
 const root=await mkdtemp(join(tmpdir(),'research-export-')),scope={accountId:'synthetic-a',generation:1},hostGeneration=randomUUID(),child='session-22222222-2222-4222-8222-222222222222'
 const folder=join(accountResearchDirectory(root,scope.accountId),'projects/study');await mkdir(join(folder,'sandbox'),{recursive:true});await writeFile(join(folder,'project.json'),'{"id":"study"}')
 let parent='',live=true;const calls:any[]=[]
 const bridge=new ResearchBridge({userDataRoot:root,isCurrent:()=>live,hostContext:()=>({scope,hostGeneration}),command:async(action,data)=>{calls.push({action,data});if(action==='bind'){parent=(data as any).sessionId;return {...data as object,workspaceId:'workspace-study'}}if(action==='journal-export'&&(data as any).input.kind==='sessions')return [{id:parent,parentSessionId:null},{id:child,parentSessionId:parent}];return {nativeSessionId:child}}})
 try{const listed=await bridge.invoke(scope,{projectId:'study',operation:'journal-sessions',input:null}as never,new AbortController().signal)as any;expect(listed.sessions).toEqual(expect.arrayContaining([expect.objectContaining({id:child,parentSessionId:parent,rootSessionId:parent})]));await bridge.invoke(scope,{projectId:'study',sessionId:child,operation:'journal-export',input:{cursor:{seq:-1,offset:0},endSeq:null}}as never,new AbortController().signal);expect(calls.at(-1).data).toMatchObject({context:{sessionId:parent},input:{sessionId:child}});expect((await bridge.chats(scope,'study')).chats).toHaveLength(1);live=false;await expect(bridge.invoke(scope,{projectId:'study',sessionId:child,operation:'journal-export',input:{cursor:{seq:-1,offset:0},endSeq:null}}as never,new AbortController().signal)).rejects.toThrow('RESEARCH_SCOPE_REVOKED')}finally{await rm(root,{recursive:true,force:true})}
})
