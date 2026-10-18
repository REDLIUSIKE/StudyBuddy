import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {mkdtemp,readFile,writeFile,readdir,mkdir,copyFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {DiskMediaImageStore} from '../src/studybuddy/media-image-store.ts'
import {DiskMediaKeyJournal} from '../src/studybuddy/media-key-journal.ts'
import {AigcMediaClient} from '../src/studybuddy/aigc-media.ts'
import {HarnessMediaBridge} from '../src/studybuddy/media-bridge.ts'
import {DiskMediaRequestJournal} from '../src/studybuddy/media-journal.ts'
import type {MediaKeyRecord} from '../src/studybuddy/media-key-journal.ts'
const owner='owner',other='other',ownerHash=createHash('sha256').update(owner).digest('hex')
const row:MediaKeyRecord={schemaVersion:1,requestId:'44444444-4444-4444-8444-444444444444',kind:'image',
 modelId:'doubao-seedream-5-0-flash-260915',inputHash:'a'.repeat(64),taskId:'task_fixture',state:'completed'}
const image={mime:'image/png' as const,base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FOMAAAAASUVORK5CYII='}
const roots:string[]=[]
async function directory(){const root=await mkdtemp(join(tmpdir(),'studybuddy-owned-image-'));roots.push(root);return root}
afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();for(const root of roots.splice(0)){
 if(!resolve(root).startsWith(resolve(tmpdir())+sep)||!root.includes('studybuddy-owned-image-'))throw Error('TEST_CLEANUP_BOUNDARY')
 await rm(root,{recursive:true,force:true})
}})
it('publishes complete output atomically and reads it through a new store instance',async()=>{
 const root=await directory(),store=new DiskMediaImageStore(root)
 await Promise.all([store.save(owner,row,image),new DiskMediaImageStore(root).save(owner,row,image)])
 expect(await new DiskMediaImageStore(root).get(owner,row)).toEqual(image)
 expect(await readdir(join(root,ownerHash))).toEqual([row.requestId+'.image'])
 await expect(store.save(owner,row,{mime:'image/jpeg',base64:'/9j/AQ=='})).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 expect(await store.get(owner,row)).toEqual(image)
})
it('binds output to the account, original model and original request input',async()=>{
 const root=await directory(),store=new DiskMediaImageStore(root);await store.save(owner,row,image)
 expect(await store.get(other,row)).toBeNull()
 await expect(store.get(owner,{...row,inputHash:'b'.repeat(64)})).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 await expect(store.get(owner,{...row,modelId:'different-model'})).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 const foreignDirectory=join(root,createHash('sha256').update(other).digest('hex'));await mkdir(foreignDirectory)
 await copyFile(join(root,ownerHash,row.requestId+'.image'),join(foreignDirectory,row.requestId+'.image'))
 await expect(store.get(other,row)).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
})
it('rejects modified output and malformed image bytes without returning partial content',async()=>{
 const root=await directory(),store=new DiskMediaImageStore(root);await store.save(owner,row,image)
 const path=join(root,ownerHash,row.requestId+'.image'),content=await readFile(path);content[content.length-1]=(content[content.length-1]??0)^1;await writeFile(path,content)
 await expect(store.get(owner,row)).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 await expect(store.save(owner,{...row,requestId:'55555555-5555-4555-8555-555555555555'},{mime:'image/png',base64:'/9j/AQ=='})).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
})
it('rejects a redirected account directory',async()=>{
 const root=await directory(),outside=await directory();await symlink(outside,join(root,ownerHash),process.platform==='win32'?'junction':'dir')
 const store=new DiskMediaImageStore(root)
 await expect(store.get(owner,row)).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 await expect(store.save(owner,row,image)).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 expect(await readdir(outside)).toEqual([])
})
it('accepts a configured ancestor redirection while keeping the image root and account directory direct',async()=>{
 const logical=await directory(),physical=await directory(),parent=join(logical,'redirected-parent')
 await symlink(physical,parent,process.platform==='win32'?'junction':'dir')
 const root=join(parent,'images'),store=new DiskMediaImageStore(root)
 await store.save(owner,row,image)
 expect(await new DiskMediaImageStore(root).get(owner,row)).toEqual(image)
 expect(await readdir(join(physical,'images',ownerHash))).toEqual([row.requestId+'.image'])
})
it('still refuses a redirected image root beneath the configured parent',async()=>{
 const parent=await directory(),outside=await directory(),root=join(parent,'images')
 await symlink(outside,root,process.platform==='win32'?'junction':'dir')
 const store=new DiskMediaImageStore(root)
 await expect(store.save(owner,row,image)).rejects.toThrow('AIGC_IMAGE_STORE_INVALID')
 expect(await readdir(outside)).toEqual([])
})
it('serves an inline result beyond five minutes, then after a client and journal restart with no upstream read or paid retry',async()=>{
 const root=await directory(),keyRoot=join(root,'key-requests'),imageRoot=join(root,'images'),scope={accountId:owner,generation:1}
 let posts=0
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:row.modelId,providerId:'fixture',type:'image',
   priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  if(!url.endsWith('/v1/images/generations'))throw Error('Upstream discarded output; no further read is needed')
  posts++;return Response.json({model:row.modelId,data:[{b64_json:image.base64}]},{headers:{'X-StudyBuddy-Task-Id':'task_fixture'}})
 })
 const options=()=>({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'fixture-key'}),fetch,
  journal:new DiskMediaKeyJournal(keyRoot),images:new DiskMediaImageStore(imageRoot)})
 const first=new AigcMediaClient(options()),input={requestId:row.requestId,modelId:row.modelId,handle:'fixture',prompt:'fixture',size:'1K'}
 try{
  expect(await first.request(scope,'/images/requests',input)).toMatchObject({state:'completed',contentAvailable:true})
  const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now+6*60_000)
  expect(await first.request(scope,'/images/requests/'+row.requestId)).toMatchObject({contentAvailable:true})
  first.clearTransient()
  const restarted=new AigcMediaClient(options()),renewed={...scope,generation:2}
  try{
   expect(await restarted.request(renewed,'/images/requests',input)).toMatchObject({state:'completed',contentAvailable:true})
   expect(Buffer.from(await (await restarted.content(renewed,'/images/requests/'+row.requestId+'/content')).arrayBuffer())).toEqual(Buffer.from(image.base64,'base64'))
   expect(posts).toBe(1);expect(fetch).toHaveBeenCalledTimes(2)
   expect((await readFile(join(keyRoot,ownerHash,row.requestId+'.json'),'utf8'))).not.toContain(image.base64)
  }finally{restarted.clearTransient()}
 }finally{first.clearTransient()}
})

