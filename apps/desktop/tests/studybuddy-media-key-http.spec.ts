import {expect,it,vi} from 'vitest'
import {AigcMediaClient} from '../src/studybuddy/aigc-media.ts'
import type {MediaKeyRecord} from '../src/studybuddy/media-key-journal.ts'
import type {StoredMediaImage} from '../src/studybuddy/media-image-store.ts'
const scope={accountId:'owned',generation:2},id='44444444-4444-4444-8444-444444444444'
const model='doubao-seedream-5-0-flash-260915'
function journal(){const rows=new Map<string,MediaKeyRecord>();return{
 rows,
 get:async(_owner:string,id:string)=>rows.get(id)??null,
 claim:async(_owner:string,row:MediaKeyRecord)=>{const old=rows.get(row.requestId);if(old)return{row:old,created:false};rows.set(row.requestId,structuredClone(row));return{row,created:true}},
 save:async(_owner:string,row:MediaKeyRecord)=>{rows.set(row.requestId,structuredClone(row))},
}}
it('provides pure generation preflight using the same parser as paid dispatch',()=>{
 let effects=0
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>{effects++;throw Error('unexpected Key read')},fetch:async()=>{effects++;throw Error('unexpected HTTP')},journal:journal()})
 try{
  const validate=Reflect.get(client,'validateGeneration')
  expect(typeof validate).toBe('function')
  const missing={requestId:id,handle:'fixture',prompt:'A car',duration:5,resolution:'1080p',ratio:'16:9'}
  expect(()=>validate.call(client,'video',missing)).toThrow('AIGC_REQUEST_INVALID')
  expect(()=>validate.call(client,'video',{...missing,mode:'text',generateAudio:false,images:[]})).not.toThrow()
  expect(effects).toBe(0)
 }finally{client.clearTransient()}
})
it('keeps an inline image readable after handoff expiry and a client restart without querying discarded upstream content',async()=>{
 const bytes=Buffer.from([255,216,255,1]),storage=journal(),saved=new Map<string,StoredMediaImage>()
 const images={get:async(owner:string,row:MediaKeyRecord)=>saved.get(owner+row.requestId)??null,
  save:async(owner:string,row:MediaKeyRecord,content:StoredMediaImage)=>{saved.set(owner+row.requestId,structuredClone(content))}}
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:model,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  if(url.includes('/tasks/by-request/'))return Response.json({request_id:id,task_id:'task_fixture',model,status:'SUCCESS',content_available:false})
  return Response.json({model,data:[{b64_json:bytes.toString('base64')}]},{headers:{'X-StudyBuddy-Task-Id':'task_fixture'}})
 })
 const options={isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),fetch,journal:storage,images}
 const client=new AigcMediaClient(options)
 try{
  await client.request(scope,'/images/requests',{requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K'})
  client.clearTransient()
  const restarted=new AigcMediaClient(options),renewed={...scope,generation:3}
  try{
   expect(await restarted.request(renewed,'/images/requests/'+id)).toMatchObject({state:'completed',contentAvailable:true})
   expect(Buffer.from(await (await restarted.content(renewed,'/images/requests/'+id+'/content')).arrayBuffer())).toEqual(bytes)
   expect(fetch.mock.calls.filter(c=>c[0].includes('/tasks/by-request/'))).toHaveLength(0)
   expect(JSON.stringify([...storage.rows.values()])).not.toContain(bytes.toString('base64'))
  }finally{restarted.clearTransient()}
 }finally{client.clearTransient()}
})

