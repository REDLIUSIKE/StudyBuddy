/** Main-only media transport. The configured Key calls the private online service. */
import {createHash} from 'node:crypto'
import {HARNESS_IMAGE_MODELS,HARNESS_VIDEO_MODEL} from '@studybuddy/contracts'
import type {OwnedScope} from '@studybuddy/contracts'
import type {StudyBuddyFetch} from './services.ts'
import {ModelKeyClient} from './model-key-client.ts'
import type {ModelKeyPriceGuard} from './model-key-client.ts'
import {mediaRequestUUID,mediaTaskState} from './media-key-journal.ts'
import {AigcSpeechClient} from './aigc-speech.ts'
import {AigcAudioClient} from './aigc-audio.ts'
import type {ResearchSpeechRequest} from './research-speech.ts'
import type {HarnessResearchContextV1} from '@studybuddy/contracts'
import type {MediaKeyJournal,MediaKeyRecord} from './media-key-journal.ts'
import type {MediaImageStore} from './media-image-store.ts'
import type {MediaAudioStore} from './media-audio-store.ts'
const object=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AIGC_RESPONSE_INVALID')
 return value as Record<string,unknown>
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
async function readJson(response:Response,limit=256*1024):Promise<unknown>{
 const length=response.headers.get('content-length')
 if(length&&(!/^\d+$/.test(length)||Number(length)>limit)||!response.body){await response.body?.cancel();throw Error('AIGC_RESPONSE_INVALID')}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength
  if(size>limit){await reader.cancel();throw Error('AIGC_RESPONSE_INVALID')}chunks.push(next.value)}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown
 }catch{throw Error('AIGC_RESPONSE_INVALID')}finally{reader.releaseLock()}
}
interface ImageTransfer {mime:'image/png'|'image/jpeg'|'image/webp';base64:string}
const referenceImage=(value:unknown):{dataUrl:string;bytes:number}=>{
 if(typeof value!=='string'||value.length>40_000_032)throw Error('AIGC_REQUEST_INVALID')
 const match=/^data:(image\/(?:png|jpeg|webp|bmp|tiff|gif|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
 if(!match)throw Error('AIGC_REQUEST_INVALID')
 const b=Buffer.from(match[2]!,'base64'),mime=match[1]
 if(!b.length||b.length>30_000_000||b.toString('base64')!==match[2])throw Error('AIGC_REQUEST_INVALID')
 const brands:string[]=[]
 if(b.length>=16&&b.toString('ascii',4,8)==='ftyp'){
  const size=b.readUInt32BE(0)
  if(size>=16&&size<=b.length){brands.push(b.toString('ascii',8,12));for(let offset=16;offset+4<=Math.min(size,256);offset+=4)brands.push(b.toString('ascii',offset,offset+4))}
 }
 const heic=brands.some(brand=>['heic','heix','hevc','hevx','heim','heis','hevm','hevs'].includes(brand))
 const valid=mime==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
  mime==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:
  mime==='image/webp'?b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP':
  mime==='image/bmp'?b.toString('ascii',0,2)==='BM':
  mime==='image/tiff'?b.subarray(0,4).equals(Buffer.from([73,73,42,0]))||b.subarray(0,4).equals(Buffer.from([77,77,0,42])):
  mime==='image/gif'?['GIF87a','GIF89a'].includes(b.toString('ascii',0,6)):
  mime==='image/heic'?heic:heic||brands.some(brand=>['mif1','msf1'].includes(brand))
 if(!valid)throw Error('AIGC_REQUEST_INVALID')
 return{dataUrl:value,bytes:b.length}
}
const imageContent=(base64:unknown):ImageTransfer=>{
 if(typeof base64!=='string'||base64.length>Math.ceil(16*1024*1024/3)*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('AIGC_RESPONSE_INVALID')
 const b=Buffer.from(base64,'base64')
 if(!b.length||b.toString('base64')!==base64||b.length>16*1024*1024)throw Error('AIGC_RESPONSE_INVALID')
 const mime=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':
  b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null
 if(!mime)throw Error('AIGC_RESPONSE_INVALID');return{mime,base64}
}
const state=mediaTaskState

export class AigcMediaClient {
 private readonly speech:AigcSpeechClient
 private readonly audio:AigcAudioClient
 private readonly transfers=new Map<string,{content:ImageTransfer;expires:number;timer:ReturnType<typeof setTimeout>}>()
 private transferKey(scope:OwnedScope,id:string){return JSON.stringify([scope.accountId,scope.generation,id])}
 private transfer(scope:OwnedScope,id:string):ImageTransfer|undefined{
  const key=this.transferKey(scope,id),entry=this.transfers.get(key)
  if(entry&&entry.expires>Date.now())return entry.content
  if(entry)clearTimeout(entry.timer);this.transfers.delete(key);return undefined
 }
 private handoff(scope:OwnedScope,id:string,content:ImageTransfer){
  const key=this.transferKey(scope,id),previous=this.transfers.get(key);if(previous)clearTimeout(previous.timer)
  while(this.transfers.size>=16){const oldest=this.transfers.keys().next().value;if(oldest===undefined)break;const row=this.transfers.get(oldest);if(row)clearTimeout(row.timer);this.transfers.delete(oldest)}
  const timer=setTimeout(()=>this.transfers.delete(key),5*60_000);timer.unref()
  this.transfers.set(key,{content,expires:Date.now()+5*60_000,timer})
 }
 clearTransient():void{for(const row of this.transfers.values())clearTimeout(row.timer);this.transfers.clear();this.speech.clearTransient();this.audio.clearTransient()}
 private readonly queues=new Map<string,Promise<unknown>>()
 private serial<T>(scope:OwnedScope,id:string,run:()=>Promise<T>):Promise<T>{
  const key=JSON.stringify([scope.accountId,id]),previous=this.queues.get(key)??Promise.resolve()
  const next=previous.catch(()=>{}).then(run);this.queues.set(key,next)
  void next.then(()=>{if(this.queues.get(key)===next)this.queues.delete(key)},()=>{if(this.queues.get(key)===next)this.queues.delete(key)})
  return next
 }
 constructor(private readonly options:{
  isCurrent(scope:OwnedScope):boolean
  target(scope:OwnedScope):Promise<{baseUrl:string;apiKey:string}>
  fetch:StudyBuddyFetch
  journal:MediaKeyJournal
  images?:MediaImageStore
  audioResults?:MediaAudioStore
  readTtsSubtitles?:(url:string,signal:AbortSignal)=>Promise<unknown>
 }){this.speech=new AigcSpeechClient(options);this.audio=new AigcAudioClient(options)}
 transcribe(scope:OwnedScope,input:ResearchSpeechRequest,signal:AbortSignal,context:HarnessResearchContextV1){return this.speech.transcribe(scope,input,signal,context)}
 private assert(scope:OwnedScope,signal?:AbortSignal){if(!this.options.isCurrent(scope))throw Error('AIGC_SCOPE_REVOKED');signal?.throwIfAborted()}
 private async target(scope:OwnedScope){
  this.assert(scope);const target=await this.options.target(scope);this.assert(scope)
  const client=new ModelKeyClient({baseUrl:target.baseUrl,readKey:async()=>target.apiKey,fetch:this.options.fetch})
  return{client,target}
 }
 private async legacy(scope:OwnedScope,path:string,signal?:AbortSignal):Promise<Response>{
  const{target}=await this.target(scope)
  // Fixed original product API, read-only. A checks this Key against the original Task.
  const response=await this.options.fetch('https://guijitongzhuo.com/api/v2/aigc-media/key'+path,{
   credentials:'omit',redirect:'error',method:'GET',headers:{Authorization:'Bearer '+target.apiKey,Accept:'application/json'},
   signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(90_000)])})
  this.assert(scope,signal)
  if(!response.ok){await response.body?.cancel();throw Error(response.status===404?'AIGC_TASK_NOT_FOUND':'AIGC_MEDIA_UNAVAILABLE')}
  return response
 }
 private project(row:MediaKeyRecord,scope:OwnedScope){
  return{schemaVersion:1,requestId:row.requestId,modelId:row.modelId,kind:row.kind,state:row.state,
   contentAvailable:row.state==='completed'&&(row.kind==='video'?row.taskId!==null:this.transfer(scope,row.requestId)!==undefined)}
 }
 private async storedImage(scope:OwnedScope,row:MediaKeyRecord,signal?:AbortSignal):Promise<ImageTransfer|undefined>{
  if(row.kind!=='image')return undefined
  const cached=this.transfer(scope,row.requestId);if(cached)return cached
  const stored=await this.options.images?.get(scope.accountId,row);this.assert(scope,signal)
  if(!stored)return undefined
  const content=imageContent(stored.base64)
  if(content.mime!==stored.mime)throw Error('AIGC_IMAGE_STORE_INVALID')
  this.handoff(scope,row.requestId,content);return content
 }
 private async status(scope:OwnedScope,row:MediaKeyRecord,signal?:AbortSignal){
  const stored=await this.storedImage(scope,row,signal)
  if(stored&&row.state!=='completed'){
   row.state='completed';await this.options.journal.save(scope.accountId,row);this.assert(scope,signal)
  }
  if(stored||row.state==='failed')return this.project(row,scope)
  const{client}=await this.target(scope)
  const response=await client.mediaRequestStatus(row.requestId,AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(90_000)]))
  this.assert(scope,signal)
  if(!response.ok)throw Error('AIGC_TASK_NOT_FOUND')
  const value=object(await readJson(response));this.assert(scope,signal)
  if(value.model!==row.modelId||value.request_id!==row.requestId)throw Error('AIGC_RESPONSE_MODEL_INVALID')
  const reported=state(value.status)
  if(row.state!=='completed'||reported!=='unknown')row.state=reported
  if(typeof value.task_id==='string'&&/^task_[A-Za-z0-9_-]{1,120}$/.test(value.task_id))row.taskId=value.task_id
  await this.options.journal.save(scope.accountId,row);this.assert(scope,signal)
  const projected=this.project(row,scope)
  return{...projected,contentAvailable:row.state==='completed'&&value.content_available===true&&row.taskId!==null}
 }
 /** Pure preflight for callers that must validate before claiming a durable request UUID. */
 validateGeneration(kind:'image'|'video',value:unknown):void{this.input(kind,value)}
 private input(kind:'image'|'video',value:unknown){
  const r=object(value),modelId=kind==='image'?String(r.modelId):HARNESS_VIDEO_MODEL
  const keys=kind==='image'?['requestId','modelId','handle','prompt','size','images']:['requestId','handle','prompt','duration','resolution','ratio','generateAudio','mode','images']
  if(Object.keys(r).length!==keys.length-(kind==='image'&&!Object.hasOwn(r,'images')?1:0)||Object.keys(r).some(k=>!keys.includes(k))||!mediaRequestUUID(r.requestId)||
   typeof r.handle!=='string'||typeof r.prompt!=='string'||!r.prompt.trim()||r.prompt.length>10000||r.prompt.includes('\u0000'))throw Error('AIGC_REQUEST_INVALID')
  let body:Record<string,unknown>
  if(kind==='image'){
   if(!HARNESS_IMAGE_MODELS.includes(modelId as never)||!['1K','1.5K','2K'].includes(String(r.size)))throw Error('AIGC_REQUEST_INVALID')
   if(Object.hasOwn(r,'images')&&(!Array.isArray(r.images)||r.images.length>10))throw Error('AIGC_REQUEST_INVALID')
   const images:string[]=[];let bytes=0
   for(const value of Array.isArray(r.images)?r.images:[]){
    const image=object(value)
    if(Object.keys(image).length!==1||!Object.hasOwn(image,'dataUrl'))throw Error('AIGC_REQUEST_INVALID')
    const reference=referenceImage(image.dataUrl);bytes+=reference.bytes
    if(bytes>95*1024*1024)throw Error('AIGC_REQUEST_INVALID')
    images.push(reference.dataUrl)
   }
   body={model:modelId,prompt:r.prompt,size:r.size,response_format:'b64_json',watermark:true,...images.length?{image:images}:{}}
  }else{
   if(!Number.isSafeInteger(r.duration)||Number(r.duration)<4||Number(r.duration)>30||!['480p','720p','1080p'].includes(String(r.resolution))||
    !['16:9','4:3','1:1','3:4','9:16','21:9'].includes(String(r.ratio))||typeof r.generateAudio!=='boolean'||
    !Array.isArray(r.images)||r.images.length>8||!(r.mode==='text'||Array.isArray(r.mode)&&JSON.stringify(r.mode)==='["imageReference:8"]')||r.mode==='text'&&r.images.length)throw Error('AIGC_REQUEST_INVALID')
   const images=r.images.map(v=>{const i=object(v)
    if(Object.keys(i).join(',')!=='dataUrl'||typeof i.dataUrl!=='string'||i.dataUrl.length>1024*1024||
     !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(i.dataUrl))throw Error('AIGC_REQUEST_INVALID')
    return{type:'image_url',image_url:{url:i.dataUrl},role:'reference_image'}
   })
   if(images.reduce((n,i)=>n+i.image_url.url.length,0)>5*1024*1024)throw Error('AIGC_REQUEST_INVALID')
   body={model:modelId,prompt:r.prompt,seconds:r.duration,resolution:r.resolution,ratio:r.ratio,generate_audio:r.generateAudio,
    watermark:true,service_tier:'default',...images.length?{metadata:{content:images}}:{}}
  }
  return{requestId:r.requestId,handle:r.handle,modelId,body}
 }
 async request(scope:OwnedScope,path:string,value?:unknown,signal?:AbortSignal):Promise<unknown>{
  const id=value&&typeof value==='object'&&'requestId' in value?String(value.requestId):path.split('/').at(-1)??''
  if(mediaRequestUUID(id))return this.serial(scope,id,()=>this.execute(scope,path,value,signal))
  return this.execute(scope,path,value,signal)
 }
 private async execute(scope:OwnedScope,path:string,value?:unknown,signal?:AbortSignal):Promise<unknown>{
  if(path.startsWith('/speech/')||path.startsWith('/asr/'))return this.speech.request(scope,path,value,signal)
  if(path.startsWith('/audio/'))return this.audio.request(scope,path,value,signal)
  const catalog=/^\/(?:images\/)?catalog$/.test(path)&&value===undefined
  const create=/^\/(?:images\/)?requests$/.test(path)&&value!==undefined
  const match=/^(?:\/images)?\/requests\/([a-f0-9-]{36})$/.exec(path)
  if(!catalog&&!create&&!(match&&mediaRequestUUID(match[1])&&value===undefined))throw Error('AIGC_ENDPOINT_DENIED')
  this.assert(scope,signal)
  if(catalog)return readJson(await this.legacy(scope,path,signal))
  if(match){
   const row=await this.options.journal.get(scope.accountId,match[1]!);this.assert(scope,signal)
   return row?this.status(scope,row,signal):readJson(await this.legacy(scope,'/requests/'+match[1],signal))
  }
  const kind=path.startsWith('/images/')?'image':'video',input=this.input(kind,value)
  const proposed:MediaKeyRecord={schemaVersion:1,requestId:input.requestId,kind,modelId:input.modelId,inputHash:hash(input.body),
   taskId:null,state:'unknown'}
  const existing=await this.options.journal.get(scope.accountId,input.requestId);this.assert(scope,signal)
  if(existing){
   if(existing.inputHash!==proposed.inputHash||existing.modelId!==proposed.modelId||existing.kind!==kind)throw Error('AIGC_REQUEST_CONFLICT')
   return this.status(scope,existing,signal)
  }
  const doc=object(await this.request(scope,(kind==='image'?'/images':'')+'/catalog',undefined,signal))
  if(doc.schemaVersion!==1||!Array.isArray(doc.models))throw Error('AIGC_RESPONSE_INVALID')
  const model=doc.models.map(object).find(row=>row.modelId===input.modelId&&row.type===kind&&row.providerId===input.handle)
  if(!model)throw Error('AIGC_MODEL_UNAVAILABLE')
  const guard=object(model.priceGuard) as unknown as ModelKeyPriceGuard
  const{client}=await this.target(scope)
  // Preparation failure is safe to retry. The durable claim begins only at
  // the paid dispatch boundary; uncertainty after this point is read-only.
  const claimed=await this.options.journal.claim(scope.accountId,proposed);this.assert(scope,signal)
  if(claimed.row.inputHash!==proposed.inputHash||claimed.row.modelId!==proposed.modelId||claimed.row.kind!==kind)throw Error('AIGC_REQUEST_CONFLICT')
  if(!claimed.created)return this.status(scope,claimed.row,signal)
  const response=await client.invoke({schemaVersion:1,requestId:input.requestId,exactModelId:input.modelId,
   protocol:kind==='image'?'openai_image.generate':'openai_video.create',purpose:kind},input.body,
   AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(kind==='image'?190_000:90_000)]),guard)
  if(!response.ok){await response.body?.cancel();throw Error('AIGC_MEDIA_UNAVAILABLE')}
  const result=object(await readJson(response,kind==='image'?24*1024*1024:256*1024))
  // The gateway delivers synchronous image bytes once. Persist owned output
  // before exposing completion; request and reasoning journals remain keyless.
  if(result.model!==input.modelId)throw Error('AIGC_RESPONSE_MODEL_INVALID')
  const taskId=response.headers.get('X-StudyBuddy-Task-Id')??result.id
  if(typeof taskId==='string'&&/^task_[A-Za-z0-9_-]{1,120}$/.test(taskId))proposed.taskId=taskId
  let transfer:ImageTransfer|undefined
  if(kind==='image'){
   if(!Array.isArray(result.data)||result.data.length!==1)throw Error('AIGC_RESPONSE_INVALID')
   transfer=imageContent(object(result.data[0]).b64_json);proposed.state='completed'
  }else{
   if(proposed.taskId===null)throw Error('AIGC_RESPONSE_INVALID');proposed.state=state(result.status)
  }
  this.assert(scope,signal)
  if(transfer&&this.options.images){
   try{await this.options.images.save(scope.accountId,proposed,transfer)}catch{throw Error('AIGC_IMAGE_SAVE_FAILED')}
   this.assert(scope,signal)
  }
  await this.options.journal.save(scope.accountId,proposed);this.assert(scope,signal)
  if(transfer)this.handoff(scope,proposed.requestId,transfer)
  return this.project(proposed,scope)
 }
 async content(scope:OwnedScope,path:string,signal?:AbortSignal):Promise<Response>{
  const id=path.split('/').at(-2)??''
  if(mediaRequestUUID(id))return this.serial(scope,id,()=>this.contentCurrent(scope,path,signal))
  return this.contentCurrent(scope,path,signal)
 }
 private async contentCurrent(scope:OwnedScope,path:string,signal?:AbortSignal):Promise<Response>{
  if(path.startsWith('/speech/'))return this.speech.content(scope,path,signal)
  if(path.startsWith('/audio/'))return this.audio.content(scope,path,signal)
  const match=/^(?:\/images)?\/requests\/([a-f0-9-]{36})\/content$/.exec(path)
  if(!match||!mediaRequestUUID(match[1]))throw Error('AIGC_ENDPOINT_DENIED')
  this.assert(scope,signal)
  const row=await this.options.journal.get(scope.accountId,match[1]!);this.assert(scope,signal)
  const stored=row?await this.storedImage(scope,row,signal):undefined
  let response:Response
  if(!row&&path.startsWith('/images/'))response=await this.legacy(scope,'/requests/'+match[1]+'/content',signal)
  else if(!row){
   const legacy=object(await readJson(await this.legacy(scope,'/requests/'+match[1],signal)))
   if(legacy.requestId!==match[1]||legacy.kind!=='video'||legacy.contentAvailable!==true||typeof legacy.taskId!=='string')throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')
   const{client}=await this.target(scope)
   response=await client.task(legacy.taskId,'content',{signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(90_000)])})
  }
  else if(stored){
   response=new Response(Buffer.from(stored.base64,'base64'),{headers:{'Content-Type':stored.mime}})
  }else{
   const current=object(await this.status(scope,row,signal))
   if(current.contentAvailable!==true||row.taskId===null)throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')
   const{client}=await this.target(scope)
   response=await client.task(row.taskId,'content',{signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(90_000)])})
  }
  const mime=response.headers.get('content-type')?.split(';')[0]
  const allowed=path.startsWith('/images/')?['image/png','image/jpeg','image/webp']:['video/mp4']
  if(!this.options.isCurrent(scope)||!response.ok||!mime||!allowed.includes(mime)){await response.body?.cancel();throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')}
  if(row?.kind==='image'&&!stored&&this.options.images){
   if(!response.body)throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength
    if(size>16*1024*1024){await reader.cancel();throw Error('AIGC_RESPONSE_INVALID')}chunks.push(next.value)}}finally{reader.releaseLock()}
   const content=imageContent(Buffer.concat(chunks).toString('base64'))
   if(content.mime!==mime)throw Error('AIGC_RESPONSE_INVALID')
   this.assert(scope,signal)
   try{await this.options.images.save(scope.accountId,row,content)}catch{throw Error('AIGC_IMAGE_SAVE_FAILED')}
   this.assert(scope,signal);this.handoff(scope,row.requestId,content)
   return new Response(Buffer.from(content.base64,'base64'),{headers:{'Content-Type':content.mime}})
  }
  return response
 }
}
