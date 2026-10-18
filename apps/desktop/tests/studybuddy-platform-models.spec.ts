import { expect, it, vi } from 'vitest'
import { PlatformModels } from '../src/studybuddy/platform-models.ts'
import { fixture } from '../../../packages/llm/llm-studybuddy-builtin/tests/fixtures/platform.ts'
import { parseNativeToolMaterialRequestV2 } from '@studybuddy/contracts'
import type { NativeToolMaterialRequestV2 } from '@studybuddy/contracts'
const scope = fixture().scope
function existing<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('fixture value missing')
  return value
}
function requestBody(init: RequestInit | undefined): NativeToolMaterialRequestV2 {
  if (typeof init?.body !== 'string') throw new Error('fixture body missing')
  const body: unknown = JSON.parse(init.body)
  return parseNativeToolMaterialRequestV2(body)
}
function setup() {
  let saved: string | null = null
  const snapshot = fixture(),
    calls: string[] = [],
    host = {
      builtinContext: () => ({ scope, hostGeneration: snapshot.hostGeneration }),
      platformApply: vi.fn(async () => {}),
      platformRevoke: vi.fn(async () => {}),
    }
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    calls.push(url)
    if (url.endsWith('/harness-platform-catalog'))
      return Response.json({ catalog: snapshot.catalog, checkedAt: snapshot.checkedAt, expiresAt: snapshot.expiresAt })
    throw Error('unexpected fixture request')
  })
  const withSession = vi.fn(async (_scope: typeof scope, run: (session: {scope: typeof scope; accessToken: string}) => Promise<unknown>) => run({ scope, accessToken: 'synthetic-platform-session' }))
  const vault = {
    read: vi.fn(async () => saved),
    write: vi.fn(async (value: string) => { saved = value }),
    clear: vi.fn(async () => { saved = null }),
  }
  const models = new PlatformModels({
    host: () => host,
    isCurrent: () => true,
    withSession: withSession as never,
    fetch: fetcher,
    vault: () => vault,
    audit: async () => {},
  })
  return { models, host, calls, fetcher, snapshot, withSession, vault }
}

it('publishes exact keyless AIGC platform choices and fences a foreign account', async () => {
  const { models, calls, snapshot } = setup()
  await models.restore(scope)
  const choices = await models.consumerCatalog(scope)
  expect(choices.length).toBeGreaterThan(0)
  expect(choices[0]).toMatchObject({ kind: 'platform', selection: { fundingSource: 'platform' },
    catalogVersion: snapshot.catalog.catalogRevision })
  expect(JSON.stringify(choices)).not.toContain('synthetic-platform-session')
  expect(calls.every(url => url.endsWith('/harness-platform-catalog'))).toBe(true)
  await models.revoke(scope)
  await expect(models.consumerCatalog(scope)).rejects.toThrow('BUILTIN_PLATFORM_UNAVAILABLE')
})
it('restores platform model visibility through existing native APIs without creating a Key or requesting inference', async () => {
  const f = setup()
  await f.models.restore(scope)
  expect(f.host.platformApply).toHaveBeenCalledOnce()
  expect(f.calls).toHaveLength(1)
  expect(f.calls.every(path => path.endsWith('/harness-platform-catalog'))).toBe(true)
  expect(f.fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
})

it('keeps configured catalogue choices after the management refresh lease expires without checking login',async()=>{
  const f=setup()
  await f.models.restore(scope)
  const before=f.withSession.mock.calls.length
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(f.snapshot.expiresAt)+1)
  f.withSession.mockRejectedValue(Error('login refresh must not gate inference'))
  try{expect((await f.models.consumerCatalog(scope)).length).toBeGreaterThan(0)
    expect(f.withSession).toHaveBeenCalledTimes(before)
  }finally{clock.mockRestore()}
})
it('rejects a Host request whose model was not admitted before any material or supplier request', async () => {
  const f = setup()
  await f.models.restore(scope)
  await expect(
    f.models.admit({
      scope,
      hostGeneration: f.snapshot.hostGeneration,
      catalogRevision: 'harness-platform-fixture-r1',
      clientRequestId: '33333333-3333-4333-8333-333333333333',
      sessionId: 'session-a',
      exactModelId: 'unlisted',
    }),
  ).rejects.toThrow()
  expect(f.calls).toHaveLength(1)
})
it('rechecking identical approved facts does not replace the adapter or invalidate prepared calls', async () => {
  const f = setup()
  await f.models.restore(scope)
  await f.models.restore(scope)
  expect(f.calls).toHaveLength(2)
  expect(f.host.platformApply).toHaveBeenCalledOnce()
})
it('rejects changed facts under an unchanged catalog revision', async () => {
  const f = setup()
  await f.models.restore(scope)
  existing(f.snapshot.catalog.models[0]).displayName = 'changed without revision'
  await expect(f.models.restore(scope)).rejects.toThrow()
  expect(f.host.platformApply).toHaveBeenCalledOnce()
})
it('withdraws the old account instead of publishing a late restored catalog', async () => {
  const f = setup()
  await f.models.revoke(scope)
  await expect(f.models.restore(scope)).rejects.toThrow()
  expect(f.host.platformRevoke).toHaveBeenCalledOnce()
  expect(f.host.platformApply).not.toHaveBeenCalled()
})

