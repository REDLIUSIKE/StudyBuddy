/** Normalized display timing from MiniMax's documented millisecond word fields; never billing usage. */
import {z} from 'zod'
const millisecond=z.number().finite().min(0).max(86_400_000)
export const TtsTimingSchema=z.strictObject({durationMs:millisecond.positive(),words:z.array(z.strictObject({token:z.string().min(1).max(20000).refine(value=>!!value.trim()&&!value.includes('\0')),startMs:millisecond,endMs:millisecond})).min(1).max(20000)}).superRefine((value,ctx)=>{
 let previous=-1
 for(const word of value.words){if(word.startMs<previous||word.endMs<word.startMs||word.endMs>value.durationMs)ctx.addIssue({code:'custom',message:'Invalid word timing'});previous=word.startMs}
})
export type TtsTiming=z.infer<typeof TtsTimingSchema>
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE');return value as Record<string,unknown>}
/** Accept only a subtitle-segment array with actual word timing, preserving source millisecond precision.
 * @param value - Downloaded subtitle JSON; no URL or credentials are retained.
 * @param durationMs - Supplier audio_length in milliseconds, used only to bound display timing.
 * @returns Normalized display words, without prices, usage or inferred timestamps.
 */
export function parseMiniMaxTtsTiming(value:unknown,durationMs:number):TtsTiming{
 if(!Array.isArray(value)||!value.length||value.length>10000||Buffer.byteLength(JSON.stringify(value))>2*1024*1024||typeof durationMs!=='number'||!Number.isFinite(durationMs)||durationMs<=0||durationMs>86_400_000)throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
 const words:TtsTiming['words']=[]
 for(const item of value){
  const segment=object(item)
  if(typeof segment.text!=='string'||!segment.text||segment.text.length>20000||typeof segment.time_begin!=='number'||typeof segment.time_end!=='number'||!Number.isFinite(segment.time_begin)||!Number.isFinite(segment.time_end)||segment.time_begin<0||segment.time_end<segment.time_begin||segment.time_end>durationMs||!Array.isArray(segment.timestamped_words)||!segment.timestamped_words.length||segment.timestamped_words.length>20000)throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
  for(const item of segment.timestamped_words){
   const word=object(item)
   if(typeof word.word!=='string'||typeof word.time_begin!=='number'||typeof word.time_end!=='number'||word.time_begin<segment.time_begin||word.time_end>segment.time_end)throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
   if(!word.word.trim())continue
   words.push({token:word.word.trim(),startMs:word.time_begin,endMs:word.time_end});if(words.length>20000)throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
  }
 }
 const parsed=TtsTimingSchema.safeParse({durationMs,words});if(!parsed.success)throw Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE')
 return parsed.data
}
