import {describe,expect,it} from 'vitest';
import {NATIVE_TOOLS} from './native-tools.js';
import {parseNativeToolMaterial,parseNativeToolMaterialRequest,parseToolConnectionToolId} from './tool-connection.js';
import {bindNativeToolAuthorityV2,parseNativeToolAuthorityV2,parseNativeToolBindingRequestV2,parseNativeToolCatalogV2,
  parseNativeToolMaterialRequestV2,parseNativeToolMaterialV2,parseNativeToolFrozenModelV2} from './native-tool-connection-v2.js';
import * as nativeContract from './native-tool-connection-v2.js';

const OWNER='018f0000-0000-7000-8000-000000000001';
const DEVICE='20000000-0000-4000-8000-000000000001';
const NONCE='30000000-0000-4000-8000-000000000001';
const CONNECTION='50000000-0000-4000-8000-000000000001';
const HANDLE='60000000-0000-4000-8000-000000000001';
const HASH='a'.repeat(64);
const model=(id='fixture-a',provider='deepseek')=>({logicalModelId:`logical-${id}`,providerId:provider,exactModelId:id,
  displayName:`Fixture ${id}`,toolId:'opencode',protocol:'openai_chat_completions',contextWindow:262144,
  maxOutputTokens:8192,capabilityFlags:['tool_use'],evidenceSha256:HASH,membershipRevision:'membership-1',availability:'available'});
const models=()=>[model(),model('fixture-b','kimi')];
const catalog=()=>({schemaVersion:2,catalogRevision:'catalog-1',tools:NATIVE_TOOLS,models:models()});
const request=()=>({audience:'studybuddy-native-tools-v2',toolId:'opencode',selectedModelId:'fixture-a',
  selectedProtocol:'openai_chat_completions',catalogRevision:'catalog-1',materialNonce:NONCE,receiptRevision:1});
const material=()=>({schemaVersion:2,connectionId:CONNECTION,accountOwner:OWNER,deviceId:DEVICE,toolId:'opencode',fundingSource:'platform',
  selectedProviderId:'deepseek',gatewayOrigin:'https://gateway.example.test',protocol:'openai_chat_completions',selectedModelId:'fixture-a',
  authorizedModelIds:['fixture-a','fixture-b'],authorizedModels:models(),membershipRevision:'membership-1',apiKey:'fixture-only-key',authorityHandle:HANDLE,
  pendingBindingRevision:'binding-1',credentialRevision:1,receiptRevision:1,catalogRevision:'catalog-1',policyRevision:'policy-1',pendingExpiresAt:'2026-10-07T00:05:00.000Z'});
const authority=()=>({schemaVersion:2,toolId:'opencode',protocol:'openai_chat_completions',state:'connected',permissionState:'eligible',
  accountOwner:OWNER,deviceId:DEVICE,fundingSource:'platform',authorizedModelIds:['fixture-a','fixture-b'],authorizedModels:models(),
  membershipRevision:'membership-1',bindingRevision:'binding-1',authorityHandle:HANDLE,credentialRevision:1,receiptRevision:1,
  catalogRevision:'catalog-1',policyRevision:'policy-1',lastVerifiedAt:'2026-10-07T00:00:00.000Z'});
const binding=()=>({schemaVersion:2,toolId:'opencode',protocol:'openai_chat_completions',connectionId:CONNECTION,authorityHandle:HANDLE,
  bindingRevision:'binding-1',credentialRevision:1,receiptRevision:1,catalogRevision:'catalog-1',policyRevision:'policy-1',membershipRevision:'membership-1'});

