import {it,expect} from 'vitest'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {AigcMediaClient} from '../src/studybuddy/aigc-media.ts'
import {DiskMediaKeyJournal} from '../src/studybuddy/media-key-journal.ts'
import {DiskMediaAudioStore} from '../src/studybuddy/media-audio-store.ts'
import type {HarnessResearchContextV1} from '@studybuddy/contracts'

const scope={accountId:'speech-owner',generation:1}
const id='4c89b2fa-d652-4cbe-8c2f-420e410d87a1',modelId='speech-2.8-hd'
const handle='mediaKey'+createHash('sha256').update(modelId).digest('hex')
const guard={version:'minimax-speech-cn-20261014-v1',expressionSha256:'a'.repeat(64),pluginSha256:'b'.repeat(64)}
const catalog={schemaVersion:1,catalogRevision:'fixture',sourceSha256:'d'.repeat(64),models:[
 {provider:'minimax',modelId,displayName:'MiniMax Speech 2.8 HD',operation:'tts',unit:'character',rateCny:'3.50',ratePer:10000,priceGuard:guard,
  voices:[{title:'Chinese voice',voice:'female-shaonv',language:'zh-CN'}],formats:['wav'],sampleRates:[24000],languages:['zh-CN']},
 {provider:'minimax',modelId:'asr-1.0',displayName:'MiniMax ASR',operation:'asr',unit:'second',rateCny:'2.50',ratePer:3600,priceGuard:guard,formats:['wav'],maxFileBytes:50000000,maxDurationSeconds:500}
]}

it('recovers a completed native speech output across client restart without another generation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'speech-result-recovery-')),journal=new DiskMediaKeyJournal(root)
 const audio=Buffer.alloc(46);audio.write('RIFF');audio.write('WAVE',8);audio[44]=1;audio[45]=2
 let dispatched=0
 const options={isCurrent:()=>true,journal,target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),audioResults:new DiskMediaAudioStore(join(root,'results')),fetch:async(url:string)=>{
  if(url.endsWith('/speech/catalog'))return Response.json(catalog)
  dispatched++;return Response.json({model:modelId,trace_id:'recovery-fixture',base_resp:{status_code:0},data:{status:2,audio:audio.toString('hex')},extra_info:{audio_format:'wav',audio_sample_rate:24000,usage_characters:2,usage_voice_count:0}})
 }}
 const first=new AigcMediaClient(options),input={requestId:id,handle,modelId,prompt:'好',voiceId:'female-shaonv',speed:1,format:'wav',sampleRate:24000,language:'zh-CN'}
 let resumed:AigcMediaClient|undefined
 try{
  await first.request(scope,'/speech/requests',input);first.clearTransient();resumed=new AigcMediaClient({...options,audioResults:new DiskMediaAudioStore(join(root,'results'))})
  expect(await resumed.request(scope,'/speech/requests',input)).toMatchObject({state:'completed',contentAvailable:true})
  expect(Buffer.from(await(await resumed.content(scope,'/speech/requests/'+id+'/content')).arrayBuffer())).toEqual(audio);expect(dispatched).toBe(1)
 }finally{first.clearTransient();resumed?.clearTransient();await rm(root,{recursive:true,force:true})}
})

