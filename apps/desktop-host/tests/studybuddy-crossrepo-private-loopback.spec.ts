import { createHash,randomUUID } from 'node:crypto'
import { readFile,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import LlmRuntime,{ markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore,{ SessionId } from '@deepseek-ai/dsh-session'
import {
  canonicalNativeBuiltinCatalogPayloadV1,parseNativeBuiltinCatalogAppliedV1,parseNativeBuiltinPreparedRouteV1,
  parseNativeBuiltinRequestFreezeV1,parseNativeBuiltinValidationResultV1,
} from '@studybuddy/contracts'
import type { NativeBuiltinCatalogApplyV1,NativeBuiltinPreparedRouteV1,NativeBuiltinRequestFreezeV1,NativeBuiltinCatalogAppliedV1 } from '@studybuddy/contracts'
import { describe,expect,it,vi } from 'vitest'
import { installBuiltinHostControl } from '../src/studybuddy-builtin-models.ts'

const readyPath=process.env.STUDYBUDDY_BUILTIN_CROSSREPO_READY_FILE
const supplierKey='synthetic-crossrepo-supplier-key',exactModelId='fixture-crossrepo-exact'
const headers={ authorization:'Bearer synthetic-crossrepo-native-session','x-studybuddy-client-audience':'studybuddy-native-builtin-v1','content-type':'application/json' }
describe.runIf(Boolean(readyPath))('actual private Host SDK -> S coordinator -> G relay free loopback',()=>{
  it('validates, publishes, chats and restores exact independent same-Key sources without platform debit or public secrets',async()=>{
    const ready=JSON.parse(await readFile(readyPath!,'utf8')) as { origin:string }
    const rawFetch=globalThis.fetch
    const ctx=new Context()
    const publicFacts:unknown[]=[]
    async function request(operation:string,body?:unknown){
      return await rawFetch(ready.origin+'/v1/native-builtin/'+operation,{ method:body===undefined?'GET':'POST',headers,
        ...body===undefined?{}:{ body:JSON.stringify(body) } })
    }
    async function api(operation:string,body?:unknown):Promise<unknown>{
      const response=await request(operation,body)
      const value:unknown=await response.json()
      const code=value!==null&&typeof value==='object'&&'code' in value?String(value.code):'no error code'
      expect(response.status,operation+': '+code).toBe(body===undefined?200:201)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(JSON.stringify(value)).not.toContain(supplierKey)
      return value
    }
    async function fixture(path:string,body?:unknown){
      const response=await rawFetch(ready.origin+'/__builtin-crossrepo/'+path,{ method:body===undefined?'GET':'POST',headers,
        ...body===undefined?{}:{ body:JSON.stringify(body) } })
      expect(response.status,path).toBe(200);return await response.json()
    }
    const context=await fixture('context') as { accountOwner:string;deviceId:string;gatewayLoopbackOrigin:string }
    const scope={ accountId:context.accountOwner,generation:1 }
    vi.stubGlobal('fetch',async(input:Parameters<typeof fetch>[0],init:Parameters<typeof fetch>[1])=>{
      const target=new URL(String(input))
      if(target.origin!=='https://gateway.crossrepo-fixture.test')throw Error('closed Host fixture dispatch origin')
      return await rawFetch(context.gatewayLoopbackOrigin+target.pathname+target.search,{ ...init,redirect:'error' })
    })
    await ctx.plugin(LlmRuntime);await ctx.plugin(AgentRegistry);await ctx.plugin(SessionStore)
    await ctx.plugin(DefaultModel,{ provider:'',model:'' })
    const session=ctx.sessions.create(SessionId(randomUUID()),{ meta:{ delegationDepth:0 } })
    const agent={ id:session.id,ctx,session,status:'running' } as Agent
    let flushCount=0
    ctx.on('session/flush',async()=>{
      flushCount++;await writeFile(join(process.env.STUDYBUDDY_BUILTIN_CROSSREPO_OUTPUT!,'host-session-audit.json'),JSON.stringify(session.snapshotEvents(),null,2))
    })
    type Source={ operation:{ schemaVersion:1;operationId:string;localRef:string;sourceRevision:string;protocol:'openai_chat_completions' };route:NativeBuiltinPreparedRouteV1;ack:NativeBuiltinCatalogAppliedV1 }
    const sources=new Map<string,Source>(),freezes:NativeBuiltinRequestFreezeV1[]=[]
    const control=installBuiltinHostControl(ctx,async(message)=>{
      const capture=parseNativeBuiltinRequestFreezeV1((message as { request:unknown }).request)
      const source=sources.get(capture.selection.localRef);if(source===undefined)throw Error('unknown owned fixture source')
      freezes.push(capture)
      expect(capture.selection).toEqual(source.ack.applied[0])
      control.admissionResult({ clientRequestId:capture.clientRequestId,data:{ schemaVersion:1,clientRequestId:capture.clientRequestId,
        selection:capture.selection,authority:capture.authority,sessionId:capture.sessionId,
        purpose:capture.purpose,requestReceipt:null } })
    })
    async function install(localRef:string){
      const operationId=randomUUID(),sourceRevision=createHash('sha256').update(operationId).digest('hex')
      const saved=await api('source-sync',{ schemaVersion:1,operationId,localRef,localRevision:'a'.repeat(64),sourceRevision,inventoryRevision:'b'.repeat(64),
        providerId:'kimi',baseUrl:'https://api.moonshot.cn/v1',apiKey:supplierKey,expectedCredentialRevision:null,candidateModelIds:[exactModelId] })
      publicFacts.push(saved)
      const operation={ schemaVersion:1 as const,operationId,localRef,sourceRevision,protocol:'openai_chat_completions' as const }
      publicFacts.push(await api('prepare',{ ...operation,exactModelId }),await api('activate',operation))
      const route=parseNativeBuiltinPreparedRouteV1(await api('material',operation))
      return await applyExisting(operation,route)
    }
    async function applyExisting(operation:Source['operation'],route:NativeBuiltinPreparedRouteV1){
      const unsigned:NativeBuiltinCatalogApplyV1={ schemaVersion:1,operationId:operation.operationId,scope,hostGeneration:control.hostGeneration,
        catalogVersion:'crossrepo-'+randomUUID(),catalogDigest:'0'.repeat(64),routes:[route] }
      const snapshot:NativeBuiltinCatalogApplyV1={ ...unsigned,
        catalogDigest:createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(unsigned)).digest('hex') }
      const ack=parseNativeBuiltinCatalogAppliedV1(await control.command('apply',snapshot));publicFacts.push(ack)
      const source={ operation,route,ack };sources.set(operation.localRef,source);return source
    }
    async function validateAndPublish(source:Source,checkPremature=true){
      if(checkPremature){
        const premature=await request('confirm',{ ...source.operation,hostApplied:source.ack });expect(premature.status).toBe(409)
        expect(await premature.json()).toMatchObject({ code:'NATIVE_BUILTIN_VALIDATION_REQUIRED' })
      }
      const result=parseNativeBuiltinValidationResultV1(await control.command('validate',{ schemaVersion:1,operationId:source.operation.operationId,
        selection:source.ack.applied[0]!,clientRequestId:randomUUID(),purpose:'validation',prompt:'Synthetic free fixture only' }))
      expect(result).toMatchObject({ outcome:'completed',returnedModel:exactModelId,usageOrigin:'provider_terminal',usage:{ inputTokens:10,outputTokens:2 },errorCode:null })
      expect(result.providerResponseId).toMatch(/^crossrepo-response-/);publicFacts.push(result)
      publicFacts.push(await api('confirm',{ ...source.operation,hostApplied:source.ack }))
      await control.command('publish',{ schemaVersion:1,readiness:{ schemaVersion:1,operationId:source.operation.operationId,
        localRef:source.operation.localRef,sourceRevision:source.operation.sourceRevision,
        state:'ready',phase:'ready',catalogVersion:source.ack.catalogVersion,catalogDigest:source.ack.catalogDigest,hostApplied:source.ack,
        appliedModels:source.ack.applied,errorCode:null } })
    }
    async function chat(source:Source){
      const chunks:StreamChunk[]=[]
      await ctx.agents.withInitiator(agent,async()=>{
        for await(const chunk of ctx.llm.stream(markAgentLoopRequest({ provider:source.route.routeId,model:exactModelId,
          sessionId:session.id,
          maxTokens:16,messages:[{ role:'user',content:[{ type:'text',text:'Synthetic free chat' }] }] })))chunks.push(chunk)
      })
      expect(chunks.find(chunk=>chunk.type==='text-delta')).toMatchObject({ text:'OK' })
      expect(chunks.at(-1)).toMatchObject({ type:'finish',reason:{ kind:'stop' } })
    }
    async function profile(total:string,count:number){
      const value=await fixture('profile');expect(value.profile.metrics.totalTokens).toBe(total);expect(value.facts).toHaveLength(count)
      expect(new Set(value.facts.map((row:{ request_id:string })=>row.request_id)).size).toBe(count)
      expect(value.facts.every((row:{ logical_model_id:string })=>row.logical_model_id==='kimi.synthetic-crossrepo')).toBe(true)
      publicFacts.push(value);return value
    }
    try{
      const a=await install('synthetic-source-a'),b=await install('synthetic-source-b')
      if(a.route.mode!=='gateway'||b.route.mode!=='gateway')throw Error('exact gateway route required')
      expect(a.route.binding.grant.scope.sourceId).not.toBe(b.route.binding.grant.scope.sourceId)
      expect(a.route.binding.grant.scope.credentialReference).toBe(b.route.binding.grant.scope.credentialReference)
      expect(a.route.binding.grant.scope.credentialRevision).toBe(b.route.binding.grant.scope.credentialRevision)
      expect(a.route.binding.connectionId).not.toBe(b.route.binding.connectionId)
      expect(ctx.llm.listProviders()).toEqual([])
      await validateAndPublish(a);await validateAndPublish(b)
      expect(ctx.llm.listProviders()).toHaveLength(2)
      expect((await ctx.llm.listModels(a.route.routeId)).map(model=>model.id)).toEqual([exactModelId])
      await chat(a);await chat(b);await profile('48',4);await profile('48',4)
      for(const retired of ['request-prepare','request-status']){
        const response=await request(retired,{schemaVersion:1,clientRequestId:randomUUID()})
        expect(response.status).toBe(404)
      }
      const replay=await rawFetch(context.gatewayLoopbackOrigin+'/v1/chat/completions',{ method:'POST',headers:{ 'content-type':'application/json',authorization:'Bearer '+a.route.apiKey,'X-StudyBuddy-Request-Ticket':'retired-fixture-ticket' },body:JSON.stringify({ model:exactModelId,messages:[] }) })
      expect(replay.status).toBe(403)
      await control.command('revoke',{ scope,localRef:a.operation.localRef })
      expect(ctx.llm.listProviders().map(provider=>provider.id)).toEqual([b.route.routeId])
      const first=freezes[0]!
      const oldStatus=await rawFetch(context.gatewayLoopbackOrigin+'/v1/requests/'+first.clientRequestId,{headers:{authorization:'Bearer '+a.route.apiKey}})
      expect(oldStatus.status).toBe(200);expect(await oldStatus.json()).toMatchObject({state:'terminal',requestTicket:null})
      // Local restore removes the directory only. The same Key remains usable
      // by an independent SDK without the product session or a prepare RPC.
      const independent=await rawFetch(context.gatewayLoopbackOrigin+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+a.route.apiKey},body:JSON.stringify({model:exactModelId,messages:[{role:'user',content:'Synthetic free standalone'}],max_tokens:16})})
      expect(independent.status).toBe(200);expect(await independent.json()).toMatchObject({model:exactModelId,usage:{total_tokens:12}})
      expect(independent.headers.get('X-Request-Id')).toMatch(/^[a-f0-9-]{36}$/)
      await chat(b);await profile('72',6)
      const reconstructed=parseNativeBuiltinPreparedRouteV1(await fixture('reconstruct-material',b.operation))
      if(reconstructed.mode!=='gateway')throw Error('gateway reconstruction required')
      expect(reconstructed.apiKey).toBe(b.route.apiKey)
      expect(reconstructed.binding).toMatchObject({ connectionId:b.route.binding.connectionId,
        grant:b.route.binding.grant,hostCatalogVersion:b.ack.catalogVersion })
      const restored=await applyExisting(a.operation,a.route);await validateAndPublish(restored,false);await chat(restored)
      expect(restored.route).toEqual(a.route)
      const diagnostic=parseNativeBuiltinValidationResultV1(await control.command('validate',{ schemaVersion:1,operationId:b.operation.operationId,
        selection:b.ack.applied[0]!,clientRequestId:randomUUID(),purpose:'diagnostic',prompt:'Synthetic diagnostic' }))
      expect(diagnostic).toMatchObject({ purpose:'diagnostic',outcome:'completed',usageOrigin:'provider_terminal' });publicFacts.push(diagnostic)
      await profile('108',9);await profile('108',9)
      const observations=await (await rawFetch(context.gatewayLoopbackOrigin+'/__builtin-crossrepo/observations')).json()
      expect(observations).toEqual({ upstreamCalls:9,rejectedUpstreamCalls:0,walletUnchanged:true })
      expect(flushCount).toBe(4)
      const audit=session.snapshotEvents();expect(audit.filter(row=>row.type==='studybuddy/builtin-request')).toHaveLength(4)
      publicFacts.push(audit)
      const serialized=JSON.stringify(publicFacts)
      for(const secret of [supplierKey,a.route.apiKey,b.route.apiKey]){
        expect(serialized).not.toContain(secret)
      }
      await control.command('revoke',{ scope });expect(ctx.llm.listProviders()).toEqual([])
      await profile('108',9)
      await writeFile(join(process.env.STUDYBUDDY_BUILTIN_CROSSREPO_OUTPUT!,'harness-public-receipt.json'),JSON.stringify({ schemaVersion:1,
        actualControl:true,actualSdk:true,actualPrivateRelay:true,sourceCount:2,upstreamCalls:9,terminalFacts:9,totalTokens:'108',
        walletUnchanged:true,publicSecretsAbsent:true,sessionAuditEvents:4,
        coordinatorReconstruction:true,localDirectoryRestore:true,keyPreserved:true,perRequestTickets:false },null,2))
    }finally{vi.unstubAllGlobals();await ctx.fiber.dispose()}
  },90_000)
})
