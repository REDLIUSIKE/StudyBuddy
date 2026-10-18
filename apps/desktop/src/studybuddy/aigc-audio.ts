/** Main-only sound effects. Credentials, funding and terminal metering stay at the native gateway. */
import {createHash} from 'node:crypto'
import {HARNESS_AUDIO_MODELS} from '@studybuddy/contracts'
import type {OwnedScope} from '@studybuddy/contracts'
import {ModelKeyClient} from './model-key-client.ts'
import type {ModelKeyPriceGuard} from './model-key-client.ts'
import type {StudyBuddyFetch} from './services.ts'
import {mediaRequestUUID,mediaTaskState} from './media-key-journal.ts'
import type {MediaKeyJournal,MediaKeyRecord} from './media-key-journal.ts'
import type {MediaAudioStore,StoredMediaAudio} from './media-audio-store.ts'

const invalid=():never=>{throw Error('AIGC_RESPONSE_INVALID')}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:invalid()
const strings=(v:unknown):string[]=>Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&x.length>0)&&new Set(v).size===v.length?v:invalid()
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const slot=(id:string)=>'mediaKey'+createHash('sha256').update(id).digest('hex')
const mimes={wav:'audio/wav',mp3:'audio/mpeg',pcm:'audio/pcm',ogg_opus:'audio/ogg'} as const
const binaryLimit=64*1024*1024
interface AudioModel {
 modelId:string;label:string;priceGuard:ModelKeyPriceGuard;formats:string[];sampleRates:Record<string,number[]>
 defaultFormat:string;defaultSampleRates:Record<string,number>;maxInputCodePoints:number;maxOriginalDurationSeconds:number
}
interface Options {
 isCurrent(scope:OwnedScope):boolean
 target(scope:OwnedScope):Promise<{baseUrl:string;apiKey:string}>
 journal:MediaKeyJournal;fetch:StudyBuddyFetch;audioResults?:MediaAudioStore
}
async function json(response:Response,limit:number,check:()=>void):Promise<Record<string,unknown>>{
 const length=response.headers.get('content-length')
 try{check()}catch(error){await response.body?.cancel();throw error}
 if(!response.ok||!response.body||length&&(!/^\d+$/.test(length)||Number(length)>limit)){
  await response.body?.cancel();throw Error('AIGC_MEDIA_UNAVAILABLE')
 }
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{
  for(;;){check();const part=await reader.read();check();if(part.done)break;size+=part.value.length
   if(size>limit)invalid();chunks.push(part.value)
  }
  return object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))))
 }catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
}

