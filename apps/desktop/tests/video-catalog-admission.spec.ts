import {it,expect} from 'vitest'
import {HARNESS_VIDEO_TTS_MODELS} from '@studybuddy/contracts'
import {VideoMediaAdapter} from '../src/studybuddy/video-media.ts'

it('keeps supported native media visible while refusing TTS/ASR without required word timing',async()=>{
 const scope={accountGeneration:'account',workspaceId:'workspace',projectId:'project',sessionId:'session'},reads:string[]=[]
 const adapter=new VideoMediaAdapter({
  binding:async()=>({scope:{accountId:'account',generation:1},projectRoot:process.cwd()}),isCurrent:()=>true,pollIntervalMs:1,timeoutMs:100,
  api:{request:async(_scope,path,body)=>{
   expect(body).toBeUndefined();expect(path.endsWith('/catalog')).toBe(true);reads.push(path)
   const models=path==='/images/catalog'?[{modelId:'native-image-fixture',providerId:'native-image-handle',label:'Native image'}]
    :path==='/speech/catalog'?HARNESS_VIDEO_TTS_MODELS.map(modelId=>({modelId,providerId:'native-speech-handle',formats:['mp3'],subtitleTypes:[]}))
    :path==='/asr/catalog'?[{modelId:'asr-1.0',providerId:'native-asr-handle',formats:['wav'],responseFormats:['json'],timestampLevels:[],maxFileBytes:50000000,maxDurationSeconds:500}]:[]
   return{schemaVersion:1,models}
  },content:async()=>{throw Error('Catalog lookup must not generate or download media')}},
 })
 const choices=await adapter.catalog(scope,new AbortController().signal)
 expect(reads).toHaveLength(5);expect(choices.map(row=>row.operation)).toEqual(['image']);expect(choices[0]).toMatchObject({modelId:'native-image-fixture',label:'Native image'})
 await expect(adapter.request({scope,operation:'tts',requestId:'11111111-1111-4111-8111-111111111111',authorityRef:choices[0]!.authorityRef,input:{native:{prompt:'no paid dispatch'},out:'assets/voice.mp3'}},new AbortController().signal)).rejects.toThrow('VIDEO_AUTHORITY_REQUIRED')
 expect(reads).toHaveLength(5)
})
