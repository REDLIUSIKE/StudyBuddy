import {createHash,randomUUID} from 'node:crypto'
import {parseHarnessCapabilityInvocationV1,parseHarnessCapabilityResultV1,parseNativeBuiltinHostContextV1} from '@studybuddy/contracts'
import type {HarnessCapabilityCallerV1 as Caller,HarnessCapabilityInvocationV1 as Invocation,HarnessCapabilityResultV1 as Result,HarnessCapabilityTargetV1 as Target,HarnessCapabilityJsonV1 as Json,NativeBuiltinHostContextV1} from '@studybuddy/contracts'
interface Pending {request:Invocation;resolve(value:Result):void;reject(error:Error):void;cleanup():void}
const stableId=(value:unknown)=>{const bytes=createHash('sha256').update(JSON.stringify(value)).digest().subarray(0,16);bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;const s=bytes.toString('hex');return`${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`}
/** Private IPC observation only; unknown mutations retain their original identity and are never submitted twice. */
export class CapabilityRpc {
 private scope:NativeBuiltinHostContextV1|null=null
 private readonly pending=new Map<string,Pending>()
 private readonly observations=new Map<string,{hash:string;promise:Promise<Result>}>()
 constructor(private readonly hostGeneration:string,private readonly send:(value:object)=>Promise<void>){}
 owner=()=>this.scope?structuredClone(this.scope):null
 private assert(caller:Caller):void{if(!this.scope||this.scope.hostGeneration!==caller.hostGeneration||JSON.stringify(this.scope.scope)!==JSON.stringify(caller.scope))throw Error('CAPABILITY_SCOPE_REVOKED')}
 setScope(value:unknown):void{
  const next=value===null?null:parseNativeBuiltinHostContextV1(value)
  if(next&&next.hostGeneration!==this.hostGeneration)throw Error('CAPABILITY_SCOPE_REVOKED')
  if(JSON.stringify(next)===JSON.stringify(this.scope))return
  this.scope=next
  for(const row of [...this.pending.values()])row.reject(Error('CAPABILITY_SCOPE_REVOKED'))
  this.observations.clear()
 }
 invoke(caller:Caller,operation:Invocation['operation'],target:Target|null,input:Json,signal:AbortSignal):Promise<Result>{return this.request({schemaVersion:1,rpcId:randomUUID(),caller,operation,target,input},signal)}
 request(value:Invocation,signal:AbortSignal):Promise<Result>{
  const request=parseHarnessCapabilityInvocationV1(value);this.assert(request.caller);signal.throwIfAborted()
  const mutation=['bind','execute','import','cancel'].includes(request.operation)
  if(mutation)request.rpcId=stableId([request.caller,request.operation,request.target,request.input])
  const hash=createHash('sha256').update(JSON.stringify(request)).digest('hex'),old=this.observations.get(request.rpcId)
  if(old){if(old.hash!==hash)throw Error('CAPABILITY_RPC_CONFLICT');return old.promise}
  if(this.pending.size>=128||this.observations.size>=8192)throw Error('CAPABILITY_RPC_LIMIT')
  const promise=new Promise<Result>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.pending.delete(request.rpcId)}
   const stop=(error:Error)=>{cleanup();void this.send({type:'capability-cancel',rpcId:request.rpcId,caller:request.caller}).catch(()=>{});reject(error)}
   const abort=()=>stop(Error(mutation?'CAPABILITY_OUTCOME_UNKNOWN:capability-call:'+request.rpcId:'CAPABILITY_CALL_CANCELLED'))
   const timer=setTimeout(abort,300000);timer.unref()
   this.pending.set(request.rpcId,{request,resolve:result=>{cleanup();resolve(result)},reject:stop,cleanup})
   signal.addEventListener('abort',abort,{once:true})
   void this.send({type:'capability-request',request}).catch(()=>stop(Error(mutation?'CAPABILITY_OUTCOME_UNKNOWN:capability-call:'+request.rpcId:'CAPABILITY_CHANNEL_CLOSED')))
  })
  if(mutation)this.observations.set(request.rpcId,{hash,promise})
  return promise
 }
 result(value:unknown):void{
  if(!value||typeof value!=='object'||!('rpcId'in value)||typeof value.rpcId!=='string')return
  const row=this.pending.get(value.rpcId);if(!row)return
  try{this.assert(row.request.caller);if('error'in value&&value.error!==undefined)throw Error(typeof value.error==='string'&&/^[A-Z0-9_:.-]{1,256}$/.test(value.error)?value.error:'CAPABILITY_OPERATION_FAILED');if(!('data'in value))throw Error('CAPABILITY_RESPONSE_INVALID');row.resolve(parseHarnessCapabilityResultV1(value.data))}
  catch(error){row.reject(error instanceof Error?error:Error('CAPABILITY_RESPONSE_INVALID'))}
 }
 owns(caller:Caller):boolean{return [...this.pending.values()].some(row=>JSON.stringify(row.request.caller)===JSON.stringify(caller))}
 async close():Promise<void>{this.setScope(null)}
}