it('requests reviewed word subtitles and persists their actual millisecond timing with the completed audio',async()=>{
 const root=await mkdtemp(join(tmpdir(),'speech-word-result-')),journal=new DiskMediaKeyJournal(root),timed=structuredClone(catalog);Object.assign(timed.models[0]!,{subtitleTypes:['sentence','word']})
 const audio=Buffer.alloc(46);audio.write('RIFF');audio.write('WAVE',8);audio[44]=1;audio[45]=2
 let generations=0,downloads=0
 const options={isCurrent:()=>true,journal,audioResults:new DiskMediaAudioStore(join(root,'results')),target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),readTtsSubtitles:async(url:string)=>{expect(url).toBe('https://media.example/words?signature=fixture');downloads++;return[{text:'你好',time_begin:0,time_end:2000,timestamped_words:[{word:'你',time_begin:100.25,time_end:500.75},{word:'好',time_begin:1300,time_end:1700}]}]},fetch:async(url:string,init?:RequestInit)=>{
  if(url.endsWith('/speech/catalog'))return Response.json(timed)
  const body=JSON.parse(String(init?.body));expect(body.subtitle_enable).toBe(true);expect(body.subtitle_type).toBe('word');generations++
  return Response.json({model:modelId,trace_id:'word-fixture',base_resp:{status_code:0},data:{status:2,audio:audio.toString('hex'),subtitle_file:'https://media.example/words?signature=fixture'},extra_info:{audio_format:'wav',audio_sample_rate:24000,audio_length:2000,usage_characters:4,usage_voice_count:0}})
 }}
 const client=new AigcMediaClient(options),input={requestId:id,handle,modelId,prompt:'你好',voiceId:'female-shaonv',speed:1,format:'wav',sampleRate:24000,language:'zh-CN',wordTimestamps:true};let resumed:AigcMediaClient|undefined
 try{
  const result=await client.request(scope,'/speech/requests',input)
  expect(result).toMatchObject({state:'completed',contentAvailable:true,wordTimestampsStatus:'available',timing:{durationMs:2000,words:[{token:'你',startMs:100.25,endMs:500.75},{token:'好',startMs:1300,endMs:1700}]}})
  client.clearTransient();resumed=new AigcMediaClient({...options,audioResults:new DiskMediaAudioStore(join(root,'results'))})
  expect(await resumed.request(scope,'/speech/requests',input)).toEqual(result);expect(generations).toBe(1);expect(downloads).toBe(1)
  const stored=await readFile(join(root,'results',createHash('sha256').update(scope.accountId).digest('hex'),id+'.audio'));expect(stored.includes(Buffer.from('signature=fixture'))).toBe(false)
 }finally{client.clearTransient();resumed?.clearTransient();await rm(root,{recursive:true,force:true})}
})

it('preserves completed audio when subtitle retrieval fails and never regenerates or retries the artifact automatically',async()=>{
 const root=await mkdtemp(join(tmpdir(),'speech-word-unavailable-')),journal=new DiskMediaKeyJournal(root),timed=structuredClone(catalog);Object.assign(timed.models[0]!,{subtitleTypes:['sentence','word']})
 const audio=Buffer.alloc(46);audio.write('RIFF');audio.write('WAVE',8);let generations=0,downloads=0
 const options={isCurrent:()=>true,journal,audioResults:new DiskMediaAudioStore(join(root,'results')),target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),readTtsSubtitles:async()=>{downloads++;throw Error('signed artifact unavailable')},fetch:async(url:string)=>{if(url.endsWith('/speech/catalog'))return Response.json(timed);generations++;return Response.json({model:modelId,trace_id:'unavailable-word-fixture',base_resp:{status_code:0},data:{status:2,audio:audio.toString('hex'),subtitle_file:'https://media.example/unavailable'},extra_info:{audio_format:'wav',audio_sample_rate:24000,audio_length:2000,usage_characters:4,usage_voice_count:0}})}}
 const client=new AigcMediaClient(options),input={requestId:id,handle,modelId,prompt:'你好',voiceId:'female-shaonv',speed:1,format:'wav',sampleRate:24000,language:'zh-CN',wordTimestamps:true}
 try{
  expect(await client.request(scope,'/speech/requests',input)).toMatchObject({state:'completed',contentAvailable:true,wordTimestampsStatus:'unavailable'})
  expect(Buffer.from(await(await client.content(scope,'/speech/requests/'+id+'/content')).arrayBuffer())).toEqual(audio)
  await client.request(scope,'/speech/requests',input);expect(generations).toBe(1);expect(downloads).toBe(1)
 }finally{client.clearTransient();await rm(root,{recursive:true,force:true})}
})

