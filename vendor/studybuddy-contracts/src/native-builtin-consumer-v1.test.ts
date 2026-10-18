import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
  canonicalNativeBuiltinGrantPayloadV1, parseNativeBuiltinBindingV1,
  parseNativeBuiltinCatalogAppliedV1, parseNativeBuiltinCatalogApplyV1,
  parseNativeBuiltinModelAuthorityV1, parseNativeBuiltinReadinessV1,
  parseNativeBuiltinRequestReceiptV1, parseNativeBuiltinSourceGrantV1,
  parseNativeBuiltinValidationResultV1, parseNativeBuiltinLocalValidationV1,
  parseNativeBuiltinSourceSyncRequestV1, parseNativeBuiltinSourceBalanceV1,
  parseNativeBuiltinUsagePageV1, parseNativeBuiltinRequestFreezeV1,
  parseNativeBuiltinSourceDetailV1, parseNativeBuiltinLocalGrantV1,
} from './native-builtin-consumer-v1.js';

const owner='b742b8d4-dcf7-49bc-a6c5-c95e522c2c42';
const device='d742b8d4-dcf7-49bc-a6c5-c95e522c2c42';
const operation='a742b8d4-dcf7-49bc-a6c5-c95e522c2c42';
const connection='c742b8d4-dcf7-49bc-a6c5-c95e522c2c42';
const hostGeneration='e742b8d4-dcf7-49bc-a6c5-c95e522c2c42';
const model={logicalModelId:'fixture-model',providerId:'kimi',exactModelId:'fixture-exact',displayName:'Fixture exact',
  protocol:'openai_responses',contextWindow:1000,maxOutputTokens:100,capabilityFlags:['thinking','tool_use'],
  evidenceSha256:'e'.repeat(64),membershipRevision:'fixture-member-r1',capabilityRevision:'fixture-capability-r1',
  adapterRevision:'fixture-adapter-r1',priceAuthorityRevision:null,availability:'available'};
const source={backendInstanceId:'fixture-backend',accountOwner:owner,sourceId:device,localRef:'source-one',
  providerId:'kimi',credentialReference:'credential-one',credentialRevision:'credential-r1',baseUrl:'https://api.moonshot.cn/v1'};
const scope={...source,deviceId:device,protocol:'openai_responses',consumerId:'studybuddy_harness',consumerVersion:'1',fundingSource:'user_api'};
const grant={schemaVersion:1,grantRevision:'a'.repeat(64),catalogRevision:'fixture-catalog-r1',scope,allowedModels:[model]};
const binding={schemaVersion:1,userId:12,tokenId:34,connectionId:connection,operationId:operation,grant,
  policyRevision:'fixture-policy-r1',tokenGroup:'fixture-native',pendingExpiresAt:1893456000,
  authorityExpiresAt:1893456300,state:'active',hostCatalogVersion:null};
const selected={routeId:'owned-route-one',sourceId:source.sourceId,localRef:source.localRef,providerId:model.providerId,
  exactModelId:model.exactModelId,protocol:model.protocol,connectionId:connection,
  credentialRevision:source.credentialRevision,grantRevision:grant.grantRevision,fundingSource:'user_api'};
const ack={schemaVersion:1,operationId:operation,scope:{accountId:owner,generation:2},hostGeneration,
  catalogVersion:'host-catalog-r1',catalogDigest:'c'.repeat(64),applied:[selected]};
const ready={schemaVersion:1,operationId:operation,localRef:source.localRef,sourceRevision:'d'.repeat(64),
  state:'ready',phase:'ready',catalogVersion:ack.catalogVersion,catalogDigest:ack.catalogDigest,
  hostApplied:ack,appliedModels:[selected],errorCode:null};

