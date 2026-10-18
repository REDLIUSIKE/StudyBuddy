import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { canonicalNativeBuiltinCatalogPayloadV1 } from '@studybuddy/contracts'
import LlmRuntime, { LlmAdapter, markAgentLoopRequest, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type {
  NativeBuiltinCatalogApplyV1, NativeBuiltinFrozenRequestV1, NativeBuiltinPreparedRouteV1,
  NativeBuiltinRequestFreezeV1, NativeBuiltinRequestReceiptV1,
} from '@studybuddy/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { BuiltinModelDirectory } from '@deepseek-ai/dsh-llm-studybuddy-builtin'
import type { BuiltinResponseFacts } from '@deepseek-ai/dsh-llm-studybuddy-builtin'

const owner = '11111111-1111-4111-8111-111111111111'
const source = '22222222-2222-4222-8222-222222222222'
const generation = '33333333-3333-4333-8333-333333333333'
const operation = '44444444-4444-4444-8444-444444444444'
const scope = { accountId: owner, generation: 1 }
const roots: Context[] = []
const records: { key: string; options: GenerateOptions; headers: Readonly<Record<string, string>> }[] = []

function route(key = 'private-key-1', revision = 'credential-1', routeId = 'sb-source-one'): NativeBuiltinPreparedRouteV1 {
  return {
    mode: 'local_direct', routeId, displayName: 'My OpenAI key', baseUrl: 'https://api.openai.com/v1', apiKey: key,
    grant: {
      schemaVersion: 1, grantRevision: 'a'.repeat(64), catalogRevision: 'catalog-1', accountOwner: owner,
      deviceId: generation, sourceId: routeId === 'sb-source-two' ? '55555555-5555-4555-8555-555555555555' : source,
      localRef: routeId, connectionId: source, credentialRevision: revision,
      protocol: 'openai_responses', authorityExpiresAt: 4_000_000_000,
      allowedModels: [{
        logicalModelId: 'openai.model-a', providerId: 'openai', exactModelId: 'model-a', displayName: 'Model A',
        protocol: 'openai_responses', contextWindow: 128_000, maxOutputTokens: 16_000, capabilityFlags: ['tool_use'],
        evidenceSha256: 'b'.repeat(64), membershipRevision: 'membership-1', capabilityRevision: 'capability-1',
        adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available',
      }],
    },
  }
}

function catalog(routes = [route()], version = 'version-1'): NativeBuiltinCatalogApplyV1 {
  const snapshot: NativeBuiltinCatalogApplyV1 = {
    schemaVersion: 1, operationId: version === 'version-1' ? operation :
      '66666666-6666-4666-8666-666666666666', scope, hostGeneration: generation,
    catalogVersion: version, catalogDigest: 'c'.repeat(64), routes,
  }
  return { ...snapshot, catalogDigest: createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(snapshot)).digest('hex') }
}

function gatewayRoute(): NativeBuiltinPreparedRouteV1 {
  const local = route(); if (local.mode !== 'local_direct') throw new Error('fixture')
  return {
    mode: 'gateway', routeId: local.routeId, displayName: local.displayName,
    gatewayOrigin: 'https://gateway.example.test', apiKey: 'sk-owner-only',
    binding: {
      schemaVersion: 1, userId: 1, tokenId: 1, connectionId: source,
      operationId: '77777777-7777-4777-8777-777777777777', policyRevision: 'policy-1',
      tokenGroup: 'user-api', pendingExpiresAt: 2_000_000_000, authorityExpiresAt: 4_000_000_000,
      state: 'active', hostCatalogVersion: null,
      grant: {
        schemaVersion: 1, grantRevision: local.grant.grantRevision, catalogRevision: local.grant.catalogRevision,
        scope: {
          backendInstanceId: 'backend-1', accountOwner: owner, deviceId: generation, sourceId: source,
          localRef: local.grant.localRef, providerId: 'deepseek', credentialReference: 'credential-ref',
          credentialRevision: 'credential-1', baseUrl: 'https://api.deepseek.com', protocol: 'openai_responses',
          consumerId: 'studybuddy_harness', consumerVersion: '1', fundingSource: 'user_api',
        },
        allowedModels: local.grant.allowedModels.map(model => ({ ...model, providerId: 'deepseek' })),
      },
    },
  }
}

