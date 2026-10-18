// @vitest-environment jsdom
import { expect,it,vi } from 'vitest'
import { SupportController, type SupportHost } from '../src/client/support-controller.ts'
import type { HarnessSupportEvent } from '@studybuddy/contracts'
const scope={ accountId:'123e4567-e89b-42d3-a456-426614174001',generation:1 }
const log={ uploadId:'123e4567-e89b-42d3-a456-426614174003',publicCode:'LOG-8K2P7M4Q',status:'AVAILABLE' } as const
function create(host:SupportHost){return new SupportController(host)}
function fixture(){let calls=0;let release:(()=>void)|undefined
  const waiting=new Promise<void>((resolve)=>{release=resolve});let progress:((event:HarnessSupportEvent)=>void)|undefined
  const host:SupportHost={ status:async()=>({ phase:'authenticated',scope }),subscribe:()=>()=>{},checkUpdates:async()=>({ phase:'idle',message:'ready' }),support:{
    preview:async range=>({ range,fileCount:1,eventCount:1,compressedBytes:'1024',firstOccurredAt:'2026-10-12T00:00:00.000Z',lastOccurredAt:'2026-10-12T00:00:00.000Z',sources:[] }),
    uploadLogs:async (id)=>{calls++;await waiting;return{ state:'available',flow:'logs',requestId:id,log }},
    submitIssue:async id=>({ state:'submission_unconfirmed',flow:'issue',requestId:id,log,error:{ code:'LOG_UPLOAD_TIMEOUT' } }),
    selectScreenshots:async()=>[],getOperation:async()=>({ state:'idle' }),readPreviousExit:async()=>({ detected:false }),
    subscribe:(_id,listener)=>{progress=listener;return()=>{progress=undefined}},
  } }
  return{ host,release:()=>release?.(),get calls(){return calls},get progress(){return progress} }
}
it('suppresses double-clicks and retains one operation across same-owner remounts',async()=>{
  const f=fixture(),controller=create(f.host);controller.setScope(scope);const a=controller.uploadLogs('last_24_hours'),b=controller.uploadLogs('last_24_hours');expect(f.calls).toBe(1);f.release();await a;await b;controller.setScope(scope)
  expect(controller.getSnapshot().operation).toMatchObject({ state:'available',log });expect(f.calls).toBe(1);controller.dispose()
})
it('clears old results and ignores delayed success after an owner changes',async()=>{
  const f=fixture(),controller=create(f.host);controller.setScope(scope);const upload=controller.uploadLogs('last_24_hours');controller.setScope({ ...scope,generation:2 });f.release();await upload
  expect(controller.getSnapshot().operation.state).toBe('idle');expect(controller.getSnapshot().screenshots).toEqual([]);controller.dispose()
})
it('preserves only confirmed LOG when report creation is unconfirmed and copy failure never says copied',async()=>{
  const f=fixture(),controller=create(f.host);controller.setScope(scope);await controller.submitIssue({ title:'故障',description:'连接失败',range:'last_24_hours' })
  expect(controller.getSnapshot().operation).toMatchObject({ state:'submission_unconfirmed',log });expect(controller.getSnapshot().operation).not.toHaveProperty('issue')
  Object.defineProperty(navigator,'clipboard',{ configurable:true,value:{ writeText:vi.fn().mockRejectedValue(new Error('unavailable')) } })
  await controller.copyReference(log.publicCode);expect(controller.getSnapshot().copied).toBeNull();expect(controller.getSnapshot().errorCode).toBe('SUPPORT_COPY_FAILED');controller.dispose()
})
it('never re-submits an ambiguous report after preview clears a transient error',async()=>{
  const f=fixture();let reports=0;f.host.support!.submitIssue=async()=>{reports++;throw Object.assign(new Error('unknown'),{ code:'NATIVE_RESULT_UNKNOWN' })}
  const controller=create(f.host);controller.setScope(scope);const input={ title:'故障',description:'连接失败',range:'last_24_hours' } as const
  await controller.submitIssue(input);await controller.preview('last_24_hours');await controller.submitIssue(input)
  expect(reports).toBe(1);expect(controller.getSnapshot().issueUnconfirmed).toBe(true);controller.dispose()
})
it('keeps the unconfirmed report LOG and does not replace it with another log upload',async()=>{
  const f=fixture(),controller=create(f.host);controller.setScope(scope)
  await controller.submitIssue({ title:'故障',description:'连接失败',range:'last_24_hours' })
  f.release();await controller.uploadLogs('last_3_days')
  expect(f.calls).toBe(0);expect(controller.getSnapshot().operation).toMatchObject({ state:'submission_unconfirmed',log })
  controller.dispose()
})
it('retains the confirmed progress LOG when the report RPC later becomes unknown',async()=>{
  const f=fixture();let reject:((error:Error)=>void)|undefined
  f.host.support!.submitIssue=()=>new Promise((_resolve,rejectPromise)=>{reject=rejectPromise})
  const controller=create(f.host);controller.setScope(scope)
  const report=controller.submitIssue({ title:'故障',description:'慢速上传',range:'last_24_hours' })
  const view=controller.getSnapshot().operation;if(view.state==='idle')throw new Error('missing operation')
  f.progress?.({ requestId:view.requestId,sequence:1,phase:'submitting',operation:{ state:'running',flow:'issue',phase:'submitting',requestId:view.requestId,log } })
  reject?.(new Error('timeout'));await report
  expect(controller.getSnapshot().operation).toMatchObject({ log });expect(controller.getSnapshot().issueUnconfirmed).toBe(true)
  controller.dispose()
})
it('a late older preview cannot replace the current range',async()=>{
  const f=fixture();let complete:((value:Awaited<ReturnType<NonNullable<SupportHost['support']>['preview']>>)=>void)|undefined
  const base=await f.host.support!.preview('last_24_hours');f.host.support!.preview=range=>range==='last_24_hours'
    ?new Promise((resolve)=>{complete=resolve}):Promise.resolve({ ...base,range:'last_3_days',eventCount:2 })
  const controller=create(f.host);controller.setScope(scope);const old=controller.preview('last_24_hours');await controller.preview('last_3_days')
  complete?.(base);await old;expect(controller.getSnapshot().preview?.eventCount).toBe(2);controller.dispose()
})
