import {it,expect} from 'vitest'
import {assertNativeUsageMatches} from '../src/client/usage-controller.ts'
import type {NativeUserSourceConnectionViewV3,NativeToolUsagePageV3} from '@studybuddy/contracts'
const connection={schemaVersion:3,toolId:'codex',state:'connected',protocol:'openai_responses',sourceRef:'source',sourceRevision:'a'.repeat(64),inventoryRevision:'b'.repeat(64),grantRevision:'c'.repeat(64),allowedModelIds:['kimi-k3','kimi-k2.7-code'],defaultModelId:'kimi-k3',appliedModelId:'kimi-k3',errorCode:null} satisfies NativeUserSourceConnectionViewV3
it('accepts an actual allowed model different from the default and rejects a replaced grant',()=>{
  const page:NativeToolUsagePageV3={accountOwner:'owner',deviceId:'device',fundingSource:'user_api',billingMode:'external_provider',nextCursor:null,toolId:'codex',protocol:'openai_responses',schemaVersion:3,
    binding:{schemaVersion:3,toolId:'codex',protocol:'openai_responses',connectionId:'fixture',authorityHandle:'fixture',bindingRevision:'fixture',credentialRevision:1,receiptRevision:1,catalogRevision:'fixture',policyRevision:'fixture',grantRevision:'c'.repeat(64)},
    records:[{requestId:'fixture',providerResponseId:'fixture',providerId:'kimi',modelId:'kimi-k2.7-code',returnedModel:'kimi-k2.7-code',outcome:'unknown',createdAt:1,inputTokens:null,outputTokens:null,inputTotalTokens:null,cacheReadTokens:null,cacheWriteTokens:null,reasoningTokens:null,cacheWrite5mTokens:null,cacheWrite1hTokens:null,grantRevision:'c'.repeat(64),membershipRevision:'fixture',capabilityRevision:'fixture',adapterRevision:'fixture',priceAuthorityRevision:null}]}
  expect(()=>assertNativeUsageMatches('owner',connection,page)).not.toThrow()
  expect(()=>assertNativeUsageMatches('different-owner',connection,page)).toThrow('NATIVE_USAGE_BINDING_CHANGED')
  expect(()=>assertNativeUsageMatches('owner',{...connection,grantRevision:'d'.repeat(64)},page)).toThrow('NATIVE_USAGE_BINDING_CHANGED')
})
