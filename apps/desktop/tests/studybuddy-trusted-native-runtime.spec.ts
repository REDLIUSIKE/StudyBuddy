import { it,expect,vi } from 'vitest'
import * as filesystem from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { mkdtemp,mkdir,writeFile,rm,symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyTrustedNativeRuntime } from '../src/studybuddy/trusted-native-runtime.ts'
vi.mock('node:fs/promises',async importOriginal=>{
  const actual=await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual,readFile:vi.fn(actual.readFile) }
})
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
async function fixture(){
  const directory=await mkdtemp(join(tmpdir(),'studybuddy-trusted-v2-'))
  const companion=process.platform==='win32'?'studybuddy-harness-native.exe':'studybuddy-harness-native'
  const files:Record<string,string>={}
  for(const name of [companion,'contracts/index.js','recipes/priority-install-recipes.json','module/index.html']){
    await mkdir(join(directory,name,'..'),{ recursive:true });await writeFile(join(directory,name),'synthetic bytes; never executed');files[name]=hash('synthetic bytes; never executed')
  }
  const moduleFiles={ 'index.html':files['module/index.html']! }
  const manifest={ schemaVersion:2,protocolVersion:2,sourceHead:'a'.repeat(40),sourceFiles:{ 'packages/contracts/src/index.ts':'b'.repeat(64) },companion,files,module:{ entry:'index.html',files:moduleFiles,moduleId:'sha256:'+hash(JSON.stringify(Object.entries(moduleFiles))) } }
  const save=async(value:unknown)=>writeFile(join(directory,'manifest.json'),JSON.stringify(value))
  await save(manifest)
  return { directory,manifest,save,close:()=>rm(directory,{ recursive:true,force:true }) }
}
it('verifies v2 companion/contracts/module/recipe bytes before trusting a runtime',async()=>{
  const f=await fixture();try{
    expect(await verifyTrustedNativeRuntime(f.directory)).toMatchObject({
      directory:f.directory,companion:f.manifest.companion,module:f.manifest.module,
    })
    await writeFile(join(f.directory,f.manifest.companion),'modified')
    await expect(verifyTrustedNativeRuntime(f.directory)).rejects.toMatchObject({ code:'NATIVE_RUNTIME_INVALID' })
  }finally{await f.close()}
})
it('verifies independent files concurrently while a slow executable read is pending',async()=>{
  const f=await fixture(),release=Promise.withResolvers<void>(),started=Promise.withResolvers<void>()
  const original=(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).readFile
  let secondStarted=false
  const read=vi.mocked(filesystem.readFile).mockImplementation(async(...args:Parameters<typeof original>)=>{
    if(args[0]===join(f.directory,f.manifest.companion)){started.resolve();await release.promise}
    if(args[0]===join(f.directory,'contracts/index.js'))secondStarted=true
    return original(...args)
  })
  const verification=verifyTrustedNativeRuntime(f.directory)
  try{
    await started.promise
    await vi.waitFor(()=>{expect(secondStarted).toBe(true)})
  }finally{
    release.resolve()
    await verification
    read.mockImplementation(original)
    await f.close()
  }
})
it('rejects v1, incomplete modules and missing core inputs without a downgrade',async()=>{
  const f=await fixture();try{
    for(const value of [{ ...f.manifest,schemaVersion:1 },{ ...f.manifest,protocolVersion:1 },{ ...f.manifest,module:{ ...f.manifest.module,moduleId:'sha256:'+'c'.repeat(64) } }]){
      await f.save(value);await expect(verifyTrustedNativeRuntime(f.directory)).rejects.toMatchObject({ code:'NATIVE_RUNTIME_INVALID' })
    }
    for(const name of ['contracts/index.js','recipes/priority-install-recipes.json','module/index.html']){
      const files=Object.fromEntries(Object.entries(f.manifest.files).filter(([key])=>key!==name))
      await f.save({ ...f.manifest,files })
      await expect(verifyTrustedNativeRuntime(f.directory)).rejects.toMatchObject({ code:'NATIVE_RUNTIME_INVALID' })
    }
  }finally{await f.close()}
})
it('rejects traversal and linked runtime ancestors before reading executable bytes',async()=>{
  const f=await fixture(),parent=await mkdtemp(join(tmpdir(),'studybuddy-linked-v2-'))
  try{
    await f.save({ ...f.manifest,files:{ ...f.manifest.files,'module/../escape':'c'.repeat(64) } })
    await expect(verifyTrustedNativeRuntime(f.directory)).rejects.toMatchObject({ code:'NATIVE_RUNTIME_INVALID' })
    await f.save(f.manifest);const link=join(parent,'alias');await symlink(f.directory,link,process.platform==='win32'?'junction':'dir')
    await expect(verifyTrustedNativeRuntime(link)).rejects.toMatchObject({ code:'NATIVE_RUNTIME_INVALID' })
  }finally{await rm(parent,{ recursive:true,force:true });await f.close()}
})
it('admits a checked development upload identity but rejects relabeled source or production metadata',async()=>{
  const f=await fixture();try{
    const buildIdentity={ kind:'development',buildId:'b'.repeat(32),sourceGitSha:'a'.repeat(40) }
    await f.save({ ...f.manifest,buildIdentity })
    expect((await verifyTrustedNativeRuntime(f.directory)).sourceHead).toBe('a'.repeat(40))
    for(const value of [{ ...buildIdentity,kind:'production' },{ ...buildIdentity,sourceGitSha:'c'.repeat(40) },{ ...buildIdentity,buildId:'dev' },{ ...buildIdentity,extra:true }]){
      await f.save({ ...f.manifest,buildIdentity:value })
      await expect(verifyTrustedNativeRuntime(f.directory)).rejects.toMatchObject({ code:'NATIVE_RUNTIME_INVALID' })
    }
  }finally{await f.close()}
})
