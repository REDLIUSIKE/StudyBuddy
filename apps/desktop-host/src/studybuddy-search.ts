import {AsyncLocalStorage} from 'node:async_hooks'
import {createHash,randomUUID} from 'node:crypto'
import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import {WebError} from '@deepseek-ai/dsh-web'
import type {WebSearchRequest} from '@deepseek-ai/dsh-web'
import {parseNativeBuiltinHostContextV1,parseToolSearchRequestV1,parseToolSearchResultV1} from '@studybuddy/contracts'
import type {NativeBuiltinHostContextV1,ToolSearchRequestV1,ToolSearchResultV1} from '@studybuddy/contracts'
import {parseSearchInvocation} from '@deepseek-ai/dsh-web-search-studybuddy'
import type {SearchRpcId} from '@deepseek-ai/dsh-web-search-studybuddy'
import type {StudyBuddySearchPort} from '@deepseek-ai/dsh-web-search-studybuddy'
import type {SessionId} from '@deepseek-ai/dsh-session'
import type {ToolCallId} from '@deepseek-ai/dsh-llm'
interface CallScope {sessionId:SessionId;callId:ToolCallId;queries:readonly string[]}
interface Pending {resolve(value:ToolSearchResultV1):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>;context:NativeBuiltinHostContextV1;cleanup():void}
/** Durable identity follows the original tool call and query slot, never the text. */
export function searchOperationUUID(account:string,session:string,call:string,index:number):string {
 const bytes=createHash('sha256').update(JSON.stringify(['studybuddy-search-v1',account,session,call,index])).digest().subarray(0,16)
 bytes[6]=((bytes[6]??0)&15)|64;bytes[8]=((bytes[8]??0)&63)|128
 const text=bytes.toString('hex');return `${text.slice(0,8)}-${text.slice(8,12)}-${text.slice(12,16)}-${text.slice(16,20)}-${text.slice(20)}`
}
/** Main-owned scope and a private IPC port. It never contains a usable Key. */
export class StudyBuddySearchHostControl implements StudyBuddySearchPort {
 private context:NativeBuiltinHostContextV1|undefined
 private readonly calls=new AsyncLocalStorage<CallScope>()
 private readonly pending=new Map<SearchRpcId,Pending>()
 constructor(ctx:Context,private readonly hostGeneration:string,private readonly send:(message:object)=>Promise<void>){
  ctx.on('tools/execute',async(exec,next)=>{
   if(exec.name!=='web_search')return next()
   if(!exec.agent||ctx.sessions.get(exec.agent.id)===undefined)throw new WebError('Search requires an original conversation.','STUDYBUDDY_SEARCH_SCOPE_REVOKED')
   const args=exec.arguments
   if(!args||typeof args!=='object'||!('queries' in args)||!Array.isArray(args.queries)||args.queries.some(query=>typeof query!=='string'))throw new WebError('Search query list is invalid.','STUDYBUDDY_SEARCH_INVALID')
   return this.calls.run({sessionId:exec.agent.id,callId:exec.callId,queries:[...new Set<string>(args.queries)]},()=>next())
  })
  ctx.effect(()=>()=>this.setScope(null))
 }
 available():boolean{return this.context!==undefined}
 setScope(value:unknown):void{
  const next=value===null?undefined:parseNativeBuiltinHostContextV1(value)
  if(next&&next.hostGeneration!==this.hostGeneration)throw Error('STUDYBUDDY_SEARCH_SCOPE_REVOKED')
  if(JSON.stringify(next)!==JSON.stringify(this.context))for(const [id,pending] of this.pending){clearTimeout(pending.timer);pending.cleanup();pending.reject(new WebError('Account changed while waiting for search.','STUDYBUDDY_SEARCH_SCOPE_REVOKED'));this.pending.delete(id)}
  this.context=next
 }
 request(value:WebSearchRequest):ToolSearchRequestV1{
  const call=this.calls.getStore(),context=this.context
  const index=call?.queries.indexOf(value.query)??-1
  if(!call||!context||index<0)throw new WebError('Search operation is not bound to a tool call.','STUDYBUDDY_SEARCH_SCOPE_REVOKED')
  return parseToolSearchRequestV1({operationId:searchOperationUUID(context.scope.accountId,call.sessionId,call.callId,index),textQuery:value.query,maxResults:value.maxResults??8})
 }
 execute(request:ToolSearchRequestV1,signal?:AbortSignal):Promise<ToolSearchResultV1>{
  signal?.throwIfAborted();if(!this.context)return Promise.reject(new WebError('Search account is unavailable.','STUDYBUDDY_SEARCH_SCOPE_REVOKED'))
  const invocation=parseSearchInvocation({rpcId:randomUUID(),context:this.context,request})
  return new Promise((resolve,reject)=>{
   const abort=()=>{const pending=this.pending.get(invocation.rpcId);if(!pending)return;this.pending.delete(invocation.rpcId);clearTimeout(pending.timer);pending.cleanup();void this.send({type:'search-cancel',request:invocation}).catch((error:unknown)=>{void error;/* Main also fences a disconnected child. */});reject(new WebError('Search wait cancelled; the same operation can be recovered.','STUDYBUDDY_SEARCH_CANCELLED'))}
   const timer=setTimeout(abort,95000);timer.unref()
   this.pending.set(invocation.rpcId,{resolve,reject,timer,context:invocation.context,cleanup:()=>signal?.removeEventListener('abort',abort)})
   signal?.addEventListener('abort',abort,{once:true})
   void this.send({type:'search-request',request:invocation}).catch((error:unknown)=>{const pending=this.pending.get(invocation.rpcId);if(!pending)return;this.pending.delete(invocation.rpcId);clearTimeout(timer);pending.cleanup();reject(new WebError('Search private channel is unavailable.','STUDYBUDDY_SEARCH_UNKNOWN',{cause:error}))})
  })
 }
 result(message:unknown):void{
  if(!message||typeof message!=='object'||!('rpcId' in message)||typeof message.rpcId!=='string')return
  // Admit the nominal correlation id only after the private request parser.
  const matches=[...this.pending].find(([id])=>id===message.rpcId);if(!matches)return
  const [id,pending]=matches;this.pending.delete(id);clearTimeout(pending.timer);pending.cleanup()
  if(JSON.stringify(pending.context)!==JSON.stringify(this.context)){pending.reject(new WebError('Search scope changed.','STUDYBUDDY_SEARCH_SCOPE_REVOKED'));return}
  if('error' in message){pending.reject(new WebError('Search is unavailable.','STUDYBUDDY_SEARCH_UNKNOWN'));return}
  if(!('data' in message)){pending.reject(new WebError('Search response is invalid.','STUDYBUDDY_SEARCH_INVALID'));return}
  try{pending.resolve(parseToolSearchResultV1(message.data))}catch(error){pending.reject(new WebError('Search response is invalid.','STUDYBUDDY_SEARCH_INVALID',{cause:error}))}
 }
}
