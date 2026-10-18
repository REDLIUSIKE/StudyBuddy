import type {Context} from '@deepseek-ai/cordis'
import {ToolCallId} from '@deepseek-ai/dsh-llm'
import {SessionId} from '@deepseek-ai/dsh-session'
import {parseHarnessCapabilityInvocationV1} from '@studybuddy/contracts'
import type {CapabilityAdapter} from './types.ts'
import {capabilityContext} from './context.ts'
import {CapabilityRpc} from './rpc.ts'
import * as plugin from './index.ts'
import {createAigcCapabilityAdapter} from './adapters/aigc.ts'
import {createVideoCapabilityAdapter} from './adapters/video.ts'
import {assertResearchModelBudget} from '../research-budget-guard.ts'
import {createCapabilityNativeDelivery} from './delivery.ts'
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('CAPABILITY_CONTROL_INVALID');return value as Record<string,unknown>}
export async function installCapabilityHostControl(ctx:Context,hostGeneration:string,send:(value:object)=>Promise<void>){
 const rpc=new CapabilityRpc(hostGeneration,send)
 const delivery=createCapabilityNativeDelivery(ctx,async()=>ctx.loader.unwrapExports(await ctx.loader.import('@deepseek-ai/dsh-tool-present')))
 await ctx.plugin(plugin,{owner:rpc.owner,prepareDelivery:delivery.prepare,port:{invoke:(request,signal)=>rpc.request(request,signal)},authorize:async context=>{const owner=rpc.owner();if(!owner||JSON.stringify(owner.scope)!==JSON.stringify(context.caller.scope))throw Error('CAPABILITY_SCOPE_REVOKED')}})
 const factories=new Map<string,()=>CapabilityAdapter>([['aigc',()=>createAigcCapabilityAdapter({invoke:(request,signal)=>rpc.request(request,signal)},images=>{
  const attachments=ctx.get('attachments');if(!attachments)throw Error('AIGC_NATIVE_ATTACHMENTS_UNAVAILABLE');return attachments.saveImages(images)
 })],['video',()=>createVideoCapabilityAdapter({invoke:(request,signal)=>rpc.request(request,signal)},images=>{
  const attachments=ctx.get('attachments');if(!attachments)throw Error('CAPABILITY_NATIVE_ATTACHMENTS_UNAVAILABLE');return attachments.saveImages(images)
 })]])
 const contributions=new Map<string,()=>Promise<void>>()
 const restoring=new WeakMap<import('@deepseek-ai/dsh-agent').Agent,Promise<boolean>>()
 ctx.capabilities.restoreOrigin=agent=>{
  const old=restoring.get(agent);if(old)return old
  const task=Promise.resolve().then(async()=>{const owner=rpc.owner();if(!owner)throw Error('CAPABILITY_SCOPE_REVOKED');const context=capabilityContext(ctx,owner,{agent,callId:ToolCallId('capability-resume'),signal:new AbortController().signal}),result=await rpc.invoke(context.caller,'projects',null,{action:'restore-origin'},context.signal);return!!result.data&&typeof result.data==='object'&&!Array.isArray(result.data)&&result.data.restored===true}).finally(()=>{restoring.delete(agent)})
  restoring.set(agent,task);return task
 }
 ctx.effect(()=>async()=>{await ctx.capabilities.tools.revoke();for(const remove of contributions.values())await remove();await delivery.close();await rpc.close()},'capabilities.private-control')
 return{result:(value:unknown)=>rpc.result(value),async command(action:string,data:unknown):Promise<unknown>{
  const input=object(data)
  if(action==='scope'){
   if(Object.keys(input).sort().join(',')!=='modules,owner'||!Array.isArray(input.modules)||input.modules.some(id=>typeof id!=='string'||!factories.has(id))||new Set(input.modules).size!==input.modules.length)throw Error('CAPABILITY_CONTROL_INVALID')
   if(JSON.stringify(rpc.owner())===JSON.stringify(input.owner)&&JSON.stringify([...contributions.keys()])===JSON.stringify(input.modules))return null
   await ctx.capabilities.tools.revoke();for(const remove of contributions.values())await remove();rpc.setScope(null);contributions.clear();rpc.setScope(input.owner)
   if(input.owner!==null)for(const id of input.modules as string[])contributions.set(id,ctx.capabilities.registry.register(factories.get(id)!()))
   if(input.owner!==null)ctx.capabilities.tools.resume()
   return null
  }
  const owner=rpc.owner();if(!owner)throw Error('CAPABILITY_SCOPE_REVOKED')
  const caller=parseHarnessCapabilityInvocationV1({schemaVersion:1,rpcId:'00000000-0000-4000-8000-000000000001',caller:input.caller,operation:'catalog',target:null,input:null}).caller
  const agent=ctx.agents.get(SessionId(caller.callerSessionId));if(!agent)throw Error('CAPABILITY_SESSION_REQUIRED')
  const actual=capabilityContext(ctx,owner,{agent,callId:ToolCallId(caller.toolCallId),signal:new AbortController().signal})
  if(JSON.stringify(actual.caller)!==JSON.stringify(caller))throw Error('CAPABILITY_SCOPE_REVOKED')
  if(action==='associated'){
   const target=object(input.target);if(typeof target.moduleId!=='string'||typeof target.projectRef!=='string')throw Error('CAPABILITY_CONTROL_INVALID')
   return(await ctx.capabilities.associations.find(caller,target.moduleId)).some(row=>row.projectRef===target.projectRef)
  }
  if(action==='destination'){const directory=ctx.get('workingDirectory');if(!directory)throw Error('CAPABILITY_DESTINATION_UNAVAILABLE');return{directory:await directory.ensure(agent,actual.signal)}}
  if(action==='budget'){
   if(typeof input.requestId!=='string'||typeof input.modelId!=='string'||!['platform','user_api'].includes(String(input.fundingSource)))throw Error('CAPABILITY_CONTROL_INVALID')
   await ctx.capabilities.policy.authorize(actual,'generation',null,null)
   const admission={requestId:input.requestId,modelId:input.modelId,fundingSource:input.fundingSource as 'platform'|'user_api'}
   await assertResearchModelBudget(ctx,{sessionId:agent.id,...admission});await ctx.capabilities.associations.recordMediaLink(caller,admission);return{allowed:true}
  }
  throw Error('CAPABILITY_CONTROL_INVALID')
 }}
}
