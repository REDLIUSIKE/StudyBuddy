import {expect,it} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {CapabilityMainService} from '../../src/studybuddy/capabilities/service.ts'
import {caller,projectFixture,target} from './fixture.ts'
it('copies verified bytes exclusively into the native caller directory and rejects another destination',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capability-delivery-')),source=join(root,'source'),destination=join(root,'task');await mkdir(source);await mkdir(destination)
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]),file=join(source,'宣传 图片.png');await writeFile(file,bytes)
 const service=new CapabilityMainService({owner:()=>({scope:caller.scope,hostGeneration:caller.hostGeneration}),destination:async()=>destination})
 const f=projectFixture();service.register({port:{...f.port,import:async()=>{throw Error('unused')}},root:async()=>source})
 try{
  await service.projects.bind(caller,'video',{action:'create',title:'film'},new AbortController().signal)
  const artifact=await service.artifact(caller,target,file,'image/png'),first=await service.deliver(caller,artifact.artifactRef,destination,new AbortController().signal)
  expect(await readFile(first.path)).toEqual(bytes)
  const second=await service.deliver(caller,artifact.artifactRef,destination,new AbortController().signal);expect(second.path).toBe(first.path)
  await expect(service.deliver(caller,artifact.artifactRef,source,new AbortController().signal)).rejects.toThrow('CAPABILITY_DESTINATION_DENIED')
  await writeFile(first.path,'tampered');await expect(service.deliver(caller,artifact.artifactRef,destination,new AbortController().signal)).rejects.toThrow('CAPABILITY_CONTENT_INVALID')
 }finally{await service.revoke();await rm(root,{recursive:true,force:true})}
})
