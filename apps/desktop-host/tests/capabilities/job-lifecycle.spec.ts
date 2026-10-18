import {expect,it,vi} from 'vitest'
import NativeJobs from '@deepseek-ai/dsh-jobs-local'
import * as plugin from '../../src/capabilities/index.ts'
import {CapabilityJobs} from '../../src/capabilities/jobs.ts'
import {capabilityContext} from '../../src/capabilities/context.ts'
import {fixture,owner,documentAdapter} from './fixture.ts'
async function setup(){const f=await fixture();await f.ctx.plugin(NativeJobs);f.ctx.jobs.attachController('lifecycle');await f.ctx.plugin(plugin,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}});return f}
it.each(['native-stop','tool-cancel'] as const)('requests cancellation once and polls the original operation for its terminal status: %s',async method=>{
 const f=await setup(),adapter=documentAdapter();let cancelled=false
 const cancel=vi.spyOn(adapter,'cancel').mockImplementation(async()=>{cancelled=true;return{data:{cancellationRequested:true},artifacts:[],operationRef:null} as never}),status=vi.spyOn(adapter,'status').mockImplementation(async()=>({data:{state:cancelled?'cancelled':'in_progress'},artifacts:[],operationRef:null}))
 f.ctx.capabilities.registry.register(adapter)
 const context=capabilityContext(f.ctx,owner,{agent:f.agent,callId:'long-work',signal:new AbortController().signal}),target={moduleId:'novel',projectRef:'novel-one'},jobs=new CapabilityJobs(f.ctx,f.ctx.capabilities.registry,f.ctx.capabilities.associations,()=>{},1)
 try{await f.ctx.capabilities.associations.link(context.caller,target,'novel-job:stop');const id=jobs.track(context,target,'novel-job:stop');await expect.poll(()=>status.mock.calls.length).toBeGreaterThan(0);if(method==='native-stop')f.ctx.jobs.kill(id,f.agent.id);else await jobs.reconcile(context,'novel-job:stop',true);await expect.poll(()=>f.ctx.jobs.get(id,f.agent.id)?.status,{timeout:1500}).toBe('killed');expect(cancel).toHaveBeenCalledTimes(1);expect(f.ctx.jobs.get(id,f.agent.id)?.detail).toContain('cancelled')}
 finally{await jobs.close();await f.close()}
})
it.each(['module','agent'] as const)('revokes admission and settles the captured operation on %s disposal',async kind=>{
 const f=await setup(),adapter=documentAdapter();let cancelled=false
 const cancel=vi.spyOn(adapter,'cancel').mockImplementation(async()=>{cancelled=true;return{data:{state:'cancelled'},artifacts:[],operationRef:null}}),release=vi.spyOn(adapter,'release');vi.spyOn(adapter,'status').mockImplementation(async()=>({data:{state:cancelled?'cancelled':'in_progress'},artifacts:[],operationRef:null}))
 const remove=f.ctx.capabilities.registry.register(adapter),context=capabilityContext(f.ctx,owner,{agent:f.agent,callId:'disposal-work',signal:new AbortController().signal}),target={moduleId:'novel',projectRef:'novel-one'}
 try{await f.call('creative_project',{action:'create',moduleId:'novel',title:'draft'});await f.ctx.capabilities.associations.link(context.caller,target,'novel-job:dispose');f.ctx.capabilities.tools.jobs.track(context,target,'novel-job:dispose');if(kind==='module')await remove();else await f.agent.ctx.fiber.dispose();await expect.poll(()=>cancel.mock.calls.length,{timeout:1500}).toBe(1);await expect.poll(()=>release.mock.calls.length,{timeout:1500}).toBe(1)}
 finally{await f.close()}
})
