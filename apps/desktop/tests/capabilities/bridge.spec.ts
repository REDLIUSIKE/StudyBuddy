import { expect, it, vi } from 'vitest'
import { CapabilityMainBridge } from '../../src/studybuddy/capabilities/bridge.ts'
import { caller, target, projectFixture } from './fixture.ts'
import {randomUUID} from 'node:crypto'
const rpcId = '33333333-3333-4333-8333-333333333333'
it('unknownGenerationDoesNotCreateNewRequest', async () => {
  const { projects, port } = projectFixture(), owner = { scope: caller.scope, hostGeneration: caller.hostGeneration }
  const bridge = new CapabilityMainBridge({ owner: () => owner, projects, import: vi.fn() })
  const request = { schemaVersion: 1, rpcId, caller, operation: 'bind', target: null, input: { moduleId: 'video', action: 'create', title: '广告' } }
  await expect(bridge.handle(request, 'foreign', new AbortController().signal)).rejects.toThrow('CAPABILITY_SCOPE_REVOKED')
  const first = await bridge.handle(request, caller.hostGeneration, new AbortController().signal)
  expect(first.data).toEqual({ target }); expect(port.create).toHaveBeenCalledTimes(1)
  expect(await bridge.handle(request, caller.hostGeneration, new AbortController().signal)).toEqual(first)
  expect(port.create).toHaveBeenCalledTimes(1)
  await expect(bridge.handle({ ...request, input: { ...request.input, title: 'different' } }, caller.hostGeneration, new AbortController().signal)).rejects.toThrow('CAPABILITY_RPC_CONFLICT')
  owner.scope = { ...caller.scope, generation: 4 }
  await expect(bridge.handle(request, caller.hostGeneration, new AbortController().signal)).rejects.toThrow('CAPABILITY_SCOPE_REVOKED')
})
it('does not exhaust mutation admission after sustained read polling',async()=>{
 const {projects,port}=projectFixture(),bridge=new CapabilityMainBridge({owner:()=>({scope:caller.scope,hostGeneration:caller.hostGeneration}),projects,import:vi.fn()}),signal=new AbortController().signal
 for(let index=0;index<8200;index++)await bridge.handle({schemaVersion:1,rpcId:randomUUID(),caller,operation:'projects',target:null,input:{moduleId:'video'}},caller.hostGeneration,signal)
 await bridge.handle({schemaVersion:1,rpcId:randomUUID(),caller,operation:'bind',target:null,input:{moduleId:'video',action:'create',title:'After polling'}},caller.hostGeneration,signal)
 await bridge.handle({schemaVersion:1,rpcId:randomUUID(),caller,operation:'cancel',target,input:{operationRef:'video-export:one'}},caller.hostGeneration,signal)
 expect(port.create).toHaveBeenCalledTimes(1);expect(port.cancel).toHaveBeenCalledTimes(1)
})
