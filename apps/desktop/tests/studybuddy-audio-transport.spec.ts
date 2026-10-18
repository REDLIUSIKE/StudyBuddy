import {afterEach,it,expect} from 'vitest'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {AigcMediaClient} from '../src/studybuddy/aigc-media.ts'
import {DiskMediaKeyJournal} from '../src/studybuddy/media-key-journal.ts'
import {DiskMediaAudioStore} from '../src/studybuddy/media-audio-store.ts'

const scope={accountId:'audio-owner',generation:1},id='4c89b2fa-d652-4cbe-8c2f-420e410d87a1',modelId='seed-audio-1.0'
const handle='mediaKey'+createHash('sha256').update(modelId).digest('hex')
const guard={version:'audio-fixture-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}
const catalog=()=>({schemaVersion:1,catalogRevision:'fixture',sourceSha256:'d'.repeat(64),data:[{
 providerId:'volcengine',modelId,displayName:'Audio fixture',kind:'audio',protocols:['volcengine_audio.generate'],clientMembership:['harness-video-audio'],capabilityFlags:['audio_out','sound_effects'],
 audio:{formats:['wav'],sampleRates:{wav:[40000]},defaultFormat:'wav',defaultSampleRate:40000,defaultSampleRates:{wav:40000},maxInputCodePoints:3000,maxOriginalDurationSeconds:120,billingDurationField:'original_duration'},
 studybuddy:{taskPrice:{currency:'CNY',unit:'second',...guard}},
}]})
const roots:string[]=[],clients:AigcMediaClient[]=[]
afterEach(async()=>{clients.splice(0).forEach(c=>c.clearTransient());for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function fixture(mode:'ok'|'lost'|'missing-duration'='ok',persistent=false){
 const root=await mkdtemp(join(tmpdir(),'studybuddy-audio-'));roots.push(root)
 let calls=0,current=true;const directory=catalog(),journal=new DiskMediaKeyJournal(root)
 const wav=Buffer.alloc(46);wav.write('RIFF');wav.write('WAVE',8);wav[44]=1;wav[45]=2
 const options:ConstructorParameters<typeof AigcMediaClient>[0]={isCurrent:s=>current&&s.accountId===scope.accountId&&s.generation===scope.generation,journal,target:async()=>({baseUrl:'https://gateway.test',apiKey:'native-key-fixture'}),...(persistent?{audioResults:new DiskMediaAudioStore(join(root,'results'))}:{}),fetch:async(url,init)=>{
  expect(init?.credentials).toBe('omit');expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer native-key-fixture')
  expect(new Headers(init?.headers).has('X-Api-Key')).toBe(false)
  if(url.endsWith('/v1/model-catalog'))return Response.json(directory)
  if(url.endsWith('/v1/tasks/by-request/'+id))return Response.json({request_id:id,model:modelId,status:'SUCCESS'})
  expect(url).toBe('https://gateway.test/volcengine/v1/audio/generations');calls++
  expect(new Headers(init?.headers).get('X-StudyBuddy-CNY-Expression-SHA256')).toBe(guard.expressionSha256)
  expect(JSON.parse(String(init?.body))).toMatchObject({model:modelId,text_prompt:'三秒雨声，无人声',audio_config:{format:'wav',sample_rate:40000}})
  if(mode==='lost')throw Error('lost after dispatch')
  return Response.json({model:modelId,trace_id:'provider-trace',audio:wav.toString('base64'),duration:6.25,...mode==='missing-duration'?{}:{original_duration:3.125}})
 }}
 const client=new AigcMediaClient(options)
 clients.push(client)
 return{root,client,options,journal,wav,directory,calls:()=>calls,revoke:()=>{current=false},input:{requestId:id,handle,modelId,prompt:'三秒雨声，无人声',format:'wav',sampleRate:40000}}
}
it('restores completed sound effects from the private disk store without redispatch or a speech-route alias',async()=>{
 const f=await fixture('ok',true);await f.client.request(scope,'/audio/requests',f.input);f.client.clearTransient()
 const resumed=new AigcMediaClient({...f.options,audioResults:new DiskMediaAudioStore(join(f.root,'results'))});clients.push(resumed)
 expect(await resumed.request(scope,'/audio/requests',f.input)).toMatchObject({state:'completed',contentAvailable:true})
 expect(Buffer.from(await(await resumed.content(scope,'/audio/requests/'+id+'/content')).arrayBuffer())).toEqual(f.wav);expect(f.calls()).toBe(1)
 await expect(resumed.content(scope,'/speech/requests/'+id+'/content')).rejects.toThrow('AIGC_TASK_CONTENT_UNAVAILABLE')
})

it('projects only explicit audio membership and hands generated audio off once through native authority',async()=>{
 const f=await fixture(),choices=await f.client.request(scope,'/audio/catalog') as {models:unknown[]}
 expect(choices.models).toHaveLength(1)
 expect(choices.models[0]).toMatchObject({modelId,providerId:handle,type:'audio',priceGuard:guard})
 expect(await f.client.request(scope,'/audio/requests',f.input)).toMatchObject({modelId,state:'completed',contentAvailable:true})
 const content=await f.client.content(scope,'/audio/requests/'+id+'/content')
 expect(content.headers.get('content-type')).toBe('audio/wav');expect(Buffer.from(await content.arrayBuffer())).toEqual(f.wav)
 await expect(f.client.content(scope,'/audio/requests/'+id+'/content')).rejects.toThrow('AIGC_TASK_CONTENT_UNAVAILABLE')
 expect(f.calls()).toBe(1)
 const owner=join(f.root,(await readdir(f.root))[0]!),journal=await readFile(join(owner,id+'.json'),'utf8')
 expect(journal).not.toMatch(/三秒|UklG|native-key|provider-trace|seconds|tokens/i)
})

it('recovers an unknown paid result and never generates again for the same request',async()=>{
 const f=await fixture('lost')
 await expect(f.client.request(scope,'/audio/requests',f.input)).rejects.toThrow()
 expect(await f.client.request(scope,'/audio/requests',f.input)).toMatchObject({state:'completed',contentAvailable:false})
 expect(f.calls()).toBe(1)
 await expect(f.client.request(scope,'/audio/requests',{...f.input,prompt:'different'})).rejects.toThrow('AIGC_REQUEST_CONFLICT')
 expect(f.calls()).toBe(1)
})

it('does not expose processed duration as a substitute for missing original duration',async()=>{
 const f=await fixture('missing-duration')
 await expect(f.client.request(scope,'/audio/requests',f.input)).rejects.toThrow('AIGC_RESPONSE_INVALID')
 expect(await f.journal.get(scope.accountId,id)).toMatchObject({state:'unknown'})
})

it('denies wrong model, invalid rates, stale owner and missing price authority before dispatch',async()=>{
 const f=await fixture()
 await expect(f.client.request(scope,'/audio/requests',{...f.input,sampleRate:12345})).rejects.toThrow()
 await expect(f.client.request(scope,'/audio/requests',{...f.input,modelId:'speech-2.8-hd'})).rejects.toThrow()
 f.directory.data[0]!.studybuddy.taskPrice.unit='token'
 await expect(f.client.request(scope,'/audio/requests',f.input)).rejects.toThrow()
 f.revoke();await expect(f.client.request(scope,'/audio/catalog')).rejects.toThrow('AIGC_SCOPE_REVOKED')
 expect(f.calls()).toBe(0)
})
