import {expect,it,vi} from 'vitest'
const hook=vi.hoisted(()=>({beforeCreate:null as null|((path:string)=>Promise<void>)}))
vi.mock('node:fs/promises',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:fs/promises')>()
 return{...actual,writeFile:async(...args:Parameters<typeof actual.writeFile>)=>{if(typeof args[0]==='string'&&(args[0].includes('deliverables')||args[0].includes('video-')))await hook.beforeCreate?.(args[0]);return actual.writeFile(...args)}}
})
import {mkdtemp,mkdir,writeFile,rename,symlink,readdir,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {CapabilityMainService} from '../../src/studybuddy/capabilities/service.ts'
import {caller,projectFixture,target} from './fixture.ts'
it('never writes into an external junction swapped between validation and creation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'capability-delivery-race-')),source=join(root,'source'),destination=join(root,'task'),outside=join(root,'outside'),folder=join(destination,'deliverables')
 await mkdir(source);await mkdir(destination);await mkdir(outside);const bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]),file=join(source,'source.png');await writeFile(file,bytes)
 const service=new CapabilityMainService({owner:()=>({scope:caller.scope,hostGeneration:caller.hostGeneration}),destination:async()=>destination}),fixture=projectFixture();service.register({port:{...fixture.port,import:async()=>{throw Error('unused')}},root:async()=>source})
 let swapped=false
 try{await service.projects.bind(caller,'video',{action:'create',title:'film'},new AbortController().signal);const artifact=await service.artifact(caller,target,file,'image/png')
  hook.beforeCreate=async()=>{hook.beforeCreate=null;try{await rename(folder,folder+'.original');await symlink(outside,folder,'junction');swapped=true}catch(error){if(!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code??''))throw error}}
  const result=await service.deliver(caller,artifact.artifactRef,destination,new AbortController().signal).catch(()=>null)
  expect(await readdir(outside)).toEqual([])
  if(!swapped){expect(result).not.toBeNull();expect(await readFile(result!.path)).toEqual(bytes)}
 }finally{hook.beforeCreate=null;await service.revoke();await rm(root,{recursive:true,force:true})}
})
