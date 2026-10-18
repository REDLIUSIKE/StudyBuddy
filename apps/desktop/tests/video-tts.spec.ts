import {afterEach,it,expect} from 'vitest'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {HARNESS_VIDEO_TTS_MODELS} from '@studybuddy/contracts'
import {VideoMediaAdapter} from '../src/studybuddy/video-media.ts'
const roots:string[]=[]
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true})})
async function fixture(timingAvailable=true,modelId:string=HARNESS_VIDEO_TTS_MODELS[0]){
 const root=await mkdtemp(join(tmpdir(),'video-tts-'));roots.push(root)
 const scope={accountGeneration:'a',workspaceId:'w',projectId:'p',sessionId:'s'}
 const timing={durationMs:2300,words:[{token:'你好',startMs:124,endMs:812},{token:'世界',startMs:1341,endMs:2197}]}
 let posts=0
 const bodies:unknown[]=[]
 const api={request:async(_scope:unknown,path:string,body?:unknown)=>{
  if(path.endsWith('/catalog'))return{schemaVersion:1,models:path==='/speech/catalog'?[{modelId,providerId:'approved-native',formats:['wav','mp3','pcm'],subtitleTypes:['sentence','word'],voices:[]},{modelId:'metadata-only-tts',providerId:'other',formats:['wav'],subtitleTypes:['word']}]:[]}
  posts++;bodies.push(body);return{requestId:(body as {requestId:string}).requestId,modelId,state:'completed',contentAvailable:true,wordTimestampsStatus:timingAvailable?'available':'unavailable',...(timingAvailable?{timing}:{})}
 },content:async()=>new Response(new Uint8Array([82,73,70,70]),{headers:{'content-type':'audio/wav'}})}
 const fresh=()=>new VideoMediaAdapter({binding:async()=>({scope:{accountId:'owner',generation:1},projectRoot:root}),isCurrent:()=>true,api,pollIntervalMs:1,timeoutMs:100})
 return{root,scope,modelId,timing,bodies,fresh,posts:()=>posts}
}
it.each(HARNESS_VIDEO_TTS_MODELS)('admits only explicit video TTS %s and persists real word times with the paid artifact across adapter restart',async modelId=>{
 const f=await fixture(true,modelId),adapter=f.fresh(),signal=new AbortController().signal
 const choices=await adapter.catalog(f.scope,signal);expect(choices).toHaveLength(1)
 const choice=choices[0]!
 expect(choice.parameters.formats).toEqual(['wav','mp3']);expect(choice.parameters.subtitleTypes).toEqual(['sentence','word'])
 const request={scope:f.scope,requestId:'44444444-4444-4444-8444-444444444441',operation:'tts' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'你好世界',voiceId:'approved',speed:1,format:'wav'},out:'assets/voice'}}
 const result=await adapter.request(request,signal)
 expect(f.bodies).toEqual([expect.objectContaining({modelId:f.modelId,wordTimestamps:true})]);expect(result.data).toMatchObject({timing:f.timing,wordTimestampsStatus:'available'})
 const restarted=f.fresh(),next=(await restarted.catalog(f.scope,signal))[0]!
 const recovered=await restarted.request({...request,authorityRef:next.authorityRef},signal)
 expect(recovered).toEqual(result);expect(f.posts()).toBe(1)
 expect(await readFile(join(f.root,result.artifacts[0]!.relativePath))).toEqual(Buffer.from('RIFF'))
})
it('keeps audio when word timestamps are unavailable and rejects false/PCM before dispatch',async()=>{
 const f=await fixture(false),adapter=f.fresh(),signal=new AbortController().signal,choice=(await adapter.catalog(f.scope,signal))[0]!
 const request={scope:f.scope,requestId:'44444444-4444-4444-8444-444444444442',operation:'tts' as const,authorityRef:choice.authorityRef,input:{native:{prompt:'文本',voiceId:'approved',speed:1,format:'wav'}}}
 for(const native of [{...request.input.native,wordTimestamps:false},{...request.input.native,format:'pcm'}])await expect(adapter.request({...request,input:{native}},signal)).rejects.toThrow('VIDEO_MEDIA_INPUT_INVALID')
 expect(f.posts()).toBe(0)
 const result=await adapter.request(request,signal)
 expect(result.data).toMatchObject({wordTimestampsStatus:'unavailable'});expect(result.artifacts).toHaveLength(1);expect(f.posts()).toBe(1)
})
