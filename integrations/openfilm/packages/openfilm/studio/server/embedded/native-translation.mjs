import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {inside} from '../files.mjs';
import {transcriptPath} from '../transcripts.mjs';
import {writeAtomic} from '../atomic.mjs';
import {currentStudioContext,currentStudioCaller,assertStudioPath,withStudioEdit,studioProjectSignal,withStudioProject} from './context.mjs';
const active=new WeakMap(),hash=value=>createHash('sha256').update(value).digest('hex');
async function optional(file){try{return await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function lines(value,count){if(!Array.isArray(value)||value.length!==count||value.some(text=>typeof text!=='string'||!text.trim()||text.length>20000||text.includes('\0'))||Buffer.byteLength(JSON.stringify(value))>256*1024)throw new Error('VIDEO_TRANSLATION_RESULT_INVALID');return value;}
async function translate(context,root,job){
 const {src,language}=job,scope=context.scopeForRoot?.(root);if(!scope)throw new Error('VIDEO_PROJECT_NOT_ADMITTED');
 if(typeof src!=='string'||!src||typeof language!=='string'||!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/.test(language)||!Array.isArray(job.lines)||!job.lines.length||job.lines.length>10000||job.lines.some(text=>typeof text!=='string'||!text||text.length>20000))throw new Error('VIDEO_TRANSLATION_INPUT_INVALID');
 const input={language,lines:job.lines};if(Buffer.byteLength(JSON.stringify(input))>128*1024)throw new Error('VIDEO_TRANSLATION_INPUT_TOO_LARGE');
 const identity=JSON.stringify(scope),projectSignal=studioProjectSignal(root),signal=job.signal?AbortSignal.any([projectSignal,job.signal]):projectSignal;
 const check=()=>{signal.throwIfAborted();if(JSON.stringify(context.scopeForRoot?.(root))!==identity)throw new Error('VIDEO_SCOPE_REVOKED');};check();
 assertStudioPath(inside(root,transcriptPath(src,language)),root);
 const key=hash(JSON.stringify({project:scope.projectId,callerSessionId:currentStudioCaller()?.sessionId??scope.sessionId,src,...input})),file=assertStudioPath(resolve(root,'.film/studybuddy-translations/'+key+'.json'),root);
 const record=await withStudioEdit(root,async()=>{
  check();assertStudioPath(file,root);const existing=await optional(file);if(existing&&Buffer.byteLength(existing)>512*1024)throw new Error('VIDEO_TRANSLATION_CACHE_INVALID');
  const row=existing?JSON.parse(existing):{schemaVersion:1,key,requestId:randomUUID()};
  if(row.schemaVersion!==1||row.key!==key||typeof row.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.requestId))throw new Error('VIDEO_TRANSLATION_CACHE_INVALID');
  if(!existing){await mkdir(dirname(file),{recursive:true});assertStudioPath(file,root);check();await writeAtomic(file,JSON.stringify(row));}return row;
 });
 if(record.lines!==undefined){check();return lines(record.lines,input.lines.length);}
 const result=await context.capabilities.request({scope,requestId:record.requestId,operation:'translate',input},signal);check();
 const translated=lines(result.data?.lines,input.lines.length);
 await withStudioEdit(root,async()=>{check();assertStudioPath(file,root);await writeAtomic(file,JSON.stringify({...record,lines:translated}));});check();return translated;
}
/** Keep translation in the admitted native Session; only local subtitle text is cached here. */
export async function nativeSubtitleTranslator(root){
 const context=currentStudioContext();if(!context||context.signal.aborted)throw new Error('VIDEO_SCOPE_REVOKED');root=assertStudioPath(resolve(root));
 return job=>{
  const key=JSON.stringify([root,currentStudioCaller()?.sessionId,job.src,job.language,job.lines]);let jobs=active.get(context);if(!jobs){jobs=new Map();active.set(context,jobs);}if(jobs.has(key))return jobs.get(key).pending;
  const pending=withStudioProject(root,()=>translate(context,root,job));jobs.set(key,{root,pending});void pending.finally(()=>{if(jobs.get(key)?.pending===pending)jobs.delete(key);}).catch(()=>{});return pending;
 };
}
export async function waitForNativeTranslations(context,root){await Promise.allSettled([...(active.get(context)?.values()??[])].filter(row=>root===undefined||row.root===root).map(row=>row.pending));}
