import { it,expect,vi } from 'vitest'
import { mkdtemp,realpath,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NativeVideoProjects } from '../src/video-projects.ts'
it('admits an original OpenFilm ID to a native Session and revokes its parent and descendants',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'native-video-'))),sessionId='session-video-22222222-2222-4222-8222-222222222222'
 const parent={id:sessionId,cancel:vi.fn(),whenIdle:async()=>{}},child={id:'child',cancel:vi.fn(),whenIdle:async()=>{}}
 const ctx={get:(name:string)=>name==='workingDirectory'?{get:()=>root}:undefined,workspaceRegistry:{resolveByPath:async()=>undefined,create:async()=>({id:'workspace'})},sessions:{get:()=>undefined},sessionController:{create:vi.fn(async()=>{})},agents:{get:()=>parent,list:()=>[parent,child],isOwnedBy:(id:string,owner:unknown)=>id==='child'&&owner===parent}}
 const scope={scope:{accountId:'account',generation:1},hostGeneration:'11111111-1111-4111-8111-111111111111'}
 try{
  const owner=new NativeVideoProjects(ctx as never,scope.hostGeneration);await owner.setScope(scope)
  const binding=await owner.bind({...scope,projectId:'AbCd_12-xY',sessionId,lease:'33333333-3333-4333-8333-333333333333',root})
  expect(owner.binding(binding.scope)).toBe(binding);expect(ctx.sessionController.create).toHaveBeenCalledOnce()
  await expect(owner.bind({...scope,projectId:'other',sessionId,lease:binding.lease,root})).rejects.toThrow('VIDEO_PROJECT_CONFLICT')
  const stopping=owner.setScope(null);expect(owner.binding(binding.scope)).toBeUndefined();await stopping
  expect(parent.cancel).toHaveBeenCalledOnce();expect(child.cancel).toHaveBeenCalledOnce()
 }finally{await rm(root,{recursive:true,force:true})}
})
it.each([false,true])('reopens a relocated project with its original native Session when birth-path membership is filtered: %s',async(filtered)=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'native-video-move-'))),original=join(root,'previously-moved'),sessionId='session-video-22222222-2222-4222-8222-222222222223'
 const header={id:sessionId,cwd:original},agent={id:sessionId,session:{header},cancel:vi.fn(),whenIdle:async()=>{}}
 let effective=original
 const set=vi.fn(async(_agent:unknown,next:string)=>{effective=next;return next}),create=vi.fn(async()=>{}),workspace={id:'original-workspace',path:original,sessionIds:filtered?[]:[sessionId]}
 const ctx={get:(name:string)=>name==='workingDirectory'?{get:()=>effective,set}:undefined,workingDirectory:{get:()=>effective,set},workspaceRegistry:{list:()=>[workspace],resolveByPath:vi.fn(),create:vi.fn()},sessions:{get:()=>({header}),flush:vi.fn(async()=>{})},sessionController:{create},agents:{get:()=>agent,list:()=>[agent],isOwnedBy:()=>false}}
 const scope={scope:{accountId:'account',generation:1},hostGeneration:'11111111-1111-4111-8111-111111111111'}
 try{
  const owner=new NativeVideoProjects(ctx as never,scope.hostGeneration);await owner.setScope(scope)
  const binding=await owner.bind({...scope,projectId:'original-ID',sessionId,lease:'33333333-3333-4333-8333-333333333333',root})
  expect(binding.scope.workspaceId).toBe(workspace.id);expect(binding.projectRoot).toBe(root)
  expect(create).toHaveBeenCalledWith({sessionId,cwd:original});expect(set).toHaveBeenCalledWith(agent,root,expect.any(AbortSignal));expect(header.cwd).toBe(original)
  expect(ctx.workspaceRegistry.create).not.toHaveBeenCalled()
 }finally{await rm(root,{recursive:true,force:true})}
})