describe('exact native-tool v2 boundary',()=>{
  it('admits explicitly reviewed Harness platform providers without opening legacy tools or personal credential routes',()=>{
    for(const providerId of ['hunyuan','zhipu','minimax','mimo','volcengine']){
      for(const toolId of ['dsh','hermes','kimicode','openclaw','workbuddy']){
      const member={...model('exact-platform-model'),providerId,toolId};
      expect(parseNativeToolCatalogV2({...catalog(),models:[member]}).models[0]?.providerId).toBe(providerId);
      const proof={...material(),toolId,selectedProviderId:providerId,selectedModelId:member.exactModelId,authorizedModelIds:[member.exactModelId],authorizedModels:[member]};
      expect(parseNativeToolMaterialV2(proof).selectedProviderId).toBe(providerId);
      expect(()=>parseNativeToolCatalogV2({...catalog(),models:[{...member,toolId:'opencode'}]})).toThrow();
      expect(()=>nativeContract.parseNativeToolUserAPIMaterialRequestV2({...request(),userApi:{providerId,baseUrl:'https://supplier.example',apiKey:'synthetic',credentialReference:'ref',credentialRevision:'r1'}})).toThrow();
      expect(()=>parseNativeToolMaterialV2({...proof,fundingSource:'user_api',userApi:{connectionId:CONNECTION,credentialReference:'ref',credentialRevision:'r1'}})).toThrow();
      if(providerId!=='hunyuan')expect(()=>parseNativeToolCatalogV2({...catalog(),models:[{...member,toolId:'kimicode',protocol:'openai_responses'}]})).toThrow();
      if(['zhipu','volcengine'].includes(providerId))expect(()=>parseNativeToolCatalogV2({...catalog(),models:[{...member,toolId:'claude_code',protocol:'anthropic_messages'}]})).toThrow();
      }
    }
  });
  it('closes the owner-bound external-provider usage contract without inventing money or zero usage',()=>{
    const parseRequest=(nativeContract as Record<string,unknown>).parseNativeToolUsageRequestV2 as (v:unknown)=>unknown;
    const parsePage=(nativeContract as Record<string,unknown>).parseNativeToolUsagePageV2 as (v:unknown)=>unknown;
    expect(parseRequest).toBeTypeOf('function');expect(parsePage).toBeTypeOf('function');
    const query={binding:binding(),cursor:{createdAt:0,requestId:''},limit:100};
    expect(parseRequest(query)).toEqual(query);
    const row={requestId:'fixture-request',providerResponseId:'',providerId:'deepseek',modelId:'fixture-a',returnedModel:'',outcome:'unknown',createdAt:1791321600,
      inputTokens:null,outputTokens:null,inputTotalTokens:null,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null,cacheWrite5mTokens:null,cacheWrite1hTokens:null};
    const page={schemaVersion:2,accountOwner:OWNER,deviceId:DEVICE,toolId:'opencode',protocol:'openai_chat_completions',fundingSource:'user_api',billingMode:'external_provider',binding:binding(),records:[row],nextCursor:null};
    expect(parsePage(page)).toEqual(page);
    for(const value of [{...query,limit:101},{...query,cursor:{createdAt:1,requestId:''}},{...query,apiKey:'forbidden'}])expect(()=>parseRequest(value)).toThrow();
    for(const changed of [{inputTokens:0},{inputTokens:-1},{inputTokens:1.5},{apiKey:'forbidden'},{walletCharge:'0'}])expect(()=>parsePage({...page,records:[{...row,...changed}]})).toThrow();
    expect(()=>parsePage({...page,fundingSource:'platform'})).toThrow();
    expect(()=>parsePage({...page,binding:{...binding(),toolId:'pi'}})).toThrow();
  });
  it('accepts the dedicated closed own-supplier request but never through platform material issuance',()=>{
    const value={...request(),userApi:{providerId:'deepseek',baseUrl:'https://api.deepseek.com',apiKey:'synthetic-owned-supplier-key',
      credentialReference:'original-model-ref',credentialRevision:'original-model-r1'}};
    const parse=(nativeContract as Record<string,unknown>).parseNativeToolUserAPIMaterialRequestV2;
    expect(parse).toBeTypeOf('function');
    expect((parse as (v:unknown)=>unknown)(value)).toEqual(value);
    expect(()=>parseNativeToolMaterialRequestV2(value)).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID');
    for(const changed of [{baseUrl:'http://127.0.0.1:80'},{baseUrl:'https://api.deepseek.com/foreign'},
      {baseUrl:'https://api.deepseek.com?key=secret'},{providerId:'guessed'},{apiKey:''},{apiKey:'synthetic\u0000'},
      {credentialRevision:''},{accessToken:'forbidden'}]){
      expect(()=>(parse as (v:unknown)=>unknown)({...value,userApi:{...value.userApi,...changed}})).toThrow('NATIVE_TOOL_USER_API_MATERIAL_REQUEST_V2_INVALID');
    }
  });
  it('binds the private funding/connection revision without exporting the supplier Key',()=>{
    const userApi={connectionId:CONNECTION,credentialReference:'original-model-ref',credentialRevision:'original-model-r1'};
    const ownMaterial={...material(),fundingSource:'user_api',authorizedModelIds:['fixture-a'],authorizedModels:[model()],userApi};
    const ownAuthority={...authority(),fundingSource:'user_api',authorizedModelIds:['fixture-a'],authorizedModels:[model()],userApi};
    expect(parseNativeToolMaterialV2(ownMaterial)).toEqual(ownMaterial);
    expect(parseNativeToolAuthorityV2(ownAuthority)).toEqual(ownAuthority);
    expect(()=>bindNativeToolAuthorityV2(ownMaterial,ownAuthority,OWNER,DEVICE,'2026-10-07T00:00:00.000Z')).not.toThrow();
    for(const value of [{...ownMaterial,userApi:undefined},{...material(),userApi},
      {...ownMaterial,userApi:{...userApi,apiKey:'forbidden'}},{...ownMaterial,authorizedModels:models(),authorizedModelIds:['fixture-a','fixture-b']}]){
      expect(()=>parseNativeToolMaterialV2(value)).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
    }
    expect(()=>bindNativeToolAuthorityV2(ownMaterial,{...ownAuthority,userApi:{...userApi,credentialRevision:'changed'}},OWNER,DEVICE,'2026-10-07T00:00:00.000Z')).toThrow('NATIVE_TOOL_AUTHORITY_BINDING_V2_INVALID');
  });
  it('decodes known frozen cleanup facts without using them to re-enable an unverified tool',()=>{
    const frozen={...model(),toolId:'cline'};
    expect(parseNativeToolFrozenModelV2(frozen)).toEqual(frozen);
    expect(()=>parseNativeToolCatalogV2({...catalog(),models:[frozen]})).toThrow('NATIVE_TOOL_CATALOG_V2_INVALID');
    expect(()=>parseNativeToolFrozenModelV2({...frozen,apiKey:'forbidden'})).toThrow('NATIVE_TOOL_FROZEN_MODEL_V2_INVALID');
    expect(()=>parseNativeToolFrozenModelV2({...frozen,contextWindow:0})).toThrow('NATIVE_TOOL_FROZEN_MODEL_V2_INVALID');
  });
  it('accepts equivalent metadata regardless of JSON object field order',()=>{
    const tools=NATIVE_TOOLS.map(t=>({...t,platformSupport:{linux:t.platformSupport.linux,macos:t.platformSupport.macos,windows:t.platformSupport.windows}}));
    expect(parseNativeToolCatalogV2({...catalog(),tools})).toEqual(catalog());
  });
  it('does not execute untrusted metadata accessors or echo their error text',()=>{
    const malicious={...NATIVE_TOOLS[0]};let reads=0;
    Object.defineProperty(malicious,'id',{get(){reads++;throw new Error('fixture-only-secret');}});
    expect(()=>parseNativeToolCatalogV2({...catalog(),tools:[malicious,...NATIVE_TOOLS.slice(1)]})).toThrow('NATIVE_TOOL_CATALOG_V2_INVALID');
    expect(reads).toBe(0);
  });
  it('accepts the real OpenCode identity and Chat protocol without a Codex alias',()=>{
    expect(parseNativeToolCatalogV2(catalog())).toEqual(catalog());
    expect(parseNativeToolMaterialRequestV2(request())).toEqual(request());
    expect(parseNativeToolMaterialV2(material())).toEqual(material());
    expect(parseNativeToolAuthorityV2(authority())).toEqual(authority());
    expect(parseNativeToolBindingRequestV2(binding())).toEqual(binding());
  });
  it('keeps v1 strictly two-tool/two-protocol and rejects v2 envelopes',()=>{
    expect(parseToolConnectionToolId('codex')).toBe('codex');
    expect(()=>parseToolConnectionToolId('opencode')).toThrow('TOOL_CONNECTION_TOOL_INVALID');
    expect(()=>parseNativeToolMaterialRequest(request())).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_INVALID');
    expect(()=>parseNativeToolMaterial(material())).toThrow('NATIVE_TOOL_MATERIAL_INVALID');
  });
  it('retains all 38 exact management definitions, refusing missing, duplicate and altered tools',()=>{
    for(const tools of [NATIVE_TOOLS.slice(1),[...NATIVE_TOOLS.slice(1),NATIVE_TOOLS[1]],
      NATIVE_TOOLS.map(t=>t.id==='opencode'?{...t,nativeConfigScope:'codex-home'}:t)]){
      expect(()=>parseNativeToolCatalogV2({...catalog(),tools})).toThrow('NATIVE_TOOL_CATALOG_V2_INVALID');
    }
  });
  it('rejects unmanaged and pending-contract issuance before material consumption',()=>{
    for(const toolId of ['cursor','cline','grok','unknown','claudecode']){
      expect(()=>parseNativeToolMaterialRequestV2({...request(),toolId})).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID');
      expect(()=>parseNativeToolMaterialV2({...material(),toolId})).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
    }
  });
  it('rejects wrong or guessed protocols and never infers them from a model name',()=>{
    for(const selectedProtocol of ['anthropic_messages','openai','chat','',null]){
      expect(()=>parseNativeToolMaterialRequestV2({...request(),selectedProtocol})).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID');
    }
    expect(()=>parseNativeToolMaterialRequestV2({...request(),toolId:'codex',selectedProtocol:'openai_chat_completions'})).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID');
    expect(()=>parseNativeToolMaterialRequestV2({...request(),toolId:'claude_code',selectedProtocol:'openai_responses'})).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID');
  });
  it('rejects unknown fields, Keys, prototype-shaped inputs and missing revisions in public requests',()=>{
    for(const value of [{...request(),apiKey:'fixture-secret'},Object.assign(Object.create(null),request()),
      {...request(),catalogRevision:''},{...request(),receiptRevision:0},{...request(),receiptRevision:NaN},
      {...request(),materialNonce:'arbitrary'}, {...request(),audience:'studybuddy-native-v1'}]){
      expect(()=>parseNativeToolMaterialRequestV2(value)).toThrow('NATIVE_TOOL_MATERIAL_REQUEST_V2_INVALID');
    }
    expect(()=>parseNativeToolBindingRequestV2({...binding(),apiKey:'fixture-secret'})).toThrow('NATIVE_TOOL_BINDING_REQUEST_V2_INVALID');
  });
  it('requires exact metadata, evidence, capacities and explicit capability facts',()=>{
    for(const changed of [{contextWindow:0},{contextWindow:1.5},{maxOutputTokens:0},{maxOutputTokens:262145},
      {evidenceSha256:'unverified'},{membershipRevision:''},{capabilityFlags:['guessed-search']},
      {capabilityFlags:['tool_use','tool_use']},{providerId:'inferred'},{exactModelId:'bad id'},{extra:true}]){
      expect(()=>parseNativeToolCatalogV2({...catalog(),models:[{...model(),...changed}]})).toThrow('NATIVE_TOOL_CATALOG_V2_INVALID');
    }
    expect(parseNativeToolCatalogV2({...catalog(),models:[{...model(),maxOutputTokens:null}]})).toEqual({...catalog(),models:[{...model(),maxOutputTokens:null}]});
  });
  it('binds ordered complete membership, exact provider and selected model without invented defaults',()=>{
    for(const changed of [{authorizedModelIds:['fixture-b','fixture-a']},{authorizedModelIds:['fixture-a','fixture-a']},
      {authorizedModelIds:['fixture-a']},{authorizedModels:[model()]},{authorizedModelIds:[]},{authorizedModels:[]},
      {selectedModelId:'fixture-unknown'},{selectedProviderId:'kimi'},
      {authorizedModels:[model(),{...model('fixture-b','kimi'),toolId:'codex'}]},
      {authorizedModels:[model(),{...model('fixture-b','kimi'),protocol:'openai_responses'}]},
      {authorizedModels:[model(),{...model('fixture-b','kimi'),membershipRevision:'membership-2'}]},
      {authorizedModels:[{...model(),availability:'unavailable'},model('fixture-b','kimi')]}]){
      expect(()=>parseNativeToolMaterialV2({...material(),...changed})).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
    }
  });
  it('does not turn user_api funding, missing owner/device or policy fields into platform authority',()=>{
    for(const changed of [{fundingSource:'user_api'},{accountOwner:'missing'},{deviceId:''},{credentialRevision:0},
      {receiptRevision:0},{catalogRevision:null},{policyRevision:''},{membershipRevision:''},{pendingBindingRevision:''}]){
      expect(()=>parseNativeToolMaterialV2({...material(),...changed})).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
    }
  });
  it('does not accept private origins, malformed credentials or expiry timestamps',()=>{
    for(const gatewayOrigin of ['http://gateway.example.test','https://localhost','https://127.0.0.2',
      'https://10.0.0.1','https://gateway.example.test/v1','https://user:password@gateway.example.test',
      'https://[::1]','https://gateway.example.test?key=fixture']){
      expect(()=>parseNativeToolMaterialV2({...material(),gatewayOrigin})).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
    }
    for(const changed of [{apiKey:''},{apiKey:'contains whitespace'},{apiKey:'fixture\u0000'},
      {pendingExpiresAt:'2026-10-07'},{pendingExpiresAt:'2026-02-30T00:00:00.000Z'}]){
      expect(()=>parseNativeToolMaterialV2({...material(),...changed})).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
    }
  });
  it('bounds membership at 64 and does not truncate a 65th member',()=>{
    const rows=Array.from({length:64},(_,i)=>model(`fixture-${i.toString().padStart(2,'0')}`));
    const full={...material(),selectedModelId:rows[0]!.exactModelId,authorizedModelIds:rows.map(m=>m.exactModelId),authorizedModels:rows};
    expect(parseNativeToolMaterialV2(full)).toEqual(full);
    expect(()=>parseNativeToolMaterialV2({...full,authorizedModelIds:[...full.authorizedModelIds,'fixture-64'],authorizedModels:[...rows,model('fixture-64')]})).toThrow('NATIVE_TOOL_MATERIAL_V2_INVALID');
  });
  it('public authority has no Key and refuses contradictory active/absent shapes',()=>{
    for(const changed of [{apiKey:'fixture-secret'},{state:'available'},{state:'unavailable'},
      {authorityHandle:null},{policyRevision:null},{authorizedModels:null},{permissionState:'unavailable'}]){
      expect(()=>parseNativeToolAuthorityV2({...authority(),...changed})).toThrow('NATIVE_TOOL_AUTHORITY_V2_INVALID');
    }
    const absent={...authority(),state:'available',authorizedModelIds:[],authorizedModels:[],membershipRevision:null,
      bindingRevision:null,authorityHandle:null,credentialRevision:null,receiptRevision:null,policyRevision:null};
    expect(parseNativeToolAuthorityV2(absent)).toEqual(absent);
    const stale={...authority(),state:'conflict',permissionState:'unavailable',authorizedModels:null};
    expect(parseNativeToolAuthorityV2(stale)).toEqual(stale);
  });
  it('distinguishes an exact pending application from a configuration conflict or a connected tool',()=>{
    const pending={...authority(),state:'pending',permissionState:'unavailable'};
    expect(parseNativeToolAuthorityV2(pending)).toEqual(pending);
    for(const changed of [{permissionState:'eligible'},{authorityHandle:null},{authorizedModels:null}]){
      expect(()=>parseNativeToolAuthorityV2({...pending,...changed})).toThrow('NATIVE_TOOL_AUTHORITY_V2_INVALID');
    }
    expect(()=>bindNativeToolAuthorityV2(material(),pending,OWNER,DEVICE,'2026-10-07T00:00:01.000Z')).toThrow('NATIVE_TOOL_AUTHORITY_BINDING_V2_INVALID');
  });
  it('binds material only to the exact fresh, funded, activated authority',()=>{
    expect(()=>bindNativeToolAuthorityV2(material(),authority(),OWNER,DEVICE,'2026-10-07T00:00:01.000Z')).not.toThrow();
    for(const changed of [{accountOwner:DEVICE},{deviceId:OWNER},{toolId:'codex'},{protocol:'openai_responses'},
      {bindingRevision:'another-binding'},{authorityHandle:CONNECTION},{credentialRevision:2},{receiptRevision:2},
      {catalogRevision:'catalog-2'},{policyRevision:'policy-2'},{membershipRevision:'membership-2'},
      {authorizedModels:[{...model(),contextWindow:524288},model('fixture-b','kimi')]},
      {lastVerifiedAt:null},{permissionState:'funding_required'},{state:'conflict',permissionState:'unavailable'}]){
      expect(()=>bindNativeToolAuthorityV2(material(),{...authority(),...changed},OWNER,DEVICE,'2026-10-07T00:00:01.000Z')).toThrow('NATIVE_TOOL_AUTHORITY_BINDING_V2_INVALID');
    }
    expect(()=>bindNativeToolAuthorityV2(material(),authority(),DEVICE,OWNER,'2026-10-07T00:00:01.000Z')).toThrow('NATIVE_TOOL_AUTHORITY_BINDING_V2_INVALID');
    expect(()=>bindNativeToolAuthorityV2(material(),authority(),OWNER,DEVICE,'2026-10-07T00:05:00.000Z')).toThrow('NATIVE_TOOL_AUTHORITY_BINDING_V2_INVALID');
  });
});