function request(f: ReturnType<typeof setup>) {
  return {
    scope,
    hostGeneration: f.snapshot.hostGeneration,
    catalogRevision: f.snapshot.catalog.catalogRevision,
    clientRequestId: '33333333-3333-4333-8333-333333333333',
    sessionId: 'session-a',
    exactModelId: 'deepseek-flash',
  }
}
function nativeFixture(f: ReturnType<typeof setup>, intent: NativeToolMaterialRequestV2) {
  const members = [...f.snapshot.catalog.models].sort((a, b) =>
    a.exactModelId < b.exactModelId ? -1 : a.exactModelId > b.exactModelId ? 1 : 0,
  )
  const material = {
    schemaVersion: 2,
    connectionId: '44444444-4444-4444-8444-444444444444',
    accountOwner: scope.accountId,
    deviceId: '55555555-5555-4555-8555-555555555555',
    toolId: 'dsh',
    fundingSource: 'platform',
    selectedProviderId: 'deepseek',
    gatewayOrigin: 'https://guijitongzhuo.com',
    protocol: 'openai_chat_completions',
    selectedModelId: 'deepseek-flash',
    authorizedModelIds: ['deepseek-flash'],
    authorizedModels: f.snapshot.catalog.models,
    membershipRevision: 'harness-platform-fixture-r1',
    apiKey: 'synthetic-platform-only-key',
    authorityHandle: '66666666-6666-4666-8666-666666666666',
    pendingBindingRevision: 'binding-r1',
    credentialRevision: 17,
    receiptRevision: intent.receiptRevision,
    catalogRevision: 'harness-platform-fixture-r1',
    policyRevision: 'policy-r1',
    pendingExpiresAt: new Date(Date.now() + 300000).toISOString(),
  }
  material.authorizedModelIds = members.map(m => m.exactModelId)
  material.authorizedModels = members
  const authority = {
    schemaVersion: 2,
    toolId: 'dsh',
    protocol: material.protocol,
    state: 'connected',
    permissionState: 'eligible',
    accountOwner: material.accountOwner,
    deviceId: material.deviceId,
    fundingSource: 'platform',
    authorizedModelIds: material.authorizedModelIds,
    authorizedModels: material.authorizedModels,
    membershipRevision: material.membershipRevision,
    bindingRevision: material.pendingBindingRevision,
    authorityHandle: material.authorityHandle,
    credentialRevision: material.credentialRevision,
    receiptRevision: material.receiptRevision,
    catalogRevision: material.catalogRevision,
    policyRevision: material.policyRevision,
    lastVerifiedAt: new Date().toISOString(),
  }
  return { material, authority }
}
it('reuses the configured Key without login, status or connection authorization', async () => {
  const f = setup()
  await f.models.restore(scope)
  let native: ReturnType<typeof nativeFixture> | undefined
  f.fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith('/material')) { native = nativeFixture(f, requestBody(init)); return Response.json(native.material) }
    if (url.endsWith('/activate')) return Response.json(existing(native).authority)
    throw Error('unexpected management request')
  })
  const first = await f.models.admit(request(f))
  const sessionCalls = f.withSession.mock.calls.length
  f.withSession.mockRejectedValue(new Error('login must not be checked'))
  f.fetcher.mockImplementation(async () => { throw Error('connection authorization must not be checked') })
  const next = await f.models.admit({ ...request(f), clientRequestId: '77777777-7777-4777-8777-777777777777' })
  expect(next.material.apiKey).toBe(first.material.apiKey)
  expect(next.authority).toBeNull()
  expect(f.withSession).toHaveBeenCalledTimes(sessionCalls)
  await f.models.clearConfirmed(scope)
  expect(await f.models.keyMaterial(scope)).toMatchObject({apiKey:first.material.apiKey})
})
it('verifies mixed-case exact memberships using the same ASCII order as native issuance', async () => {
  const f = setup()
  f.snapshot.catalog.models.push({
    ...existing(f.snapshot.catalog.models[0]),
    logicalModelId: 'dsh.minimax.MiniMax-M3.chat',
    providerId: 'minimax',
    exactModelId: 'MiniMax-M3',
    displayName: 'MiniMax-M3',
  })
  await f.models.restore(scope)
  let native: ReturnType<typeof nativeFixture>
  f.fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith('/material')) {
      native = nativeFixture(f, requestBody(init))
      return Response.json(native.material)
    }
    if (url.endsWith('/activate')) return Response.json(existing(native).authority)
    throw Error('unexpected fixture request')
  })
  expect((await f.models.admit(request(f))).material.authorizedModelIds).toEqual(['MiniMax-M3', 'deepseek-flash'])
})
it('uses configured platform material and reuses the Key without a connection readback', async () => {
  const f = setup()
  await f.models.restore(scope)
  let native: ReturnType<typeof nativeFixture> | undefined,
    issued = 0
  f.fetcher.mockImplementation(async (url, init) => {
    f.calls.push(url)
    if (url.endsWith('/material')) {
      issued++
      native = nativeFixture(f, requestBody(init))
      return Response.json(native.material)
    }
    if (url.endsWith('/activate') || url.endsWith('/status')) return Response.json(existing(native).authority)
    throw Error('unexpected fixture request')
  })
  const first = await f.models.admit(request(f))
  expect(first.material.fundingSource).toBe('platform')
  expect(first.material).not.toHaveProperty('userApi')
  await f.models.admit({ ...request(f), clientRequestId: '77777777-7777-4777-8777-777777777777' })
  expect(issued).toBe(1)
  expect(f.calls.filter(path => path.endsWith('/status'))).toHaveLength(0)
})

