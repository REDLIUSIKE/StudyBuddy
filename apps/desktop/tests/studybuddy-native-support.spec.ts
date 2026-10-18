import { expect,it,vi } from 'vitest'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseSupportRequestId } from '@studybuddy/contracts'
import { NativeAccountClient } from '../src/studybuddy/native-account-client.ts'
it('parses support on the original native owner and drops replayed, foreign or stale-stream progress',async()=>{
  const client=new NativeAccountClient({ start:async()=>spawn(process.execPath,[fileURLToPath(new URL('./fixtures/studybuddy-native-support.mjs',import.meta.url))],{ stdio:'pipe',windowsHide:true }) })
  const scope={ accountId:'123e4567-e89b-42d3-a456-426614174001',generation:1 },id=parseSupportRequestId('123e4567-e89b-42d3-a456-426614174002')
  client.useSession({ scope,accessToken:'fixture-access' })
  try{
    expect(Reflect.get(client,'invokeSupport')).toBeTypeOf('function')
    const phases:string[]=[];const detach=client.subscribeSupportEvents(scope,event=>phases.push(event.phase))
    const result=await client.invokeSupport(scope,'uploadSupportLogs',[id,'last_24_hours'])
    expect(result).toMatchObject({ state:'available',log:{ publicCode:'LOG-8K2P7M4Q' } });expect(phases).toEqual(['preparing','completed'])
    await expect(client.invoke(scope,'uploadSupportLogs' as never,[id,'last_24_hours'] as never)).rejects.toMatchObject({ code:'NATIVE_OPERATION_DENIED' })
    detach();client.revoke();expect(()=>client.subscribeSupportEvents(scope,()=>{})).toThrow()
  }finally{await client.dispose()}
})
it('a final support deadline rejects only that request and leaves the healthy companion available',async()=>{
  let launches=0
  const client=new NativeAccountClient({ start:async()=>{launches++;return spawn(process.execPath,[fileURLToPath(new URL('./fixtures/studybuddy-native-support.mjs',import.meta.url))],{ stdio:'pipe',windowsHide:true })} })
  const scope={ accountId:'123e4567-e89b-42d3-a456-426614174001',generation:1 },id=parseSupportRequestId('123e4567-e89b-42d3-a456-426614174002')
  client.useSession({ scope,accessToken:'fixture-access' })
  try{
    await client.invokeSupport(scope,'readSupportPreviousExit',[]);vi.useFakeTimers({ toFake:['setTimeout','clearTimeout'] })
    let progressed:()=>void=()=>{};const phase=new Promise<void>((resolve)=>{progressed=resolve})
    client.subscribeSupportEvents(scope,()=>{ progressed() })
    const report=client.invokeSupport(scope,'submitSupportIssue',[id,{ title:'故障',description:'超时上传',range:'last_24_hours',screenshotSelectionIds:[] }]).then(()=>null,(error:unknown)=>error)
    await phase;await vi.advanceTimersByTimeAsync(30*60_000+1)
    expect(await report).toMatchObject({ code:'NATIVE_RESULT_UNKNOWN' })
    expect(await client.invokeSupport(scope,'getSupportOperation',[id])).toMatchObject({ state:'available',log:{ publicCode:'LOG-8K2P7M4Q' } })
    expect(launches).toBe(1)
  }finally{vi.useRealTimers();await client.dispose()}
})
it('a slow multi-phase report outlives 120 seconds without killing a concurrent native operation',async()=>{
  let launches=0
  const client=new NativeAccountClient({ start:async()=>{launches++;return spawn(process.execPath,[fileURLToPath(new URL('./fixtures/studybuddy-native-support.mjs',import.meta.url))],{ stdio:'pipe',windowsHide:true })} })
  const scope={ accountId:'123e4567-e89b-42d3-a456-426614174001',generation:1 },id=parseSupportRequestId('123e4567-e89b-42d3-a456-426614174002')
  client.useSession({ scope,accessToken:'fixture-access' })
  try{
    await client.invokeSupport(scope,'readSupportPreviousExit',[])
    vi.useFakeTimers({ toFake:['setTimeout','clearTimeout'] })
    let progressed:()=>void=()=>{};const phase=new Promise<void>((resolve)=>{progressed=resolve})
    client.subscribeSupportEvents(scope,()=>{ progressed() })
    const report=client.invokeSupport(scope,'submitSupportIssue',[id,{ title:'故障',description:'慢速上传',range:'last_24_hours',screenshotSelectionIds:[] }]).then(data=>({ ok:true,data }),(error:unknown)=>({ ok:false,error }))
    await phase
    await vi.advanceTimersByTimeAsync(110_000)
    const other=client.invoke(scope,'scanNativeTools',[]).then(data=>({ ok:true,data }),(error:unknown)=>({ ok:false,error }))
    await vi.advanceTimersByTimeAsync(11_000)
    await client.invokeSupport(scope,'getSupportOperation',[id])
    expect(await report).toMatchObject({ ok:true,data:{ state:'available',log:{ publicCode:'LOG-8K2P7M4Q' } } })
    expect(await other).toMatchObject({ ok:true,data:[] });expect(launches).toBe(1)
  }finally{vi.useRealTimers();await client.dispose()}
})
