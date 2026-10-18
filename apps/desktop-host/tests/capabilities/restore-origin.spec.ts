import {expect,it} from 'vitest'
import {installCapabilityHostControl} from '../../src/capabilities/control.ts'
import {fixture,owner} from './fixture.ts'

it('reauthorizes a cold editor from the actual registered native caller without replacing its Session',async()=>{
 const f=await fixture(),requests:unknown[]=[]
 let control:Awaited<ReturnType<typeof installCapabilityHostControl>>
 try{
  control=await installCapabilityHostControl(f.ctx,owner.hostGeneration,async message=>{
   const value=message as {type:string;request?:{rpcId:string;caller:{callerSessionId:string};operation:string;input:unknown}}
   if(value.type!=='capability-request'||!value.request)return
   requests.push(value.request);expect(value.request.caller.callerSessionId).toBe(f.agent.id)
   queueMicrotask(()=>control.result({rpcId:value.request!.rpcId,data:{data:{restored:true},artifacts:[],operationRef:null}}))
  })
  await control.command('scope',{owner,modules:[]})
  const header=structuredClone(f.agent.session.header)
  const first=f.ctx.capabilities.restoreOrigin!(f.agent),second=f.ctx.capabilities.restoreOrigin!(f.agent)
  expect(await first).toBe(true);expect(await second).toBe(true);expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({operation:'projects',input:{action:'restore-origin'}})
  expect(f.agent.session.header).toEqual(header);await control.command('scope',{owner:null,modules:[]})
  await expect(f.ctx.capabilities.restoreOrigin!(f.agent)).rejects.toThrow('CAPABILITY_SCOPE_REVOKED')
 }finally{await f.close()}
})
