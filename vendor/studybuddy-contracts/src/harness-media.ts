/** Private Harness media bridge. Never register this contract on a renderer RPC surface. */
import type { OwnedScope } from './harness-account.js';
import { parseNativeBuiltinHostContextV1 } from './native-builtin-consumer-v1.js';

import {HARNESS_IMAGE_MODELS,HARNESS_VIDEO_MODEL} from './model-membership.generated.js';
export {HARNESS_IMAGE_MODELS,HARNESS_VIDEO_MODEL,HARNESS_TTS_MODELS,HARNESS_VIDEO_TTS_MODELS,HARNESS_ASR_MODELS,HARNESS_VIDEO_ASR_MODELS,HARNESS_AUDIO_MODELS} from './model-membership.generated.js';
export type HarnessImageModel = typeof HARNESS_IMAGE_MODELS[number];
export type HarnessMediaKind = 'image'|'video';
export interface HarnessMediaContextV1 {scope:OwnedScope;hostGeneration:string;sessionId:string}
export interface HarnessImageInputV1 {requestId:string;modelId:HarnessImageModel;prompt:string;size:'1K'|'1.5K'|'2K'}
export interface HarnessVideoInputV1 {requestId:string;modelId:typeof HARNESS_VIDEO_MODEL;prompt:string;duration:number;resolution:'480p'|'720p'|'1080p';ratio:'16:9'|'4:3'|'1:1'|'3:4'|'9:16'|'21:9';generateAudio:boolean}
export interface HarnessMediaLookupV1 {requestId:string;kind:HarnessMediaKind}
export type HarnessMediaInvocationV1 = {schemaVersion:1;rpcId:string;context:HarnessMediaContextV1}&(
 {operation:'catalog';input:null} |
 {operation:'create-image';input:HarnessImageInputV1} |
 {operation:'create-video';input:HarnessVideoInputV1} |
 {operation:'status'|'content';input:HarnessMediaLookupV1}
);
export interface HarnessMediaTaskV1 {
 schemaVersion:1;requestId:string;sessionId:string;kind:HarnessMediaKind;modelId:string;
 state:'queued'|'in_progress'|'completed'|'failed'|'unknown';contentAvailable:boolean;
}
export interface HarnessMediaContentV1 {
 schemaVersion:1;requestId:string;kind:HarnessMediaKind;mediaType:'image/png'|'image/jpeg'|'image/webp'|'video/mp4';base64:string;bytes:number;sha256:string;
}
const invalid=():never=>{throw Error('HARNESS_MEDIA_REQUEST_INVALID');};
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const r=value as Record<string,unknown>;if(Object.keys(r).length!==keys.length||Object.keys(r).some(k=>!keys.includes(k)))return invalid();return r;
}
function uuid(value:unknown):string{
 if(typeof value!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))return invalid();return value;
}
function member<T extends string>(value:unknown,values:readonly T[]):T{
 if(typeof value!=='string'||!values.includes(value as T))return invalid();return value as T;
}
function prompt(value:unknown):string{
 if(typeof value!=='string'||!value.trim()||value.length>10000||value.includes('\u0000'))return invalid();return value;
}
export function parseHarnessMediaContextV1(value:unknown):HarnessMediaContextV1{
 const r=object(value,['scope','hostGeneration','sessionId']);
 const owner=parseNativeBuiltinHostContextV1({scope:r.scope,hostGeneration:r.hostGeneration});
 if(typeof r.sessionId!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/.test(r.sessionId))return invalid();
 return {...owner,sessionId:r.sessionId};
}
export function parseHarnessImageInputV1(value:unknown):HarnessImageInputV1{
 const r=object(value,['requestId','modelId','prompt','size']);
 return {requestId:uuid(r.requestId),modelId:member(r.modelId,HARNESS_IMAGE_MODELS),prompt:prompt(r.prompt),size:member(r.size,['1K','1.5K','2K'])};
}
export function parseHarnessVideoInputV1(value:unknown):HarnessVideoInputV1{
 const r=object(value,['requestId','modelId','prompt','duration','resolution','ratio','generateAudio']);
 if(!Number.isSafeInteger(r.duration)||Number(r.duration)<4||Number(r.duration)>30||typeof r.generateAudio!=='boolean')return invalid();
 return {requestId:uuid(r.requestId),modelId:member(r.modelId,[HARNESS_VIDEO_MODEL]),prompt:prompt(r.prompt),duration:Number(r.duration),
 resolution:member(r.resolution,['480p','720p','1080p']),ratio:member(r.ratio,['16:9','4:3','1:1','3:4','9:16','21:9']),generateAudio:r.generateAudio};
}
export function parseHarnessMediaInvocationV1(value:unknown):HarnessMediaInvocationV1{
 const r=object(value,['schemaVersion','rpcId','context','operation','input']);if(r.schemaVersion!==1)return invalid();
 const base={schemaVersion:1 as const,rpcId:uuid(r.rpcId),context:parseHarnessMediaContextV1(r.context)};
 if(r.operation==='catalog'){if(r.input!==null)return invalid();return {...base,operation:r.operation,input:null};}
 if(r.operation==='create-image')return {...base,operation:r.operation,input:parseHarnessImageInputV1(r.input)};
 if(r.operation==='create-video')return {...base,operation:r.operation,input:parseHarnessVideoInputV1(r.input)};
 if(r.operation==='status'||r.operation==='content'){
  const input=object(r.input,['requestId','kind']);
  return {...base,operation:r.operation,input:{requestId:uuid(input.requestId),kind:member(input.kind,['image','video'])}};
 }
 return invalid();
}
