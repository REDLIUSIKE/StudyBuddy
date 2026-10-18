import {expect,it} from 'vitest'
import * as Speech from '../src/studybuddy/aigc-speech.ts'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const parse=(value:unknown,durationMs:number)=>{
 const parser=Reflect.get(Speech,'parseMiniMaxTtsTiming');expect(typeof parser).toBe('function')
 return parser(value,durationMs)
}
it('keeps provider millisecond word timing instead of distributing text evenly',()=>{
 expect(parse([{text:'你好',time_begin:0,time_end:2000,timestamped_words:[{word:'你',word_begin:0,word_end:1,time_begin:100.25,time_end:500.75},{word:'好',word_begin:1,word_end:2,time_begin:1300,time_end:1700}]}],2000)).toEqual({durationMs:2000,words:[{token:'你',startMs:100.25,endMs:500.75},{token:'好',startMs:1300,endMs:1700}]})
})
it('parses the reviewed real China supplier subtitle file without changing its fractional milliseconds',async()=>{
 const bytes=await readFile(new URL('./fixtures/minimax-tts-word-subtitles.cn.json',import.meta.url))
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('75ce1eaaa9534ebf860d5efcfe543ddb70673c08a8785dbbd2ef5019ebb67602')
 const timing=parse(JSON.parse(bytes.toString('utf8')),1230)
 expect(timing.words).toHaveLength(6);expect(timing.words[0]).toEqual({token:'你',startMs:42.666666666666664,endMs:213.33333333333331})
 expect(timing.words[3]).toEqual({token:'世',startMs:384,endMs:597.3333333333333})
})
it('rejects sentence-only subtitles, guessed containers and invalid provider word times',()=>{
 for(const value of [[],{subtitles:[]},[{text:'你好',time_begin:0,time_end:2000,timestamped_words:null}],[{text:'你好',time_begin:0,time_end:2000,timestamped_words:[{word:'你',time_begin:1300,time_end:2100}]}],[{text:'你好',time_begin:0,time_end:2000,timestamped_words:[{word:'你',time_begin:1300,time_end:1500},{word:'好',time_begin:100,time_end:500}]}]])expect(()=>parse(value,2000)).toThrow('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
})
