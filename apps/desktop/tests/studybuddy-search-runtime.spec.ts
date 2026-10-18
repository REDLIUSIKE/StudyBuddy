import {expect,it,vi} from 'vitest'
import {StudyBuddySearchRuntime} from '../src/studybuddy/search-runtime.ts'
import {parseToolSearchRequestV1} from '@studybuddy/contracts'
const scope={accountId:'11111111-1111-4111-8111-111111111111',generation:1}
const input=parseToolSearchRequestV1({operationId:'22222222-2222-4222-8222-222222222222',textQuery:'official',maxResults:5})
const reply={search_results:[{url:'https://example.test/',title:'',snippet:'',date:'',chunks:[]}],studybuddy:{operation_id:input.operationId,state:'completed',charge_cny:'0.015',result_expires_at:'2026-10-15T12:00:00Z',truncated:false}}
function deps(fetch:(url:string,init?:RequestInit)=>Promise<Response>){let raw:string|null=null;return{isCurrent:()=>true,keyMaterial:async()=>({baseUrl:'https://gateway.example.test',apiKey:'private-existing-key'}),fetch,journal:()=>({read:async()=>raw,write:async(value:string)=>{raw=value},clear:async()=>{raw=null}})}}
it('uses original Key and stable UUID, then GET for repeat or lost response',async()=>{
 const fetch=vi.fn(async(_url:string,init?:RequestInit)=>{if(init?.method==='POST')throw Error('response lost');return Response.json(reply)})
 const runtime=new StudyBuddySearchRuntime(deps(fetch));const first=await runtime.execute(scope,input,new AbortController().signal);expect(first.state).toBe('completed');await runtime.execute(scope,input,new AbortController().signal)
 expect(fetch.mock.calls.map(x=>x[1]?.method)).toEqual(['POST','GET','GET']);expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({'X-Request-Id':input.operationId,Authorization:'Bearer private-existing-key'})
 expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('model')
})
it('fences late data after account changes while allowing supplier settlement',async()=>{
 let current=true;const dependencies=deps(async()=>{current=false;return Response.json(reply)});dependencies.isCurrent=()=>current
 await expect(new StudyBuddySearchRuntime(dependencies).execute(scope,input,new AbortController().signal)).rejects.toThrow('STUDYBUDDY_SEARCH_SCOPE_REVOKED')
})
