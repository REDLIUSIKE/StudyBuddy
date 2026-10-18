import {expect,it,vi} from 'vitest'
import {CapabilityRpc} from '../../src/capabilities/rpc.ts'
import {owner} from './fixture.ts'
const caller={...owner,callerSessionId:'ordinary-session',workspaceId:null,toolCallId:'stable-call'},target={moduleId:'video',projectRef:'film-a'}
it('sameRequestAfterUnknownOutcome does not submit another mutation',async()=>{
 const send=vi.fn(async(_message:object)=>{}),rpc=new CapabilityRpc(owner.hostGeneration,send);rpc.setScope(owner)
 const signal=new AbortController(),work=rpc.invoke(caller,'execute',target,{tool:'createExport',args:{kind:'video'}},signal.signal)
 await Promise.resolve();signal.abort();await expect(work).rejects.toThrow('CAPABILITY_OUTCOME_UNKNOWN')
 await expect(rpc.invoke(caller,'execute',target,{tool:'createExport',args:{kind:'video'}},new AbortController().signal)).rejects.toThrow('CAPABILITY_OUTCOME_UNKNOWN')
 expect(send.mock.calls.filter(([message]:any)=>message.type==='capability-request')).toHaveLength(1)
 await rpc.close()
})
it('late response cannot cross an account or Host epoch',async()=>{
 const send=vi.fn(async(_message:object)=>{}),rpc=new CapabilityRpc(owner.hostGeneration,send);rpc.setScope(owner)
 const work=rpc.invoke(caller,'catalog',null,{moduleId:'video'},new AbortController().signal);await Promise.resolve()
 const request=(send.mock.calls[0]![0] as any).request;rpc.setScope(null)
 rpc.result({rpcId:request.rpcId,data:{data:{ready:true},artifacts:[],operationRef:null}})
 await expect(work).rejects.toThrow('CAPABILITY_SCOPE_REVOKED');await rpc.close()
})
