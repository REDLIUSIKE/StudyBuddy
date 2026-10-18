import {describe,it,expect} from 'vitest';
import {parseNativeUserSourceDraftV2,parseDiscoveredModelCatalogV2,parseNativeUserSourceCheckV2,parseNativeUserSourceSaveRequestV2,parseNativeUserSourceSaveResultV2,parseNativeUserSourceRegistrationV2,parseNativeUserSourcesV2} from './native-user-sources.js';
import * as sources from './native-user-sources.js';
const stamp='2026-10-09T01:00:00.000Z';
const draft={schemaVersion:2,internalId:null,expectedLocalRevision:null,name:'我的来源',apiKey:'test-user-key-not-real',sourcePresetId:'kimi',advanced:null};
const catalog={schemaVersion:2,inventoryRevision:'a'.repeat(64),fetchedAt:stamp,endpoint:'https://api.moonshot.cn/v1/models',responseSha256:['b'.repeat(64)],models:[
  {exactModelId:'vendor/model"quoted',ownedBy:null,lifecycle:null,shutdownDate:null},
  {exactModelId:'../directory/id',ownedBy:'vendor',lifecycle:'deprecated',shutdownDate:'2027-01-01'}]};
const check={schemaVersion:2,route:'local_direct',sourceRevision:'c'.repeat(64),inventory:catalog,ping:{success:true,latencyMs:82,url:'https://api.moonshot.cn',errorCode:null},
  probe:{protocol:'openai_chat_completions',success:true,latencyMs:40,returnedModel:catalog.models[0]!.exactModelId,response:'OK',errorCode:null},
  verificationId:'b742b8d4-dcf7-49bc-a6c5-c95e522c2c42',verifiedAt:stamp,expiresAt:'2026-10-09T01:10:00.000Z',errorCode:null};
describe('native source schema 2',()=>{
  it('accepts a source without a manual model or protocol',()=>{expect(parseNativeUserSourceDraftV2(draft)).toEqual(draft)});
  it('accepts the complete keyless inventory with literal exact IDs and lifecycle',()=>{expect(parseDiscoveredModelCatalogV2(catalog)).toEqual(catalog);expect(JSON.stringify(parseDiscoveredModelCatalogV2(catalog))).not.toContain(draft.apiKey)});
  it('requires explicit nullable fields and denies unknown fields',()=>{
    for(const input of [draft,catalog])for(const key of Object.keys(input)){
      const changed:Record<string,unknown>={...input};delete changed[key];
      const parse=input===draft?parseNativeUserSourceDraftV2:parseDiscoveredModelCatalogV2;
      expect(()=>parse(changed)).toThrow();
    }
    expect(()=>parseNativeUserSourceDraftV2({...draft,modelId:'kimi-k3'})).toThrow();
    expect(()=>parseDiscoveredModelCatalogV2({...catalog,apiKey:draft.apiKey})).toThrow();
    let invoked=false;const getter={...draft};Object.defineProperty(getter,'name',{enumerable:true,get(){invoked=true;return 'x'}});
    expect(()=>parseNativeUserSourceDraftV2(getter)).toThrow();expect(invoked).toBe(false);
  });
  it('rejects invalid/duplicate IDs, control characters, incomplete/empty arrays and digest misuse',()=>{
    for(const id of ['', 'a\u0000b','é'.repeat(257)])expect(()=>parseDiscoveredModelCatalogV2({...catalog,models:[{...catalog.models[0],exactModelId:id}]})).toThrow();
    for(const models of [[],[catalog.models[0],catalog.models[0]]])expect(()=>parseDiscoveredModelCatalogV2({...catalog,models})).toThrow();
    expect(()=>parseDiscoveredModelCatalogV2({...catalog,responseSha256:[]})).toThrow();
    expect(()=>parseDiscoveredModelCatalogV2({...catalog,inventoryRevision:'not-a-sha'})).toThrow();
  });
  it('issues a check proof only for one successful tested model in the inventory',()=>{
    expect(parseNativeUserSourceCheckV2(check)).toEqual(check);
    expect(()=>parseNativeUserSourceCheckV2({...check,probe:{...check.probe,returnedModel:'not-listed'}})).toThrow();
    expect(()=>parseNativeUserSourceCheckV2({...check,probe:null})).toThrow();
    expect(()=>parseNativeUserSourceCheckV2({...check,errorCode:'API_TIMEOUT'})).toThrow();
    expect(()=>parseNativeUserSourceCheckV2({...check,expiresAt:'2026-10-09T01:10:00.001Z'})).toThrow();
    expect(()=>parseNativeUserSourceCheckV2({...check,sourceRevision:null})).toThrow();
  });
  it('allows a failed check without a proof, but never a fake successful check',()=>{
    const failed={...check,sourceRevision:null,inventory:null,probe:null,verificationId:null,verifiedAt:null,expiresAt:null,errorCode:'MODEL_INVENTORY_INCOMPLETE'};
    expect(parseNativeUserSourceCheckV2(failed)).toEqual(failed);
    expect(()=>parseNativeUserSourceCheckV2({...failed,errorCode:null})).toThrow();
  });
});