describe('neutral builtin consumer contracts',()=>{
  it('accepts explicit no-expiry personal bindings while retaining historical snapshots and rejecting malformed or platform zero deadlines',()=>{
    const permanent={...binding,pendingExpiresAt:0,authorityExpiresAt:0};
    expect(parseNativeBuiltinBindingV1(permanent)).toEqual(permanent);
    const legacy={...binding,pendingExpiresAt:1,authorityExpiresAt:2};
    expect(parseNativeBuiltinBindingV1(legacy)).toEqual(legacy);
    for(const [pendingExpiresAt,authorityExpiresAt] of [[-1,0],[0,1],[1,0],['0',0],[0,undefined]])
      expect(()=>parseNativeBuiltinBindingV1({...binding,pendingExpiresAt,authorityExpiresAt})).toThrow();
    const platform={...grant,scope:{...scope,fundingSource:'platform'},allowedModels:[{...model,priceAuthorityRevision:'exact-cny-r1'}]};
    expect(()=>parseNativeBuiltinBindingV1({...permanent,grant:platform})).toThrow();
  });
  it('accepts a permanent local personal Key grant without changing exact model or account isolation fields',()=>{
    const local={schemaVersion:1,grantRevision:grant.grantRevision,catalogRevision:grant.catalogRevision,accountOwner:owner,
      deviceId:device,sourceId:source.sourceId,localRef:source.localRef,connectionId:connection,credentialRevision:source.credentialRevision,
      protocol:'openai_responses',authorityExpiresAt:0,allowedModels:[{...model,providerId:'openai'}]};
    expect(parseNativeBuiltinLocalGrantV1(local)).toEqual(local);
    expect(()=>parseNativeBuiltinLocalGrantV1({...local,authorityExpiresAt:-1})).toThrow();
    expect(()=>parseNativeBuiltinLocalGrantV1({...local,authorityExpiresAt:'0'})).toThrow();
  });
  it('keeps exact authority independent from external tool ids, including all three wire protocols',()=>{
    for(const protocol of ['openai_responses','openai_chat_completions','anthropic_messages']){
      const exact={...grant,scope:{...scope,protocol},allowedModels:[{...model,protocol}]};
      expect(parseNativeBuiltinSourceGrantV1(exact)).toEqual(exact);
    }
    expect(parseNativeBuiltinModelAuthorityV1(model)).toEqual(model);
    expect(()=>parseNativeBuiltinModelAuthorityV1({...model,toolId:'harness'})).toThrow();
    expect(()=>parseNativeBuiltinSourceGrantV1({...grant,scope:{...scope,toolId:'dsh'}})).toThrow();
  });
  it('retains separate source identities when two rows reference the same credential',()=>{
    const other={...grant,scope:{...scope,sourceId:connection,localRef:'source-two'}};
    expect(parseNativeBuiltinSourceGrantV1(other).scope.localRef).toBe('source-two');
    expect(parseNativeBuiltinSourceGrantV1(other).scope.sourceId).not.toBe(parseNativeBuiltinSourceGrantV1(grant).scope.sourceId);
    expect(parseNativeBuiltinBindingV1(binding)).toEqual(binding);
  });
  it('rejects unknown fields, accessors without evaluating them, unsafe counts and provider/protocol conflicts',()=>{
    const access={...model};let called=false;
    Object.defineProperty(access,'displayName',{enumerable:true,get(){called=true;return 'bad'}});
    expect(()=>parseNativeBuiltinModelAuthorityV1(access)).toThrow();expect(called).toBe(false);
    for(const value of [{...model,apiKey:'fixture-secret'},{...model,contextWindow:1.5},{...model,capabilityFlags:['thinking','thinking']},
      {...model,maxOutputTokens:1001},{...model,evidenceSha256:'SHA256:untrusted'}])expect(()=>parseNativeBuiltinModelAuthorityV1(value)).toThrow();
    for(const value of [{...grant,scope:{...scope,providerId:'deepseek'}},{...grant,allowedModels:[model,model]},
      {...grant,allowedModels:[{...model,protocol:'anthropic_messages'}]},
      {...grant,scope:{...scope,consumerId:'codex'}},{...grant,scope:{...scope,providerId:'openai'}}])expect(()=>parseNativeBuiltinSourceGrantV1(value)).toThrow();
  });
  it('requires an exact price authority for platform admission while retaining external user_api funding',()=>{
    expect(()=>parseNativeBuiltinSourceGrantV1({...grant,scope:{...scope,fundingSource:'platform'}})).toThrow();
    const platform={...grant,scope:{...scope,fundingSource:'platform'},allowedModels:[{...model,priceAuthorityRevision:'exact-cny-r1'}]};
    expect(parseNativeBuiltinSourceGrantV1(platform)).toEqual(platform);
    expect(()=>parseNativeBuiltinBindingV1({...binding,state:'active',authorityExpiresAt:binding.pendingExpiresAt})).toThrow();
  });
  it('canonicalizes exactly authorized facts while display names and input order cannot change a grant hash',()=>{
    const canonical=canonicalNativeBuiltinGrantPayloadV1(grant);
    const renamed={...grant,grantRevision:'b'.repeat(64),allowedModels:[{...model,displayName:'Renamed',capabilityFlags:['tool_use','thinking']}]};
    expect(canonicalNativeBuiltinGrantPayloadV1(renamed)).toBe(canonical);
    expect(canonical).not.toContain('displayName');expect(canonical).not.toContain('grantRevision');
    expect(canonicalNativeBuiltinGrantPayloadV1({...grant,scope:{...scope,localRef:'source-two'}})).not.toBe(canonical);
    expect(canonicalNativeBuiltinGrantPayloadV1({...grant,allowedModels:[{...model,adapterRevision:'fixture-adapter-r2'}]})).not.toBe(canonical);
  });
  it('matches the independently pinned Go canonical UTF-8 digest vector',()=>{
    const vector=JSON.parse(readFileSync(new URL('./fixtures/native-builtin-grant-vector-v1.json',import.meta.url),'utf8'));
    const payload=JSON.parse(vector.canonicalUtf8);
    const candidate={...payload,grantRevision:vector.sha256,allowedModels:payload.allowedModels.map((m:unknown)=>({...m as object,displayName:'Fixture for digest'}))};
    const actual=canonicalNativeBuiltinGrantPayloadV1(candidate);
    expect(actual).toBe(vector.canonicalUtf8);
    expect(createHash('sha256').update(actual,'utf8').digest('hex')).toBe('2f5a30da629928b01a1264eed23345ae33e3712326d47a15a1adfd138b3695cd');
  });
  it('private catalog apply accepts only the owned account and exact active binding; ack excludes credentials',()=>{
    const route={mode:'gateway',routeId:selected.routeId,displayName:'My fixture Key',gatewayOrigin:'https://gateway.example.com',apiKey:'fixture-only-bearer',binding};
    const apply={...ack,routes:[route]};delete (apply as Partial<typeof ack>).applied;
    expect(parseNativeBuiltinCatalogApplyV1(apply)).toEqual(apply);
    expect(parseNativeBuiltinCatalogAppliedV1(ack)).toEqual(ack);
    expect(()=>parseNativeBuiltinCatalogApplyV1({...apply,scope:{accountId:device,generation:2}})).toThrow();
    expect(()=>parseNativeBuiltinCatalogApplyV1({...apply,routes:[{...route,binding:{...binding,state:'pending'}}]})).toThrow();
    expect(()=>parseNativeBuiltinCatalogAppliedV1({...ack,apiKey:'fixture-only-bearer'})).toThrow();
    expect(()=>parseNativeBuiltinCatalogAppliedV1({...ack,applied:[selected,selected]})).toThrow();
  });
  it('does not declare ready from saved or confirmed alone and verifies the exact applied source, revision and digest',()=>{
    expect(parseNativeBuiltinReadinessV1(ready)).toEqual(ready);
    for(const value of [{...ready,hostApplied:null},{...ready,phase:'grant_confirm'},
      {...ready,hostApplied:{...ack,catalogDigest:'f'.repeat(64)}},
      {...ready,hostApplied:{...ack,operationId:device}},
      {...ready,hostApplied:{...ack,applied:[{...selected,credentialRevision:'other-r2'}]}},
      {...ready,appliedModels:[{...selected,localRef:'other'}]},
      {...ready,errorCode:'VALIDATION_FAILED'},{...ready,apiKey:'fixture-secret'}])expect(()=>parseNativeBuiltinReadinessV1(value)).toThrow();
    const pending={...ready,state:'pending',phase:'credential_sync',catalogVersion:null,catalogDigest:null,hostApplied:null,appliedModels:[]};
    expect(parseNativeBuiltinReadinessV1(pending)).toEqual(pending);
  });
  it('requires request recovery state so unknown dispatch cannot be mistaken for a fresh ticket',()=>{
    const receipt={schemaVersion:1,operationId:operation,requestId:connection,purpose:'diagnostic',requestTicket:null,expiresAt:1893456000,state:'dispatch_started'};
    expect(parseNativeBuiltinRequestReceiptV1(receipt)).toEqual(receipt);
    expect(()=>parseNativeBuiltinRequestReceiptV1({...receipt,state:'resend'})).toThrow();
    expect(()=>parseNativeBuiltinRequestReceiptV1({...receipt,purpose:'caller-chosen'})).toThrow();
  });
  it('only carries protected request material for a prepared receipt, while unavailable and historical receipts remain readable',()=>{
    const receipt={schemaVersion:1,operationId:operation,requestId:connection,purpose:'diagnostic',requestTicket:null,expiresAt:1893456000,state:'prepared'};
    expect(parseNativeBuiltinRequestReceiptV1(receipt)).toEqual(receipt);
    const prepared={...receipt,requestTicket:'fixture-one-use-ticket'};
    expect(parseNativeBuiltinRequestReceiptV1(prepared)).toEqual(prepared);
    for(const state of ['dispatch_started','terminal']){
      const historical={...receipt,state};
      expect(parseNativeBuiltinRequestReceiptV1(historical)).toEqual(historical);
      expect(()=>parseNativeBuiltinRequestReceiptV1({...historical,requestTicket:'must-not-return-historical-ticket'})).toThrow();
    }
    const {requestTicket:_,...omitted}=receipt;
    expect(()=>parseNativeBuiltinRequestReceiptV1(omitted)).toThrow();
    expect(()=>parseNativeBuiltinRequestReceiptV1({...receipt,requestTicket:''})).toThrow();
  });
  it('does not evaluate array element getters and preserves explicit absence of optional capabilities',()=>{
    const capabilities=['thinking'];let called=false;
    Object.defineProperty(capabilities,0,{enumerable:true,get(){called=true;return 'thinking'}});
    expect(()=>parseNativeBuiltinModelAuthorityV1({...model,capabilityFlags:capabilities})).toThrow();expect(called).toBe(false);
    expect(parseNativeBuiltinModelAuthorityV1({...model,capabilityFlags:[]}).capabilityFlags).toEqual([]);
    expect(()=>parseNativeBuiltinModelAuthorityV1({...model,capabilityFlags:['made_up_tools']})).toThrow();
  });
  it('represents missing response identity honestly without admitting fabricated trusted usage',()=>{
    const failure={schemaVersion:1,operationId:operation,clientRequestId:connection,selection:selected,
      purpose:'validation',providerResponseId:null,returnedModel:null,outcome:'failed',usageOrigin:'unknown',
      usage:null,firstVisibleTextMs:null,dispatchToTerminalMs:null,errorCode:'RESPONSE_ID_UNAVAILABLE'};
    expect(parseNativeBuiltinValidationResultV1(failure)).toEqual(failure);
    const usage={inputTokens:1,outputTokens:2,inputTotalTokens:1,cacheReadTokens:null,cacheWriteTokens:null,
      reasoningTokens:null,cacheWrite5mTokens:null,cacheWrite1hTokens:null};
    expect(()=>parseNativeBuiltinValidationResultV1({...failure,usage,usageOrigin:'provider_terminal',
      returnedModel:model.exactModelId})).toThrow();
    const local={schemaVersion:1,operationId:operation,clientRequestId:connection,scope:ack.scope,hostGeneration,
      catalogVersion:ack.catalogVersion,catalogDigest:ack.catalogDigest,selection:{...selected,providerId:'openai'},
      providerResponseId:null,returnedModel:model.exactModelId,outcome:'completed',usageOrigin:'provider_terminal',usage};
    expect(()=>parseNativeBuiltinLocalValidationV1(local)).toThrow();
  });
  it('retains a measured zero millisecond interval rather than manufacturing one millisecond',()=>{
    const result={schemaVersion:1,operationId:operation,clientRequestId:connection,selection:selected,
      purpose:'diagnostic',providerResponseId:'fixture-response',returnedModel:model.exactModelId,outcome:'completed',
      usageOrigin:'unknown',usage:null,firstVisibleTextMs:0,dispatchToTerminalMs:0,errorCode:null};
    expect(parseNativeBuiltinValidationResultV1(result)).toEqual(result);
    expect(()=>parseNativeBuiltinValidationResultV1({...result,dispatchToTerminalMs:-1})).toThrow();
  });
  it('keeps supplier secrets on the exact native sync body and requires explicit predecessor and inventory',()=>{
    const sync={schemaVersion:1,operationId:operation,localRef:source.localRef,localRevision:'b'.repeat(64),
      sourceRevision:'c'.repeat(64),inventoryRevision:'d'.repeat(64),providerId:'hunyuan',
      baseUrl:'https://tokenhub.tencentmaas.com/v1',apiKey:'fixture-private-only',
      expectedCredentialRevision:null,candidateModelIds:['fixture-exact']};
    expect(parseNativeBuiltinSourceSyncRequestV1(sync)).toEqual(sync);
    const {expectedCredentialRevision:_,...omitted}=sync;
    for(const value of [omitted,{...sync,accountOwner:owner},{...sync,candidateModelIds:[]},
      {...sync,candidateModelIds:['fixture-exact','fixture-exact']},{...sync,providerId:'openai'}])
      expect(()=>parseNativeBuiltinSourceSyncRequestV1(value)).toThrow();
  });
  it('returns only cached owned source details and rejects private credential or ticket fields',()=>{
    const details={schemaVersion:1,localRef:source.localRef,readiness:ready,balance:null,lastDiagnostics:[]};
    expect(parseNativeBuiltinSourceDetailV1(details)).toEqual(details);
    expect(()=>parseNativeBuiltinSourceDetailV1({...details,apiKey:'fixture-private-only'})).toThrow();
    expect(()=>parseNativeBuiltinSourceDetailV1({...details,readiness:{...ready,localRef:'another-source'}})).toThrow();
  });
  it('preserves exact multi-currency decimals and stale success time without reporting unknown as zero',()=>{
    const balance={state:'success',checkedAt:1893456000,lastSuccessAt:1893456000,
      currencies:[{currency:'CNY',available:'12.000000000000000001',cash:'9.00',grant:'3.000000000000000001'},
        {currency:'USD',available:'2.5',cash:null,grant:null}],plan:null,classification:'account_balance',
      errorCode:null,officialUrl:'https://platform.deepseek.com'};
    expect(parseNativeBuiltinSourceBalanceV1(balance)).toEqual(balance);
    const stale={...balance,state:'stale',checkedAt:1893456060,errorCode:'PROVIDER_UNAVAILABLE'};
    expect(parseNativeBuiltinSourceBalanceV1(stale).lastSuccessAt).toBe(1893456000);
    const unsupported={...balance,state:'unsupported',lastSuccessAt:null,currencies:[],classification:'unknown',errorCode:'UNSUPPORTED'};
    expect(parseNativeBuiltinSourceBalanceV1(unsupported).currencies).toEqual([]);
    for(const value of [{...unsupported,currencies:[balance.currencies[0]]},
      {...balance,currencies:[{...balance.currencies[0],available:12}]},
      {...stale,lastSuccessAt:1893456061},{...balance,currencies:[balance.currencies[0],balance.currencies[0]]}])
      expect(()=>parseNativeBuiltinSourceBalanceV1(value)).toThrow();
    for(const officialUrl of ['https://api-docs.deepseek.com/zh-cn/','https://platform.xiaomimimo.com/#/console/balance'])
      expect(parseNativeBuiltinSourceBalanceV1({...unsupported,officialUrl}).officialUrl).toBe(officialUrl);
    for(const officialUrl of ['http://unsafe.example.com/','https://key:secret@example.com/','javascript:alert(1)'])
      expect(()=>parseNativeBuiltinSourceBalanceV1({...unsupported,officialUrl})).toThrow();
  });
  it('binds pagination and trusted terminal counts to the immutable exact source and rejects forged session purposes',()=>{
    const usage={inputTokens:5,outputTokens:3,inputTotalTokens:5,cacheReadTokens:null,cacheWriteTokens:null,
      reasoningTokens:2,cacheWrite5mTokens:null,cacheWrite1hTokens:null};
    const row={schemaVersion:1,projectionVersion:1,requestId:connection,operationId:operation,purpose:'chat',scope,
      catalogRevision:grant.catalogRevision,grantRevision:grant.grantRevision,connectionId:connection,policyRevision:binding.policyRevision,
      exactModelId:model.exactModelId,membershipRevision:model.membershipRevision,capabilityRevision:model.capabilityRevision,
      adapterRevision:model.adapterRevision,priceAuthorityRevision:null,providerResponseId:'fixture-response',
      returnedModel:model.exactModelId,outcome:'completed',usage,createdAt:1893456000};
    const page={records:[row],nextCursor:{createdAt:row.createdAt,requestId:row.requestId}};
    expect(parseNativeBuiltinUsagePageV1(page)).toEqual(page);
    expect(()=>parseNativeBuiltinUsagePageV1({...page,nextCursor:{...page.nextCursor,requestId:operation}})).toThrow();
    expect(()=>parseNativeBuiltinUsagePageV1({...page,records:[{...row,returnedModel:'other-model'}]})).toThrow();
    const freeze={schemaVersion:1,scope:ack.scope,hostGeneration,catalogVersion:ack.catalogVersion,catalogDigest:ack.catalogDigest,
      selection:selected,authority:model,clientRequestId:connection,sessionId:'session-fixture',purpose:'chat'};
    expect(parseNativeBuiltinRequestFreezeV1(freeze)).toEqual(freeze);
    expect(()=>parseNativeBuiltinRequestFreezeV1({...freeze,sessionId:null})).toThrow();
    expect(()=>parseNativeBuiltinRequestFreezeV1({...freeze,purpose:'hidden-title'})).toThrow();
  });
});
