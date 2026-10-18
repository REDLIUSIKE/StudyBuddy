import {it,expect} from 'vitest';
import {parseNativeRememberedChoiceV1,parseNativeUserSourceConnectV3,parseNativeUserSourceConnectionViewV3,parseNativeSourceModelCandidatesV3} from './native-source-ui-v3.js';
const choice={schemaVersion:1,toolId:'codex',kind:'user_source',sourceRef:'one',sourceRevision:'a'.repeat(64),exactModelId:'kimi-k3',protocol:'openai_responses',logicalModelId:null};
it('keyless UI shapes are closed and source scope is exact',()=>{
 expect(parseNativeRememberedChoiceV1(choice)).toEqual(choice);
 for(const patch of [{apiKey:'not-real'},{sourceRevision:null},{sourceRef:null},{schemaVersion:3},{logicalModelId:'alias'}])expect(()=>parseNativeRememberedChoiceV1({...choice,...patch})).toThrow();
 const connect={schemaVersion:3,toolId:'codex',sourceRef:'one',sourceRevision:'a'.repeat(64),inventoryRevision:'b'.repeat(64),exactModelId:'kimi-k3',protocol:'openai_responses',options:{}};
 expect(parseNativeUserSourceConnectV3(connect)).toEqual(connect);
 expect(()=>parseNativeUserSourceConnectV3({...connect,allowedModels:['kimi-k3']})).toThrow();
});
it('does not read sparse or accessor-bearing UI arrays',()=>{
 const view={schemaVersion:3,toolId:'codex',state:'connected',protocol:'openai_responses',sourceRef:'one',sourceRevision:'a'.repeat(64),inventoryRevision:'b'.repeat(64),grantRevision:'c'.repeat(64),allowedModelIds:['kimi-k3'],defaultModelId:'kimi-k3',appliedModelId:'kimi-k3',errorCode:null};
 let reads=0;const ids=['kimi-k3'];Object.defineProperty(ids,'0',{get:()=>{reads++;return 'kimi-k3';}});
 expect(()=>parseNativeUserSourceConnectionViewV3({...view,allowedModelIds:ids})).toThrow();expect(reads).toBe(0);
 expect(()=>parseNativeSourceModelCandidatesV3(new Array(1))).toThrow();
 expect(parseNativeUserSourceConnectionViewV3(view)).toEqual(view);
});
