import {expect,it,vi} from 'vitest'
import {AigcCapabilityPort} from '../../src/studybuddy/capabilities/aigc.ts'
import {caller} from './fixture.ts'
it.each(['missing-output','controller-lost','identity-changed','flush-failed'] as const)('releases the retained writer and caller on %s and keeps an explicit failed/unknown observation',async failure=>{
 const target={moduleId:'aigc',projectRef:'aigc-project'},signal=new AbortController().signal,release=vi.fn(async()=>{}),releaseCaller=vi.fn(async()=>{}),generationId='00000000-0000-4000-8000-000000000009'
 const command=vi.fn(async()=>{if(failure==='controller-lost')throw Error('AIGC_CONNECTION_LOST');return{status:'succeeded',generationId:failure==='identity-changed'?'other':generationId,outputs:failure==='missing-output'?{}:{image:{value:{url:'assets/result.png'}}}}}),flush=vi.fn(async()=>{if(failure==='flush-failed')throw Error('SAVE_FAILED')})
 const port=new AigcCapabilityPort({associated:async()=>true,runtime:{invoke:async()=>({projectRef:target.projectRef,directory:'C:/owned/project'})} as any,
 bridge:{isEditorOwner:()=>false,project:async(_scope:any,path:string)=>path,bind:async()=>({}),retainCapabilityCaller:()=>({release:releaseCaller}),invokeCapability:async(_caller:any,_context:any,operation:string)=>operation==='catalog'?{tools:[{name:'nodeTools',schemaSha256:'a'.repeat(64)}]}:{content:[],details:{status:'generating',generationId}}} as any,
 views:{acquire:async()=>({controller:{command,flush},state:async()=>({canvasId:'canvas.json',revision:1}),release})} as any,
 artifact:async()=>({artifactRef:'asset',moduleId:'aigc',schemaRef:'media-v1',originSessionId:caller.callerSessionId,mime:'image/png',bytes:12,sha256:'b'.repeat(64)})})
 const started=await port.execute(caller,target,'nodeTools',{nodeId:'node',name:'node:generateImage',args:{}},signal)
 const observation=await port.status(caller,target,started.operationRef!,signal)
 expect(observation.data).toMatchObject({state:failure==='missing-output'?'failed':'unknown'});expect(observation.artifacts).toEqual([]);expect(release).toHaveBeenCalledTimes(2);expect(releaseCaller).toHaveBeenCalledTimes(1)
 expect(await port.status(caller,target,started.operationRef!,signal)).toEqual(observation);expect(command).toHaveBeenCalledTimes(1)
})
