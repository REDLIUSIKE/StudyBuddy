import { createRpcCapabilityAdapter, type CapabilityAdapterPort } from './rpc-adapter.ts'
import { AIGC_CAPABILITY_REVISION } from '../../../../../integrations/toonflow/apps/server/src/embedded/capability-contract.mjs'
import { normalizeAigcResult,renderAigcResult } from '../../aigc-tool-adapter.ts'
export function createAigcCapabilityAdapter(port: CapabilityAdapterPort, storeImages?: Parameters<typeof normalizeAigcResult>[1]) {
  const base=createRpcCapabilityAdapter('aigc',AIGC_CAPABILITY_REVISION,port)
  return {...base,async execute(...args:Parameters<typeof base.execute>){
    const result=await base.execute(...args),data=result.data
    if(data&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.content))return {...result,data:await normalizeAigcResult(data,storeImages)}
    return result
  },presentResult:(result:import('../types.ts').CapabilityResult)=>renderAigcResult(result.data)}
}
