import {expect,it,vi} from 'vitest'
import {createAigcCapabilityAdapter} from '../../src/capabilities/adapters/aigc.ts'
import {fixture,owner} from './fixture.ts'
import {capabilityContext} from '../../src/capabilities/context.ts'
import {ToolCallId} from '@deepseek-ai/dsh-llm'
it('videoCallerCanUseAigcTools without changing the native cwd or Session',async()=>{
 const invoke=vi.fn(async(request:any)=>({data:request.operation==='bind'?{target:{moduleId:'aigc',projectRef:'canvas-a'}}:{content:[{type:'text',text:'done'}]},artifacts:[],operationRef:null})),f=await fixture()
 try{
  const adapter=createAigcCapabilityAdapter({invoke}),before=f.agent.session.header.cwd
  const context=capabilityContext(f.ctx,owner,{agent:f.agent,callId:ToolCallId('aigc-call'),signal:new AbortController().signal}),target=await adapter.bind(context,{action:'create',title:'宣传片素材'})
  await adapter.execute(context,target,'getCanvas',{})
  expect(invoke.mock.calls.at(-1)?.[0].caller.callerSessionId).toBe(f.agent.id);expect(f.agent.session.header.cwd).toBe(before)
 }finally{await f.close()}
})
it('stores image tool output through the explicit native attachment service for any invoking Agent',async()=>{
 const f=await fixture(),saveImages=vi.fn(async(_images:readonly import('@deepseek-ai/dsh-attachment').SaveImageAttachment[])=>[{attachmentId:'image-native' as import('@deepseek-ai/dsh-attachment').AttachmentId,mediaType:'image/png' as const,bytes:68,width:1,height:1}])
 const invoke=vi.fn(async()=>({data:{content:[{type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGv8AAAAASUVORK5CYII='}]},artifacts:[],operationRef:null}))
 try{
  const adapter=createAigcCapabilityAdapter({invoke},saveImages),context=capabilityContext(f.ctx,owner,{agent:f.agent,callId:ToolCallId('read-image'),signal:new AbortController().signal})
  const result=await adapter.execute(context,{moduleId:'aigc',projectRef:'canvas-a'},'read',{path:'assets/car.png'})
  expect(saveImages).toHaveBeenCalledTimes(1)
  expect(saveImages.mock.calls[0]?.[0]?.[0]?.data).toBeInstanceOf(Buffer)
  expect(adapter.presentResult(result)).toEqual([{type:'image',attachment:{attachmentId:'image-native',mediaType:'image/png',bytes:68,width:1,height:1}}])
 }finally{await f.close()}
})
