import {expect,it,vi} from 'vitest'
import LocalJobs from '@deepseek-ai/dsh-jobs-local'
import {CapabilityJobs} from '../../src/capabilities/jobs.ts'
import {capabilityContext} from '../../src/capabilities/context.ts'
import * as plugin from '../../src/capabilities/index.ts'
import {fixture,owner,documentAdapter} from './fixture.ts'
it('uses the native owned Job and reauthorizes a restored operation without executing generation',async()=>{
 const f=await fixture()
 try{
  await f.ctx.plugin(LocalJobs);f.ctx.jobs.attachController('capability-test')
  await f.ctx.plugin(plugin,{owner:()=>owner,port:{invoke:async()=>({data:null,artifacts:[],operationRef:null})},authorize:async()=>{}})
  const adapter=documentAdapter(),execute=vi.spyOn(adapter,'execute'),bind=vi.spyOn(adapter,'bind');f.ctx.capabilities.registry.register(adapter)
  const context=capabilityContext(f.ctx,owner,{agent:f.agent,callId:'original-call',signal:new AbortController().signal}),target={moduleId:'novel',projectRef:'novel-one'}
  const jobs=new CapabilityJobs(f.ctx,f.ctx.capabilities.registry,f.ctx.capabilities.associations,()=>{},1)
  await f.ctx.capabilities.associations.link(context.caller,target,'novel-job:one')
  const result=await jobs.reconcile(context,'novel-job:one');expect(result.data).toEqual({state:'completed'});expect(bind).toHaveBeenCalled();expect(execute).not.toHaveBeenCalled()
  const id=jobs.track(context,target,'novel-job:one');await expect.poll(()=>f.ctx.jobs.get(id,f.agent.id)?.status).toBe('completed')
  expect(()=>f.ctx.jobs.get(id,f.other.id)).toThrow();await jobs.close()
 }finally{await f.close()}
})
