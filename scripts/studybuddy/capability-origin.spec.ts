import {expect,it} from 'vitest'
const {withNativeCaller,invokeNative,configureNative,admitNativeCaller,releaseNativeCaller}=await import(new URL('../../integrations/toonflow/apps/server/src/embedded/native.ts',import.meta.url).href)
const a={sessionId:'session-video-00000000-0000-4000-8000-000000000001',callId:'tool-a',directory:'C:/owned/aigc',grantRef:'00000000-0000-4000-8000-000000000011'},b={...a,sessionId:'ordinary-session',callId:'tool-b',grantRef:'00000000-0000-4000-8000-000000000012'}
it('preserves two actual origins through deferred HTTP work and revokes their independent grants',async()=>{
 const requests:any[]=[],withdraw=configureNative(async(_operation:string,input:unknown)=>{requests.push(input);return{accepted:true}})
 try{
  await Promise.all([a,b].map(origin=>withNativeCaller(origin,async()=>{await Promise.resolve();await invokeNative('temporary',{action:'open'})})))
  await withNativeCaller(admitNativeCaller(a.grantRef),()=>invokeNative('budget',{modelId:'fixture-model',requestId:'fixture-request'}))
  expect(requests.map(row=>row.capabilityCaller.sessionId)).toEqual([a.sessionId,b.sessionId,a.sessionId])
  releaseNativeCaller(a.grantRef);expect(()=>admitNativeCaller(a.grantRef)).toThrow('AIGC_CALLER_REVOKED');expect(admitNativeCaller(b.grantRef).sessionId).toBe(b.sessionId)
 }finally{releaseNativeCaller(a.grantRef);releaseNativeCaller(b.grantRef);withdraw()}
})
it('does not reinterpret a legacy editor operation as a cross-conversation caller',async()=>{
 let request:any;const withdraw=configureNative(async(_operation:string,input:unknown)=>{request=input;return{}})
 try{await withNativeCaller({sessionId:a.sessionId,callId:a.callId,directory:a.directory},()=>invokeNative('temporary',{action:'open'}));expect(request).not.toHaveProperty('capabilityCaller')}
 finally{withdraw()}
})
