/** Verify local first-party runtime bytes. No endpoint, credential or fallback. */
import { createHash } from 'node:crypto'
import { lstat,readFile } from 'node:fs/promises'
import { dirname,join,resolve } from 'node:path'
import { BusinessFailure } from './business-api.ts'
export interface VerifiedNativeRuntime {
  directory:string
  companion:string
  sourceHead:string
  files:Readonly<Record<string,string>>
  module:{ moduleId:string;entry:'index.html';files:Readonly<Record<string,string>> }
}
const invalid=():never=>{throw new BusinessFailure('NATIVE_RUNTIME_INVALID')}
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex')
function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid()
  return value as Record<string,unknown>
}
function checkedName(value:string):void {
  if(!value||value.includes('\\')||value.includes(':')||value.startsWith('/')||value.split('/').some(part=>!part||part==='.'||part==='..'))invalid()
}
function hashes(value:unknown):Record<string,string>{
  const input=record(value),entries=Object.entries(input)
  if(!entries.length||entries.length>8192)invalid()
  for(const[name,digest]of entries){checkedName(name);if(typeof digest!=='string'||!/^[a-f0-9]{64}$/u.test(digest))invalid()}
  return input as Record<string,string>
}
async function safePath(path:string):Promise<void>{
  let current=resolve(path)
  for(;;){if((await lstat(current)).isSymbolicLink())invalid();const parent=dirname(current);if(parent===current)return;current=parent}
}
/** Both companion launch and tool-page admission consume this exact manifest. */
export async function verifyTrustedNativeRuntime(directory:string):Promise<VerifiedNativeRuntime>{
  try{
    const base=resolve(directory);await safePath(base)
    const manifestPath=join(base,'manifest.json');await safePath(manifestPath)
    const stat=await lstat(manifestPath);if(!stat.isFile()||stat.size>8*1024*1024)invalid()
    const manifest=record(JSON.parse(await readFile(manifestPath,'utf8')))
    const companion=process.platform==='win32'?'studybuddy-harness-native.exe':'studybuddy-harness-native'
    const keys=Object.keys(manifest).filter(key=>key!=='buildIdentity').sort().join(',')
    if(keys!=='companion,files,module,protocolVersion,schemaVersion,sourceFiles,sourceHead'||manifest.schemaVersion!==2||manifest.protocolVersion!==2||manifest.companion!==companion||typeof manifest.sourceHead!=='string'||!/^[a-f0-9]{40}$/u.test(manifest.sourceHead))invalid()
    if(manifest.buildIdentity!==undefined){
      const build=record(manifest.buildIdentity)
      if(Object.keys(build).sort().join(',')!=='buildId,kind,sourceGitSha'||build.kind!=='development'||typeof build.buildId!=='string'||!/^[a-f0-9]{32}$/u.test(build.buildId)||build.sourceGitSha!==manifest.sourceHead)invalid()
    }
    hashes(manifest.sourceFiles)
    const files=hashes(manifest.files),module=record(manifest.module),moduleFiles=hashes(module.files)
    if(Object.keys(module).sort().join(',')!=='entry,files,moduleId'||module.entry!=='index.html'||!Object.hasOwn(moduleFiles,'index.html')||module.moduleId!=='sha256:'+hash(JSON.stringify(Object.entries(moduleFiles).sort(([a],[b])=>a.localeCompare(b)))))invalid()
    for(const name of [companion,'contracts/index.js','recipes/priority-install-recipes.json','module/index.html'])if(!Object.hasOwn(files,name))invalid()
    for(const[name,digest]of Object.entries(moduleFiles))if(files['module/'+name]!==digest)invalid()
    const entries=Object.entries(files)
    for(let offset=0;offset<entries.length;offset+=4){
      const checked=await Promise.allSettled(entries.slice(offset,offset+4).map(async([name,digest])=>{
        const path=join(base,name);await safePath(path)
        const stat=await lstat(path);if(!stat.isFile()||stat.size>1024*1024*1024||hash(await readFile(path))!==digest)invalid()
      }))
      if(checked.some(result=>result.status==='rejected'))invalid()
    }
    return { directory:base,companion,sourceHead:manifest.sourceHead as string,files:Object.freeze(files),module:{ moduleId:module.moduleId as string,entry:'index.html',files:Object.freeze(moduleFiles) } }
  }catch{throw new BusinessFailure('NATIVE_RUNTIME_INVALID')}
}
