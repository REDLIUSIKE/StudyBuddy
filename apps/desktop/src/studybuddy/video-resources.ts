import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile,readdir,stat,realpath } from 'node:fs/promises'
import { dirname,isAbsolute,join,relative,sep } from 'node:path'
import { assertVideoPath } from './video-path.ts'
import type { VideoLaunchResources,VideoResourcePin,VideoResourceFile,VideoRuntimeManifest } from './video-types.ts'
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const path=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<4096&&!/[\\:\x00-\x1f]/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
const file=(value:unknown):value is VideoResourceFile=>object(value)&&path(value.path)&&typeof value.size==='number'&&Number.isSafeInteger(value.size)&&value.size>=0&&digest(value.sha256)
async function hash(filename:string):Promise<string>{const value=createHash('sha256');for await(const chunk of createReadStream(filename))value.update(chunk);return value.digest('hex')}
async function verify(root:string,row:VideoResourceFile,workspace?:string):Promise<string>{
 let filename=join(root,row.path)
 if(workspace){
  filename=await realpath(filename);const rel=relative(workspace,filename)
  if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('VIDEO_PATH_DENIED')
 }
 await assertVideoPath(filename)
 const info=await stat(filename)
 if(!info.isFile()||info.size!==row.size||await hash(filename)!==row.sha256)throw Error('VIDEO_RESOURCE_HASH_MISMATCH')
 await assertVideoPath(filename);return filename
}
/** Verify the complete candidate and exact shared runtime references before any video process starts. */
export async function loadVideoResources(directory:string,pin:VideoResourcePin|null,roots:{primary:string;dsh:string;aigc:string;workspace?:string}):Promise<VideoLaunchResources>{
 if(!pin||!digest(pin.manifestSha256)||!digest(pin.sourceDigest)||!digest(pin.lockDigest))throw Error('VIDEO_RESOURCES_NOT_PREPARED')
 for(const root of[directory,...Object.values(roots)]){if(!isAbsolute(root)||/\.asar(?:[\\/]|$)/.test(root))throw Error('VIDEO_PATH_DENIED');await assertVideoPath(root)}
 const manifestFile=join(directory,'manifest.json');await assertVideoPath(manifestFile)
 const bytes=await readFile(manifestFile)
 if(bytes.length>4*1024*1024||createHash('sha256').update(bytes).digest('hex')!==pin.manifestSha256)throw Error('VIDEO_RESOURCE_PIN_MISMATCH')
 const value:unknown=JSON.parse(bytes.toString('utf8'))
 if(!object(value)||value.schemaVersion!==1||value.kind!=='studybuddy-video-plugin'||value.profile!=='studybuddy-video'||value.platform!==process.platform||value.arch!==process.arch||value.entry!=='compiled/domain.mjs'||value.staticEntry!=='web/index.html'||!object(value.upstream)||value.upstream.repository!=='https://github.com/openfilm/openfilm.git'||value.upstream.tag!=='v0.1.7'||value.upstream.commit!=='6ad25014526e3e4abe8b671aa8009c1ce16ab7cf'||value.sourceDigest!==pin.sourceDigest||value.lockDigest!==pin.lockDigest||!Array.isArray(value.files)||!value.files.length||!object(value.shared))throw Error('VIDEO_MANIFEST_INVALID')
 const inventory=new Map<string,VideoResourceFile>(),folded=new Set<string>(),folders=new Set<string>()
 for(const row of value.files){
  if(!file(row)||row.path==='manifest.json'||folded.has(row.path.toLowerCase())||/(?:^|\/)(?:\.git|\.env(?:\.|$)|\.next)(?:\/|$)|(?:^|\/)node_modules\/electron(?:\/|$)|\.map$|\.(?:test|spec)\.[cm]?[jt]s$/i.test(row.path))throw Error('VIDEO_MANIFEST_INVALID')
  inventory.set(row.path,row);folded.add(row.path.toLowerCase());const parts=row.path.split('/');for(let length=1;length<parts.length;length++)folders.add(parts.slice(0,length).join('/'))
 }
 if(!inventory.has(value.entry)||!inventory.has(value.staticEntry))throw Error('VIDEO_MANIFEST_INVALID')
 const walk=async(prefix:string):Promise<void>=>{for(const entry of await readdir(join(directory,prefix),{withFileTypes:true})){
  const name=prefix+entry.name
  if(entry.isSymbolicLink())throw Error('VIDEO_PATH_DENIED')
  if(entry.isDirectory()){if(!folders.has(name))throw Error('VIDEO_RESOURCE_INVENTORY_MISMATCH');await walk(name+'/')}
  else if(!entry.isFile()||name!=='manifest.json'&&!inventory.has(name))throw Error('VIDEO_RESOURCE_INVENTORY_MISMATCH')
 }}
 await walk('');for(const row of inventory.values())await verify(directory,row)
 const sharedRoots={...roots,video:directory},paths:Record<string,string>={}
 for(const key of['node','entry','plugin','browser','ffmpeg','ffprobe','git']){
  const row=value.shared[key]
  if(key==='git'&&row===undefined)continue
  if(!file(row)||!object(row)||!['primary','dsh','aigc','video'].includes(String(row.root))||typeof row.version!=='string'||!row.version)throw Error('VIDEO_MANIFEST_INVALID')
  const root=sharedRoots[row.root as 'primary'|'dsh'|'aigc'|'video']
  paths[key]=await verify(root,row,row.root==='dsh'?roots.workspace:undefined)
 }
 await walk('')
 const manifest=value as unknown as VideoRuntimeManifest
 return{directory,node:paths.node!,entry:paths.entry!,plugin:paths.plugin!,domainEntry:join(directory,manifest.entry),staticDirectory:join(directory,'web'),manifestSha256:pin.manifestSha256,
  ...(paths.git?{gitDirectory:dirname(paths.git)}:{}),
  renderRuntime:{browserExecutable:paths.browser!,ffmpegExecutable:paths.ffmpeg!,ffprobeExecutable:paths.ffprobe!,identities:Object.fromEntries(['browser','ffmpeg','ffprobe'].map(key=>{const row=manifest.shared[key as 'browser'];return[key,{sha256:row.sha256,version:row.version}]}))}}
}