function receiptAdmission(receipt: Pick<NativeBuiltinRequestReceiptV1, 'state' | 'requestTicket' | 'expiresAt'>) {
  return async (capture: NativeBuiltinRequestFreezeV1): Promise<NativeBuiltinFrozenRequestV1> => ({
    schemaVersion: 1, clientRequestId: capture.clientRequestId, selection: capture.selection,
    authority: capture.authority, sessionId: capture.sessionId, purpose: capture.purpose,
    requestReceipt: {
      schemaVersion: 1, operationId: '88888888-8888-4888-8888-888888888888',
      requestId: capture.clientRequestId, purpose: capture.purpose, ...receipt,
    },
  })
}

const retiredReceipts: readonly Pick<NativeBuiltinRequestReceiptV1, 'state' | 'requestTicket' | 'expiresAt'>[] = [
  { state: 'prepared', requestTicket: null, expiresAt: 4_000_000_000 },
  { state: 'dispatch_started', requestTicket: null, expiresAt: 4_000_000_000 },
  { state: 'terminal', requestTicket: null, expiresAt: 4_000_000_000 },
  { state: 'prepared', requestTicket: 'expired-ticket', expiresAt: 1 },
]

class Wire extends LlmAdapter {
  constructor(private readonly material: NativeBuiltinPreparedRouteV1, private readonly headers: Readonly<Record<string,
    string>>, private readonly facts?: BuiltinResponseFacts) { super() }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    records.push({ key: this.material.apiKey, options, headers: this.headers })
    yield { type: 'text-delta', index: 0, text: 'from exact route' }
    if (this.facts !== undefined) Object.assign(this.facts, {
      providerResponseId: 'actual-response', returnedModel:
        options.model, outcome: 'completed', usage: {
        inputTokens: 3, outputTokens: 1, inputTotalTokens: 3,
        cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, cacheWrite5mTokens: null, cacheWrite1hTokens: null,
      },
    })
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function fixture(admission?: (capture: NativeBuiltinRequestFreezeV1) => Promise<NativeBuiltinFrozenRequestV1>) {
  const ctx = new Context(); roots.push(ctx); new LlmRuntime(ctx)
  const directory = new BuiltinModelDirectory(ctx, {
    hostGeneration: generation,
    createAdapter: (material, headers, facts) => new Wire(material, headers, facts),
    trustedConversation: options => options.sessionId === undefined ? undefined : {
      sessionId:
        String(options.sessionId), appendAudit: async () => { },
    },
    admit: admission ?? (async capture => ({
      schemaVersion: 1, clientRequestId: capture.clientRequestId, selection: capture.selection,
      authority: capture.authority, sessionId: capture.sessionId, purpose: capture.purpose, requestReceipt: null,
    })),
  })
  return { ctx, directory }
}

function request(model = 'model-a', provider = 'sb-source-one'): GenerateOptions {
  return markAgentLoopRequest({ provider, model, sessionId: 'conversation-1' as never, messages: [] })
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk); return chunks
}
async function ready(directory: BuiltinModelDirectory, snapshot: NativeBuiltinCatalogApplyV1) {
  const ack = await directory.apply(snapshot)
  directory.publishReady({
    schemaVersion: 1, operationId: snapshot.operationId, localRef: ack.applied[0]!.localRef,
    sourceRevision: 'e'.repeat(64), state: 'ready', phase: 'ready', catalogVersion: ack.catalogVersion, catalogDigest: ack.catalogDigest,
    hostApplied: ack, appliedModels: ack.applied, errorCode: null,
  })
  return ack
}

it('projects only currently published exact image-tool models and removes revoked source choices', async () => {
  const { directory } = fixture()
  const original = route()
  if (original.mode !== 'local_direct') throw new Error('fixture route')
  const text = original.grant.allowedModels[0]!
  const vision = { ...text, logicalModelId: 'openai.model-b', exactModelId: 'model-b', capabilityFlags: ['image_in'] as const }
  const input = catalog([{ ...original, grant: { ...original.grant, allowedModels: [text, vision] } }])
  await directory.apply(input)
  expect(directory).toHaveProperty('imageToolModels', expect.any(Function))
  expect(directory.imageToolModels()).toEqual([])
  await ready(directory, input)
  expect(directory.imageToolModels()).toEqual([{ provider: 'sb-source-one', model: 'model-b' }])
  directory.revokeSource(scope, 'sb-source-one')
  expect(directory.imageToolModels()).toEqual([])
})
afterEach(async () => { records.length = 0; await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose())) })

