import {expect,it,vi} from 'vitest'
import * as source from '../src/research-lineage-export.ts'
const root='session-11111111-1111-4111-8111-111111111111',child='session-22222222-2222-4222-8222-222222222222',grandchild='session-33333333-3333-4333-8333-333333333333'
const header=(id:string,parentSession?:string)=>({id,version:1,createdAt:1,cwd:'C:/owned/sandbox',isSeeded:false,...(parentSession?{parentSession}: {})})
function fixture(){
 let current=true
 const records=[{header:header(root),live:true,persisted:true},{header:header(child,root),live:false,persisted:true},{header:header(grandchild,child),live:false,persisted:true},{header:{...header('foreign',root),cwd:'C:/other/sandbox'},live:false,persisted:true},{header:header('ordinary'),live:true,persisted:true}]
 const query={listSessions:vi.fn(async()=>structuredClone(records)),readSession:vi.fn(async(id:string)=>({session:records.find(record=>record.header.id===id)!.header,events:[{seq:0,time:1,type:'user/message',data:{text:'observed child record'}}],inheritedEventCount:0}))}
 const factory=(source as Record<string,any>).NativeResearchLineageExport;if(typeof factory!=='function')throw Error('NATIVE_LINEAGE_EXPORT_NOT_IMPLEMENTED')
 return {service:new factory(query,()=>current),query,records,revoke:()=>{current=false},binding:{sessionId:root,authorizedRoots:['C:/owned/sandbox']}}
}
it('exports complete persisted child and grandchild journals only under the owned root and cwd',async()=>{
 const x=fixture();expect(await x.service.list(x.binding)).toEqual([{id:root,parentSessionId:null},{id:child,parentSessionId:root},{id:grandchild,parentSessionId:child}])
 const result=await x.service.page(x.binding,child,{cursor:{seq:-1,offset:0},endSeq:null});const records=Buffer.from(result.dataBase64,'base64').toString('utf8').trim().split('\n').map(line=>JSON.parse(line));expect(records[0].header.parentSession).toBe(root);expect(records[1].data.text).toBe('observed child record');expect(x.query.readSession).toHaveBeenCalledWith(child)
 await expect(x.service.page(x.binding,'ordinary',{cursor:{seq:-1,offset:0},endSeq:null})).rejects.toThrow('HARNESS_RESEARCH_EXPORT_SESSION_DENIED')
 await expect(x.service.page(x.binding,'foreign',{cursor:{seq:-1,offset:0},endSeq:null})).rejects.toThrow('HARNESS_RESEARCH_EXPORT_SESSION_DENIED')
})
it('rechecks scope and ancestry after a detached read without activating or changing a session',async()=>{
 const x=fixture();x.query.readSession.mockImplementation(async(id:string)=>{x.revoke();return {session:header(id,root),events:[],inheritedEventCount:0}})
 await expect(x.service.page(x.binding,child,{cursor:{seq:-1,offset:0},endSeq:null})).rejects.toThrow('HARNESS_RESEARCH_SCOPE_REVOKED')
 const y=fixture();y.query.readSession.mockImplementation(async(id:string)=>({session:header(id,'other-root'),events:[],inheritedEventCount:0}));await expect(y.service.page(y.binding,child,{cursor:{seq:-1,offset:0},endSeq:null})).rejects.toThrow('HARNESS_RESEARCH_EXPORT_SESSION_DENIED')
})
