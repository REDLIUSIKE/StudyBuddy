import { createRpcCapabilityAdapter, type CapabilityAdapterPort } from './rpc-adapter.ts'
import { VIDEO_CAPABILITY_REVISION } from '../../video-tool-descriptors.ts'
import {normalizeAigcResult,renderAigcResult} from '../../aigc-tool-adapter.ts'
export function createVideoCapabilityAdapter(port:CapabilityAdapterPort,storeImages?:Parameters<typeof normalizeAigcResult>[1]){
 const base=createRpcCapabilityAdapter('video',VIDEO_CAPABILITY_REVISION,port)
 return{...base,async execute(...args:Parameters<typeof base.execute>){const result=await base.execute(...args),data=result.data;return data&&typeof data==='object'&&!Array.isArray(data)&&Array.isArray(data.content)?{...result,data:await normalizeAigcResult(data,storeImages)}:result},presentResult:(result:import('../types.ts').CapabilityResult)=>renderAigcResult(result.data)}
}