it('does not report an inline image ready when its durable save fails or issue another paid POST',async()=>{
 const storage=journal(),images={get:async()=>null,save:async()=>{throw Error('disk full')}}
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:model,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  if(url.includes('/tasks/by-request/'))return Response.json({request_id:id,task_id:'task_fixture',model,status:'SUCCESS',content_available:false})
  return Response.json({model,data:[{b64_json:'/9j/AQ=='}]},{headers:{'X-StudyBuddy-Task-Id':'task_fixture'}})
 })
 const options={isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),fetch,journal:storage,images}
 const client=new AigcMediaClient(options),body={requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K'}
 try{
  await expect(client.request(scope,'/images/requests',body)).rejects.toThrow('AIGC_IMAGE_SAVE_FAILED')
  expect(await client.request(scope,'/images/requests',body)).toMatchObject({contentAvailable:false})
  expect(fetch.mock.calls.filter(c=>c[0].endsWith('/v1/images/generations'))).toHaveLength(1)
 }finally{client.clearTransient()}
})
it('uses only the configured Key, persists metadata only and never submits a paid request twice',async()=>{
 const bytes=Buffer.from([255,216,255,1])
 const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
  const headers=new Headers(init?.headers)
  expect(headers.get('authorization')).toBe('Bearer portable-fixture-key')
  expect(headers.has('x-studybuddy-client-audience')).toBe(false);expect(headers.has('cookie')).toBe(false)
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:model,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  expect(url).toBe('https://gateway.test/v1/images/generations')
  const body=JSON.parse(String(init?.body));expect(body.model).toBe(model);expect(body.requestId).toBeUndefined();expect(body.handle).toBeUndefined();expect(body.image).toBeUndefined()
  expect(headers.get('x-request-id')).toBe(id)
  return Response.json({model,data:[{b64_json:bytes.toString('base64')}]},{headers:{'X-StudyBuddy-Task-Id':'task_fixture'}})
 })
 const storage=journal()
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),fetch,journal:storage})
 const body={requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K'}
 expect(await client.request(scope,'/images/requests',body)).toMatchObject({state:'completed',contentAvailable:true})
 expect(await client.request(scope,'/images/requests',{...body,images:[]})).toMatchObject({state:'completed'})
 expect(Buffer.from(await (await client.content(scope,'/images/requests/'+id+'/content')).arrayBuffer())).toEqual(bytes)
 expect(JSON.stringify([...storage.rows.values()])).not.toContain(bytes.toString('base64'))
 expect(storage.rows.get(id)).not.toHaveProperty('content')
 expect(fetch.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
})

it('bounds catalogue transfer without relying on Content-Length',async()=>{
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),
  fetch:async()=>Response.json({schemaVersion:1,models:[],padding:'x'.repeat(300_000)}),journal:journal()})
 await expect(client.request(scope,'/images/catalog')).rejects.toThrow('AIGC_RESPONSE_INVALID')
})
it('keeps an uncertain POST as read-only recovery rather than generating again',async()=>{
 const fetch=vi.fn(async(url:string)=>{
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:model,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  if(url.includes('/tasks/by-request/'))return Response.json({schemaVersion:1,request_id:id,model,status:'unknown',content_available:false},{status:202})
  throw Error('network interrupted')
 })
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),fetch,journal:journal()})
 const body={requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K'}
 await expect(client.request(scope,'/images/requests',body)).rejects.toThrow()
 expect(await client.request(scope,'/images/requests',body)).toMatchObject({state:'unknown'})
 expect(fetch.mock.calls.filter(c=>c[0].endsWith('/v1/images/generations'))).toHaveLength(1)
})

it('can retry failed catalogue preparation when no paid POST has started',async()=>{
 const storage=journal();let attempts=0,posts=0
 const fetch=async(url:string,init?:RequestInit)=>{
  if(url.endsWith('/catalog')){if(attempts++===0)throw Error('catalogue temporarily offline')
   return Response.json({schemaVersion:1,models:[{modelId:model,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})}
  if(init?.method==='POST'){posts++;return Response.json({model,data:[{b64_json:Buffer.from([255,216,255,1]).toString('base64')}]})}
  throw Error('no result query is needed before dispatch')
 }
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),fetch,journal:storage})
 const body={requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K'}
 await expect(client.request(scope,'/images/requests',body)).rejects.toThrow('catalogue temporarily offline')
 expect(posts).toBe(0)
 expect(await client.request(scope,'/images/requests',body)).toMatchObject({state:'completed'})
 expect(posts).toBe(1)
})
it('rejects external endpoint paths before reading credentials',async()=>{
 const target=vi.fn(async()=>{throw Error('not needed')})
 const client=new AigcMediaClient({isCurrent:()=>true,target,fetch:async()=>Response.json({}),journal:journal()})
 await expect(client.request(scope,'https://foreign.test')).rejects.toThrow('AIGC_ENDPOINT_DENIED');expect(target).not.toHaveBeenCalled()
})

it.each([model,'doubao-seedream-5-0-pro-260628'])('forwards ten bounded references for the exact approved image model without persisting media (%s)',async(modelId)=>{
 const png='data:image/png;base64,iVBORw0KGgoB',jpeg='data:image/jpeg;base64,/9j/AQ=='
 const webp='data:image/webp;base64,UklGRgEAAABXRUJQAQ=='
 const references=[png,jpeg,webp,png,jpeg,webp,png,jpeg,webp,png]
 const storage=journal(),requests:Record<string,unknown>[]=[]
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),journal:storage,
  fetch:async(url,init)=>{
   if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
   expect(url).toBe('https://gateway.test/v1/images/generations')
   const request=JSON.parse(String(init?.body));requests.push(request)
   expect(request).toEqual({model:modelId,prompt:'fixture',size:'1K',response_format:'b64_json',watermark:true,
    image:[png,jpeg,webp,png,jpeg,webp,png,jpeg,webp,png]})
   expect(new Headers(init?.headers).get('x-request-id')).toBe(id)
   return Response.json({model:modelId,data:[{b64_json:'/9j/AQ=='}]})
  }})
 const input={requestId:id,modelId,handle:'mediaFixture',prompt:'fixture',size:'1K',images:references.map(dataUrl=>({dataUrl}))}
 try{
  expect(await client.request(scope,'/images/requests',input)).toMatchObject({state:'completed',contentAvailable:true})
  expect(await client.request(scope,'/images/requests',input)).toMatchObject({state:'completed'})
  await expect(client.request(scope,'/images/requests',{...input,images:[{dataUrl:jpeg}]})).rejects.toThrow('AIGC_REQUEST_CONFLICT')
  expect(requests).toHaveLength(1)
  const saved=JSON.stringify([...storage.rows.values()])
  for(const reference of references)expect(saved).not.toContain(reference)
  expect(saved).not.toContain('portable-fixture-key')
 }finally{client.clearTransient()}
})

