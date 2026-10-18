import { afterEach,it,expect } from 'vitest'
import { mkdtemp,readFile,writeFile,rm,mkdir,symlink,stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { VideoMediaAdapter } from '../src/studybuddy/video-media.ts'
import { AigcMediaClient } from '../src/studybuddy/aigc-media.ts'
import type { VideoScope } from '../../desktop-host/src/video-domain-types.ts'
const roots:string[]=[]

it('rejects incomplete video input before claiming its UUID, then accepts corrected input once',async()=>{
 let effects=0
 const native=new AigcMediaClient({isCurrent:()=>true,target:async()=>{effects++;throw Error('unexpected Key read')},fetch:async()=>{effects++;throw Error('unexpected HTTP')},journal:{get:async()=>{effects++;return null},claim:async()=>{effects++;throw Error('unexpected claim')},save:async()=>{effects++}}})
 const f=await fixture(),signal=new AbortController().signal
 Object.assign(f.api,{validateGeneration:(kind:'image'|'video',value:unknown)=>Reflect.get(native,'validateGeneration').call(native,kind,value)})
 f.api.content=async()=>new Response(new Uint8Array([0,0,0,16,102,116,121,112]),{headers:{'content-type':'video/mp4'}})
 const choice=(await f.adapter.catalog(f.scope,signal)).find(row=>row.operation==='video')!
 const request={scope:f.scope,operation:'video' as const,authorityRef:choice.authorityRef,requestId:'3f6a1c2e-8b4d-4a7e-9f21-6c5d8e7a1b02',input:{native:{prompt:'A car at dawn',duration:5,resolution:'1080p',ratio:'16:9'}}}
 const failure=await f.adapter.request(request,signal).then(()=>null,error=>error)
 expect(f.creates).toHaveLength(0)
 expect(failure?.message).toBe('VIDEO_MEDIA_INPUT_INVALID')
 await expect(readFile(join(f.root,'.film/studybuddy-media',request.requestId+'.json'))).rejects.toMatchObject({code:'ENOENT'})
 const corrected={...request,input:{native:{...request.input.native,mode:'text',generateAudio:false,images:[]}}}
 const result=await f.adapter.request(corrected,signal)
 expect(result.data).toMatchObject({state:'completed'})
 expect(f.creates).toHaveLength(1)
 expect(f.creates[0]?.body).toMatchObject({requestId:request.requestId,mode:'text',generateAudio:false,images:[]})
 await f.adapter.request(corrected,signal)
 expect(f.creates).toHaveLength(1)
 await expect(f.adapter.request({...corrected,input:{native:{...corrected.input.native,prompt:'Different shot'}}},signal)).rejects.toThrow('VIDEO_REQUEST_CONFLICT')
 expect(effects).toBe(0)
 native.clearTransient()
})
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function fixture(unknown=false){
 const root=await mkdtemp(join(tmpdir(),'sb-video-media-'));roots.push(root)
 const scope:VideoScope={accountGeneration:'a1',workspaceId:'w1',projectId:'p1',sessionId:'s1'}
 let current=true
 const creates:Array<{path:string,body:Record<string,unknown>}>=[]
 const api:ConstructorParameters<typeof VideoMediaAdapter>[0]['api']={request:async(_scope:unknown,path:string,body?:unknown)=>{
  if(path==='/asr/catalog')return{schemaVersion:1,models:[]}
  if(path.endsWith('/catalog'))return{schemaVersion:1,models:[{modelId:path.startsWith('/images')?'image-exact':path.startsWith('/speech')?'tts-exact':path.startsWith('/audio')?'audio-exact':'video-exact',providerId:'native-slot',label:'Native model',type:path.startsWith('/images')?'image':path.startsWith('/speech')||path.startsWith('/audio')?'audio':'video',voices:[{title:'Native voice',voice:'voice-id'}]}]}
  if(body){creates.push({path,body:body as Record<string,unknown>});return{schemaVersion:1,requestId:(body as Record<string,unknown>).requestId,modelId:path.startsWith('/images')?'image-exact':path.startsWith('/audio')?'audio-exact':'video-exact',state:unknown?'unknown':'completed',contentAvailable:!unknown}}
  if(unknown&&path.includes('/requests/'))return{schemaVersion:1,requestId:path.split('/').at(-1),modelId:'image-exact',state:'unknown',contentAvailable:false}
  throw Error('No paid retry is allowed')
 },content:async(_scope:unknown,path:string)=>new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'content-type':path.startsWith('/audio')?'audio/wav':'image/png'}})}
 const adapter=new VideoMediaAdapter({binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:root}),isCurrent:()=>current,api,pollIntervalMs:1,timeoutMs:100})
 return{adapter,api,scope,creates,root,revoke:()=>{current=false}}
}
it('reads only the verified project speech artifact and preserves real word times',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sb-video-asr-'));roots.push(root)
 const scope:VideoScope={accountGeneration:'a1',workspaceId:'w1',projectId:'p1',sessionId:'s1'},id='66666666-6666-4666-8666-666666666666'
 const audioPath='.film/studybuddy-speech/'+id+'.wav',audio=Buffer.alloc(44+6400)
 audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(16000,24);audio.writeUInt32LE(32000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(6400,40)
 await mkdir(join(root,'.film/studybuddy-speech'),{recursive:true});await writeFile(join(root,audioPath),audio)
 let dispatched=0
 const segments=[{id:0,start:0.02,end:0.07,speaker:'S1',text:'你'},{id:1,start:0.15,end:0.19,speaker:'S1',text:'好'}]
 const adapter=new VideoMediaAdapter({binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:root}),isCurrent:()=>true,pollIntervalMs:1,timeoutMs:100,api:{request:async(_scope,path,body)=>{
  if(path.endsWith('/catalog'))return{schemaVersion:1,models:path==='/asr/catalog'?[{modelId:'asr-exact',providerId:'native-slot',formats:['wav'],responseFormats:['json','verbose_json'],timestampLevels:['word'],maxFileBytes:50000000,maxDurationSeconds:500}]:[]}
  expect(path).toBe('/asr/requests');dispatched++
  expect(body).toMatchObject({requestId:id,modelId:'asr-exact',handle:'native-slot'})
  expect(Buffer.from((body as {audio:Uint8Array}).audio)).toEqual(audio)
  return{requestId:id,modelId:'asr-exact',state:'completed',text:'你好',duration:0.2,nSpeakers:1,segments}
 },content:async()=>{throw Error('ASR has no media content request')}}})
 const choice=(await adapter.catalog(scope,new AbortController().signal)).find(row=>row.operation==='asr')!
 expect(choice).toBeDefined()
 const request={scope,operation:'asr' as const,authorityRef:choice.authorityRef,requestId:'77777777-7777-4777-8777-777777777777',input:{native:{audioPath,bytes:audio.length,sha256:'0'.repeat(64)}}}
 await expect(adapter.request(request,new AbortController().signal)).rejects.toThrow('VIDEO_SPEECH_INPUT_INVALID');expect(dispatched).toBe(0)
 const actual={...request,requestId:id,input:{native:{audioPath,bytes:audio.length,sha256:createHash('sha256').update(audio).digest('hex')}}}
 const result=await adapter.request(actual,new AbortController().signal)
 expect(result.data).toMatchObject({segments,duration:0.2});expect(result.receiptRef).toBe(id);expect(dispatched).toBe(1)
})

