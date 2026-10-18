import { describe, expect, it } from 'vitest';
import * as v3 from './native-source-grants-v3.js';
import { parseNativeToolMaterialV2, parseNativeToolBindingRequestV2 } from './native-tool-connection-v2.js';

const owner='00000000-0000-4000-8000-000000000001', device='00000000-0000-4000-8000-000000000002';
const model=(id:string)=>({logicalModelId:`logical-${id}`,exactModelId:id,providerId:'kimi',displayName:id,toolId:'codex',protocol:'openai_responses',contextWindow:100,maxOutputTokens:50,capabilityFlags:['tool_use'],evidenceSha256:'a'.repeat(64),membershipRevision:`membership-${id}`,availability:'available',capabilityRevision:`capability-${id}`,adapterRevision:`adapter-${id}`,priceAuthorityRevision:null});
const scope={ownerReference:owner,deviceReference:device,toolId:'codex',providerId:'kimi',baseUrl:'https://api.moonshot.cn/v1',credentialReference:'m-source',credentialRevision:'supplier-revision',protocol:'openai_responses',fundingSource:'user_api'};
const grant=()=>({schemaVersion:1,grantRevision:'b'.repeat(64),scope,allowedModels:[model('fixture-a'),model('fixture-b')]});
const binding=()=>({schemaVersion:3,toolId:'codex',protocol:'openai_responses',connectionId:owner,authorityHandle:device,bindingRevision:'binding',credentialRevision:1,receiptRevision:1,catalogRevision:'catalog',policyRevision:'policy',grantRevision:'b'.repeat(64)});
const material=()=>({schemaVersion:3,connectionId:owner,accountOwner:owner,deviceId:device,toolId:'codex',fundingSource:'user_api',userApi:{connectionId:owner,credentialReference:'m-source',credentialRevision:'supplier-revision'},selectedProviderId:'kimi',gatewayOrigin:'https://gateway.example.com',protocol:'openai_responses',selectedModelId:'fixture-a',sourceGrant:grant(),apiKey:'test-gateway-key-not-real',authorityHandle:device,pendingBindingRevision:'binding',credentialRevision:1,receiptRevision:1,catalogRevision:'catalog',policyRevision:'policy',pendingExpiresAt:'2026-10-09T00:05:00.000Z'});

