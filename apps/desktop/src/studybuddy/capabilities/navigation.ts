import {randomUUID} from 'node:crypto'
import type {HarnessCapabilityCallerV1 as Caller,HarnessCapabilityTargetV1 as Target,OwnedScope} from '@studybuddy/contracts'
interface Options{assert(caller:Caller):void;notify(caller:Caller,target:Target,id:string):void;open(caller:Caller,target:Target,signal:AbortSignal):Promise<void>}
/** A trusted shell action selects the existing page; the domain performs its original project transition. */
export class CapabilityProjectNavigation{
 private readonly pending=new Map<string,{caller:Caller;target:Target;signal:AbortSignal;resolve():void;reject(error:unknown):void;claimed:boolean}>()
 constructor(private readonly options:Options){}
 async open(caller:Caller,target:Target,signal:AbortSignal){
  this.options.assert(caller);signal.throwIfAborted();if(this.pending.size>=16)throw Error('CAPABILITY_OPEN_LIMIT')
  const id=randomUUID(),done=Promise.withResolvers<void>(),row={caller:structuredClone(caller),target:structuredClone(target),signal,...done,claimed:false};this.pending.set(id,row)
  const abort=()=>done.reject(Error('CAPABILITY_OPEN_CANCELLED')),timer=setTimeout(()=>done.reject(Error('CAPABILITY_OPEN_TIMEOUT')),45000);signal.addEventListener('abort',abort,{once:true})
  try{this.options.notify(caller,target,id);await done.promise;this.options.assert(caller);signal.throwIfAborted()}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);this.pending.delete(id)}
 }
 async complete(id:string,scope:OwnedScope){
  const row=this.pending.get(id);if(!row||row.claimed||JSON.stringify(row.caller.scope)!==JSON.stringify(scope))throw Error('CAPABILITY_OPEN_NOT_AUTHORIZED')
  this.options.assert(row.caller);row.signal.throwIfAborted();row.claimed=true
  try{await this.options.open(row.caller,row.target,row.signal);this.options.assert(row.caller);row.signal.throwIfAborted();row.resolve()}catch(error){row.reject(error);throw error}
 }
 revoke(){for(const row of this.pending.values())row.reject(Error('CAPABILITY_SCOPE_REVOKED'));this.pending.clear()}
}