it('enforcesCapabilityAndUnits: uses exact native membership and preserves the image request',async()=>{
 const f=await fixture(),catalog=await f.adapter.catalog(f.scope,new AbortController().signal)
 const image=catalog.find(row=>row.operation==='image')!
 const input={prompt:'A film still',size:'1K',images:[]}
 const result=await f.adapter.request({scope:f.scope,requestId:'11111111-1111-4111-8111-111111111111',operation:'image',authorityRef:image.authorityRef,input:{native:input}},new AbortController().signal)
 expect(f.creates).toHaveLength(1)
 expect(f.creates[0]?.body).toMatchObject({...input,modelId:'image-exact',handle:'native-slot'})
 expect(result.artifacts[0]?.mime).toBe('image/png')
 expect(await readFile(join(f.root,result.artifacts[0]!.relativePath))).toEqual(Buffer.from([137,80,78,71,13,10,26,10]))
 expect(JSON.stringify(result)).not.toMatch(/estimatedTokens|reasoningTokens|apiKey/)
})
it('adds sound effects to the project using the native audio choice and keeps music absent',async()=>{
 const f=await fixture(),catalog=await f.adapter.catalog(f.scope,new AbortController().signal),sfx=catalog.find(row=>row.operation==='sfx')
 expect(sfx).toBeDefined();expect(catalog.some(row=>(row.operation as string)==='music')).toBe(false)
 const result=await f.adapter.request({scope:f.scope,requestId:'55555555-5555-4555-8555-555555555555',operation:'sfx',authorityRef:sfx!.authorityRef,input:{native:{prompt:'三秒雨声',format:'wav',sampleRate:40000},out:'assets/audio/sfx/rain'}},new AbortController().signal)
 expect(f.creates).toHaveLength(1);expect(f.creates[0]).toMatchObject({path:'/audio/requests',body:{modelId:'audio-exact',prompt:'三秒雨声',format:'wav',sampleRate:40000}})
 expect(result.artifacts[0]).toMatchObject({relativePath:'assets/audio/sfx/rain.wav',mime:'audio/wav'})
})
it('rejects missing authority and unsupported music, SFX or timed-ASR before native dispatch',async()=>{
 const f=await fixture()
 for(const operation of ['image','music','sfx','asr'] as const){
  await expect(f.adapter.request({scope:f.scope,requestId:'call-'+operation,operation,input:{requireWordTimestamps:true}},new AbortController().signal)).rejects.toThrow(/AUTHORITY|CAPABILITY|TIMESTAMP/)
 }
 expect(f.creates).toHaveLength(0)
})
it('doesNotRetryUnknownPaidOutcome: repeated observation does not create another generation',async()=>{
 const f=await fixture(true),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 const request={scope:f.scope,requestId:'22222222-2222-4222-8222-222222222222',operation:'image' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K',images:[]}}}
 const first=await f.adapter.request(request,new AbortController().signal)
 const second=await f.adapter.request(request,new AbortController().signal)
 expect(first.data).toMatchObject({state:'unknown'})
 expect(second).toEqual(first);expect(f.creates).toHaveLength(1)
})

it.each(['unknown','deadline','network-error','abort'] as const)('reconciles a %s observation with the same UUID without dispatching again',async failure=>{
 const f=await fixture(),controller=new AbortController(),id='88888888-8888-4888-8888-888888888888'
 let completed=false,queries=0,contentReads=0
 const original=f.api.request,originalContent=f.api.content
 f.api.request=async(owner,path,body)=>{
  if(path.endsWith('/catalog'))return original(owner,path,body)
  if(body){
   f.creates.push({path,body:body as Record<string,unknown>})
   if(failure==='network-error')throw Error('NETWORK_AFTER_ACCEPTANCE')
   if(failure==='abort')controller.abort()
  }else{queries++;expect(path).toBe('/images/requests/'+id)}
  return{requestId:id,modelId:'image-exact',state:completed?'completed':failure==='unknown'?'unknown':'in_progress',contentAvailable:completed}
 }
 f.api.content=async(owner,path)=>{contentReads++;return originalContent(owner,path)}
 const adapter=new VideoMediaAdapter({binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:f.root}),isCurrent:()=>true,api:f.api,pollIntervalMs:1,timeoutMs:1})
 const choice=(await adapter.catalog(f.scope,controller.signal)).find(row=>row.operation==='image')!
 const request={scope:f.scope,requestId:id,operation:'image' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K',images:[]}}}
 if(failure==='network-error'||failure==='abort')await expect(adapter.request(request,controller.signal)).rejects.toBeDefined()
 else expect((await adapter.request(request,controller.signal)).data).toMatchObject({state:failure==='unknown'?'unknown':'in_progress'})
 completed=true
 const results=await Promise.all([adapter.request(request,new AbortController().signal),adapter.request(request,new AbortController().signal)])
 expect(results[0]).toEqual(results[1]);expect(results[0]!.data).toMatchObject({state:'completed'})
 expect(await readFile(join(f.root,results[0]!.artifacts[0]!.relativePath))).toEqual(Buffer.from([137,80,78,71,13,10,26,10]))
 expect(f.creates).toHaveLength(1);expect(queries).toBeGreaterThan(0);expect(contentReads).toBe(1)
 await expect(adapter.request({...request,input:{native:{...request.input.native,prompt:'Different frame'}}},new AbortController().signal)).rejects.toThrow('VIDEO_REQUEST_CONFLICT')
 expect(f.creates).toHaveLength(1)
})
it('rejects stale scope and a different selected model before paid dispatch',async()=>{
 const f=await fixture(),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 await expect(f.adapter.request({scope:f.scope,requestId:'33333333-3333-4333-8333-333333333333',operation:'image',authorityRef:choice.authorityRef,input:{native:{modelId:'other-model',prompt:'Frame',size:'1K'}}},new AbortController().signal)).rejects.toThrow('VIDEO_AUTHORITY_MISMATCH')
 f.revoke()
 await expect(f.adapter.catalog(f.scope,new AbortController().signal)).rejects.toThrow('VIDEO_SCOPE_REVOKED')
 expect(f.creates).toHaveLength(0)
})
it('rejects an unsafe destination before generation or external directory creation',async()=>{
 const f=await fixture(),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 const outside=await mkdtemp(join(tmpdir(),'sb-video-outside-'));roots.push(outside)
 await mkdir(join(f.root,'assets'))
 await symlink(outside,join(f.root,'assets','linked'),process.platform==='win32'?'junction':'dir')
 await expect(f.adapter.request({scope:f.scope,requestId:'44444444-4444-4444-8444-444444444444',operation:'image',authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'},out:'assets/linked/new-folder/frame'}},new AbortController().signal)).rejects.toThrow('VIDEO_ASSET_PATH_DENIED')
 expect(f.creates).toHaveLength(0)
 expect(await stat(join(outside,'new-folder')).then(()=>true,()=>false)).toBe(false)
})
it('preserves an existing manual asset before dispatching any paid generation',async()=>{
 const f=await fixture(),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 await mkdir(join(f.root,'assets'));await writeFile(join(f.root,'assets/manual.png'),'manual asset')
 await expect(f.adapter.request({scope:f.scope,requestId:'77777777-7777-4777-8777-777777777771',operation:'image',authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'},out:'assets/manual'}},new AbortController().signal)).rejects.toThrow('VIDEO_ASSET_EXISTS')
 expect(f.creates).toHaveLength(0);expect(await readFile(join(f.root,'assets/manual.png'),'utf8')).toBe('manual asset')
})
it('restores a completed project artifact after adapter restart without another native request',async()=>{
 const f=await fixture(),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!,request={scope:f.scope,requestId:'77777777-7777-4777-8777-777777777772',operation:'image' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'}}}
 const first=await f.adapter.request(request,new AbortController().signal)
 const resumed=new VideoMediaAdapter({binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:f.root}),isCurrent:()=>true,api:f.api,pollIntervalMs:1,timeoutMs:100}),fresh=(await resumed.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 expect(await resumed.request({...request,authorityRef:fresh.authorityRef},new AbortController().signal)).toEqual(first);expect(f.creates).toHaveLength(1)
})
it('preserves a racing manual file and reuses the staged result at another destination with the same request UUID',async()=>{
 const f=await fixture(),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!,original=f.api.content
 f.api.content=async(owner,path)=>{await mkdir(join(f.root,'assets'),{recursive:true});await writeFile(join(f.root,'assets/raced.png'),'new manual asset');return original(owner,path)}
 const request={scope:f.scope,requestId:'77777777-7777-4777-8777-777777777773',operation:'image' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'},out:'assets/raced'}}
 await expect(f.adapter.request(request,new AbortController().signal)).rejects.toThrow('VIDEO_ASSET_EXISTS');expect(await readFile(join(f.root,'assets/raced.png'),'utf8')).toBe('new manual asset')
 const resumed=new VideoMediaAdapter({binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:f.root}),isCurrent:()=>true,api:f.api,pollIntervalMs:1,timeoutMs:100}),fresh=(await resumed.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 const recovered=await resumed.request({...request,authorityRef:fresh.authorityRef,input:{...request.input,out:'assets/recovered'}},new AbortController().signal)
 expect(recovered.artifacts[0]?.relativePath).toBe('assets/recovered.png');expect(f.creates).toHaveLength(1)
})
it('keeps a later manual change and never regenerates a completed local artifact to repair it',async()=>{
 const f=await fixture(),choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!,request={scope:f.scope,requestId:'77777777-7777-4777-8777-777777777774',operation:'image' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'}}}
 const result=await f.adapter.request(request,new AbortController().signal),file=join(f.root,result.artifacts[0]!.relativePath);await writeFile(file,'new manual bytes')
 const resumed=new VideoMediaAdapter({binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:f.root}),isCurrent:()=>true,api:f.api,pollIntervalMs:1,timeoutMs:100}),fresh=(await resumed.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 await expect(resumed.request({...request,authorityRef:fresh.authorityRef},new AbortController().signal)).rejects.toThrow('VIDEO_ASSET_CONFLICT')
 expect(f.creates).toHaveLength(1);expect(await readFile(file,'utf8')).toBe('new manual bytes')
})
it('cancels the native response body when a destination becomes unsafe after generation',async()=>{
 const f=await fixture(),outside=await mkdtemp(join(tmpdir(),'video-body-outside-'));roots.push(outside);let canceled=false
 const choice=(await f.adapter.catalog(f.scope,new AbortController().signal)).find(row=>row.operation==='image')!
 f.api.content=async()=>{await symlink(outside,join(f.root,'assets'),process.platform==='win32'?'junction':'dir');return new Response(new ReadableStream({cancel(){canceled=true}}),{headers:{'content-type':'image/png'}})}
 await expect(f.adapter.request({scope:f.scope,requestId:'77777777-7777-4777-8777-777777777775',operation:'image',authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'}}},new AbortController().signal)).rejects.toThrow(/PATH_DENIED/)
 expect(canceled).toBe(true)
})
it('aborts a pending response read when its project is closed',async()=>{
 const f=await fixture(),controller=new AbortController();let canceled=false
 const choice=(await f.adapter.catalog(f.scope,controller.signal)).find(row=>row.operation==='image')!
 let ready:()=>void=()=>{};const started=new Promise<void>(resolve=>{ready=resolve})
 f.api.content=async()=>new Response(new ReadableStream({pull(){ready()},cancel(){canceled=true}}),{headers:{'content-type':'image/png'}})
 const work=f.adapter.request({scope:f.scope,requestId:'77777777-7777-4777-8777-777777777776',operation:'image',authorityRef:choice.authorityRef,input:{native:{prompt:'Frame',size:'1K'}}},controller.signal),rejected=expect(work).rejects.toBeDefined()
 await started;controller.abort();await rejected;expect(canceled).toBe(true)
})