describe('native source grants V3 (synthetic authority only)',()=>{
  it('full_grant_keeps_independent_revisions',()=>{expect(v3.parseNativeSourceGrantV1(grant()).allowedModels.map(m=>m.membershipRevision)).toEqual(['membership-fixture-a','membership-fixture-b']);});
  it('strict_v3_never_reuses_v2_decoder',()=>{
    expect(v3.parseNativeToolMaterialV3(material()).sourceGrant.allowedModels).toHaveLength(2);
    expect(v3.parseNativeToolBindingV3(binding()).grantRevision).toBe('b'.repeat(64));
    expect(()=>parseNativeToolMaterialV2(material())).toThrow();expect(()=>parseNativeToolBindingRequestV2(binding())).toThrow();
    expect(()=>v3.parseNativeToolMaterialV3({...material(),schemaVersion:2})).toThrow();
    expect(()=>v3.parseNativeToolMaterialV3({...material(),membershipRevision:'fake-global'})).toThrow();
  });
  it('rejects_empty_duplicate_unsorted_65th_and_cross_scope_members',()=>{
    for(const allowedModels of [[],[model('fixture-a'),model('fixture-a')],[model('fixture-b'),model('fixture-a')],Array.from({length:65},(_,i)=>model(`fixture-${String(i).padStart(2,'0')}`)),[model('fixture-a'),{...model('fixture-b'),providerId:'deepseek'}],[{...model('fixture-a'),protocol:'openai_chat_completions'}],[{...model('fixture-a'),exactModelId:'a,b'}]])expect(()=>v3.parseNativeSourceGrantV1({...grant(),allowedModels})).toThrow();
    for(const change of [{baseUrl:'https://relay.example.com/v1'},{providerId:'openai'},{fundingSource:'platform'},{baseUrl:'https://api.moonshot.cn/anthropic'}])expect(()=>v3.parseNativeSourceGrantV1({...grant(),scope:{...scope,...change}})).toThrow();
  });
  it('rejects_accessors_unknown_fields_and_unbound_material',()=>{
    const hostile={...grant()};Object.defineProperty(hostile,'grantRevision',{get(){throw new Error('must not execute accessor');}});
    expect(()=>v3.parseNativeSourceGrantV1(hostile)).toThrow();
    for(const change of [{accountOwner:device},{selectedModelId:'unreviewed'},{fundingSource:'platform'},{userApi:{...material().userApi,credentialRevision:'other'}}])expect(()=>v3.parseNativeToolMaterialV3({...material(),...change})).toThrow();
  });
  it('request_is_registered_only_and_does_not_accept_frontend_allowlist',()=>{
    const request={audience:'studybuddy-native-tools-v3',toolId:'codex',selectedModelId:'logical-fixture-b',selectedProtocol:'openai_responses',catalogRevision:'catalog',materialNonce:owner,receiptRevision:1,installedToolVersion:'0.160.0',registration:{operationId:owner,credentialId:device,credentialRevision:'supplier-revision',localRef:'m-source',sourceRevision:'c'.repeat(64)}};
    expect(v3.parseNativeUserSourceMaterialRequestV3(request).selectedModelId).toBe('logical-fixture-b');
    const actualVersion={...request,toolId:'dsh',selectedProtocol:'openai_chat_completions',installedToolVersion:'0.2.1-alpha.1'};
    expect(v3.parseNativeUserSourceMaterialRequestV3(actualVersion).installedToolVersion).toBe('0.2.1-alpha.1');
    for(const installedToolVersion of ['v0.2.1','00.2.1','0.2.1-alpha.01','0.2.1+','9007199254740992.0.0'])expect(()=>v3.parseNativeUserSourceMaterialRequestV3({...actualVersion,installedToolVersion})).toThrow();
    for(const change of [{audience:'studybuddy-native-tools-v2'},{allowedModels:['fixture-a']},{installedToolVersion:''},{userApi:{apiKey:'must-not-enter-registered-request'}}])expect(()=>v3.parseNativeUserSourceMaterialRequestV3({...request,...change})).toThrow();
  });
  it('authority_absent_and_pending_active_shapes_are_distinct',()=>{
    const base={schemaVersion:3,toolId:'codex',protocol:'openai_responses',state:'available',permissionState:'eligible',accountOwner:owner,deviceId:device,fundingSource:'user_api',userApi:material().userApi,sourceGrant:null,bindingRevision:null,authorityHandle:null,credentialRevision:null,receiptRevision:null,catalogRevision:'catalog',policyRevision:null,lastVerifiedAt:null};
    expect(v3.parseNativeToolAuthorityV3(base).sourceGrant).toBeNull();expect(()=>v3.parseNativeToolAuthorityV3({...base,state:'connected'})).toThrow();
    const active={...base,state:'connected',sourceGrant:grant(),bindingRevision:'binding',authorityHandle:device,credentialRevision:1,receiptRevision:1,policyRevision:'policy',lastVerifiedAt:'2026-10-09T00:00:00.000Z'};
    expect(v3.parseNativeToolAuthorityV3(active).sourceGrant?.allowedModels).toHaveLength(2);expect(()=>v3.parseNativeToolAuthorityV3({...active,sourceGrant:null})).toThrow();
  });
  it('usage_is_per_actual_member_and_rejects_conflicting_terminal_counts',()=>{
    const usage={requestId:'request-b',providerResponseId:'response-b',providerId:'kimi',modelId:'fixture-b',returnedModel:'fixture-b',outcome:'completed',createdAt:1,inputTokens:10,outputTokens:2,inputTotalTokens:10,cacheReadTokens:0,cacheWriteTokens:null,reasoningTokens:1,cacheWrite5mTokens:null,cacheWrite1hTokens:null,grantRevision:'b'.repeat(64),membershipRevision:'membership-fixture-b',capabilityRevision:'capability-fixture-b',adapterRevision:'adapter-fixture-b',priceAuthorityRevision:null};
    const page={schemaVersion:3,accountOwner:owner,deviceId:device,toolId:'codex',protocol:'openai_responses',fundingSource:'user_api',billingMode:'external_provider',binding:binding(),records:[usage],nextCursor:null};
    expect(v3.parseNativeToolUsagePageV3(page).records[0]?.membershipRevision).toBe('membership-fixture-b');
    for(const change of [{returnedModel:'fixture-a'},{reasoningTokens:3},{grantRevision:'c'.repeat(64)},{inputTokens:null},{inputTotalTokens:11}])expect(()=>v3.parseNativeToolUsagePageV3({...page,records:[{...usage,...change}]})).toThrow();
  });
});
