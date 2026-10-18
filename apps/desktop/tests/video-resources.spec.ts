import { describe,it,expect } from 'vitest'
import { mkdtemp,mkdir,writeFile,rm,symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { loadVideoResources } from '../src/studybuddy/video-resources.ts'
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'video-resources-')),directory=join(root,'video');await mkdir(join(directory,'compiled'),{recursive:true});await mkdir(join(directory,'web'))
 const entries={'compiled/domain.mjs':'export {}','web/index.html':'<title>Studio</title>','node.exe':'node','dsh.mjs':'launcher','plugin.mjs':'provider','browser.exe':'browser','ffmpeg.exe':'encoder','ffprobe.exe':'probe'}
 for(const[name,text]of Object.entries(entries))await writeFile(join(directory,name),text)
 const files=Object.entries(entries).map(([path,text])=>({path,size:Buffer.byteLength(text),sha256:digest(text)}))
 const names={node:'node.exe',entry:'dsh.mjs',plugin:'plugin.mjs',browser:'browser.exe',ffmpeg:'ffmpeg.exe',ffprobe:'ffprobe.exe'}
 const manifest={schemaVersion:1,kind:'studybuddy-video-plugin',profile:'studybuddy-video',platform:process.platform,arch:process.arch,upstream:{repository:'https://github.com/openfilm/openfilm.git',commit:'6ad25014526e3e4abe8b671aa8009c1ce16ab7cf',tag:'v0.1.7'},sourceDigest:'c'.repeat(64),lockDigest:'d'.repeat(64),entry:'compiled/domain.mjs',staticEntry:'web/index.html',files,shared:Object.fromEntries(Object.entries(names).map(([key,path])=>{const file=files.find(file=>file.path===path)!;return[key,{root:'video',...file,version:'test'}]}))}
 const write=async()=>{const bytes=JSON.stringify(manifest);await writeFile(join(directory,'manifest.json'),bytes);return{manifestSha256:digest(bytes),sourceDigest:manifest.sourceDigest,lockDigest:manifest.lockDigest}}
 return{root,directory,manifest,write,roots:{primary:directory,dsh:directory,aigc:directory}}
}
describe('sealed minimal video resources',()=>{
 it('accepts Playwright driver source while refusing a duplicate Electron package',async()=>{
  const f=await fixture();try{
   const path='node_modules/playwright-core/lib/server/electron/loader.js',text='export {}';await mkdir(join(f.directory,'node_modules/playwright-core/lib/server/electron'),{recursive:true});await writeFile(join(f.directory,path),text);f.manifest.files.push({path,size:Buffer.byteLength(text),sha256:digest(text)})
   await expect(loadVideoResources(f.directory,await f.write(),f.roots)).resolves.toHaveProperty('domainEntry')
   f.manifest.files.push({path:'node_modules/electron/package.json',size:2,sha256:digest('{}')});await expect(loadVideoResources(f.directory,await f.write(),f.roots)).rejects.toThrow('VIDEO_MANIFEST_INVALID')
  }finally{await rm(f.root,{recursive:true,force:true})}
 })
 it('accepts exact compiled and shared bytes, then rejects replacement before launch',async()=>{
  const f=await fixture();try{const pin=await f.write(),value=await loadVideoResources(f.directory,pin,f.roots);expect(value.domainEntry).toBe(join(f.directory,'compiled/domain.mjs'));await writeFile(join(f.directory,'ffmpeg.exe'),'changed');await expect(loadVideoResources(f.directory,pin,f.roots)).rejects.toThrow('VIDEO_RESOURCE_HASH_MISMATCH')}finally{await rm(f.root,{recursive:true,force:true})}
 })
 it('rejects unlisted files, case collisions and an external resource junction',async()=>{
  const f=await fixture();try{
   let pin=await f.write();await writeFile(join(f.directory,'secret.env'),'secret');await expect(loadVideoResources(f.directory,pin,f.roots)).rejects.toThrow('VIDEO_RESOURCE_INVENTORY_MISMATCH');await rm(join(f.directory,'secret.env'))
   f.manifest.files.push({...f.manifest.files[0]!,path:'COMPILED/domain.mjs'});pin=await f.write();await expect(loadVideoResources(f.directory,pin,f.roots)).rejects.toThrow('VIDEO_MANIFEST_INVALID');f.manifest.files.pop()
   const outside=join(f.root,'outside');await mkdir(outside);await symlink(outside,join(f.directory,'escape'),process.platform==='win32'?'junction':'dir');pin=await f.write();await expect(loadVideoResources(f.directory,pin,f.roots)).rejects.toThrow('VIDEO_PATH_DENIED')
  }finally{await rm(f.root,{recursive:true,force:true})}
 })
})