it('reads the stored result through the real media bridge after restart and denies a different account or conversation',async()=>{
 const root=await directory(),host='22222222-2222-4222-8222-222222222222'
 let current={accountId:owner,generation:1},posts=0
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:row.modelId,providerId:'fixture',type:'image',
   priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  if(!url.endsWith('/v1/images/generations'))throw Error('Stored output must not require upstream retrieval')
  posts++;return Response.json({model:row.modelId,data:[{b64_json:image.base64}]},{headers:{'X-StudyBuddy-Task-Id':'task_fixture'}})
 })
 const api=()=>new AigcMediaClient({isCurrent:scope=>scope.accountId===current.accountId&&scope.generation===current.generation,
  target:async()=>({baseUrl:'https://gateway.test',apiKey:'fixture-key'}),fetch,
  journal:new DiskMediaKeyJournal(join(root,'keys')),images:new DiskMediaImageStore(join(root,'images'))})
 const bridge=(client:AigcMediaClient)=>new HarnessMediaBridge({scope:()=>current,api:client,journal:new DiskMediaRequestJournal(join(root,'requests'))})
 const context={scope:{...current},hostGeneration:host,sessionId:'session-fixture'}
 const create={schemaVersion:1,rpcId:row.requestId,context,operation:'create-image',
  input:{requestId:row.requestId,modelId:row.modelId,prompt:'fixture',size:'1K'}}
 const first=api()
 try{
  expect(await bridge(first).handle(create,host)).toMatchObject({state:'completed',contentAvailable:true})
  first.clearTransient();current={...current,generation:2}
  const restarted=api(),owned=bridge(restarted),content={...create,context:{...context,scope:{...current}},operation:'content',input:{requestId:row.requestId,kind:'image'}}
  try{
   expect(await owned.handle(content,host)).toMatchObject({requestId:row.requestId,base64:image.base64,mediaType:image.mime})
   await expect(owned.handle({...content,context:{...content.context,sessionId:'foreign-session'}},host)).rejects.toThrow('HARNESS_MEDIA_TASK_NOT_FOUND')
   current={accountId:other,generation:3}
   await expect(owned.handle({...content,context:{...content.context,scope:{...current}}},host)).rejects.toThrow('HARNESS_MEDIA_TASK_NOT_FOUND')
   expect(posts).toBe(1)
  }finally{restarted.clearTransient()}
 }finally{first.clearTransient()}
})
