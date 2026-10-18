import {expect,it,vi} from 'vitest'
import {createVideoCapabilityAdapter} from '../../src/capabilities/adapters/video.ts'
import {fixture,owner} from './fixture.ts'
import {capabilityContext} from '../../src/capabilities/context.ts'
import {ToolCallId} from '@deepseek-ai/dsh-llm'
it('ordinaryCallerEditsAdmittedFilm through the common private port',async()=>{
 const invoke=vi.fn(async(request:any)=>({data:request.operation==='bind'?{target:{moduleId:'video',projectRef:'film-a'}}:request.operation==='catalog'&&request.input.action==='tools'?{tools:[]}:request.input,artifacts:[],operationRef:null}))
 const adapter=createVideoCapabilityAdapter({invoke}),f=await fixture();
 try{
  const context=capabilityContext(f.ctx,owner,{agent:f.other,callId:ToolCallId('adapter-call'),signal:new AbortController().signal}),target=await adapter.bind(context,{action:'create',title:'汽车宣传片'})
  await adapter.execute(context,target,'readProject',{})
  expect(invoke.mock.calls.at(-1)?.[0].caller.callerSessionId).toBe(f.other.id)
  expect(target).toEqual({moduleId:'video',projectRef:'film-a'})
 }finally{await f.close()}
})
it('presents verified video frames as original native image attachments in any conversation',async()=>{
 const f=await fixture(),saveImages=vi.fn(async(_images:readonly import('@deepseek-ai/dsh-attachment').SaveImageAttachment[])=>[{attachmentId:'frame-native' as import('@deepseek-ai/dsh-attachment').AttachmentId,mediaType:'image/png' as const,bytes:9,width:1,height:1}])
 try{
  const adapter=createVideoCapabilityAdapter({invoke:async()=>({data:{content:[{type:'text',text:'frame checked'},{type:'image',mimeType:'image/png',data:'iVBORw0KGgoB'}],details:{ok:true}},artifacts:[],operationRef:null})},saveImages)
  const context=capabilityContext(f.ctx,owner,{agent:f.other,callId:ToolCallId('frame-call'),signal:new AbortController().signal}),result=await adapter.execute(context,{moduleId:'video',projectRef:'film-a'},'look',{})
  expect(saveImages).toHaveBeenCalledTimes(1)
  expect(adapter.presentResult(result)).toContainEqual({type:'image',attachment:{attachmentId:'frame-native',mediaType:'image/png',bytes:9,width:1,height:1}})
 }finally{await f.close()}
})
