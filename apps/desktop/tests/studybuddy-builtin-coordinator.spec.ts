import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type {
  NativeBuiltinCatalogAppliedV1, NativeBuiltinCatalogApplyV1, NativeBuiltinHostContextV1,
  NativeBuiltinPreparedSourceV1, NativeBuiltinLocalDirectRouteV1, NativeBuiltinGatewayRouteV1, NativeBuiltinReadinessV1, NativeBuiltinValidationResultV1, OwnedScope,
} from '@studybuddy/contracts'
import { canonicalNativeBuiltinCatalogPayloadV1 } from '@studybuddy/contracts'
import { BuiltinCoordinator } from '../src/studybuddy/builtin-coordinator.ts'

const scope: OwnedScope = { accountId: '11111111-1111-4111-8111-111111111111', generation: 1 }
const hostGeneration = '33333333-3333-4333-8333-333333333333'
const operationId = '44444444-4444-4444-8444-444444444444'
function source(): NativeBuiltinPreparedSourceV1 & {routes:[NativeBuiltinLocalDirectRouteV1]} {
  return {
    schemaVersion: 1, operationId, localRef: 'source-1', sourceRevision: 'e'.repeat(64), routes: [{
      mode:
        'local_direct', routeId: 'private-route', displayName: 'Private source', baseUrl: 'https://api.openai.com/v1',
      apiKey: 'owner-only-key',
      grant: {
        schemaVersion: 1, grantRevision: 'a'.repeat(64), catalogRevision: 'catalog-1', accountOwner:
          scope.accountId, deviceId: hostGeneration,
        sourceId: '22222222-2222-4222-8222-222222222222', localRef: 'source-1', connectionId:
          '22222222-2222-4222-8222-222222222222', credentialRevision: 'credential-1', protocol: 'openai_responses',
        authorityExpiresAt: 4_000_000_000,
        allowedModels: [{
          logicalModelId: 'openai.model-a', providerId: 'openai', exactModelId: 'model-a', displayName:
            'Model A', protocol: 'openai_responses', contextWindow: 128_000, maxOutputTokens: 16_000,
          capabilityFlags: ['tool_use'], evidenceSha256: 'b'.repeat(64), membershipRevision: 'member-1',
          capabilityRevision: 'cap-1', adapterRevision: 'adapter-1', priceAuthorityRevision: null, availability: 'available',
        }],
      },
    }],
  }
}
function gatewaySource(expiresAt: number): NativeBuiltinPreparedSourceV1 & {routes:[NativeBuiltinGatewayRouteV1]} {
  const direct = source(), original = direct.routes[0].grant
  return { ...direct, routes: [{ mode: 'gateway', routeId: 'private-route', displayName: 'Private source',
    apiKey: 'owner-only-key', gatewayOrigin: 'https://synthetic.gateway.test', binding: {
      schemaVersion: 1, userId: 3, tokenId: 4, connectionId: original.connectionId, operationId,
      policyRevision: 'policy-1', tokenGroup: 'default', pendingExpiresAt: expiresAt - 60,
      authorityExpiresAt: expiresAt, state: 'active', hostCatalogVersion: null,
      grant: { schemaVersion: 1, grantRevision: original.grantRevision, catalogRevision: original.catalogRevision,
        scope: { backendInstanceId: 'fixture-backend', accountOwner: scope.accountId, deviceId: hostGeneration,
          sourceId: original.sourceId, localRef: original.localRef, providerId: 'deepseek',
          credentialReference: 'credential-1', credentialRevision: original.credentialRevision,
          baseUrl: 'https://api.deepseek.com/v1', protocol: 'openai_chat_completions',
          consumerId: 'studybuddy_harness', consumerVersion: '1', fundingSource: 'user_api' },
        allowedModels: original.allowedModels.map(m => ({ ...m, providerId: 'deepseek', protocol: 'openai_chat_completions' })) },
    } }] }
}
function fixture(ownedOperations?: (owner: OwnedScope) => Promise<readonly string[]>, material: NativeBuiltinPreparedSourceV1 = source()) {
  let current: typeof scope | null = scope, ack: NativeBuiltinCatalogAppliedV1 | undefined, confirmed = false
  const pending = (): NativeBuiltinReadinessV1 => ({
    schemaVersion: 1, operationId, localRef: 'source-1',
    sourceRevision: 'e'.repeat(64), state: 'pending', phase: ack ? 'validation' : 'grant_prepare', catalogVersion:
      ack?.catalogVersion ?? null, catalogDigest: ack?.catalogDigest ?? null, hostApplied: ack ?? null, appliedModels:
      [], errorCode: null,
  })
  const ready = (): NativeBuiltinReadinessV1 => ({ ...pending(), state: 'ready', phase: 'ready', appliedModels: ack!.applied })
  const host = {
    builtinContext: (owner: typeof scope): NativeBuiltinHostContextV1 => ({ scope: owner, hostGeneration }),
    builtinApply: vi.fn(async (value: NativeBuiltinCatalogApplyV1) => {
      expect(value.catalogDigest).toBe(createHash('sha256').update(canonicalNativeBuiltinCatalogPayloadV1(value)).digest('hex'))
      ack = {
        schemaVersion: 1, operationId, scope, hostGeneration: value.hostGeneration, catalogVersion:
          value.catalogVersion, catalogDigest: value.catalogDigest,
        applied: value.routes.flatMap(route => {
          const grant = route.mode === 'gateway' ? route.binding.grant : route.grant
          const identity = route.mode === 'gateway' ? route.binding.grant.scope : route.grant
          return grant.allowedModels.map(model => ({ routeId: route.routeId, sourceId: identity.sourceId,
            localRef: identity.localRef, providerId: model.providerId, exactModelId: model.exactModelId,
            protocol: model.protocol, connectionId: route.mode === 'gateway' ? route.binding.connectionId : route.grant.connectionId,
            credentialRevision: identity.credentialRevision, grantRevision: grant.grantRevision, fundingSource: 'user_api' as const }))
        }),
      }; return ack
    }), builtinReadback: vi.fn(async (_owner:OwnedScope,_operationId:string) => ack!), builtinPublish: vi.fn(async () => { }), builtinRevoke: vi.fn(async () => { }),
    builtinValidate: vi.fn(async ({ prompt: _prompt, ...request }): Promise<NativeBuiltinValidationResultV1> => ({
      ...request, providerResponseId: 'actual-response', returnedModel: 'model-a', outcome: 'completed', usageOrigin: 'provider_terminal',
      usage: {
        inputTokens: 3, outputTokens: 1, inputTotalTokens: 3, cacheReadTokens: null, cacheWriteTokens: null,
        reasoningTokens: null, cacheWrite5mTokens: null, cacheWrite1hTokens: null,
      }, firstVisibleTextMs: 0,
      dispatchToTerminalMs: 1, errorCode: null,
    })),
  }
  const invokeBuiltin = vi.fn(async (_owner:OwnedScope, method:string, args:readonly unknown[]):Promise<unknown> => {
    if (method === 'getBuiltinSourceMaterial') return structuredClone(material)
    if (method === 'listBuiltinReadiness') return [confirmed ? ready() : pending()]
    if (method === 'getBuiltinSourceDetail') return {
      schemaVersion: 1, localRef: 'source-1', readiness:
        confirmed ? ready() : pending(), balance: null, lastDiagnostics: [],
    }
    if (method === 'acknowledgeBuiltinCatalog') { expect(args[0]).toEqual(ack); return pending() }
    if (method === 'acknowledgeBuiltinLocalValidation') {
      expect(args[0]).toMatchObject({
        providerResponseId:
          'actual-response', returnedModel: 'model-a', catalogVersion: ack!.catalogVersion,
      }); confirmed = true; return ready()
    }
    if (method === 'revokeBuiltinSource') return undefined
    if (method === 'resumeBuiltinSource') return confirmed ? ready() : pending()
    return pending()
  })
  let activeHost = host
  const coordinator = new BuiltinCoordinator({
    host: () => activeHost, isCurrent: owner =>
      current?.accountId === owner.accountId && current.generation === owner.generation,
    native: { invokeBuiltin: invokeBuiltin as never }, ...ownedOperations === undefined ? {} : { ownedOperations },
  })
  return {
    coordinator, host, invokeBuiltin, setScope: (value: typeof scope | null) => { current = value },
    setConfirmed: (value: boolean) => { confirmed = value }, setHost: (value: typeof host) => { activeHost = value },
  }
}
describe('Main built-in source orchestration', () => {
  it('retains a saved gateway Key directory beyond historical timestamps without renewal, paid validation or Key change', async () => {
    const now = 1_900_000_000, clock = vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
    try {
      const material = gatewaySource(now + 60), f = fixture(undefined, material)
      f.setConfirmed(true)
      expect(await f.coordinator.resume(scope, operationId)).toMatchObject({ state: 'ready' })
      const first = f.host.builtinApply.mock.calls[0]![0]
      clock.mockReturnValue((now + 61) * 1000)
      expect((await f.coordinator.list(scope))[0]).toMatchObject({ state: 'ready' })
      expect(f.host.builtinApply).toHaveBeenCalledOnce()
      const latest = f.host.builtinApply.mock.calls[0]![0], route = latest.routes[0]
      expect(route?.mode).toBe('gateway')
      if (route?.mode !== 'gateway') throw Error('fixture gateway route missing')
      expect(route.binding.authorityExpiresAt).toBe(now + 60)
      expect(route.apiKey).toBe(first.routes[0]?.apiKey)
      expect(latest.operationId).toBe(first.operationId)
      expect(f.host.builtinValidate).not.toHaveBeenCalled()
      expect(f.host.builtinRevoke).not.toHaveBeenCalled()
      const count = f.host.builtinApply.mock.calls.length
      await f.coordinator.list(scope)
      expect(f.host.builtinApply).toHaveBeenCalledTimes(count)
    } finally { clock.mockRestore() }
  })
  it.each(['valid', 'foreign-owner', 'foreign-request', 'changed-key', 'extra-field', 'unsafe-origin', 'corrupt',
    'logout-404', 'logout-403', 'logout-200', 'oversized'])
  ('recovers only the exact original Key receipt after restart (%s)', async (variant) => {
    const f = fixture(), id = '77777777-7777-4777-8777-777777777777', route = source().routes[0]
    const record = { schemaVersion: 1, accountOwner: scope.accountId, gatewayOrigin: 'https://synthetic.gateway.test',
      apiKey: 'retained-original-model-key', keySha256: createHash('sha256').update('retained-original-model-key').digest('hex'),
      frozen: { schemaVersion: 1, clientRequestId: id, sessionId: 'session-1', purpose: 'chat', requestReceipt: null,
        authority: route.grant.allowedModels[0], selection: { routeId: route.routeId, sourceId: route.grant.sourceId,
          localRef: route.grant.localRef, providerId: 'openai', exactModelId: 'model-a', protocol: route.grant.protocol,
          connectionId: route.grant.connectionId, credentialRevision: route.grant.credentialRevision,
          grantRevision: route.grant.grantRevision, fundingSource: 'user_api' } } }
    let saved = JSON.stringify(record)
    if (variant === 'foreign-owner') saved = JSON.stringify({ ...record, accountOwner: '22222222-2222-4222-8222-222222222222' })
    if (variant === 'foreign-request') saved = JSON.stringify({ ...record, frozen: { ...record.frozen, clientRequestId: operationId } })
    if (variant === 'changed-key') saved = JSON.stringify({ ...record, apiKey: 'changed-key' })
    if (variant === 'extra-field') saved = JSON.stringify({ ...record, unexpected: true })
    if (variant === 'unsafe-origin') saved = JSON.stringify({ ...record, gatewayOrigin: 'http://127.0.0.1' })
    if (variant === 'corrupt') saved = '{"apiKey":"retained-original-model-key",broken'
    const vault = { read: vi.fn(async () => saved), write: vi.fn(), clear: vi.fn() }
    let active = true
    const deferred = Promise.withResolvers<Response>()
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://synthetic.gateway.test/v1/requests/' + id)
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer retained-original-model-key')
      if (variant.startsWith('logout-')) return deferred.promise
      if (variant === 'oversized') return new Response('x'.repeat(32769))
      return Response.json({ schemaVersion: 1, operationId, requestId: id, purpose: 'chat', state: 'terminal',
        requestTicket: null, expiresAt: 4_000_000_000 })
    })
    const restarted = new BuiltinCoordinator({ host: () => f.host, isCurrent: () => active,
      native: { invokeBuiltin: f.invokeBuiltin as never }, requestVault: () => vault, fetch })
    if (variant === 'valid') {
      expect(await restarted.consumerRequestStatus({ ...scope, generation: 2 }, id)).toMatchObject({ requestId: id, state: 'terminal' })
      expect(fetch).toHaveBeenCalledOnce()
    } else if (variant.startsWith('logout-')) {
      const pending = restarted.consumerRequestStatus({ ...scope, generation: 2 }, id)
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
      active = false
      deferred.resolve(new Response(null, { status: Number(variant.slice(7)) }))
      await expect(pending).rejects.toThrow('BUILTIN_SCOPE_REVOKED')
    } else if (variant === 'oversized') {
      await expect(restarted.consumerRequestStatus({ ...scope, generation: 2 }, id)).rejects.toThrow('BUILTIN_REQUEST_STATUS_UNAVAILABLE')
    } else {
      await expect(restarted.consumerRequestStatus({ ...scope, generation: 2 }, id)).rejects.toThrow('BUILTIN_REQUEST_RECOVERY_INVALID')
      expect(fetch).not.toHaveBeenCalled()
    }
    expect(f.invokeBuiltin).not.toHaveBeenCalled()
    expect(f.host.builtinApply).not.toHaveBeenCalled()
    expect(vault.clear).not.toHaveBeenCalled()
  })
  it('keeps configured Key models published after the management lease expires', async () => {
    const original = source()
    const route = original.routes[0]
    const material: ReturnType<typeof source> = { ...original, routes:[{...route,grant:{...route.grant,authorityExpiresAt:1}}] }
    const f = fixture(undefined, material)
    await f.coordinator.prepareAndValidate(scope, operationId, { exactModelId: 'model-a', protocol: 'openai_responses' })
    const [row] = await f.coordinator.list(scope)
    expect(row).toMatchObject({ state: 'ready' })
  })
  it('journals a Key request without calling login-authenticated request preparation', async () => {
    const f = fixture()
    await f.coordinator.prepareAndValidate(scope, operationId, { exactModelId: 'model-a', protocol: 'openai_responses' })
    const apply = f.host.builtinApply.mock.calls[0]![0]
    const ack = await f.host.builtinReadback(scope, operationId)
    const request = { schemaVersion: 1 as const, scope, hostGeneration, catalogVersion: apply.catalogVersion,
      catalogDigest: apply.catalogDigest, selection: ack.applied[0]!, authority: source().routes[0]!.grant.allowedModels[0]!,
      clientRequestId: '77777777-7777-4777-8777-777777777777', sessionId: 'session-1', purpose: 'chat' as const }
    f.invokeBuiltin.mockImplementation(async (_owner, method, args) => {
      if (method !== 'prepareBuiltinKeyRequest') throw Error('login request preparation is forbidden')
      const row = args[0] as typeof request
      return { schemaVersion: 1, clientRequestId: row.clientRequestId, selection: row.selection,
        authority: row.authority, sessionId: row.sessionId, purpose: row.purpose, requestReceipt: null }
    })
    const frozen = await f.coordinator.admit(request)
    expect(frozen.requestReceipt).toBeNull()
    expect(f.invokeBuiltin.mock.calls.at(-1)?.[1]).toBe('prepareBuiltinKeyRequest')
    const calls = f.invokeBuiltin.mock.calls.length
    expect(await f.coordinator.consumerRequestStatus(scope, request.clientRequestId)).toBeNull()
    expect(f.invokeBuiltin).toHaveBeenCalledTimes(calls)
  })
  it('rejects a retired non-null native freeze for a local direct source', async () => {
    const f = fixture()
    await f.coordinator.prepareAndValidate(scope, operationId, { exactModelId: 'model-a', protocol: 'openai_responses' })
    const apply = f.host.builtinApply.mock.calls[0]![0], ack = await f.host.builtinReadback(scope, operationId)
    const request = { schemaVersion: 1 as const, scope, hostGeneration, catalogVersion: apply.catalogVersion,
      catalogDigest: apply.catalogDigest, selection: ack.applied[0]!, authority: source().routes[0]!.grant.allowedModels[0]!,
      clientRequestId: '77777777-7777-4777-8777-777777777777', sessionId: 'session-1', purpose: 'chat' as const }
    f.invokeBuiltin.mockImplementation(async (_owner, method, args) => {
      if (method !== 'prepareBuiltinKeyRequest') throw Error('login request preparation is forbidden')
      const row = args[0] as typeof request
      return { schemaVersion: 1, clientRequestId: row.clientRequestId, selection: row.selection,
        authority: row.authority, sessionId: row.sessionId, purpose: row.purpose, requestReceipt: {
          schemaVersion: 1, operationId, requestId: row.clientRequestId, purpose: row.purpose,
          state: 'prepared', requestTicket: 'retired-private-ticket', expiresAt: 4_000_000_000 } }
    })
    await expect(f.coordinator.admit(request)).rejects.toThrow('NATIVE_BUILTIN_CONSUMER_V1_INVALID')
  })
  it('installs and reads back actual source material before native acknowledgement and keeps pending sources unpublished', async () => {
    const { coordinator, host, invokeBuiltin } = fixture()
    expect(await coordinator.resume(scope, operationId)).toMatchObject({ state: 'pending', phase: 'validation' })
    expect(host.builtinApply).toHaveBeenCalledTimes(1)
    expect(host.builtinReadback).toHaveBeenCalledWith(scope, operationId)
    expect(invokeBuiltin.mock.calls.some(([, method]) => method === 'acknowledgeBuiltinCatalog')).toBe(true)
    expect(host.builtinPublish).not.toHaveBeenCalled()
    expect(host.builtinValidate).not.toHaveBeenCalled()
    await coordinator.resume(scope, operationId)
    expect(host.builtinApply).toHaveBeenCalledTimes(1)
    expect(host.builtinValidate).not.toHaveBeenCalled()
  })
  it('uses one explicit exact validation, then native local proof, before publishing ready', async () => {
    const { coordinator, host } = fixture()
    expect(await coordinator.prepareAndValidate(scope, operationId, {
      exactModelId: 'model-a', protocol:
        'openai_responses',
    })).toMatchObject({ state: 'ready' })
    expect(host.builtinValidate).toHaveBeenCalledTimes(1)
    expect(host.builtinPublish).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1, readiness:
        expect.objectContaining({ state: 'ready' }),
    }))
  })
  it('never performs an inference during per-source login restore', async () => {
    const { coordinator, host } = fixture()
    await coordinator.restore(scope)
    expect(host.builtinApply).toHaveBeenCalledTimes(1)
    expect(host.builtinValidate).not.toHaveBeenCalled()
  })
  it('fences an old account before accepting further material and admission', async () => {
    const { coordinator, host, setScope } = fixture()
    await coordinator.resume(scope, operationId)
    setScope(null); await coordinator.revoke(scope)
    await expect(coordinator.resume(scope, operationId)).rejects.toThrow('BUILTIN_SCOPE_REVOKED')
    expect(host.builtinRevoke).toHaveBeenCalledWith(scope)
    expect(host.builtinValidate).not.toHaveBeenCalled()
  })
  it('keeps native confirmation pending publicly until this Host successfully publishes the exact source', async () => {
    const { coordinator, host } = fixture()
    host.builtinPublish.mockRejectedValueOnce(new Error('BUILTIN_HOST_UNAVAILABLE'))
    await expect(coordinator.prepareAndValidate(scope, operationId, {
      exactModelId: 'model-a', protocol:
        'openai_responses',
    })).rejects.toThrow('BUILTIN_HOST_UNAVAILABLE')
    expect(await coordinator.list(scope)).toEqual([expect.objectContaining({ state: 'pending', phase: 'host_apply', appliedModels: [] })])
    expect((await coordinator.detail(scope, 'source-1')).readiness).toMatchObject({ state: 'pending', phase: 'host_apply' })
  })
  it('rejects a consistent apply/readback receipt if its exact credential authority differs from the actual material', async () => {
    const { coordinator, host, invokeBuiltin } = fixture()
    const apply = host.builtinApply.getMockImplementation()!, readback = host.builtinReadback.getMockImplementation()!
    const alter = (ack: NativeBuiltinCatalogAppliedV1): NativeBuiltinCatalogAppliedV1 => ({
      ...ack, applied:
        ack.applied.map(row => ({ ...row, credentialRevision: 'unowned-credential' })),
    })
    host.builtinApply.mockImplementation(async value => alter(await apply(value)))
    host.builtinReadback.mockImplementation(async (owner,id) => alter(await readback(owner,id)))
    await expect(coordinator.resume(scope, operationId)).rejects.toThrow('BUILTIN_HOST_ACK_MISMATCH')
    expect(invokeBuiltin.mock.calls.some(([, method]) => method === 'acknowledgeBuiltinCatalog')).toBe(false)
  })
  it('removes a published source immediately when native withdraws its current readiness', async () => {
    const { coordinator, host, setConfirmed } = fixture()
    await coordinator.prepareAndValidate(scope, operationId, { exactModelId: 'model-a', protocol: 'openai_responses' })
    expect((await coordinator.list(scope))[0]!.state).toBe('ready')
    setConfirmed(false)
    expect((await coordinator.list(scope))[0]!.state).toBe('pending')
    expect(host.builtinRevoke).toHaveBeenCalledWith(scope, 'source-1')
  })
  it('restores a replacement Host from actual source material without treating the old published ack as current', async () => {
    const { coordinator, host, setHost, setConfirmed } = fixture()
    await coordinator.prepareAndValidate(scope, operationId, { exactModelId: 'model-a', protocol: 'openai_responses' })
    const replacement = {
      ...host, builtinContext: (owner: typeof scope) => ({
        scope: owner, hostGeneration:
          '99999999-9999-4999-8999-999999999999',
      }),
      builtinRevoke: vi.fn(async () => { throw new Error('BUILTIN_SCOPE_MISMATCH') }),
    }
    setHost(replacement)
    setConfirmed(false)
    await coordinator.restore(scope)
    expect(host.builtinApply).toHaveBeenCalledTimes(2)
    expect(host.builtinApply.mock.calls[1]![0].hostGeneration).toBe('99999999-9999-4999-8999-999999999999')
    expect(host.builtinValidate).toHaveBeenCalledTimes(1)
    expect((await coordinator.list(scope))[0]!.state).toBe('pending')
    expect(replacement.builtinRevoke).not.toHaveBeenCalled()
  })
  it('refreshes actual owned saved operations before restoring newly registered login sources with no readiness journal yet', async () => {
    const owned = vi.fn(async () => [operationId]), { coordinator, host, invokeBuiltin } = fixture(owned)
    const original = invokeBuiltin.getMockImplementation()!
    invokeBuiltin.mockImplementation((owner, method, args) => method === 'listBuiltinReadiness' ? Promise.resolve([]) :
      original(owner, method, args))
    await coordinator.restore(scope)
    expect(owned).toHaveBeenCalledWith(scope)
    expect(host.builtinApply).toHaveBeenCalledOnce()
    expect(host.builtinValidate).not.toHaveBeenCalled()
    expect(host.builtinPublish).not.toHaveBeenCalled()
  })
})
