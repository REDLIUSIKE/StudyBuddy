import {expect,it} from 'vitest'
import * as Speech from '../src/studybuddy/aigc-speech.ts'
// Invalid native provider responses are intentional fixtures for the downloader's validation boundary.
const download=(url:string,signal:AbortSignal,provider:unknown)=>{const fetch=Reflect.get(Speech,'downloadMiniMaxTtsSubtitles');expect(typeof fetch).toBe('function');return fetch(url,signal,provider as Parameters<typeof Speech.downloadMiniMaxTtsSubtitles>[2])}
it('reads subtitle JSON anonymously through the bounded native web reader',async()=>{
 const signal=new AbortController().signal,document=[{text:'你好'}];let calls=0
 const result=await download('https://media.example/subtitle.json?signature=fixture',signal,{fetch:async(request:unknown,control:AbortSignal)=>{expect(Object.keys(request as object)).toEqual(['url']);expect(control).toBe(signal);calls++;return{url:'https://media.example/subtitle.json?signature=fixture',statusCode:200,body:{kind:'text',content:JSON.stringify(document)},truncated:false}}})
 expect(result).toEqual(document);expect(calls).toBe(1)
})
it('rejects unsafe URLs, redirects, truncated content and private error details',async()=>{
 let calls=0
 const provider={fetch:async()=>{calls++;throw Error('Do not expose signature=fixture')}}
 for(const url of ['http://media.example/subtitle.json','https://user:password@media.example/subtitle.json','https://media.example:9443/subtitle.json','https://media.example/subtitle.json#data'])await expect(download(url,new AbortController().signal,provider)).rejects.toThrow('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
 expect(calls).toBe(0)
 for(const result of [{statusCode:302,body:{kind:'text',content:'[]'},truncated:false},{statusCode:200,body:{kind:'html',content:'<html>error</html>'},truncated:false},{statusCode:200,body:{kind:'text',content:'[]'},truncated:true}])await expect(download('https://media.example/file',new AbortController().signal,{fetch:async()=>result})).rejects.toThrow('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
 const outcome=await download('https://media.example/subtitle.json?signature=fixture',new AbortController().signal,provider).catch((error:Error)=>error)
 expect(outcome).toHaveProperty('message','VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
})
