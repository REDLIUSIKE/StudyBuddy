/** Original specialist tasks use the actual native delegation service and exact model directory. */
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {Context} from '@deepseek-ai/cordis'
import {installModelSelection,type ModelSelection} from '@deepseek-ai/dsh-agent'
import {ReasoningEffortId} from '@deepseek-ai/dsh-llm'
import {SessionId} from '@deepseek-ai/dsh-session'
import type {Session,SessionEvent} from '@deepseek-ai/dsh-session'
import type {SubagentActivation} from '@deepseek-ai/dsh-subagent'
import {parseHarnessResearchContextV1,type HarnessResearchContextV1} from '@studybuddy/contracts'
import {lstat,realpath} from 'node:fs/promises'
import {PERSONA_PREFIX_SECTION,renderPrompt} from '@deepseek-ai/dsh-system-prompt'

interface Options {current(context:HarnessResearchContextV1):boolean;directory(context:HarnessResearchContextV1):string;catalog():Promise<{groups:readonly {id:string;models:readonly {id:string;reasoning?:{efforts:readonly {id:string}[]}}[]}[]}>;composeChild?(context:HarnessResearchContextV1,agent:NonNullable<ReturnType<Context['agents']['get']>>):Promise<void>;maxDepth?:number}
interface Start {action:'start';operationId:string;label:string;prompt:string;persona:string;modelRef:string|null;reasoningEffort:string|null;tools:string[]|null;inheritParentContext:boolean;maxTokens:number;systemPromptMode?:'append'|'replace';inheritProjectContext?:boolean;inheritSkills?:boolean}
type Command=Start|{action:'inspect'|'cancel'|'transcript';operationId:string}|{action:'steer';operationId:string;requestId:string;message:string}
interface Receipt {operationId:string;nativeSessionId:string;parentSessionId:string;state:'admitting'|'running'|'completed'|'failed'|'unknown';selection:Readonly<ModelSelection>;tools:string[];text?:string;error?:string}
interface Row {context:HarnessResearchContextV1;signature:string;request:Start;receipt:Receipt;file:string;controller:AbortController;activation?:SubagentActivation;session?:Session;settled:Promise<void>}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
function parse(value:unknown):Command {
 const invalid=()=>{throw Error('HARNESS_RESEARCH_ADVANCED_INPUT_INVALID')}
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();const row=value as Record<string,unknown>
 const fields:Record<string,string[]>={start:['action','operationId','label','prompt','persona','modelRef','reasoningEffort','tools','inheritParentContext','maxTokens'],inspect:['action','operationId'],cancel:['action','operationId'],transcript:['action','operationId'],steer:['action','operationId','requestId','message']}
 const allowed=typeof row.action==='string'?fields[row.action]:undefined
 const inheritance=row.action==='start'?['systemPromptMode','inheritProjectContext','inheritSkills']:[],extra=inheritance.filter(key=>Object.hasOwn(row,key))
 if(!allowed||extra.length!==0&&extra.length!==inheritance.length||Object.keys(row).length!==allowed.length+extra.length||Object.keys(row).some(key=>!allowed.includes(key)&&!inheritance.includes(key))||typeof row.operationId!=='string'||!uuid.test(row.operationId))return invalid()
 if(extra.length&&(!(row.systemPromptMode==='append'||row.systemPromptMode==='replace')||typeof row.inheritProjectContext!=='boolean'||typeof row.inheritSkills!=='boolean'))return invalid()
 if(row.action==='start'&&(typeof row.label!=='string'||!row.label.trim()||row.label.length>200||typeof row.prompt!=='string'||!row.prompt.trim()||row.prompt.length>65536||typeof row.persona!=='string'||row.persona.length>32768||!(row.modelRef===null||typeof row.modelRef==='string'&&row.modelRef.length<768)||!(row.reasoningEffort===null||typeof row.reasoningEffort==='string'&&row.reasoningEffort.length<128)||!(row.tools===null||Array.isArray(row.tools)&&row.tools.length<=256&&row.tools.every(name=>typeof name==='string'&&name.length<256))||typeof row.inheritParentContext!=='boolean'||!Number.isSafeInteger(row.maxTokens)||Number(row.maxTokens)<1||Number(row.maxTokens)>32768))return invalid()
 if(row.action==='steer'&&(typeof row.requestId!=='string'||!uuid.test(row.requestId)||typeof row.message!=='string'||!row.message.trim()||row.message.length>16000))return invalid()
 return structuredClone(row) as unknown as Command
}
/** Account revocation immediately denies old results; durable admitting receipts prevent duplicate paid starts. */
export class NativeResearchAdvanced {
 private readonly rows=new Map<string,Row>()
 private readonly pending=new Map<string,{signature:string;context:string;value:Promise<Receipt>}>()
 private readonly cancelledStarts=new Map<string,HarnessResearchContextV1>()
 constructor(private readonly ctx:Context,private readonly options:Options){
  ctx.on('agent/created',async({agent})=>{
   const row=[...this.rows.values()].find(row=>row.receipt.nativeSessionId===agent.id)
   if(!row)return;this.assert(row.context)
   const parent=await this.caller(row.context,row.receipt.parentSessionId);if(agent.session.header.parentSession!==parent.id)throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')
   row.session=agent.session
   if(row.receipt.tools.length)await this.options.composeChild?.(row.context,agent);this.assert(row.context)
   for(const name of row.receipt.tools){const definition=parent.ctx.tools.get(name,parent);if(definition&&!agent.ctx.tools.get(name,agent))agent.ctx.effect(()=>agent.ctx.tools.register(definition))}
   installModelSelection(agent.ctx,{current:{...row.receipt.selection},assembled:undefined},{requireSelection:true})
   if(row.request.systemPromptMode!==undefined){
    const baseline=row.request.systemPromptMode==='append'?renderPrompt(await parent.ctx.systemPrompt.assemble({scope:parent,signal:row.controller.signal})):''
    this.assert(row.context)
    agent.ctx.systemPrompt.section({name:PERSONA_PREFIX_SECTION,order:agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),text:[baseline,row.request.persona].filter(Boolean).join('\n\n'),interpolate:false,complete:true})
   }
   agent.ctx.on('agent/pre-step',async(_step,next)=>{
    const decision=await next();if(decision.kind==='reject')return decision
    return {...decision,messages:decision.messages.filter(message=>!(row.request.inheritProjectContext===false&&['agent-instructions'].includes(message.source.kind))&&!(row.request.inheritSkills===false&&['skill-catalog','skill-invocation'].includes(message.source.kind)))}
   },{prepend:true})
   const allowed=new Set(row.receipt.tools)
   agent.ctx.tools.guard(exec=>!this.options.current(row.context)?'Research ownership has expired.':allowed.has(exec.name)?undefined:'This capability was outside the specialist creation-time ceiling.')
   agent.ctx.on('system-prompt/assemble',async(_assembly,_context,next)=>{const assembled=await next();return {...assembled,tools:assembled.tools.filter(tool=>allowed.has(tool.name))}},{prepend:true})
   if(!allowed.size){agent.ctx.on('agent/pre-step',async({step},next)=>{const decision=await next();return step>1?{kind:'reject'}:decision},{prepend:true});agent.ctx.on('agent/request-error',async(_error,next)=>{await next();return undefined},{prepend:true})}
  })
 }
 private assert(context:HarnessResearchContextV1){if(!this.options.current(context))throw Error('HARNESS_RESEARCH_SCOPE_REVOKED')}
 private async proveParent(context:HarnessResearchContextV1,id:string):Promise<void>{
  this.assert(context);const seen=new Set<string>(),root=this.options.directory(context)
  while(id!==context.sessionId){
   if(seen.has(id))throw Error('HARNESS_RESEARCH_CALLER_DENIED');seen.add(id)
   const live=this.ctx.agents.get(SessionId(id))?.session??this.ctx.sessions.get(SessionId(id)),query=this.ctx.get('sessionQuery')??this.ctx.get('sessionQueries'),saved=live?{session:{...live.header,id:live.id}}:query?await query.readSession(SessionId(id)):null
   this.assert(context);if(!saved||saved.session.id!==id||saved.session.cwd!==root||typeof saved.session.parentSession!=='string')throw Error('HARNESS_RESEARCH_CALLER_DENIED')
   const parentId=saved.session.parentSession,service=this.ctx.get('subagents');if(!service||!(await service.listChildren(SessionId(parentId))).some(child=>child.id===id))throw Error('HARNESS_RESEARCH_CALLER_DENIED')
   this.assert(context);id=parentId
  }
  const rootAgent=this.ctx.agents.get(SessionId(context.sessionId));if(!rootAgent||rootAgent.session.header.cwd!==root)throw Error('HARNESS_RESEARCH_CALLER_DENIED')
 }
 private async caller(context:HarnessResearchContextV1,id:string){await this.proveParent(context,id);const caller=this.ctx.agents.get(SessionId(id));if(!caller)throw Error('HARNESS_RESEARCH_CALLER_DENIED');return caller}
 private async owned(context:HarnessResearchContextV1,id:string){
  const row=this.rows.get(id);if(row){if(JSON.stringify(row.context)!==JSON.stringify(context))throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND');return row}
  const restored=await this.restore(context,id);if(!restored)throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND');return restored
 }
 private async restore(context:HarnessResearchContextV1,id:string):Promise<Row|undefined>{
  const file=await this.file(context,id);this.assert(context)
  let text:string;try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>524288)throw Error('HARNESS_RESEARCH_RECEIPT_INVALID');text=fs.readFileSync(file,'utf8')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
  const saved=JSON.parse(text),owner=parseHarnessResearchContextV1(saved.context),input=parse(JSON.parse(saved.signature)),receipt=saved.receipt as Receipt
  if(saved.schemaVersion!==1||owner.scope.accountId!==context.scope.accountId||owner.projectId!==context.projectId||owner.sessionId!==context.sessionId||owner.workspaceId!==context.workspaceId||input.action!=='start'||input.operationId!==id)throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT')
  if(saved.cancelled===true)throw Error('HARNESS_RESEARCH_CANCELLED')
  if(!receipt||typeof receipt!=='object'||receipt.operationId!==id||receipt.nativeSessionId!=='session-'+id||typeof receipt.parentSessionId!=='string'||!['admitting','running','completed','failed','unknown'].includes(receipt.state)||!receipt.selection||typeof receipt.selection.provider!=='string'||typeof receipt.selection.model!=='string'||receipt.selection.provider.length>768||receipt.selection.model.length>768||receipt.selection.reasoningEffort!==undefined&&typeof receipt.selection.reasoningEffort!=='string'||!Array.isArray(receipt.tools)||receipt.tools.length>256||receipt.tools.some(tool=>typeof tool!=='string'||tool.length>256)||receipt.text!==undefined&&(typeof receipt.text!=='string'||receipt.text.length>131072)||receipt.error!==undefined&&(typeof receipt.error!=='string'||receipt.error.length>512))throw Error('HARNESS_RESEARCH_RECEIPT_INVALID')
  await this.proveParent(context,receipt.parentSessionId)
  const observed=structuredClone(receipt);if(observed.state==='admitting'||observed.state==='running'){observed.state='unknown';observed.error='HARNESS_RESEARCH_OUTCOME_UNCONFIRMED'}
  const row:Row={context:structuredClone(context),signature:saved.signature,request:input,receipt:observed,file,controller:new AbortController(),settled:Promise.resolve()};this.assert(context);this.rows.set(id,row);return row
 }
 private async file(context:HarnessResearchContextV1,id:string){const root=this.options.directory(context);if(!path.isAbsolute(root)||await realpath(root)!==root)throw Error('HARNESS_RESEARCH_PATH_DENIED');const directory=path.join(root,'.studybuddy','native-advanced');for(const segment of [path.join(root,'.studybuddy'),directory]){try{const stat=await lstat(segment);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(segment)!==segment)throw Error('HARNESS_RESEARCH_PATH_DENIED')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;fs.mkdirSync(segment,{mode:0o700})}}this.assert(context);return path.join(directory,id+'.json')}
 private save(row:Row){this.assert(row.context);const temporary=row.file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temporary,JSON.stringify({schemaVersion:1,context:row.context,signature:row.signature,receipt:row.receipt})+'\n',{flag:'wx',mode:0o600});fs.renameSync(temporary,row.file)}
 async command(context:HarnessResearchContextV1,value:unknown):Promise<Receipt|{text:string;nativeSessionId:string}|{accepted:true}>{return this.commandForCaller(context,value,context.sessionId)}
 /** Execute under a trusted native workflow caller; JSON never selects the caller or ceiling. */
 async commandForCaller(context:HarnessResearchContextV1,value:unknown,callerSessionId:string,ceiling?:readonly string[]):Promise<Receipt|{text:string;nativeSessionId:string}|{accepted:true}>{
  this.assert(context);const request=parse(value)
  if(request.action==='start'){
   const signature=JSON.stringify(request),owner=JSON.stringify([context,callerSessionId]),previous=this.pending.get(request.operationId)
   if(previous){if(previous.signature!==signature||previous.context!==owner)throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');return previous.value}
   const value=this.start(context,request,callerSessionId,ceiling).finally(()=>{if(this.pending.get(request.operationId)?.value===value)this.pending.delete(request.operationId)})
   this.pending.set(request.operationId,{signature,context:owner,value});return value
  }
  if(request.action==='cancel'){
   const pending=this.pending.get(request.operationId)
   if(pending){if(pending.context!==JSON.stringify([context,callerSessionId]))throw Error('HARNESS_RESEARCH_RUN_NOT_FOUND');this.cancelledStarts.set(request.operationId,structuredClone(context));this.rows.get(request.operationId)?.controller.abort();try{await pending.value}catch(error){this.assert(context);if((error as Error).message==='HARNESS_RESEARCH_CANCELLED'||(error as Error).name==='AbortError')return {accepted:true};throw error}}
  }
  const row=await this.owned(context,request.operationId)
  await this.proveParent(context,row.receipt.parentSessionId);if(callerSessionId!==context.sessionId&&row.receipt.parentSessionId!==callerSessionId)throw Error('HARNESS_RESEARCH_CALLER_DENIED')
  if(request.action==='inspect')return structuredClone(row.receipt)
  if(request.action==='transcript')return this.transcript(context,row)
  if(request.action==='cancel'){row.controller.abort();await row.activation?.dispose();const child=this.ctx.agents.get(SessionId(row.receipt.nativeSessionId));if(child&&child.session.header.parentSession===row.receipt.parentSessionId){child.cancel({kind:'user'});await child.whenIdle()}this.assert(context);return structuredClone(row.receipt)}
  if(request.action!=='steer')throw Error('HARNESS_RESEARCH_ADVANCED_INPUT_INVALID')
  const service=this.ctx.get('subagents');if(!service)throw Error('HARNESS_RESEARCH_SUBAGENTS_UNAVAILABLE')
  await service.prompt({parentSessionId:SessionId(row.receipt.parentSessionId),childSessionId:SessionId(row.receipt.nativeSessionId),mode:'continuable',requestId:request.requestId as never,delivery:'steer',content:[{type:'text',text:request.message}]},new AbortController().signal)
  this.assert(context);return {accepted:true}
 }
 /** Resolve exact creation-time model/tools without creating an Agent or starting model work. */
 async freezeStart(context:HarnessResearchContextV1,value:unknown,callerSessionId=context.sessionId,ceiling?:readonly string[]):Promise<Start>{
  const request=parse(value);if(request.action!=='start')throw Error('HARNESS_RESEARCH_ADVANCED_INPUT_INVALID')
  const parent=await this.caller(context,callerSessionId),resolved=await this.resolveStart(context,request,parent,ceiling)
  return {...request,modelRef:`${resolved.selection.provider}/${resolved.selection.model}`,reasoningEffort:resolved.selection.reasoningEffort??null,tools:[...resolved.tools],systemPromptMode:request.systemPromptMode??'append',inheritProjectContext:request.inheritProjectContext??true,inheritSkills:request.inheritSkills??true}
 }
 private async resolveStart(context:HarnessResearchContextV1,request:Start,parent:NonNullable<ReturnType<Context['agents']['get']>>,ceiling?:readonly string[]){
  const catalog=await this.options.catalog();this.assert(context)
  const matches=catalog.groups.flatMap(group=>group.models.map(model=>({group,model}))).filter(row=>`${row.group.id}/${row.model.id}`===request.modelRef),inherited=this.ctx.sessionController.inspectLiveModelSelection(parent.id)
  let selection:Readonly<ModelSelection>
  if(request.modelRef===null){if(!inherited)throw Error('HARNESS_RESEARCH_MODEL_SELECTION_REQUIRED');selection={provider:inherited.provider,model:inherited.model,...(inherited.reasoningEffort===undefined?{}:{reasoningEffort:ReasoningEffortId(inherited.reasoningEffort)})}}
  else{if(matches.length!==1)throw Error('HARNESS_RESEARCH_MODEL_UNAVAILABLE');selection={provider:matches[0]!.group.id,model:matches[0]!.model.id}}
  const selected=catalog.groups.find(group=>group.id===selection.provider)?.models.find(model=>model.id===selection.model);if(!selected)throw Error('HARNESS_RESEARCH_MODEL_UNAVAILABLE')
  if(request.reasoningEffort!==null){if(!selected.reasoning?.efforts.some(effort=>effort.id===request.reasoningEffort))throw Error('HARNESS_RESEARCH_REASONING_UNAVAILABLE');selection={...selection,reasoningEffort:ReasoningEffortId(request.reasoningEffort)}}
  const visible=new Set(parent.ctx.tools.schemas(parent).map(tool=>tool.name)),permitted=ceiling===undefined?visible:new Set(ceiling.filter(name=>visible.has(name))),requested=request.tools??[...permitted]
  if(requested.some(name=>!visible.has(name)||!permitted.has(name)))throw Error('HARNESS_RESEARCH_TOOL_UNAVAILABLE')
  return {selection,tools:request.inheritSkills===false?requested.filter(name=>name!=='skill'):requested}
 }
 private async start(context:HarnessResearchContextV1,request:Start,callerSessionId:string,ceiling?:readonly string[]):Promise<Receipt>{
  const signature=JSON.stringify(request),existing=this.rows.get(request.operationId)??await this.restore(context,request.operationId)
  if(existing){const row=await this.owned(context,request.operationId);if(row.signature!==signature||row.receipt.parentSessionId!==callerSessionId)throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT');return structuredClone(row.receipt)}
  const service=this.ctx.get('subagents'),parent=await this.caller(context,callerSessionId);if(!service)throw Error('HARNESS_RESEARCH_SUBAGENTS_UNAVAILABLE')
  const {selection,tools}=await this.resolveStart(context,request,parent,ceiling);this.assert(context)
  if(this.cancelledStarts.has(request.operationId)){
   const file=await this.file(context,request.operationId);this.assert(context)
   try{fs.writeFileSync(file,JSON.stringify({schemaVersion:1,context,signature,cancelled:true})+'\n',{flag:'wx',mode:0o600})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
   throw Error('HARNESS_RESEARCH_CANCELLED')
  }
  const provider=request.inheritParentContext?'fork':'spawn';if(!service.getProvider(provider))throw Error('HARNESS_RESEARCH_SUBAGENTS_UNAVAILABLE')
  const file=await this.file(context,request.operationId);this.assert(context)
  if(this.cancelledStarts.has(request.operationId)){fs.writeFileSync(file,JSON.stringify({schemaVersion:1,context,signature,cancelled:true})+'\n',{flag:'wx',mode:0o600});throw Error('HARNESS_RESEARCH_CANCELLED')}
  if(fs.existsSync(file))throw Error('HARNESS_RESEARCH_OPERATION_CONFLICT')
  const row:Row={context:structuredClone(context),signature,request:structuredClone(request),file,controller:new AbortController(),receipt:{operationId:request.operationId,nativeSessionId:'session-'+request.operationId,parentSessionId:callerSessionId,state:'admitting',selection,tools:[...tools]},settled:Promise.resolve()}
  this.rows.set(request.operationId,row);fs.writeFileSync(file,JSON.stringify({schemaVersion:1,context:row.context,signature,receipt:row.receipt})+'\n',{flag:'wx',mode:0o600})
  try{
   const maxDepth=service.resolveMaxDepth(this.options.maxDepth),globalTools=tools.filter(name=>name!=='run_code'&&this.ctx.tools.get(name)!==undefined)
   const activation=await service.startActivation({provider,label:request.label,childId:SessionId(row.receipt.nativeSessionId),request:{parent,prompt:[{type:'text',text:request.prompt}],...(request.systemPromptMode===undefined?{persona:request.persona}:{}),cwd:this.options.directory(context),agentOptions:{...selection,maxTokens:request.maxTokens},toolFilter:{allow:globalTools},...(maxDepth===undefined?{}:{maxDepth})},signal:row.controller.signal,delivery:'caller'})
   row.activation=activation;this.assert(context);row.receipt.state='running';this.save(row)
   row.settled=activation.result.then(result=>{this.assert(context);row.receipt.state=result.stopReason==='completed'?'completed':'failed';row.receipt.text=result.output.filter(block=>block.type==='text').map(block=>block.type==='text'?block.text:'').join('\n').slice(0,131072);if(result.stopReason!=='completed')row.receipt.error='Native specialist ended: '+result.stopReason;this.save(row)},()=>{row.receipt.state='unknown';if(this.options.current(context))this.save(row)}).catch(()=>{row.receipt.state='unknown'})
   return structuredClone(row.receipt)
  }catch(error){row.controller.abort();await row.activation?.dispose();row.receipt.state='unknown';if(this.options.current(context))this.save(row);throw error}
 }
 async settled(operationId:string):Promise<void>{await this.rows.get(operationId)?.settled}
 private async transcript(context:HarnessResearchContextV1,row:Row){
  const receipt=row.receipt;this.assert(context);const id=SessionId(receipt.nativeSessionId),live=row.session??this.ctx.sessions.get(id),query=this.ctx.get('sessionQuery')??this.ctx.get('sessionQueries');
  const snapshot=live?{session:{...live.header,id:live.id},events:live.snapshotEvents()}:query?await query.readSession(id):null;
  this.assert(context);await this.proveParent(context,receipt.parentSessionId);if(!snapshot||snapshot.session.id!==id||snapshot.session.parentSession!==receipt.parentSessionId||snapshot.session.cwd!==this.options.directory(context))throw Error('HARNESS_RESEARCH_TRANSCRIPT_DENIED');
  const records:SessionEvent[]=[],lines:string[]=[];let bytes=0,truncated=false;
  for(const event of snapshot.events){const line=JSON.stringify(event),size=Buffer.byteLength(line,'utf8')+1;if(records.length>=1024||bytes+size>65536){truncated=true;break;}records.push(event);lines.push(line);bytes+=size;}
  return {nativeSessionId:receipt.nativeSessionId,text:lines.join('\n'),journal:{records,truncated,endSeq:snapshot.events.at(-1)?.seq??-1,cursor:records.at(-1)?.seq??-1},limitations:truncated?['Bounded transcript; use the project native journal export for all original events.']:[]};
 }
 async close(projectId?:string):Promise<void>{const closing=[...this.rows.values()].filter(row=>projectId===undefined||row.context.projectId===projectId);for(const row of closing)row.controller.abort();await Promise.all(closing.map(async row=>{await row.activation?.dispose();await row.settled}));for(const row of closing)if(this.rows.get(row.receipt.operationId)===row)this.rows.delete(row.receipt.operationId);for(const [id,context]of this.cancelledStarts)if(projectId===undefined||context.projectId===projectId)this.cancelledStarts.delete(id)}
}
