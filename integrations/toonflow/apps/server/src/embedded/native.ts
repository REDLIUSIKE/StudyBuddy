export type NativeOperation = "question" | "temporary" | "budget";
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
export interface NativeCaller {sessionId:string;callId:string;directory:string;grantRef?:string}
const callers=new AsyncLocalStorage<NativeCaller>(),grants=new Map<string,Readonly<NativeCaller>>();
export const currentNativeCaller=()=>callers.getStore();
export function withNativeCaller<T>(caller:NativeCaller,run:()=>T):T{
 const snapshot=Object.freeze({...caller});
 if(snapshot.grantRef!==undefined){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(snapshot.grantRef))throw Error('AIGC_CALLER_INVALID');
  const old=grants.get(snapshot.grantRef);if(old&&JSON.stringify(old)!==JSON.stringify(snapshot))throw Error('AIGC_CALLER_CONFLICT');
  if(!old&&grants.size>=2048)throw Error('AIGC_CALLER_LIMIT');grants.set(snapshot.grantRef,snapshot);
 }
 return callers.run(snapshot,run);
}
export function admitNativeCaller(grantRef:string):Readonly<NativeCaller>{const caller=grants.get(grantRef);if(!caller)throw Error('AIGC_CALLER_REVOKED');return caller;}
export function releaseNativeCaller(grantRef:string):void{grants.delete(grantRef);}
export async function admitNativeMedia(directory:string,mediaType:string,modelId:string,requestId:string|undefined,signal?:AbortSignal){
 const caller=currentNativeCaller();if(!caller?.grantRef)return requestId;
 const admitted=admitNativeCaller(caller.grantRef);if(admitted.directory!==directory)throw Error('AIGC_CALLER_DIRECTORY_MISMATCH');
 if(!requestId){const hash=createHash('sha256').update(JSON.stringify([admitted.sessionId,admitted.callId,mediaType,modelId])).digest('hex').slice(0,32).split('');hash[12]='4';hash[16]='8';const text=hash.join('');requestId=[text.slice(0,8),text.slice(8,12),text.slice(12,16),text.slice(16,20),text.slice(20)].join('-');}
 await invokeNative('budget',{requestId,modelId,fundingSource:'platform'},signal);return requestId;
}
export type NativeRequest = (operation: NativeOperation, input: unknown, signal: AbortSignal) => Promise<unknown>;
let request: NativeRequest | undefined;
export function configureNative(value: NativeRequest) {
  if (request) throw new Error("AIGC_NATIVE_ALREADY_CONFIGURED");
  request = value;
  return () => { if (request === value) {request = undefined;grants.clear();} };
}
export function invokeNative(operation: NativeOperation, input: unknown, signal: AbortSignal = new AbortController().signal) {
  signal.throwIfAborted();
  if (!request) throw new Error("AIGC_NATIVE_UNAVAILABLE");
  const caller=callers.getStore();
  return request(operation, caller?.grantRef&&(operation==='temporary'||operation==='budget')?{...(input as object),capabilityCaller:caller}:input, signal);
}