it.each([
 {images:null},
 {images:'data:image/png;base64,iVBORw0KGgoB'},
 {images:Array.from({length:11},()=>({dataUrl:'data:image/png;base64,iVBORw0KGgoB'}))},
 {images:[{dataUrl:'https://outside.test/private.png'}]},
 {images:[{dataUrl:'data:image/avif;base64,Qk0BAA=='}]},
 {images:[{dataUrl:'data:image/png;base64,/9j/AQ=='}]},
 {images:[{dataUrl:'data:image/jpeg;base64,/9j/AQ='}]},
 {images:[{dataUrl:'data:image/jpeg;base64,/9j/ AQ=='}]},
 {images:[{dataUrl:'data:image/png;base64,iVBORw0KGgoB',path:'outside.png'}]},
 {images:[],image:['data:image/png;base64,iVBORw0KGgoB']},
])('rejects invalid reference fields before reading Key material (%j)',async(extra)=>{
 const target=vi.fn(async()=>{throw Error('credentials must stay unread')})
 const client=new AigcMediaClient({isCurrent:()=>true,target,fetch:async()=>Response.json({}),journal:journal()})
 await expect(client.request(scope,'/images/requests',{requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K',...extra})).rejects.toThrow('AIGC_REQUEST_INVALID')
 expect(target).not.toHaveBeenCalled()
})

it.each([
 ['image/gif',[71,73,70,56,57,97,1]],
 ['image/bmp',[66,77,1,0]],
 ['image/tiff',[73,73,42,0,1]],
 ['image/heic',[0,0,0,20,102,116,121,112,104,101,105,99,0,0,0,0,109,105,102,49]],
 ['image/heif',[0,0,0,20,102,116,121,112,109,105,102,49,0,0,0,0,109,115,102,49]],
] as const)('keeps the official reference image format available (%s)',async(mime,bytes)=>{
 let posted:Record<string,unknown>|undefined
 const client=new AigcMediaClient({isCurrent:()=>true,target:async()=>({baseUrl:'https://gateway.test',apiKey:'portable-fixture-key'}),journal:journal(),fetch:async(url,init)=>{
  if(url.endsWith('/catalog'))return Response.json({schemaVersion:1,models:[{modelId:model,providerId:'mediaFixture',type:'image',priceGuard:{version:'fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}}]})
  posted=JSON.parse(String(init?.body));return Response.json({model,data:[{b64_json:'/9j/AQ=='}]})
 }})
 const dataUrl='data:'+mime+';base64,'+Buffer.from(bytes).toString('base64')
 try{
  expect(await client.request(scope,'/images/requests',{requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K',images:[{dataUrl}]})).toMatchObject({state:'completed'})
  expect(posted?.image).toEqual([dataUrl])
 }finally{client.clearTransient()}
})

it('rejects an image over 30 million bytes and references over the 95 MiB deployment budget before reading Key material',async()=>{
 const target=vi.fn(async()=>{throw Error('credentials must stay unread')})
 const client=new AigcMediaClient({isCurrent:()=>true,target,fetch:async()=>Response.json({}),journal:journal()})
 const png=Buffer.alloc(30_000_001);png.set([137,80,78,71,13,10,26,10])
 const oversized='data:image/png;base64,'+png.toString('base64')
 const input={requestId:id,modelId:model,handle:'mediaFixture',prompt:'fixture',size:'1K'}
 await expect(client.request(scope,'/images/requests',{...input,images:[{dataUrl:oversized}]})).rejects.toThrow('AIGC_REQUEST_INVALID')
 const valid='data:image/png;base64,'+png.subarray(0,15_000_000).toString('base64')
 await expect(client.request(scope,'/images/requests',{...input,images:Array.from({length:7},()=>({dataUrl:valid}))})).rejects.toThrow('AIGC_REQUEST_INVALID')
 expect(target).not.toHaveBeenCalled()
})