describe('registered source wire schema 2',()=>{
  const regRef={operationId:'b742b8d4-dcf7-49bc-a6c5-c95e522c2c42',credentialId:'d742b8d4-dcf7-49bc-a6c5-c95e522c2c42',credentialRevision:'registered-r1',localRef:'m-fixture',sourceRevision:'c'.repeat(64)};
  const prepare={schemaVersion:2,operationId:regRef.operationId,localRef:regRef.localRef,expectedCredentialRevision:null,expectedOperationId:null,sourceRevision:regRef.sourceRevision,inventoryRevision:'a'.repeat(64),providerId:'kimi',baseUrl:'https://api.moonshot.cn/v1',anthropicUrl:null,apiKey:'synthetic-key',catalogRevision:'manual-r1',clientVerifiedAt:stamp,memberships:[{exactModelId:'kimi-k3',protocol:'openai_responses',membershipRevision:'manual-r1'}]};
  const material={audience:'studybuddy-native-tools-v2',toolId:'codex',selectedModelId:'codex.kimi-k3',selectedProtocol:'openai_responses',catalogRevision:'manual-r1',materialNonce:regRef.operationId,receiptRevision:1,registration:regRef};
  it('accepts exact source prepare, disallows local foreign provider/relay and unbounded memberships',()=>{
    const parse=(sources as any).parseNativeUserCredentialPrepareV2;expect(parse(prepare)).toEqual(prepare);
    for(const change of [{providerId:'openai'},{baseUrl:'https://relay.example.test/v1'},{expectedCredentialRevision:'r2'},{memberships:[]},{memberships:[...prepare.memberships,...prepare.memberships]},{memberships:Array.from({length:257},(_,i)=>({...prepare.memberships[0],exactModelId:'m-'+i}))}])expect(()=>parse({...prepare,...change})).toThrow();
    expect(()=>parse({...prepare,modelId:'kimi-k3'})).toThrow();
  });
  it('freezes operation and source revision in registration-only material',()=>{
    const parse=(sources as any).parseNativeRegisteredSourceMaterialRequestV2;expect(parse(material)).toEqual(material);
    for(const key of Object.keys(regRef)){const altered:any={...regRef};delete altered[key];expect(()=>parse({...material,registration:altered})).toThrow();}
    for(const change of [{apiKey:'synthetic-key'},{userApi:{apiKey:'synthetic-key'}},{registration:{...regRef,sourceRevision:'old'}}])expect(()=>parse({...material,...change})).toThrow();
    expect((sources as any).parseNativeUserCredentialRefV2({schemaVersion:2,...regRef})).toEqual({schemaVersion:2,...regRef});
  });
});
const operation='b742b8d4-dcf7-49bc-a6c5-c95e522c2c42';
const receipt={schemaVersion:2,operationId:operation,credentialId:'d742b8d4-dcf7-49bc-a6c5-c95e522c2c42',credentialRevision:'registered-r1',localRef:'m-fixture',sourceRevision:'c'.repeat(64),inventoryRevision:catalog.inventoryRevision,state:'active',providerId:'kimi',catalogRevision:'manual-r1',memberships:[{exactModelId:'kimi-k3',protocol:'openai_responses',membershipRevision:'manual-r1'}],verifiedAt:stamp};
describe('native source save schema 2',()=>{
  it('validates proof-bound save requests before any IPC effect',()=>{const request={schemaVersion:2,operationId:operation,draft,verificationId:operation};expect(parseNativeUserSourceSaveRequestV2(request)).toEqual(request);expect(()=>parseNativeUserSourceSaveRequestV2({...request,verificationId:'tested'})).toThrow();expect(()=>parseNativeUserSourceSaveRequestV2({...request,apiKey:draft.apiKey})).toThrow()});
  it('edit CAS uses a digest, not a caller-provided version label',()=>{expect(()=>parseNativeUserSourceDraftV2({...draft,internalId:'m-owned',expectedLocalRevision:'version-1'})).toThrow();expect(parseNativeUserSourceDraftV2({...draft,internalId:'m-owned',expectedLocalRevision:'e'.repeat(64)}).expectedLocalRevision).toBe('e'.repeat(64))});
  it('local saved results have no registration, domestic saved needs active exact receipt',()=>{
    const local={schemaVersion:2,state:'saved',route:'local_direct',localRef:'m-fixture',sourceRevision:'c'.repeat(64),registration:null,pendingPhase:null};expect(parseNativeUserSourceSaveResultV2(local)).toEqual(local);
    expect(()=>parseNativeUserSourceSaveResultV2({...local,registration:receipt})).toThrow();expect(()=>parseNativeUserSourceSaveResultV2({...local,pendingPhase:'local_publish'})).toThrow();
    const domestic={...local,route:'domestic_registered',registration:receipt};expect(parseNativeUserSourceSaveResultV2(domestic)).toEqual(domestic);
    for(const change of [{state:'prepared'},{sourceRevision:'d'.repeat(64)},{localRef:'other'}])expect(()=>parseNativeUserSourceSaveResultV2({...domestic,registration:{...receipt,...change}})).toThrow();
  });
  it('keeps shared membership exact and rejects credential leakage or duplicate protocol pairs',()=>{
    expect(parseNativeUserSourceRegistrationV2(receipt)).toEqual(receipt);expect(()=>parseNativeUserSourceRegistrationV2({...receipt,apiKey:draft.apiKey})).toThrow();expect(()=>parseNativeUserSourceRegistrationV2({...receipt,memberships:[...receipt.memberships,...receipt.memberships]})).toThrow();
  });
  it('lists keyless local views, preserves legacy and requires a tested inventory model for saved',()=>{
    const view={localRef:'m-fixture',localRevision:'d'.repeat(64),sourceRevision:'c'.repeat(64),name:'Owned',route:'local_direct',inventory:catalog,testedModelId:catalog.models[0]!.exactModelId,testedProtocol:'openai_responses',state:'saved',operationId:operation,registration:null};
    expect(parseNativeUserSourcesV2([view])).toEqual([view]);expect(parseNativeUserSourcesV2([])).toEqual([]);expect(()=>parseNativeUserSourcesV2([{...view,apiKey:draft.apiKey}])).toThrow();expect(()=>parseNativeUserSourcesV2([{...view,testedModelId:'not-returned'}])).toThrow();expect(()=>parseNativeUserSourcesV2([view,view])).toThrow();
    const legacy={...view,sourceRevision:null,inventory:null,testedModelId:null,testedProtocol:null,state:'legacy',operationId:null};expect(parseNativeUserSourcesV2([legacy])).toEqual([legacy]);expect(()=>parseNativeUserSourcesV2([{...legacy,state:'saved'}])).toThrow();
  });
});
