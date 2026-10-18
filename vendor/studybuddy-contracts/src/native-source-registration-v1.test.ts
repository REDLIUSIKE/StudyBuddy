import {describe, expect, it} from 'vitest';
import {
  parseNativeSourceConfigurationContextV1,
  parseNativeSourceConfigurationRequestV1,
  parseNativeSourceRegistrationViewV1,
  parseNativeToolConfigurationViewV1,
} from './native-source-registration-v1.js';

const source={kind:'user_source',sourceRef:'personal',sourceRevision:'a'.repeat(64),inventoryRevision:'b'.repeat(64)};
const option={
  toolId:'workbuddy',source:{kind:'platform'},label:'平台额度',protocol:'openai_chat_completions',
  catalogRevision:'catalog-fixture',policyRevision:'policy-fixture',installedToolVersion:'1.0.0',
  bootstrapLogicalModelId:'workbuddy.fixture.deepseek-flash',bootstrapExactModelId:'deepseek-flash',
  authorizedModelIds:['deepseek-flash','kimi-k3'],available:true,blockReason:null,
};
const context={schemaVersion:1,capabilities:['source_configuration_v1','source_registration_v1'],toolId:'workbuddy',options:[option]};
const request={
  schemaVersion:1,toolId:'workbuddy',source,protocol:'openai_chat_completions',
  catalogRevision:'catalog-fixture',policyRevision:'policy-fixture',installedToolVersion:'1.0.0',options:{},
};
const view={
  schemaVersion:1,kind:'source_registration',toolId:'workbuddy',state:'registered',
  source,protocol:'openai_chat_completions',catalogRevision:'catalog-fixture',
  grantRevision:'grant-fixture',credentialRevision:'1',authorizedModelIds:['deepseek-flash','kimi-k3'],
  nativeSelection:{kind:'external',modelId:'original-account-model'},errorCode:null,
};
describe('source-only six-tool contracts',()=>{
  it('round trips closed source-only requests without accepting user supplied models, keys or paths',()=>{
    expect(parseNativeSourceConfigurationRequestV1(request)).toEqual(request);
    for(const patch of [{apiKey:'fixture-secret'},{modelId:'kimi-k3'},{authorizedModelIds:[]},{path:'C:/fake'},
      {toolId:'codex'},{toolId:'chatgptdesktop'},{toolId:'unknown'},{schemaVersion:3},
      {policyRevision:''},{installedToolVersion:'unknown'},{installedToolVersion:' v1.0.0'}])
      expect(()=>parseNativeSourceConfigurationRequestV1({...request,...patch})).toThrow();
    for(const patch of [{sourceRevision:'expired'},{inventoryRevision:null},{credentialRef:'key'},{kind:'platform'}])
      expect(()=>parseNativeSourceConfigurationRequestV1({...request,source:{...source,...patch}})).toThrow();
    expect(()=>parseNativeSourceConfigurationRequestV1({...request,options:{model:'other'}})).toThrow();
    expect(parseNativeSourceConfigurationRequestV1({...request,source:{kind:'platform'},options:{webSearch:false}}).source).toEqual({kind:'platform'});
  });
  it('requires the additive capability and one audited bootstrap in the complete bounded G',()=>{
    expect(parseNativeSourceConfigurationContextV1(context)).toEqual(context);
    for(const patch of [{capabilities:['source_configuration_v1']},{capabilities:['source_registration_v1']},
      {capabilities:['source_configuration_v1','source_configuration_v1','source_registration_v1']},
      {toolId:'codex'},{options:[{...option,toolId:'dsh'}]},{options:[option,option]}])
      expect(()=>parseNativeSourceConfigurationContextV1({...context,...patch})).toThrow();
    for(const patch of [{authorizedModelIds:[]},{authorizedModelIds:Array.from({length:65},(_,i)=>'m'+i)},
      {authorizedModelIds:['deepseek-flash','deepseek-flash']},{bootstrapExactModelId:'absent'},
      {policyRevision:null},{installedToolVersion:null},{bootstrapLogicalModelId:null},{blockReason:'blocked'}])
      expect(()=>parseNativeSourceConfigurationContextV1({...context,options:[{...option,...patch}]})).toThrow();
    const models=Array.from({length:64},(_,i)=>'m'+i);
    expect(parseNativeSourceConfigurationContextV1({...context,options:[{...option,authorizedModelIds:models,bootstrapExactModelId:'m63'}]}).options[0]?.authorizedModelIds).toHaveLength(64);
  });
  it('can describe an unreviewed version without inventing a bootstrap or enabling it',()=>{
    const blocked={...option,available:false,blockReason:'SOURCE_BOOTSTRAP_NOT_READY',policyRevision:null,
      installedToolVersion:null,bootstrapLogicalModelId:null,bootstrapExactModelId:null,authorizedModelIds:[]};
    expect(parseNativeSourceConfigurationContextV1({...context,options:[blocked]}).options[0]).toEqual(blocked);
    expect(()=>parseNativeSourceConfigurationContextV1({...context,options:[{...blocked,blockReason:null}]})).toThrow();
  });
  it('uses UTF-16 length and rejects edge BOMs consistently with the native mirror',()=>{
    for(const label of ['😀'.repeat(129),'\uFEFF平台额度','平台额度\uFEFF'])
      expect(()=>parseNativeSourceConfigurationContextV1({...context,options:[{...option,label}]})).toThrow();
    expect(parseNativeSourceConfigurationContextV1({...context,options:[{...option,label:'😀'.repeat(128)}]}).options[0]?.label).toBe('😀'.repeat(128));
  });
  it('keeps registration valid while the original tool selects an external model',()=>{
    expect(parseNativeSourceRegistrationViewV1(view)).toEqual(view);
    expect(parseNativeToolConfigurationViewV1(view)).toEqual(view);
    expect(parseNativeSourceRegistrationViewV1({...view,nativeSelection:{kind:'unknown',modelId:null}}).state).toBe('registered');
    for(const patch of [{toolId:'claude_code'},{toolId:'codex'},{source:null},{protocol:null},{catalogRevision:null},
      {credentialRevision:null},{authorizedModelIds:[]},{errorCode:'CONFLICT'},
      {nativeSelection:{kind:'owned',modelId:'foreign'}},{nativeSelection:{kind:'unknown',modelId:'known'}},
      {nativeSelection:{kind:'external',modelId:null}},{apiKey:'fixture-secret'}])
      expect(()=>parseNativeSourceRegistrationViewV1({...view,...patch})).toThrow();
  });
  it('never translates registration to old connected, or relaxes old source connected readback',()=>{
    expect(()=>parseNativeSourceRegistrationViewV1({...view,state:'connected'})).toThrow();
    const old={schemaVersion:3,toolId:'claude_code',state:'connected',protocol:'anthropic_messages',
      sourceRef:source.sourceRef,sourceRevision:source.sourceRevision,inventoryRevision:source.inventoryRevision,
      grantRevision:'c'.repeat(64),allowedModelIds:['kimi-k3'],defaultModelId:'kimi-k3',appliedModelId:'kimi-k3',errorCode:null};
    expect(parseNativeToolConfigurationViewV1(old)).toEqual(old);
    expect(()=>parseNativeToolConfigurationViewV1({...old,appliedModelId:'deepseek-flash'})).toThrow();
    expect(()=>parseNativeToolConfigurationViewV1({...old,toolId:'workbuddy'})).toThrow();
  });
  it('does not evaluate accessor-bearing objects or arrays',()=>{
    let reads=0;
    const unsafe={...request};Object.defineProperty(unsafe,'source',{get(){reads++;return source;}});
    expect(()=>parseNativeSourceConfigurationRequestV1(unsafe)).toThrow();expect(reads).toBe(0);
    const models=['deepseek-flash'];Object.defineProperty(models,'0',{get(){reads++;return 'deepseek-flash';}});
    expect(()=>parseNativeSourceRegistrationViewV1({...view,authorizedModelIds:models})).toThrow();expect(reads).toBe(0);
    expect(()=>parseNativeSourceConfigurationContextV1({...context,options:new Array(1)})).toThrow();
    const decorated=[option];Object.assign(decorated,{key:'extra'});
    expect(()=>parseNativeSourceConfigurationContextV1({...context,options:decorated})).toThrow();
  });
});
