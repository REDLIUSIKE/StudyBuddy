import {describe,expect,it} from 'vitest';
import * as contract from './native-user-models.js';

const OP='30000000-0000-4000-8000-000000000001';
const CREDENTIAL='40000000-0000-4000-8000-000000000001';
const NOW='2026-10-09T00:00:00.000Z';
const draft=()=>({schemaVersion:1,internalId:null,expectedLocalRevision:null,name:'我的 DeepSeek',baseUrl:'https://api.deepseek.com',
  anthropicUrl:null,apiKey:'synthetic-user-key',modelId:'deepseek-flash',protocols:['openai_chat_completions']});
const registration=()=>({schemaVersion:1,operationId:OP,credentialId:CREDENTIAL,credentialRevision:'credential-r1',localRef:'m-123456',
  state:'active',providerId:'deepseek',modelId:'deepseek-flash',protocols:['openai_chat_completions'],catalogRevision:'catalog-r1',membershipRevision:'membership-r1',verifiedAt:NOW});
const prepare=()=>({schemaVersion:1,operationId:OP,localRef:'m-123456',expectedCredentialRevision:null,providerId:'deepseek',baseUrl:'https://api.deepseek.com',
  anthropicUrl:null,apiKey:'synthetic-user-key',modelId:'deepseek-flash',protocols:['openai_chat_completions'],catalogRevision:'catalog-r1',membershipRevision:'membership-r1',clientVerifiedAt:NOW});
const reference=()=>({schemaVersion:1,operationId:OP,credentialId:CREDENTIAL,credentialRevision:'credential-r1',localRef:'m-123456'});

describe('closed user-model registration contracts',()=>{
  it('accepts the draft without treating a Key as a model',()=>{
    expect(contract.parseNativeUserModelDraftV1(draft())).toEqual(draft());
    for(const changed of [{schemaVersion:2},{apiKey:''},{apiKey:'key\n'},{modelId:''},{modelId:'guessed model'},
      {protocols:[]},{protocols:['openai_chat_completions','openai_chat_completions']},{baseUrl:'https://user:pass@api.deepseek.com'},
      {baseUrl:'https://api.deepseek.com?key=x'},{accessToken:'not-a-supplier-key'}])
      expect(()=>contract.parseNativeUserModelDraftV1({...draft(),...changed})).toThrow();
  });
  it('does not execute metadata getters or accept nonplain records',()=>{
    let reads=0;const value={...draft()};Object.defineProperty(value,'apiKey',{get(){reads++;return 'secret';}});
    expect(()=>contract.parseNativeUserModelDraftV1(value)).toThrow();expect(reads).toBe(0);
    expect(()=>contract.parseNativeUserModelDraftV1(Object.assign(Object.create(null),draft()))).toThrow();
  });
  it('requires every protocol to succeed and binds proof timestamps',()=>{
    const result={schemaVersion:1,probes:[{protocol:'openai_chat_completions',success:true,latencyMs:24,returnedModel:'deepseek-flash',response:'OK',errorCode:null}],
      verificationId:OP,verifiedAt:NOW,expiresAt:'2026-10-09T00:10:00.000Z'};
    expect(contract.parseNativeUserModelProbeResultV1(result)).toEqual(result);
    for(const changed of [{probes:[{...result.probes[0],success:false,errorCode:'API_AUTH_REJECTED'}]},
      {probes:[{...result.probes[0],response:' '}]},{probes:[{...result.probes[0],latencyMs:-1}]},{expiresAt:NOW},{apiKey:'no-key-in-receipts'}])
      expect(()=>contract.parseNativeUserModelProbeResultV1({...result,...changed})).toThrow();
    const failed={...result,verificationId:null,verifiedAt:null,expiresAt:null,probes:[{...result.probes[0],success:false,returnedModel:null,response:null,errorCode:'API_AUTH_REJECTED'}]};
    expect(contract.parseNativeUserModelProbeResultV1(failed)).toEqual(failed);
  });
  it('rejects forged-shaped save requests, without assigning server ownership in the body',()=>{
    const value={schemaVersion:1,operationId:OP,draft:draft(),verificationId:CREDENTIAL};
    expect(contract.parseNativeUserModelSaveRequestV1(value)).toEqual(value);
    for(const changed of [{operationId:'nonce'},{verificationId:''},{draft:{...draft(),openaiTested:true}},{accountOwner:'someone'}])
      expect(()=>contract.parseNativeUserModelSaveRequestV1({...value,...changed})).toThrow();
  });
  it('prepares only explicit approved endpoints and closed protocol inputs',()=>{
    expect(contract.parseNativeUserCredentialPrepareV1(prepare())).toEqual(prepare());
    for(const changed of [{providerId:'guessed'},{baseUrl:'https://api.deepseek.com/foreign'},{baseUrl:'http://127.0.0.1'},
      {protocols:['anthropic_messages']},{clientVerifiedAt:'yesterday'},{deviceId:'someone'},{apiKey:''}])
      expect(()=>contract.parseNativeUserCredentialPrepareV1({...prepare(),...changed})).toThrow();
  });
  it('never includes supplier material in a public registration/ref',()=>{
    expect(contract.parseNativeUserModelRegistrationV1(registration())).toEqual(registration());
    expect(contract.parseNativeUserCredentialRefV1(reference())).toEqual(reference());
    for(const changed of [{apiKey:'forbidden'},{credentialId:'not-uuid'},{localRef:''},{credentialRevision:''}]){
      expect(()=>contract.parseNativeUserModelRegistrationV1({...registration(),...changed})).toThrow();
      expect(()=>contract.parseNativeUserCredentialRefV1({...reference(),...changed})).toThrow();
    }
  });
  it('a pending save is not reported as saved/active',()=>{
    const value={state:'saved',localRef:'m-123456',registration:registration()};
    expect(contract.parseNativeUserModelSaveResultV1(value)).toEqual(value);
    expect(()=>contract.parseNativeUserModelSaveResultV1({...value,registration:{...registration(),state:'prepared'}})).toThrow();
    expect(()=>contract.parseNativeUserModelSaveResultV1({...value,localRef:'different'})).toThrow();
  });
  it('registered material cannot simultaneously carry raw userApi',()=>{
    const value={audience:'studybuddy-native-tools-v2',toolId:'workbuddy',selectedModelId:'workbuddy.deepseek.deepseek-flash',selectedProtocol:'openai_chat_completions',
      catalogRevision:'catalog-r1',materialNonce:OP,receiptRevision:1,registration:{credentialId:CREDENTIAL,credentialRevision:'credential-r1',localRef:'m-123456'}};
    expect(contract.parseNativeRegisteredUserAPIMaterialRequestV2(value)).toEqual(value);
    expect(()=>contract.parseNativeRegisteredUserAPIMaterialRequestV2({...value,userApi:prepare()})).toThrow();
    expect(()=>contract.parseNativeRegisteredUserAPIMaterialRequestV2({...value,registration:{...value.registration,apiKey:'forbidden'}})).toThrow();
  });
});