it('video transcription requests actual word segments and keeps them out of the request journal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studybuddy-video-asr-')),journal=new DiskMediaKeyJournal(root)
 let dispatched=0
 const words=[{id:0,start:0.1,end:0.7,speaker:'S1',text:'你'},{id:1,start:1.2,end:1.8,speaker:'S1',text:'好'}]
 const timed=structuredClone(catalog),asr=timed.models[1]!
 Object.assign(asr,{responseFormats:['json','verbose_json'],timestampLevels:['sentence','word']})
 const client=new AigcMediaClient({isCurrent:()=>true,journal,target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),fetch:async(url,init)=>{
  if(url.endsWith('/speech/catalog'))return Response.json(timed)
  expect(url).toBe('https://gateway.test/minimax/v1/speech_to_text');dispatched++
  const form=init!.body as FormData
  expect(form.get('response_format')).toBe('verbose_json');expect(form.get('timestamp_level')).toBe('word')
  expect(form.has('timestamp_granularities[]')).toBe(false)
  expect(new Headers(init?.headers).get('X-Request-Id')).toBe(id)
  return Response.json({model:'asr-1.0',trace_id:'word-terminal-trace',text:'你好',duration:'2.000000001',n_speakers:1,segments:words})
 }})
 try{
  const choices=await client.request(scope,'/asr/catalog') as {models:{modelId:string;providerId:string;responseFormats:string[]}[]}
  const choice=choices.models[0]!
  expect(choice.modelId).toBe('asr-1.0')
  const input={requestId:id,modelId:choice.modelId,handle:choice.providerId,audio:new Uint8Array([1,2,3,4]),contextId:'a'.repeat(64)}
  expect(await client.request(scope,'/asr/requests',input)).toMatchObject({requestId:id,state:'completed',duration:2.000000001,segments:words})
  await expect(client.request(scope,'/asr/requests',input)).rejects.toThrow('RESEARCH_SPEECH_ALREADY_SUBMITTED')
  expect(dispatched).toBe(1)
  const saved=await readFile(join(root,createHash('sha256').update(scope.accountId).digest('hex'),id+'.json'),'utf8')
  expect(saved).not.toContain('你好');expect(saved).not.toContain('word-terminal-trace');expect(saved).not.toContain('synthetic-key')
 }finally{client.clearTransient();await rm(root,{recursive:true,force:true})}
})

it.each(['SUCCESS','FAILURE'])('recovers the original terminal %s after a lost response without generating again',async(status)=>{
 const root=await mkdtemp(join(tmpdir(),'studybuddy-speech-')),journal=new DiskMediaKeyJournal(root)
 let dispatched=0,statusReads=0
 const client=new AigcMediaClient({isCurrent:()=>true,journal,target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),fetch:async(url)=>{
  if(url.endsWith('/speech/catalog'))return Response.json(catalog)
  if(url.endsWith('/v1/tasks/by-request/'+id)){statusReads++;return Response.json({model:modelId,request_id:id,status})}
  dispatched++;throw new TypeError('provider completed, caller lost response')
 }})
 const input={requestId:id,handle,modelId,prompt:'配音文本',voiceId:'female-shaonv',speed:1,format:'wav',sampleRate:24000,language:'zh-CN'}
 try{
  await expect(client.request(scope,'/speech/requests',input)).rejects.toThrow()
  const expected=status==='SUCCESS'?'completed':'failed'
  expect(await client.request(scope,'/speech/requests/'+id)).toMatchObject({state:expected,contentAvailable:false})
  expect(await client.request(scope,'/speech/requests',input)).toMatchObject({state:expected,contentAvailable:false})
  expect(dispatched).toBe(1);expect(statusReads).toBe(1)
  expect(await journal.get(scope.accountId,id)).toMatchObject({state:expected})
  await expect(client.content(scope,'/speech/requests/'+id+'/content')).rejects.toThrow('AIGC_TASK_CONTENT_UNAVAILABLE')
 }finally{client.clearTransient();await rm(root,{recursive:true,force:true})}
})

