import {expect,it,vi} from 'vitest'
import {AigcCapabilityPort} from '../../src/studybuddy/capabilities/aigc.ts'
import {caller} from './fixture.ts'
it('keeps asynchronous node work leased until the exact generation completes, then reuses its verified output',async()=>{
 const target={moduleId:'aigc',projectRef:'aigc-project'},signal=new AbortController().signal,release=vi.fn(async()=>{}),releaseCaller=vi.fn(async()=>{}),generationId='00000000-0000-4000-8000-000000000009'
 let status='running'
 const command=vi.fn(async()=>({status,generationId,outputs:{image:{value:{url:'assets/node/result.png',mimeType:'image/png'}}}}))
 const port=new AigcCapabilityPort({associated:async()=>true,runtime:{invoke:async()=>({projectRef:target.projectRef,directory:'C:/owned/project'})} as any,
 bridge:{isEditorOwner:()=>false,project:async(_scope:any,path:string)=>path,bind:async()=>({}),retainCapabilityCaller:()=>({release:releaseCaller}),invokeCapability:async(_caller:any,_context:any,op:string)=>op==='catalog'?{tools:[{name:'nodeTools',schemaSha256:'a'.repeat(64)}]}:{content:[{type:'text',text:'started'}],details:{status:'generating',generationId}}} as any,
 views:{acquire:async()=>({controller:{command},state:async()=>({canvasId:'画布1.json',revision:3}),release})} as any,
 artifact:async()=>({artifactRef:'artifact-result',moduleId:'aigc',schemaRef:'media-v1',originSessionId:caller.callerSessionId,mime:'image/png',bytes:12,sha256:'b'.repeat(64)})})
 const started=await port.execute(caller,target,'nodeTools',{nodeId:'node',name:'node:generateImage',args:{}},signal)
 expect(started.operationRef).toMatch(/^aigc-node:/);expect(release).toHaveBeenCalledTimes(1);expect(releaseCaller).not.toHaveBeenCalled()
 const running=await port.status(caller,target,started.operationRef!,signal);expect(running.data).toMatchObject({state:'in_progress'})
 status='succeeded';const completed=await port.status(caller,target,started.operationRef!,signal)
 expect(completed.data).toMatchObject({state:'completed'});expect(completed.artifacts[0]?.artifactRef).toBe('artifact-result');expect(release).toHaveBeenCalledTimes(2);expect(releaseCaller).toHaveBeenCalledTimes(1)
 await port.status(caller,target,started.operationRef!,signal);expect(releaseCaller).toHaveBeenCalledTimes(1)
 await expect(port.status({...caller,callerSessionId:'another-session'},target,started.operationRef!,signal)).rejects.toThrow('CAPABILITY_OPERATION_NOT_AUTHORIZED')
})
