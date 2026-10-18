import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { currentStudioContext,assertStudioPath,withStudioProject,studioProjectSignal } from './context.mjs';
import { HttpError,json,readJson } from '../http.mjs';
import {transcribeNativeSpeech} from './native-speech.mjs';
import {nativeSubtitleTranslator} from './native-translation.mjs';
import {landNativeTts} from './native-tts.mjs';

function context(root){
  const current=currentStudioContext();
  if(!current||current.signal.aborted)throw new Error('VIDEO_SCOPE_REVOKED');
  const path=assertStudioPath(resolve(root));
  const scope=current.scopeForRoot?.(path);
  if(!scope)throw new Error('VIDEO_PROJECT_NOT_ADMITTED');
  return{current,scope,path};
}
/** The native tool supplies an explicit catalog choice and request identity. No provider guessing. */
export async function runGet(root,verb,given,{signal}={}){
  const {current,scope,path}=context(root);
  if(!given||typeof given!=='object'||Array.isArray(given)||typeof given.authorityRef!=='string'||typeof given.requestId!=='string'||!('input'in given)||Object.keys(given).some(key=>!['authorityRef','requestId','input'].includes(key)))throw new Error('VIDEO_AUTHORITY_REQUIRED');
  const owned=studioProjectSignal(path),combined=signal?AbortSignal.any([signal,owned]):owned;
  const result=await withStudioProject(path,async()=>{
    const value=await current.capabilities.request({scope,operation:verb,requestId:given.requestId,authorityRef:given.authorityRef,input:given.input},combined);combined.throwIfAborted();
    return verb==='tts'?landNativeTts(path,given.input,value,combined):value;
  });
  return JSON.stringify(result);
}
export function createAsks(){return{pending:()=>[],answer:()=>false,ask:async()=>null,tell:()=>{}};}
export async function subtitleTranscriber(){return (root,src,signal)=>transcribeNativeSpeech(root,src,signal,{userRequested:true});}
export const subtitleTranslator=nativeSubtitleTranslator;
export async function getRoute(req,res,parts){
  if(parts.length||req.method!=='POST')throw new HttpError(403,'VIDEO_NATIVE_SERVICES_MANAGED',{code:'VIDEO_NATIVE_SERVICES_MANAGED'});
  const body=await readJson(req);
  if(typeof body.folder!=='string'||typeof body.verb!=='string')throw new HttpError(400,'VIDEO_REQUEST_INVALID');
  try{return json(res,200,{ok:true,text:await runGet(body.folder,body.verb,body.args)});}
  catch(error){return json(res,200,{ok:false,code:1,text:error instanceof Error?error.message:'VIDEO_CAPABILITY_FAILED'});}
}
/** Native catalog calls do not create media requests. */
export async function nativeCatalog(root,signal){const{current,scope}=context(root);return current.capabilities.request({scope,requestId:randomUUID(),operation:'catalog',input:{}},signal??current.signal);}