it('projects one reviewed speech catalogue and hands off audio once without saving generated audio or text',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studybuddy-speech-')),journal=new DiskMediaKeyJournal(root)
 let dispatched=0
 const audio=Buffer.alloc(46);audio.write('RIFF');audio.write('WAVE',8);audio[44]=1;audio[45]=2
 const client=new AigcMediaClient({isCurrent:()=>true,journal,target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),fetch:async(url,init)=>{
  expect(init?.credentials).toBe('omit');expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-key')
  if(url.endsWith('/speech/catalog'))return Response.json(catalog)
  expect(url).toBe('https://gateway.test/minimax/v1/t2a_v2');dispatched++
  const body=JSON.parse(String(init?.body));expect(body.model).toBe(modelId);expect(body.voice_setting).toEqual({voice_id:'female-shaonv',speed:1,vol:1,pitch:0})
  expect(new Headers(init?.headers).get('X-Request-Id')).toBe(id)
  expect(new Headers(init?.headers).get('X-StudyBuddy-CNY-Plugin-SHA256')).toBe(guard.pluginSha256)
  return Response.json({model:modelId,trace_id:'upstream-trace',base_resp:{status_code:0},data:{status:2,audio:audio.toString('hex')},extra_info:{audio_format:'wav',audio_sample_rate:24000,usage_characters:12,usage_voice_count:0}})
 }})
 try{
  const view=await client.request(scope,'/speech/catalog') as {models:{modelId:string;type:string}[]}
  expect(view.models.map(row=>row.modelId)).toEqual([modelId]);expect(view.models[0]?.type).toBe('audio')
  const input={requestId:id,handle,modelId,prompt:'需要配音的文本',voiceId:'female-shaonv',speed:1,format:'wav',sampleRate:24000,language:'zh-CN'}
  expect(await client.request(scope,'/speech/requests',input)).toMatchObject({kind:'audio',state:'completed',contentAvailable:true,requestId:id})
  expect(await client.request(scope,'/speech/requests',input)).toMatchObject({state:'completed'});expect(dispatched).toBe(1)
  const response=await client.content(scope,'/speech/requests/'+id+'/content')
  expect(response.headers.get('Content-Type')).toBe('audio/wav');expect(Buffer.from(await response.arrayBuffer())).toEqual(audio)
  const directory=join(root,createHash('sha256').update(scope.accountId).digest('hex'));expect(await readdir(directory)).toEqual([id+'.json'])
  const saved=await readFile(join(directory,id+'.json'),'utf8')
  expect(saved).not.toContain('需要配音的文本');expect(saved).not.toContain(audio.toString('hex'));expect(saved).not.toContain('synthetic-key')
  client.clearTransient()
  await expect(client.content(scope,'/speech/requests/'+id+'/content')).rejects.toThrow('AIGC_TASK_CONTENT_UNAVAILABLE')
 }finally{client.clearTransient();await rm(root,{recursive:true,force:true})}
})

it('dictation uses the same Key/UUID and multipart protocol and stores no transcript or audio',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studybuddy-asr-')),journal=new DiskMediaKeyJournal(root)
 let dispatched=0,current=true
 const client=new AigcMediaClient({isCurrent:()=>current,journal,target:async()=>({baseUrl:'https://gateway.test',apiKey:'synthetic-key'}),fetch:async(url,init)=>{
  if(url.endsWith('/speech/catalog'))return Response.json(catalog)
  expect(url).toBe('https://gateway.test/minimax/v1/speech_to_text');dispatched++
  expect(init?.body).toBeInstanceOf(FormData)
  const form=init!.body as FormData
  expect([...form.keys()].sort()).toEqual(['file','model','response_format','stream'])
  expect(form.get('model')).toBe('asr-1.0');expect(form.get('stream')).toBe('false')
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-key')
  expect(new Headers(init?.headers).get('X-Request-Id')).toBe(id)
  expect(init?.credentials).toBe('omit')
  return Response.json({model:'asr-1.0',trace_id:'terminal-trace',text:'这段内容只回填草稿',duration:'26.325'})
 }})
 const input={requestId:id,modelId:'asr-1.0' as const,audio:new Uint8Array([1,2,3,4]),mimeType:'audio/wav' as const}
 const context={projectId:'fixture-project'} as unknown as HarnessResearchContextV1,signal=new AbortController().signal
 try{
  expect(await client.transcribe(scope,input,signal,context)).toEqual({requestId:id,modelId:'asr-1.0',text:'这段内容只回填草稿',duration:26.325})
  await expect(client.transcribe(scope,input,signal,context)).rejects.toThrow('RESEARCH_SPEECH_ALREADY_SUBMITTED');expect(dispatched).toBe(1)
  const saved=await readFile(join(root,createHash('sha256').update(scope.accountId).digest('hex'),id+'.json'),'utf8')
  expect(saved).not.toContain('这段内容');expect(saved).not.toContain('synthetic-key');expect(saved).not.toContain('fixture-project')
  current=false;await expect(client.transcribe(scope,input,signal,context)).rejects.toThrow('AIGC_SCOPE_REVOKED')
 }finally{client.clearTransient();await rm(root,{recursive:true,force:true})}
})
