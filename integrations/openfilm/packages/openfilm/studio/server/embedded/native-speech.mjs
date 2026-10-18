import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,stat,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {videoProgram,trackRenderChild} from '../../../src/runtime.mjs';
import {inside,readable} from '../files.mjs';
import {parseVtt,spokenLines,transcriptPath,writeTranscript} from '../transcripts.mjs';
import {writeAtomic} from '../atomic.mjs';
import {currentStudioContext,currentStudioCaller,assertStudioPath,withStudioEdit,studioProjectSignal,withStudioProject} from './context.mjs';
import {assertNativeTtsAsrAllowed} from './native-tts.mjs';
const run=promisify(execFile),active=new WeakMap();
function execute(...args){const pending=run(...args);trackRenderChild(pending.child);return pending;}
const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
async function optionalText(file){try{return await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function timing(value,requestId,modelId,max){
 if(!value||value.requestId!==requestId||value.modelId!==modelId||value.state!=='completed'||typeof value.text!=='string'||value.text.length>131072||value.text.includes('\0')||!Number.isFinite(value.duration)||value.duration<=0||value.duration>max||!Array.isArray(value.segments)||value.segments.length>20000||value.text.trim()&&!value.segments.length)throw new Error('VIDEO_WORD_TIMESTAMPS_INVALID');
 let previous=-1,cursor=0;const ids=new Set();
 for(const word of value.segments){
  if(!word||!Number.isSafeInteger(word.id)||word.id<0||ids.has(word.id)||typeof word.text!=='string'||!word.text.trim()||!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<previous||word.start<0||word.end<word.start||word.end>value.duration||typeof word.speaker!=='string'||!/^S[1-9][0-9]{0,2}$/.test(word.speaker))throw new Error('VIDEO_WORD_TIMESTAMPS_INVALID');
  const index=value.text.indexOf(word.text.trim(),cursor);if(index<0)throw new Error('VIDEO_WORD_TIMESTAMPS_INVALID');
  cursor=index+word.text.trim().length;previous=word.start;ids.add(word.id);
 }
 return value;
}
/** Keep completed local chunks and stable request IDs; an unknown paid chunk is never retried under a new ID. */
async function transcribe(root,src,context,signal,userRequested){
 const scope=context.scopeForRoot?.(root);if(!scope)throw new Error('VIDEO_PROJECT_NOT_ADMITTED');
 const identity=JSON.stringify(scope),check=()=>{signal.throwIfAborted();if(JSON.stringify(context.scopeForRoot?.(root))!==identity)throw new Error('VIDEO_SCOPE_REVOKED');};
 check();if(typeof src!=='string'||!src||src.length>4096)throw new Error('VIDEO_SPEECH_INPUT_INVALID');
 const source=readable(root,src),before=await stat(source);if(!before.isFile())throw new Error('VIDEO_SPEECH_INPUT_INVALID');
 const destination=assertStudioPath(inside(root,transcriptPath(src)),root),original=await optionalText(destination);
 if(original!==null){if(original.length>4*1024*1024||!parseVtt(original).lines.length)throw Error('VIDEO_TRANSCRIPT_CONFLICT');check();return{src,requestIds:[],artifacts:[{relativePath:transcriptPath(src),sha256:hash(original),mime:'text/vtt'}]};}
 if(!userRequested){await assertNativeTtsAsrAllowed(root,src,source);check();}
 const catalogue=await context.capabilities.request({scope,requestId:randomUUID(),operation:'catalog',input:{}},signal);check();
 const choices=Array.isArray(catalogue.data)?catalogue.data.filter(row=>row.operation==='asr'):[];
 if(choices.length!==1)throw Object.assign(new Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE'),{code:'not-connected'});
 const choice=choices[0],max=choice.parameters?.maxDurationSeconds;
 if(typeof choice.authorityRef!=='string'||typeof choice.modelId!=='string'||!Number.isInteger(max)||max<=0||max>500||!choice.parameters?.timestampLevels?.includes('word')||!choice.parameters?.responseFormats?.includes('verbose_json'))throw new Error('VIDEO_WORD_TIMESTAMPS_UNAVAILABLE');
 const probe=await execute(videoProgram('ffprobe'),['-v','error','-show_entries','format=duration','-of','json',source],{signal,windowsHide:true,maxBuffer:1024*1024});check();
 const duration=Number(JSON.parse(probe.stdout).format?.duration),count=Math.ceil(duration/max);
 if(!Number.isFinite(duration)||duration<=0||!Number.isSafeInteger(count)||count<1||count>1024)throw new Error('VIDEO_SPEECH_INPUT_INVALID');
 const key=hash(JSON.stringify({src,callerSessionId:currentStudioCaller()?.sessionId??scope.sessionId,size:before.size,mtimeMs:before.mtimeMs,modelId:choice.modelId,max}));
 const cache=assertStudioPath(resolve(root,'.film/studybuddy-transcripts/'+key+'.json'),root),folder=assertStudioPath(resolve(root,'.film/studybuddy-speech'),root);
 await mkdir(dirname(cache),{recursive:true});await mkdir(folder,{recursive:true});check();assertStudioPath(cache,root);assertStudioPath(folder,root);
 const saved=await optionalText(cache);if(saved&&saved.length>64*1024*1024)throw new Error('VIDEO_SPEECH_CACHE_INVALID');
 const job=saved?JSON.parse(saved):{schemaVersion:1,key,modelId:choice.modelId,chunks:Array.from({length:count},()=>({requestId:randomUUID(),result:null}))};
 if(job.schemaVersion!==1||job.key!==key||job.modelId!==choice.modelId||!Array.isArray(job.chunks)||job.chunks.length!==count||job.chunks.some(chunk=>!uuid(chunk.requestId)))throw new Error('VIDEO_SPEECH_CACHE_INVALID');
 const persist=()=>withStudioEdit(root,async()=>{check();assertStudioPath(cache,root);await writeAtomic(cache,JSON.stringify(job));check();});
 if(!saved)await persist();
 const lines=[],requestIds=[];
 for(let index=0;index<count;index++){
  check();const chunk=job.chunks[index],offset=index*max;let result=chunk.result;
  requestIds.push(chunk.requestId);
  if(!result){
   const audioPath='.film/studybuddy-speech/'+chunk.requestId+'.wav',file=assertStudioPath(resolve(root,audioPath),root);
   try{
    await execute(videoProgram('ffmpeg'),['-y','-v','error','-ss',String(offset),'-i',source,'-t',String(Math.min(max,duration-offset)),'-vn','-map','0:a:0','-ac','1','-ar','16000','-c:a','pcm_s16le','-fflags','+bitexact','-flags:a','+bitexact','-f','wav',file],{signal,windowsHide:true,maxBuffer:1024*1024});check();
    assertStudioPath(file,root);const info=await stat(file);if(!info.isFile()||info.size<46||info.size>choice.parameters.maxFileBytes)throw new Error('VIDEO_SPEECH_INPUT_INVALID');
    const bytes=await readFile(file);check();
    const response=await context.capabilities.request({scope,requestId:chunk.requestId,operation:'asr',authorityRef:choice.authorityRef,input:{native:{audioPath,bytes:bytes.length,sha256:hash(bytes)}}},signal);check();
    result=timing(response.data,chunk.requestId,choice.modelId,max);chunk.result=result;await persist();
   }finally{assertStudioPath(file,root);await rm(file,{force:true});}
  }
  timing(result,chunk.requestId,choice.modelId,max);
  const words=result.segments.map(word=>({token:word.text,startSec:word.start,endSec:word.end}));
  for(const line of spokenLines(result.text,words,result.duration*1000))lines.push({...line,startMs:line.startMs+offset*1000,endMs:line.endMs+offset*1000,...(line.marks?{marks:line.marks.map(mark=>({...mark,startMs:mark.startMs+offset*1000}))}:{})});
 }
 return withStudioEdit(root,async()=>{
  check();readable(root,src);const after=await stat(source);
  if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||await optionalText(destination)!==original)throw new Error('VIDEO_TRANSCRIPT_CONFLICT');
  assertStudioPath(destination,root);await writeTranscript(root,src,{lines});check();
  return{src,requestIds,artifacts:[{relativePath:transcriptPath(src),sha256:hash(await readFile(destination)),mime:'text/vtt'}]};
 });
}
/** Transcribe only an admitted source, retaining the original VTT format and edit transaction. */
export function transcribeNativeSpeech(root,src,requestedSignal,{userRequested=false}={}){
 const context=currentStudioContext();if(!context||context.signal.aborted)throw new Error('VIDEO_SCOPE_REVOKED');
 root=assertStudioPath(resolve(root));
 const projectSignal=studioProjectSignal(root),signal=requestedSignal?AbortSignal.any([projectSignal,requestedSignal]):projectSignal;
 let jobs=active.get(context);if(!jobs){jobs=new Map();active.set(context,jobs);}
 const key=JSON.stringify([root,currentStudioCaller()?.sessionId,src,userRequested]);if(jobs.has(key))return jobs.get(key).pending;
 const result=withStudioProject(root,()=>transcribe(root,src,context,signal,userRequested));jobs.set(key,{root,pending:result});
 void result.finally(()=>{if(jobs.get(key)?.pending===result)jobs.delete(key);}).catch(()=>{});
 return result;
}
export async function waitForNativeSpeech(context,root){await Promise.allSettled([...(active.get(context)?.values()??[])].filter(row=>root===undefined||row.root===root).map(row=>row.pending));}
