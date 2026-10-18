import {expect,it,vi} from 'vitest'
import {VideoCapabilityPort} from '../../src/studybuddy/capabilities/video.ts'
import {caller,target} from './fixture.ts'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
it('project references alone do not grant access to an existing film',async()=>{
 const runtime={command:vi.fn(async()=>({projects:[{id:target.projectRef,name:'film'}]}))},bridge={isEditorOwner:()=>false}
 const port=new VideoCapabilityPort({runtime:runtime as any,bridge:bridge as any,associated:async()=>false,artifact:async()=>{throw Error('unused')}})
 await expect(port.resolve(caller,target.projectRef,new AbortController().signal)).rejects.toThrow('CAPABILITY_PROJECT_NOT_AUTHORIZED')
 expect(await port.list(caller,new AbortController().signal)).toEqual([])
})
it('returns checked preview bytes to the invoking native conversation without an external read grant',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cap-preview-')),bytes=Buffer.from([137,80,78,71,13,10,26,10,1]),sha256=createHash('sha256').update(bytes).digest('hex')
 const bridge={isEditorOwner:()=>true,retainTask:async()=>({scope:{},projectRoot:root}),invokeCapability:async()=>({ok:true,artifacts:[{relativePath:'frame.png',mime:'image/png',sha256}]})}
 const artifact={artifactRef:'frame-verified',moduleId:'video',schemaRef:'media-v1',originSessionId:caller.callerSessionId,mime:'image/png',bytes:bytes.length,sha256}
 const port=new VideoCapabilityPort({runtime:{} as any,bridge:bridge as any,associated:async()=>true,artifact:async()=>artifact})
 try{await writeFile(join(root,'frame.png'),bytes);const result=await port.execute(caller,target,'look',{},new AbortController().signal);expect(result.data).toMatchObject({content:expect.arrayContaining([{type:'image',mimeType:'image/png',data:bytes.toString('base64')}])})}finally{await rm(root,{recursive:true,force:true})}
})
it('exports only to the canonical directory returned by native path admission',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cap-export-')),canonical=join(root,'canonical-authorized-output'),invokeCapability=vi.fn(async(..._args:unknown[])=>({jobId:'abcdef012345'}))
 const runtime={admitPaths:vi.fn(async()=>[canonical])},bridge={isEditorOwner:()=>true,retainTask:vi.fn(async()=>({scope:{},projectRoot:root})),invokeCapability}
 const port=new VideoCapabilityPort({userDataRoot:root,runtime:runtime as any,bridge:bridge as any,associated:async()=>true,artifact:async()=>{throw Error('unused')}})
 try{
  await port.execute(caller,target,'createExport',{kind:'video'},new AbortController().signal)
  expect(invokeCapability.mock.calls[0]?.[3]).toEqual({kind:'video',folder:canonical})
 }finally{await rm(root,{recursive:true,force:true})}
})
