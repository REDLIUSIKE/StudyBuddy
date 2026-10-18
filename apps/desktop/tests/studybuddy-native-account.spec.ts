import { it,expect,vi } from 'vitest'
import { spawn } from 'node:child_process'
import { NativeAccountClient } from '../src/studybuddy/native-account-client.ts'
import { fileURLToPath } from 'node:url'
const scope={ accountId:'owner-a',generation:1 }
it('shares the native startup while source reads bypass a tool operation from the first launch', async () => {
  let launches = 0
  const client = new NativeAccountClient({ start: async () => {
    launches++
    return spawn(process.execPath,
      [fileURLToPath(new URL('./fixtures/studybuddy-native-tools.mjs', import.meta.url)), 'blocked-tool-operation'],
      { stdio: 'pipe', windowsHide: true })
  } })
  client.useSession({ scope, accessToken: 'private-fixture-access' })
  const operation = client.invoke(scope, 'syncNativeModelCatalogs', []).catch(() => undefined)
  try {
    const read = client.invoke(scope, 'getNativeUserModels', [])
    await expect(Promise.race([read, new Promise((_, reject) => setTimeout(() => reject(new Error('SOURCE_READ_QUEUED_AT_STARTUP')), 500))])).resolves.toEqual([])
    expect(launches).toBe(1)
  } finally { client.revoke(); await operation; await client.dispose() }
})

it('reads personal sources while an unrelated tool operation is still waiting', async () => {
  const client = new NativeAccountClient({ start: async () => spawn(process.execPath,
    [fileURLToPath(new URL('./fixtures/studybuddy-native-tools.mjs', import.meta.url)), 'blocked-tool-operation'],
    { stdio: 'pipe', windowsHide: true }) })
  client.useSession({ scope, accessToken: 'private-fixture-access' })
  try {
    await client.invoke(scope, 'getNativeUserModels', [])
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const unsubscribe = client.subscribeInstallEvents(scope, () => { entered() })
    const blocked = client.invoke(scope, 'syncNativeModelCatalogs', []).catch(() => undefined)
    await started
    unsubscribe()
    const read = client.invoke(scope, 'listNativeUserSourcesV3', [])
    try { await expect(Promise.race([read, new Promise((_, reject) => setTimeout(() => reject(new Error('SOURCE_READ_QUEUED_BEHIND_TOOL')), 500))])).resolves.toEqual([]) }
    finally { client.revoke(); await blocked; await read.catch(() => undefined) }
  } finally { await client.dispose() }
})

it('never retries an interrupted source write as a new operation',async()=>{
  let launches=0
  const client=new NativeAccountClient({ start:async()=>{launches++;return spawn(process.execPath,
    [fileURLToPath(new URL('./fixtures/studybuddy-native-crash.mjs',import.meta.url))],{ stdio:'pipe',windowsHide:true })} })
  client.useSession({ scope,accessToken:'private-fixture-access' })
  const operationId='11111111-1111-4111-8111-111111111111'
  try{
    const result=client.invoke(scope,'resumeNativeUserSourceSave',[operationId])
    await expect(result).rejects.toMatchObject({ code:'NATIVE_RESULT_UNKNOWN',operationId })
    expect(launches).toBe(1)
  }finally{await client.dispose()}
})

it('ends a stalled source read without terminating the companion or an unrelated operation', async () => {
  let launches = 0
  const client = new NativeAccountClient({ start: async () => {
    launches++
    return spawn(process.execPath,
      [fileURLToPath(new URL('./fixtures/studybuddy-native-tools.mjs', import.meta.url)), 'blocked-source-read'],
      { stdio: 'pipe', windowsHide: true })
  } })
  client.useSession({ scope, accessToken: 'private-fixture-access' })
  try {
    await client.invoke(scope, 'getNativeUserModels', [])
    vi.useFakeTimers()
    const read = client.invoke(scope, 'listNativeUserSourcesV3', [])
    let failure: unknown
    const settled = read.catch(error => { failure = error })
    await vi.advanceTimersByTimeAsync(15_001)
    expect(failure).toMatchObject({ code: 'NATIVE_READ_TIMEOUT' })
    await settled
    expect(await client.invoke(scope, 'getNativeUserModels', [])).toEqual([])
    expect(launches).toBe(1)
  } finally { client.revoke(); await client.dispose(); vi.useRealTimers() }
})

it('admits the closed Main-only built-in operations without opening renderer operations', async () => {
  const client = new NativeAccountClient({
    start: async () => spawn(process.execPath,
      [fileURLToPath(new URL('./fixtures/studybuddy-native-tools.mjs', import.meta.url))], { stdio: 'pipe', windowsHide: true }),
  })
  client.useSession({ scope, accessToken: 'private-fixture-access' })
  try {
    expect(await client.invokeBuiltin(scope, 'listBuiltinReadiness', [{
      scope, hostGeneration:
        '33333333-3333-4333-8333-333333333333',
    }])).toEqual([])
    await expect(client.invokeBuiltin(scope, 'untrustedBuiltinMethod' as never, [] as never)).rejects.toMatchObject({
      code: 'NATIVE_OPERATION_DENIED',
    })
  } finally { await client.dispose() }
})

it('retries a failed native logout in the same private process',async()=>{
  let launches=0
  const client=new NativeAccountClient({ start:async()=>{launches++;return spawn(process.execPath,
    [fileURLToPath(new URL('./fixtures/studybuddy-native-logout.mjs',import.meta.url)),'retry'],{ stdio:'pipe',windowsHide:true })} })
  const session={ scope,accessToken:'private-fixture-access' }
  try{
    await expect(client.logout(session)).rejects.toMatchObject({ code:'INVALID_RESPONSE' })
    client.revoke()
    expect(()=>client.useSession({ scope:{ accountId:'owner-b',generation:2 },accessToken:
      'other-private-fixture' })).toThrow('ACCOUNT_SCOPE_CHANGED')
    await expect(client.invoke(scope,'listNativeUserSources',[])).rejects.toMatchObject({ code:'ACCOUNT_SCOPE_CHANGED' })
    expect(await client.logout(session)).toEqual({ localCleared:true,remoteRevoked:true,persistentCleanupRequired:false })
    expect(launches).toBe(1)
  }finally{await client.dispose()}
})

it('terminates an old native operation before starting logout and preserving repair outcome',async()=>{
  let launches=0
  const client=new NativeAccountClient({ start:async()=>{launches++;return spawn(process.execPath,
    [fileURLToPath(new URL('./fixtures/studybuddy-native-logout.mjs',import.meta.url)),'repair'],{ stdio:'pipe',windowsHide:true })} })
  const session={ scope,accessToken:'private-fixture-access' }
  client.useSession(session)
  try{
    const old=client.invoke(scope,'listNativeUserSources',[])
    const rejected=expect(old).rejects.toMatchObject({ code:'ACCOUNT_SCOPE_CHANGED' })
    await vi.waitFor(()=>{expect(launches).toBe(1)})
    const outcome=await client.logout(session)
    await rejected
    expect(outcome).toEqual({ localCleared:true,remoteRevoked:true,persistentCleanupRequired:true })
    expect(launches).toBe(2)
  }finally{await client.dispose()}
})