describe('StudyBuddy built-in Host model admission', () => {
  describe.each(['direct', 'prepared'] as const)('%s gateway dispatch', (path) => {
    it.each(retiredReceipts)('rejects a non-dispatchable receipt before creating the wire: %j', async (receipt) => {
      const { directory } = fixture(receiptAdmission(receipt)); await ready(directory, catalog([gatewayRoute()]))
      const stream = path === 'direct' ? directory.stream(request())
        : (await directory.prepareCall('sb-source-one', 'model-a')).stream(request())
      await expect(collect(stream)).rejects.toMatchObject({ code: 'BUILTIN_REQUEST_NOT_ADMITTED' })
      expect(records).toEqual([])
    })
    it('rejects a retired non-null prepared receipt before any gateway dispatch', async () => {
      const { directory } = fixture(receiptAdmission({
        state: 'prepared', requestTicket: 'current-protected-ticket', expiresAt: 4_000_000_000,
      })); await ready(directory, catalog([gatewayRoute()]))
      await expect(collect(path === 'direct' ? directory.stream(request())
        : (await directory.prepareCall('sb-source-one', 'model-a')).stream(request()))).rejects.toMatchObject({ code: 'BUILTIN_REQUEST_NOT_ADMITTED' })
      expect(records).toEqual([])
    })
    it('dispatches the exact gateway Key with only its UUID and purpose', async () => {
      const { directory } = fixture(); await ready(directory, catalog([gatewayRoute()]))
      await collect(path === 'direct' ? directory.stream(request())
        : (await directory.prepareCall('sb-source-one', 'model-a')).stream(request()))
      expect(records).toHaveLength(1)
      expect(records[0]!.key).toBe('sk-owner-only')
      expect(records[0]!.headers).toEqual({ 'X-Request-Id': expect.any(String), 'X-StudyBuddy-Request-Purpose': 'chat' })
      expect(records[0]!.headers['X-Request-Id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })
  })
  it.each(['validation', 'diagnostic'] as const)('rejects a null prepared ticket on the protected %s command', async (purpose) => {
    const { directory } = fixture(receiptAdmission({ state: 'prepared', requestTicket: null, expiresAt: 4_000_000_000 }))
    const snapshot = catalog([gatewayRoute()]), ack = await directory.apply(snapshot)
    await expect(directory.validate({
      schemaVersion: 1, operationId: snapshot.operationId, selection: ack.applied[0]!,
      clientRequestId: '99999999-9999-4999-8999-999999999999', purpose, prompt: 'Synthetic validation.',
    })).rejects.toMatchObject({ code: 'BUILTIN_REQUEST_NOT_ADMITTED' })
    expect(records).toEqual([])
  })
  it.each([{ temperature: 0.7 }, { reasoningEffort: ReasoningEffortId('medium') }, {
    reasoningEffort:
      ReasoningEffortId('off'),
  }])('rejects request parameters that the exact authority does not authorize: %j', async (parameter) => {
    const { directory } = fixture(); await ready(directory, catalog())
    await expect(collect(directory.stream(markAgentLoopRequest({
      ...request(),
      ...parameter,
    })))).rejects.toMatchObject({ code: 'BUILTIN_PARAMETER_NOT_ALLOWED' })
    expect(records).toEqual([])
  })
  it('refuses a domestic request ticket on a local direct route before dispatch', async () => {
    const { directory } = fixture(async capture => ({
      schemaVersion: 1, clientRequestId: capture.clientRequestId, selection:
        capture.selection, authority: capture.authority, sessionId: capture.sessionId, purpose: capture.purpose,
      requestReceipt: {
        schemaVersion: 1, operationId: '77777777-7777-4777-8777-777777777777', requestId:
          capture.clientRequestId, purpose: capture.purpose, requestTicket: 'private-ticket', expiresAt: 4_000_000_000, state: 'prepared',
      },
    }))
    await ready(directory, catalog())
    await expect(collect(directory.stream(request()))).rejects.toMatchObject({ code: 'BUILTIN_REQUEST_NOT_ADMITTED' })
    expect(records).toEqual([])
  })
  it('uses a null frozen receipt for current gateway Key dispatch', async () => {
    const local = route(); if (local.mode !== 'local_direct') throw new Error('fixture')
    const gateway: NativeBuiltinPreparedRouteV1 = {
      mode: 'gateway', routeId: local.routeId, displayName: local.displayName,
      gatewayOrigin: 'https://gateway.example.test', apiKey: 'sk-owner-only',
      binding: {
        schemaVersion: 1, userId: 1, tokenId: 1, connectionId: source, operationId:
          '77777777-7777-4777-8777-777777777777', policyRevision: 'policy-1', tokenGroup: 'user-api', pendingExpiresAt:
          2_000_000_000, authorityExpiresAt: 4_000_000_000, state: 'active', hostCatalogVersion: null,
        grant: {
          schemaVersion: 1, grantRevision: local.grant.grantRevision, catalogRevision: local.grant.catalogRevision,
          scope: {
            backendInstanceId: 'backend-1', accountOwner: owner, deviceId: generation, sourceId: source, localRef:
              local.grant.localRef, providerId: 'deepseek', credentialReference: 'credential-ref', credentialRevision:
              'credential-1', baseUrl: 'https://api.deepseek.com', protocol: 'openai_responses', consumerId:
              'studybuddy_harness', consumerVersion: '1', fundingSource: 'user_api',
          }, allowedModels:
            local.grant.allowedModels.map(model => ({ ...model, providerId: 'deepseek' })),
        },
      },
    }
    const { directory } = fixture(); await ready(directory, catalog([gateway]))
    await collect(directory.stream(request()))
    expect(records).toHaveLength(1)
    expect(records[0]!.headers).not.toHaveProperty('X-StudyBuddy-Request-Ticket')
  })
  it('keeps pending and revoked route admission fail-closed through the real runtime registry', async () => {
    const { ctx, directory } = fixture(), snapshot = catalog()
    await directory.apply(snapshot)
    expect(ctx.llm.listProviders()).toEqual([])
    await expect(ctx.llm.prepareCall({ provider: 'sb-source-one', model: 'model-a' })).rejects.toMatchObject({
      code:
        'BUILTIN_SOURCE_NOT_READY',
    })
    await ready(directory, snapshot)
    directory.revoke(scope)
    expect(ctx.llm.listProviders()).toEqual([])
    await expect(ctx.llm.prepareCall({ provider: 'sb-source-one', model: 'model-a' })).rejects.toMatchObject({
      code:
        expect.stringMatching(/^BUILTIN_/),
    })
    const nextScope = { ...scope, generation: 2 }, next = { ...catalog([route()], 'next-account-version'), scope: nextScope }
    next.catalogDigest = createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(next)).digest('hex')
    await expect(directory.apply(next)).resolves.toMatchObject({ scope: nextScope })
  })
  it('allows protected validation of installed pending models without publishing chat admission', async () => {
    const { ctx, directory } = fixture()
    const snapshot = catalog(), ack = await directory.apply(snapshot)
    const result = await directory.validate({
      schemaVersion: 1, operationId: snapshot.operationId, selection: ack.applied[0]!,
      clientRequestId: '77777777-7777-4777-8777-777777777777', purpose: 'validation', prompt: 'Reply with a short greeting.',
    })
    expect(result).toMatchObject({
      outcome: 'completed', providerResponseId: 'actual-response', returnedModel:
        'model-a', usageOrigin: 'provider_terminal', usage: { outputTokens: 1 },
    })
    expect(result.firstVisibleTextMs).toBeTypeOf('number')
    expect(ctx.llm.listProviders()).toEqual([])
    await expect(directory.prepareCall('sb-source-one', 'model-a')).rejects.toMatchObject({ code: 'BUILTIN_SOURCE_NOT_READY' })
    expect(records[0]!.options).not.toHaveProperty('sessionId')
    expect(records[0]!.options).not.toHaveProperty('tools')
  })
  it('installs exact catalogs and acknowledges the current source identity', async () => {
    const { ctx, directory } = fixture()
    const receipt = await ready(directory, catalog())
    expect(receipt.applied).toEqual([{
      routeId: 'sb-source-one', sourceId: source, localRef: 'sb-source-one', providerId: 'openai',
      exactModelId: 'model-a', protocol: 'openai_responses', connectionId: source, credentialRevision: 'credential-1',
      grantRevision: 'a'.repeat(64), fundingSource: 'user_api',
    }])
    expect((await ctx.llm.listModels('sb-source-one')).map(model => model.id)).toEqual(['model-a'])
    expect(receipt).toEqual(await directory.readback(scope))
    expect(JSON.stringify(receipt)).not.toContain('private-key')
  })

  it('rejects unknown membership in preparation and direct streams with BUILTIN errors', async () => {
    const { directory } = fixture(); await ready(directory, catalog())
    await expect(directory.prepareCall('sb-source-one', 'unlisted')).rejects.toMatchObject({ code: 'BUILTIN_MODEL_NOT_ALLOWED' })
    expect(() => directory.stream(request('unlisted'))).toThrowError(expect.objectContaining({ code: 'BUILTIN_MODEL_NOT_ALLOWED' }))
    expect(records).toEqual([])
  })

  it('keeps a prepared request bound to the captured key while later calls capture rotation', async () => {
    const { directory } = fixture(); await ready(directory, catalog())
    const prepared = await directory.prepareCall('sb-source-one', 'model-a')
    await ready(directory, catalog([route('private-key-2', 'credential-2')], 'version-2'))
    await collect(prepared.stream(request()))
    await collect(directory.stream(request()))
    expect(records.map(record => record.key)).toEqual(['private-key-1', 'private-key-2'])
  })

  it('blocks captured requests after account revoke and rejects an old account apply', async () => {
    const { directory } = fixture(); await ready(directory, catalog())
    const prepared = await directory.prepareCall('sb-source-one', 'model-a')
    directory.revoke(scope)
    await expect(collect(prepared.stream(request()))).rejects.toMatchObject({ code: 'BUILTIN_SCOPE_REVOKED' })
    await expect(directory.apply(catalog())).rejects.toMatchObject({ code: 'BUILTIN_SCOPE_REVOKED' })
    expect(records).toEqual([])
  })

  it('preserves the previous directory on route collision and refuses version digest changes', async () => {
    const { ctx, directory } = fixture(); const first = await ready(directory, catalog())
    ctx.llm.registerAdapter(['collision'], new Wire(route(), {}))
    await expect(directory.apply(catalog([route('another-key', 'credential-2', 'collision')], 'version-2'))).rejects.toThrow()
    expect(await directory.readback(scope)).toEqual(first)
    await expect(directory.apply({ ...catalog(), catalogDigest: 'd'.repeat(64) })).rejects.toMatchObject({
      code:
        'BUILTIN_CATALOG_CONFLICT',
    })
    expect((await ctx.llm.listModels('sb-source-one')).map(model => model.id)).toEqual(['model-a'])
  })

  it('does not authorize a caller-supplied purpose or an unmarked session id', async () => {
    const { directory } = fixture(); await ready(directory, catalog())
    await expect(collect(directory.stream({
      provider: 'sb-source-one', model: 'model-a', messages: [],
      sessionId: 'conversation-1' as never, purpose: 'compaction',
    }))).rejects.toMatchObject({ code: 'BUILTIN_TRUST_REQUIRED' })
    expect(records).toEqual([])
  })

  it('keeps different keys for the same provider in separate selectable routes', async () => {
    const { ctx, directory } = fixture()
    const first = await ready(directory, catalog())
    await ready(directory, catalog([route('other-private-key', 'credential-2', 'sb-source-two')], 'version-2'))
    expect(await directory.readback(scope, first.operationId)).toEqual(first)
    await collect(directory.stream(request('model-a', 'sb-source-two')))
    expect(records.map(record => record.key)).toEqual(['other-private-key'])
    expect(ctx.llm.listProviders().map(provider => provider.id)).toEqual(['sb-source-one', 'sb-source-two'])
  })

  it('keeps privately installed sources out of the selectable catalog until native confirms readiness', async () => {
    const { ctx, directory } = fixture()
    const ack = await directory.apply(catalog())
    expect(ack.applied).toHaveLength(1)
    expect(ctx.llm.listProviders()).toEqual([])
    await expect(directory.prepareCall('sb-source-one', 'model-a')).rejects.toMatchObject({ code: 'BUILTIN_SOURCE_NOT_READY' })
  })

  it('blocks previously prepared dispatch after its source is explicitly revoked', async () => {
    const { directory } = fixture(); await ready(directory, catalog())
    const prepared = await directory.prepareCall('sb-source-one', 'model-a')
    directory.revokeSource(scope, 'sb-source-one')
    await expect(collect(prepared.stream(request()))).rejects.toMatchObject({ code: 'BUILTIN_SOURCE_REVOKED' })
    expect(records).toEqual([])
  })
})