export class AigcAudioClient {
 private readonly contentRows=new Map<string,StoredMediaAudio&{timer:ReturnType<typeof setTimeout>}>()
 constructor(private readonly options:Options){}
 private key(scope:OwnedScope,id:string){return JSON.stringify([scope.accountId,scope.generation,id])}
 private assert(scope:OwnedScope,signal?:AbortSignal){if(!this.options.isCurrent(scope))throw Error('AIGC_SCOPE_REVOKED');signal?.throwIfAborted()}
 clearTransient(){for(const row of this.contentRows.values())clearTimeout(row.timer);this.contentRows.clear()}
 private async client(scope:OwnedScope){
  this.assert(scope);const target=await this.options.target(scope);this.assert(scope)
  return new ModelKeyClient({baseUrl:target.baseUrl,readKey:async()=>target.apiKey,fetch:this.options.fetch})
 }
 private async catalog(scope:OwnedScope,signal?:AbortSignal){
  const client=await this.client(scope),doc=await json(await client.catalog(AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(30_000)])),1024*1024,()=>this.assert(scope,signal))
  if(doc.schemaVersion!==1||typeof doc.catalogRevision!=='string'||!doc.catalogRevision||typeof doc.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(doc.sourceSha256)||!Array.isArray(doc.data)||doc.data.length>1024)invalid()
  const models:AudioModel[]=[]
  for(const value of doc.data as unknown[]){
   const row=object(value)
   if(row.kind!=='audio'||!Array.isArray(row.clientMembership)||!row.clientMembership.includes('harness-video-audio')||!HARNESS_AUDIO_MODELS.includes(row.modelId as never))continue
   const audio=object(row.audio),price=object(object(row.studybuddy).taskPrice)
   if(row.providerId!=='volcengine'||typeof row.modelId!=='string'||typeof row.displayName!=='string'||!row.displayName||
    !Array.isArray(row.protocols)||!row.protocols.includes('volcengine_audio.generate')||!Array.isArray(row.capabilityFlags)||!row.capabilityFlags.includes('sound_effects')||
    price.currency!=='CNY'||price.unit!=='second'||typeof price.version!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(price.version)||
    typeof price.expressionSha256!=='string'||!/^[a-f0-9]{64}$/.test(price.expressionSha256)||typeof price.pluginSha256!=='string'||!/^[a-f0-9]{64}$/.test(price.pluginSha256)||
    audio.billingDurationField!=='original_duration'||!Number.isSafeInteger(audio.maxInputCodePoints)||Number(audio.maxInputCodePoints)<1||
    !Number.isSafeInteger(audio.maxOriginalDurationSeconds)||Number(audio.maxOriginalDurationSeconds)<1)invalid()
   const formats=strings(audio.formats),rates=object(audio.sampleRates),defaults=object(audio.defaultSampleRates)
   for(const format of formats)if(!Object.hasOwn(mimes,format)||!Array.isArray(rates[format])||!(rates[format] as unknown[]).length||
    !(rates[format] as unknown[]).every(x=>Number.isSafeInteger(x)&&Number(x)>0)||!(rates[format] as unknown[]).includes(defaults[format]))invalid()
   if(typeof audio.defaultFormat!=='string'||!formats.includes(audio.defaultFormat))invalid()
   models.push({modelId:row.modelId as string,label:row.displayName as string,priceGuard:{version:price.version as string,expressionSha256:price.expressionSha256 as string,pluginSha256:price.pluginSha256 as string},
    formats,sampleRates:rates as Record<string,number[]>,defaultFormat:audio.defaultFormat as string,defaultSampleRates:defaults as Record<string,number>,maxInputCodePoints:audio.maxInputCodePoints as number,maxOriginalDurationSeconds:audio.maxOriginalDurationSeconds as number})
  }
  if(new Set(models.map(m=>m.modelId)).size!==models.length)invalid()
  return{client,doc,models}
 }
 private remember(scope:OwnedScope,id:string,content:StoredMediaAudio):void{
  const key=this.key(scope,id),old=this.contentRows.get(key);if(old)clearTimeout(old.timer)
  while(this.contentRows.size>=8){const first=this.contentRows.keys().next().value;if(first===undefined)break;clearTimeout(this.contentRows.get(first)!.timer);this.contentRows.delete(first)}
  const timer=setTimeout(()=>this.contentRows.delete(key),300_000);timer.unref();this.contentRows.set(key,{...content,timer})
 }
 private async output(scope:OwnedScope,row:MediaKeyRecord,signal?:AbortSignal){
  this.assert(scope,signal);const current=this.contentRows.get(this.key(scope,row.requestId));if(current)return current
  if(row.state!=='completed'||!this.options.audioResults)return null
  const saved=await this.options.audioResults.get(scope.accountId,row);this.assert(scope,signal);if(saved)this.remember(scope,row.requestId,saved);return saved
 }
 private async project(scope:OwnedScope,row:MediaKeyRecord){return{schemaVersion:1,requestId:row.requestId,modelId:row.modelId,kind:'audio',state:row.state,contentAvailable:row.state==='completed'&&!!await this.output(scope,row)}}
 private async status(scope:OwnedScope,row:MediaKeyRecord,signal?:AbortSignal){
  if(row.kind!=='audio'||!HARNESS_AUDIO_MODELS.includes(row.modelId as never))throw Error('AIGC_REQUEST_CONFLICT')
  if(row.state==='completed'||row.state==='failed')return this.project(scope,row)
  const response=await(await this.client(scope)).mediaRequestStatus(row.requestId,signal)
  if(response.status===404){await response.body?.cancel();this.assert(scope,signal);return this.project(scope,row)}
  const result=await json(response,256*1024,()=>this.assert(scope,signal))
  if(result.model!==row.modelId||result.request_id!==row.requestId)invalid()
  const updated={...row,state:mediaTaskState(result.status)}
  await this.options.journal.save(scope.accountId,updated);this.assert(scope,signal);return this.project(scope,updated)
 }
 async request(scope:OwnedScope,path:string,value?:unknown,signal?:AbortSignal):Promise<unknown>{
  this.assert(scope,signal)
  if(path==='/audio/catalog'&&value===undefined){
   const{doc,models}=await this.catalog(scope,signal)
   return{schemaVersion:1,catalogRevision:doc.catalogRevision,sourceSha256:doc.sourceSha256,models:models.map(model=>({...model,providerId:slot(model.modelId),type:'audio',providerLabel:'StudyBuddy 音效 · 平台额度',fundingSource:'platform'}))}
  }
  const status=/^\/audio\/requests\/([a-f0-9-]{36})$/.exec(path)
  if(status&&mediaRequestUUID(status[1])&&value===undefined){const row=await this.options.journal.get(scope.accountId,status[1]);this.assert(scope,signal);if(!row)throw Error('AIGC_TASK_NOT_FOUND');return this.status(scope,row,signal)}
  if(path!=='/audio/requests'||value===undefined)throw Error('AIGC_ENDPOINT_DENIED')
  const input=object(value)
  if(Object.keys(input).some(key=>!['requestId','handle','modelId','prompt','format','sampleRate','speechRate','loudnessRate','pitchRate'].includes(key))||
   !mediaRequestUUID(input.requestId)||typeof input.modelId!=='string'||!HARNESS_AUDIO_MODELS.includes(input.modelId as never)||input.handle!==slot(input.modelId)||
   typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.includes('\0')||input.prompt.length>65536)throw Error('AIGC_REQUEST_INVALID')
  for(const[key,min,max]of [['speechRate',-50,100],['loudnessRate',-50,100],['pitchRate',-12,12]] as const)if(input[key]!==undefined&&(!Number.isInteger(input[key])||Number(input[key])<min||Number(input[key])>max))throw Error('AIGC_REQUEST_INVALID')
  const row:MediaKeyRecord={schemaVersion:1,requestId:input.requestId,kind:'audio',modelId:input.modelId,inputHash:digest(input),taskId:null,state:'unknown'}
  const old=await this.options.journal.get(scope.accountId,row.requestId);this.assert(scope,signal)
  if(old){if(old.inputHash!==row.inputHash||old.modelId!==row.modelId||old.kind!==row.kind)throw Error('AIGC_REQUEST_CONFLICT');return this.status(scope,old,signal)}
  const{client,models}=await this.catalog(scope,signal),model=models.find(m=>m.modelId===row.modelId)
  if(!model||Array.from(input.prompt).length>model.maxInputCodePoints)throw Error('AIGC_MODEL_UNAVAILABLE')
  const format=String(input.format??model.defaultFormat),sampleRate=input.sampleRate??model.defaultSampleRates[format]
  if(!model.formats.includes(format)||!model.sampleRates[format]?.includes(sampleRate as number))throw Error('AIGC_REQUEST_INVALID')
  const body={model:row.modelId,text_prompt:input.prompt,audio_config:{format,sample_rate:sampleRate,...input.speechRate===undefined?{}:{speech_rate:input.speechRate},...input.loudnessRate===undefined?{}:{loudness_rate:input.loudnessRate},...input.pitchRate===undefined?{}:{pitch_rate:input.pitchRate}},watermark:{aigc_metadata:{enable:true,content_producer:'StudyBuddy'}}}
  const claimed=await this.options.journal.claim(scope.accountId,row);this.assert(scope,signal)
  if(!claimed.created){if(claimed.row.inputHash!==row.inputHash||claimed.row.modelId!==row.modelId||claimed.row.kind!==row.kind)throw Error('AIGC_REQUEST_CONFLICT');return this.status(scope,claimed.row,signal)}
  const result=await json(await client.invoke({schemaVersion:1,requestId:row.requestId,exactModelId:row.modelId,protocol:'volcengine_audio.generate',purpose:'audio'},body,
   AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(300_000)]),model.priceGuard),Math.ceil(binaryLimit*4/3)+256*1024,()=>this.assert(scope,signal))
  if(result.model!==row.modelId||typeof result.trace_id!=='string'||!result.trace_id||typeof result.original_duration!=='number'||!Number.isFinite(result.original_duration)||result.original_duration<=0||result.original_duration>model.maxOriginalDurationSeconds||
   typeof result.duration!=='number'||!Number.isFinite(result.duration)||result.duration<=0||typeof result.audio!=='string'||result.audio.length%4||!result.audio.length||result.audio.length>Math.ceil(binaryLimit*4/3))invalid()
  const bytes=Buffer.from(result.audio as string,'base64')
  if(!bytes.length||bytes.length>binaryLimit||bytes.toString('base64')!==result.audio||
   format==='wav'&&(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')||
   format==='ogg_opus'&&bytes.toString('ascii',0,4)!=='OggS'||format==='mp3'&&bytes.toString('ascii',0,3)!=='ID3'&&!(bytes[0]===255&&(bytes[1]!&224)===224))invalid()
  const content={bytes,mime:mimes[format as keyof typeof mimes]};this.remember(scope,row.requestId,content)
  await this.options.audioResults?.save(scope.accountId,row,content);this.assert(scope,signal)
  row.state='completed';await this.options.journal.save(scope.accountId,row);this.assert(scope,signal)
  return this.project(scope,row)
 }
 async content(scope:OwnedScope,path:string,signal?:AbortSignal):Promise<Response>{
  this.assert(scope,signal);const match=/^\/audio\/requests\/([a-f0-9-]{36})\/content$/.exec(path)
  if(!match||!mediaRequestUUID(match[1]))throw Error('AIGC_ENDPOINT_DENIED')
  const record=await this.options.journal.get(scope.accountId,match[1]);this.assert(scope,signal)
  if(!record||record.kind!=='audio'||!HARNESS_AUDIO_MODELS.includes(record.modelId as never))throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')
  const output=await this.output(scope,record,signal);if(!output)throw Error('AIGC_TASK_CONTENT_UNAVAILABLE')
  const key=this.key(scope,match[1]),cached=this.contentRows.get(key);if(cached)clearTimeout(cached.timer);this.contentRows.delete(key)
  return new Response(Buffer.from(output.bytes),{headers:{'Content-Type':output.mime,'Cache-Control':'private, no-store'}})
 }
}
