import {expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {CapabilityMainService} from '../../src/studybuddy/capabilities/service.ts'
import {caller,projectFixture,target} from './fixture.ts'

it('opens a Main-minted project action only for its admitted original account and target',async()=>{
 let current=true
 const open=vi.fn(async()=>{}),service=new CapabilityMainService({owner:()=>current?{scope:caller.scope,hostGeneration:caller.hostGeneration}:null,open})
 const fixture=projectFixture();service.register({port:{...fixture.port,import:async()=>{throw Error('unused')}},root:async()=>'/unused'})
 const invoke=(input:Record<string,string>)=>service.handle({schemaVersion:1,rpcId:randomUUID(),caller,operation:'bind',target:null,input},new AbortController().signal)
 try{
  await invoke({action:'attach',moduleId:'video',projectRef:target.projectRef})
  const reply=await invoke({action:'project-action',moduleId:'video',projectRef:target.projectRef})
  const id=(reply.data as {projectAction:{id:string}}).projectAction.id
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
  await expect(service.openAction(id,{...caller.scope,generation:0},new AbortController().signal)).rejects.toThrow('CAPABILITY_OPEN_NOT_AUTHORIZED')
  await expect(service.openAction('film-a',caller.scope,new AbortController().signal)).rejects.toThrow('CAPABILITY_OPEN_NOT_AUTHORIZED')
  expect(open).not.toHaveBeenCalled()
  await service.openAction(id,caller.scope,new AbortController().signal)
  expect(open).toHaveBeenCalledExactlyOnceWith(caller,target,expect.any(AbortSignal))
  current=false
  await expect(service.openAction(id,caller.scope,new AbortController().signal)).rejects.toThrow('CAPABILITY_SCOPE_REVOKED')
 }finally{await service.revoke()}
})