it('initializes one reusable Key during management bootstrap without dispatching any model',async()=>{
 const f=setup();await f.models.restore(scope)
 let native:ReturnType<typeof nativeFixture>|undefined
 f.fetcher.mockImplementation(async(url,init)=>{
  if(url.endsWith('/material')){native=nativeFixture(f,requestBody(init));return Response.json(native.material)}
  if(url.endsWith('/activate'))return Response.json(existing(native).authority)
  if(url.endsWith('/dsh/search-service'))return Response.json({schemaVersion:1,enabled:true})
  throw Error('bootstrap must only configure a Key')
 })
 await f.models.initializeKey(scope)
 expect(await f.models.keyMaterial(scope)).toMatchObject({apiKey:'synthetic-platform-only-key'})
 const calls=f.withSession.mock.calls.length
 f.withSession.mockRejectedValue(Error('an existing Key must never need login refresh'))
 await f.models.initializeKey(scope)
 expect(f.withSession).toHaveBeenCalledTimes(calls)
 expect(f.fetcher.mock.calls.filter(([url])=>url.endsWith('/material'))).toHaveLength(1)
 expect(f.fetcher.mock.calls.filter(([url])=>url.endsWith('/dsh/search-service'))).toHaveLength(1)
})
it('keeps an existing chat Key and startup usable while independent search setup is stalled',async()=>{
 const f=setup();await f.models.restore(scope)
 let native:ReturnType<typeof nativeFixture>|undefined
 let releaseSearch:((response:Response)=>void)|undefined
 const stalled=new Promise<Response>(resolve=>{releaseSearch=resolve})
 f.fetcher.mockImplementation(async(url,init)=>{
  if(url.endsWith('/material')){native=nativeFixture(f,requestBody(init));return Response.json(native.material)}
  if(url.endsWith('/activate'))return Response.json(existing(native).authority)
  if(url.endsWith('/dsh/search-service'))return stalled
  throw Error('unexpected setup request')
 })
 await f.models.admit(request(f))
 const setupDone=f.models.initializeKey(scope)
 const chatDone=f.models.admit({...request(f),clientRequestId:'77777777-7777-4777-8777-777777777777'})
 const completed=await Promise.race([Promise.all([setupDone,chatDone]).then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),200))])
 existing(releaseSearch)(Response.json({schemaVersion:1,enabled:true}))
 await Promise.all([setupDone,chatDone])
 expect(completed).toBe(true)
 expect(f.fetcher.mock.calls.filter(([url])=>url.endsWith('/material'))).toHaveLength(1)
 await vi.waitFor(()=>expect(f.fetcher.mock.calls.filter(([url])=>url.endsWith('/dsh/search-service'))).toHaveLength(1))
})
it('keeps an unknown issuance nonce for retry instead of reminting or changing funding', async () => {
  const f = setup()
  await f.models.restore(scope)
  let firstNonce: string | undefined,
    count = 0,
    native: ReturnType<typeof nativeFixture> | undefined
  f.fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith('/material')) {
      const intent = requestBody(init)
      count++
      if (count === 1) {
        firstNonce = intent.materialNonce
        throw Error('synthetic network failure')
      }
      expect(intent.materialNonce).toBe(firstNonce)
      native = nativeFixture(f, intent)
      return Response.json(native.material)
    }
    if (url.endsWith('/activate')) return Response.json(existing(native).authority)
    throw Error('unexpected fixture request')
  })
  await expect(f.models.admit(request(f))).rejects.toThrow()
  expect((await f.models.admit(request(f))).material.fundingSource).toBe('platform')
  expect(count).toBe(2)
})
it('replaces an unissued intent only after the server proves that exact intent was cancelled', async () => {
  const f = setup()
  await f.models.restore(scope)
  let firstNonce: string | undefined,
    attempts = 0,
    native: ReturnType<typeof nativeFixture> | undefined
  f.fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith('/material')) {
      const intent = requestBody(init)
      attempts++
      if (attempts === 1) {
        firstNonce = intent.materialNonce
        throw Error('synthetic timeout')
      }
      if (attempts === 2) {
        expect(intent.materialNonce).toBe(firstNonce)
        return Response.json({ code: 'NATIVE_TOOL_MATERIAL_CANCELLED' }, { status: 409 })
      }
      expect(intent.materialNonce).not.toBe(firstNonce)
      native = nativeFixture(f, intent)
      return Response.json(native.material)
    }
    if (url.endsWith('/activate')) return Response.json(existing(native).authority)
    throw Error('unexpected fixture request')
  })
  await expect(f.models.admit(request(f))).rejects.toThrow()
  expect((await f.models.admit(request(f))).material.fundingSource).toBe('platform')
  expect(attempts).toBe(3)
})
it('keeps the configured Key when approved catalog metadata changes without revoking or minting another Key', async () => {
  const f = setup()
  await f.models.restore(scope)
  let native: ReturnType<typeof nativeFixture>,
    revokes = 0,
    issues = 0
  f.fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith('/harness-platform-catalog'))
      return Response.json({
        catalog: f.snapshot.catalog,
        checkedAt: f.snapshot.checkedAt,
        expiresAt: f.snapshot.expiresAt,
      })
    if (url.endsWith('/material')) {
      issues++
      native = nativeFixture(f, requestBody(init))
      native.material.catalogRevision = f.snapshot.catalog.catalogRevision
      native.material.membershipRevision = f.snapshot.catalog.catalogRevision
      native.authority.catalogRevision = f.snapshot.catalog.catalogRevision
      native.authority.membershipRevision = f.snapshot.catalog.catalogRevision
      return Response.json(native.material)
    }
    if (url.endsWith('/activate')) return Response.json(native.authority)
    if (url.endsWith('/status'))
      return Response.json({ ...native.authority, state: 'conflict', permissionState: 'unavailable' })
    if (url.endsWith('/revoke')) {
      revokes++
      return Response.json({
        ...native.authority,
        state: 'unavailable',
        permissionState: 'unavailable',
        authorizedModelIds: [],
        authorizedModels: [],
        membershipRevision: null,
        bindingRevision: null,
        authorityHandle: null,
        credentialRevision: null,
        receiptRevision: null,
        policyRevision: null,
      })
    }
    throw Error('unexpected fixture request')
  })
  await f.models.admit(request(f))
  f.snapshot.catalog.catalogRevision = 'harness-platform-fixture-r2'
  f.snapshot.catalog.models = f.snapshot.catalog.models.map(row => ({
    ...row,
    membershipRevision: 'harness-platform-fixture-r2',
  }))
  await f.models.restore(scope)
  const prepared = await f.models.admit(request(f))
  expect(prepared.request.catalogRevision).toBe('harness-platform-fixture-r2')
  expect(prepared.material.catalogRevision).toBe('harness-platform-fixture-r1')
  expect(prepared.authority).toBeNull()
  expect(revokes).toBe(0)
  expect(issues).toBe(1)
})

