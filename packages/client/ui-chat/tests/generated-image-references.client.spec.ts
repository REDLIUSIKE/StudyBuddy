import {expect,it} from 'vitest'
import {generatedImageRequests,generatedImageUrl} from '../src/client/chat/generated-image-references.ts'
import type {ChatConversationViewNode} from '../src/client/contract/chat-nodes.ts'
const id='44444444-4444-4444-8444-444444444444',session='session-fixture'
function result(patch:Record<string,unknown>={},name='generate_image',isError=false){return{
 kind:'tool-call',data:{root:{kind:'tool-result',name,isError,meta:{schemaVersion:1,requestId:id,sessionId:session,
  kind:'image',state:'completed',contentAvailable:true,...patch}}},
} as unknown as ChatConversationViewNode}
it('maps a registered image to the current document media route on desktop and mounted web clients',()=>{
 const requests=generatedImageRequests([result()],session)
 for(const base of ['dsh-app://app/index.html','https://localhost/tools/dsh/index.html']){
  const url=new URL(generatedImageUrl(base,session,id,requests)!)
  expect(url.href).toContain('api/studybuddy-media?');expect(url.searchParams.get('sessionId')).toBe(session)
  expect(url.searchParams.get('requestId')).toBe(id);expect(url.searchParams.get('kind')).toBe('image')
 }
})
it.each([{sessionId:'other-session'},{kind:'video'},{state:'unknown'},{contentAvailable:false},{requestId:'../private-file'},{schemaVersion:2}])('does not authorize an unrelated or incomplete result (%j)',patch=>{
 expect(generatedImageRequests([result(patch)],session).size).toBe(0)
})
it('keeps ordinary files, unregistered IDs, failing tools and unsupported app origins unchanged',()=>{
 const requests=generatedImageRequests([result()],session)
 for(const path of ['assets/output.png','/tmp/output.png','55555555-5555-4555-8555-555555555555','./'+id])
  expect(generatedImageUrl('dsh-app://app/',session,path,requests)).toBeUndefined()
 for(const base of ['about:blank','file:///private/','dsh-app://foreign/'])
  expect(generatedImageUrl(base,session,id,requests)).toBeUndefined()
 expect(generatedImageRequests([result({},'bash'),result({},'generate_image',true)],session).size).toBe(0)
})
