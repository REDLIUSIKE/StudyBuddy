import {createHash,randomUUID} from 'node:crypto';
import {link,lstat,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inside,readable} from '../files.mjs';
import {parseVtt,spokenLines,stripAudioTags,transcriptPath,vttOf} from '../transcripts.mjs';
import {assertStudioPath,currentStudioContext,withStudioEdit} from './context.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/;
function timingLines(prompt,timing){
 if(typeof prompt!=='string'||!timing||!Number.isFinite(timing.durationMs)||timing.durationMs<=0||timing.durationMs>86400000||!Array.isArray(timing.words)||!timing.words.length||timing.words.length>20000)return null;
 const source=stripAudioTags(prompt),words=[];let cursor=0,previous=-1;
 for(const word of timing.words){
  if(!word||typeof word.token!=='string'||!word.token.trim()||!Number.isFinite(word.startMs)||!Number.isFinite(word.endMs)||word.startMs<0||word.startMs<previous||word.endMs<word.startMs||word.endMs>timing.durationMs)return null;
  const at=source.indexOf(word.token,cursor);if(at<0)return null;
  cursor=at+word.token.length;previous=word.startMs;words.push({token:word.token,startSec:word.startMs/1000,endSec:word.endMs/1000});
 }
 // Every supplied word is aligned before using the original line cutter, so its untimed fallback cannot run.
 const lines=spokenLines(source,words,timing.durationMs);
 return lines.length&&lines.some(line=>line.marks?.length)?lines:null;
}
/** Publish a first VTT beside native TTS audio. Existing manual files always win. */
export async function landNativeTts(root,input,result,signal){
 const context=currentStudioContext(),scope=context?.scopeForRoot?.(root),identity=JSON.stringify(scope);
 const check=()=>{signal.throwIfAborted();if(!scope||JSON.stringify(context?.scopeForRoot?.(root))!==identity)throw Error('VIDEO_SCOPE_REVOKED');};
 check();if(result?.data?.state!=='completed')return result;
 const artifact=result.artifacts?.length===1?result.artifacts[0]:null;
 if(!artifact||typeof artifact.relativePath!=='string'||!artifact.relativePath.startsWith('assets/')||!/^audio\//.test(artifact.mime)||!/^[a-f0-9]{64}$/.test(artifact.sha256))throw Error('VIDEO_NATIVE_RESPONSE_INVALID');
 const source=readable(root,artifact.relativePath),info=await lstat(source);check();
 if(!info.isFile()||info.isSymbolicLink()||info.size>64*1024*1024||hash(await readFile(source))!==artifact.sha256)throw Error('VIDEO_ASSET_CONFLICT');
 const destination=assertStudioPath(inside(root,transcriptPath(artifact.relativePath)),root);
 const lines=result.data.wordTimestampsStatus==='available'?timingLines(input?.native?.prompt,result.data.timing):null;
 return withStudioEdit(root,async()=>{
  check();assertStudioPath(destination,root);
  let status='unavailable',body;
  try{body=await readFile(destination,'utf8');if(Buffer.byteLength(body)>4*1024*1024||!parseVtt(body).lines.length)throw Error('VIDEO_TRANSCRIPT_CONFLICT');status='preserved';}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(body===undefined&&lines){
   const temporary=destination+'.'+randomUUID()+'.tmp';
   try{await writeFile(temporary,vttOf(lines),{flag:'wx'});check();assertStudioPath(destination,root);await link(temporary,destination);status='created';}
   catch(error){if(error.code!=='EEXIST')throw error;status='preserved';}
   finally{assertStudioPath(temporary,root);await rm(temporary,{force:true});}
  }
  check();
  const extra=status==='unavailable'?[]:[{relativePath:transcriptPath(artifact.relativePath),mime:'text/vtt',sha256:hash(await readFile(destination))}];
  return{...result,data:{...result.data,subtitlesStatus:status},artifacts:[...result.artifacts,...extra]};
 });
}
/** Prevent an agent from silently buying ASR to fill missing TTS timing. Only the original manual subtitle button can opt in. */
export async function assertNativeTtsAsrAllowed(root,src,source){
 const directory=assertStudioPath(resolve(root,'.film/studybuddy-media'),root);
 let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
 if(entries.length>10000)throw Error('VIDEO_SPEECH_SOURCE_REVIEW_REQUIRED');
 const normalize=value=>process.platform==='win32'?resolve(root,value).toLowerCase():resolve(root,value);
 let read=0;
 for(const entry of entries){
  if(!uuid.test(entry.name))continue;
  const file=assertStudioPath(resolve(directory,entry.name),root),info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024||(read+=info.size)>64*1024*1024)throw Error('VIDEO_SPEECH_SOURCE_REVIEW_REQUIRED');
  const row=JSON.parse(await readFile(file,'utf8'));
  if(row.state!=='ready'||!row.details||!['available','unavailable'].includes(row.details.wordTimestampsStatus)||typeof row.artifact?.relativePath!=='string'||normalize(row.artifact.relativePath)!==normalize(src))continue;
  const audio=await lstat(source);
  if(audio.size===row.bytes&&audio.size<=64*1024*1024&&hash(await readFile(source))===row.artifact.sha256)throw Error('VIDEO_TTS_SUBTITLES_UNAVAILABLE');
 }
}