it('reuses material appearing during bootstrap after a catalog change without status, revoke or Key replacement', async () => {
  const f = setup()
  await f.models.restore(scope)
  let native: ReturnType<typeof nativeFixture> | undefined
  f.fetcher.mockImplementation(async (url, init) => {
    if (url.endsWith('/harness-platform-catalog'))
      return Response.json({ catalog: f.snapshot.catalog, checkedAt: f.snapshot.checkedAt, expiresAt: f.snapshot.expiresAt })
    if (url.endsWith('/material')) {
      native = nativeFixture(f, requestBody(init))
      return Response.json(native.material)
    }
    if (url.endsWith('/activate')) return Response.json(existing(native).authority)
    throw Error('configured material must not enter status or revoke management')
  })
  const first = await f.models.admit(request(f))
  const original = await f.vault.read()
  f.snapshot.catalog.catalogRevision = 'harness-platform-fixture-r2'
  f.snapshot.catalog.models = f.snapshot.catalog.models.map(row => ({ ...row, membershipRevision: 'harness-platform-fixture-r2' }))
  await f.models.restore(scope)
  // Another already-authorized bootstrap finishes between the first read and
  // the management callback. Its saved Key remains the inference credential.
  f.vault.read.mockResolvedValueOnce(null)
  const next = await f.models.admit({ ...request(f), clientRequestId: '77777777-7777-4777-8777-777777777777' })
  expect(next.material.apiKey).toBe(first.material.apiKey)
  expect(next.material.credentialRevision).toBe(first.material.credentialRevision)
  expect(next.material.catalogRevision).toBe('harness-platform-fixture-r1')
  expect(next.authority).toBeNull()
  expect(await f.vault.read()).toBe(original)
  expect(f.vault.clear).not.toHaveBeenCalled()
  expect(f.fetcher.mock.calls.filter(([url]) => !url.endsWith('/harness-platform-catalog'))
    .map(([url]) => url.split('/').at(-1))).toEqual(['material', 'activate'])
})
