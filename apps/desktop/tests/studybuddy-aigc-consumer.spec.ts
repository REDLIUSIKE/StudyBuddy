import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type {
  NativeBuiltinCatalogAppliedV1, NativeBuiltinCatalogApplyV1, NativeBuiltinGatewayRouteV1, NativeBuiltinPreparedSourceV1,
  NativeBuiltinReadinessV1, NativeBuiltinRequestFreezeV1, NativeBuiltinSelectionRefV1, OwnedScope,
} from '@studybuddy/contracts'
import { BuiltinCoordinator } from '../src/studybuddy/builtin-coordinator.ts'

const scope: OwnedScope = { accountId: randomUUID(), generation: 1 }, hostGeneration = randomUUID()
function fixture() {
  const operationId = randomUUID(), requestOperation = randomUUID()
  const route = (funding: 'user_api' | 'platform'): NativeBuiltinGatewayRouteV1 => ({ mode: 'gateway',
    routeId: funding, displayName: funding, gatewayOrigin: 'https://fixture.gateway.test', apiKey: 'private-route-secret',
    binding: { schemaVersion: 1, userId: 1, tokenId: 2, connectionId: randomUUID(), operationId,
      policyRevision: 'policy-1', tokenGroup: 'fixture-group', pendingExpiresAt: 3_900_000_000,
      authorityExpiresAt: 4_000_000_000, state: 'active', hostCatalogVersion: 'fixture-1',
      grant: { schemaVersion: 1, grantRevision: 'a'.repeat(64), catalogRevision: 'fixture-1',
        scope: { backendInstanceId: 'fixture', accountOwner: scope.accountId, sourceId: randomUUID(), localRef: 'source-1',
          providerId: 'kimi', credentialReference: 'credential-1', credentialRevision: 'revision-1',
          baseUrl: 'https://api.moonshot.cn', deviceId: hostGeneration, protocol: 'openai_chat_completions',
          consumerId: 'studybuddy_harness', consumerVersion: '1', fundingSource: funding },
        allowedModels: [{ logicalModelId: 'fixture-logical', providerId: 'kimi', exactModelId: 'same-exact-model',
          displayName: 'Fixture', protocol: 'openai_chat_completions', contextWindow: 8192, maxOutputTokens: 2048,
          capabilityFlags: ['tool_use'], evidenceSha256: 'b'.repeat(64), membershipRevision: 'member-1',
          capabilityRevision: 'cap-1', adapterRevision: 'adapter-1', priceAuthorityRevision: funding === 'platform' ? 'price-1' : null,
          availability: 'available' }] } } })
  const material: NativeBuiltinPreparedSourceV1 = { schemaVersion: 1, operationId, localRef: 'source-1',
    sourceRevision: 'e'.repeat(64), routes: [route('platform'), route('user_api')] }
  let ack: NativeBuiltinCatalogAppliedV1 | undefined, generation = hostGeneration, preparePause = async () => { }, retired = false
  const records = new Map<string, string>(), write = vi.fn(async (id: string, value: string) => { records.set(id, value) })
  const readiness = (): NativeBuiltinReadinessV1 => ({ schemaVersion: 1, operationId, localRef: material.localRef,
    sourceRevision: material.sourceRevision, state: ack ? 'ready' : 'pending', phase: ack ? 'ready' : 'grant_prepare',
    catalogVersion: ack?.catalogVersion ?? null, catalogDigest: ack?.catalogDigest ?? null,
    hostApplied: ack ?? null, appliedModels: ack?.applied ?? [], errorCode: null })
  const host = { builtinContext: (owner: OwnedScope) => ({ scope: owner, hostGeneration: generation }),
    builtinApply: async (value: NativeBuiltinCatalogApplyV1) => {
      const applied: NativeBuiltinSelectionRefV1[] = material.routes.flatMap((route) => {
        if (route.mode !== 'gateway') return []
        const { grant, connectionId } = route.binding
        return grant.allowedModels.map(model => ({ routeId: route.routeId, sourceId: grant.scope.sourceId,
          localRef: grant.scope.localRef, providerId: model.providerId, exactModelId: model.exactModelId, protocol: model.protocol,
          connectionId, credentialRevision: grant.scope.credentialRevision, grantRevision: grant.grantRevision,
          fundingSource: grant.scope.fundingSource }))
      })
      ack = { schemaVersion: 1, operationId, scope, hostGeneration: generation, catalogVersion: value.catalogVersion,
        catalogDigest: value.catalogDigest, applied }; return ack
    }, builtinReadback: async () => ack!, builtinPublish: async () => { }, builtinRevoke: async () => { },
    builtinValidate: async () => { throw Error('NO_PAID_VALIDATION') } }
  const coordinator = new BuiltinCoordinator({ host: () => host, isCurrent: () => true,
    requestVault: (_owner, id) => ({ read: async () => records.get(id) ?? null, write: value => write(id, value), clear: async () => { records.delete(id) } }),
    native: { invokeBuiltin: (async (_owner: OwnedScope, method: string, args: readonly unknown[]) => {
      if (method === 'getBuiltinSourceMaterial') return material
      if (method === 'listBuiltinReadiness') return [readiness()]
      if (method === 'prepareBuiltinKeyRequest') {
        const request = args[0] as NativeBuiltinRequestFreezeV1
        await preparePause()
        return { schemaVersion: 1, clientRequestId: request.clientRequestId, selection: request.selection,
          authority: request.authority, sessionId: request.sessionId, purpose: 'chat', requestReceipt: retired ? { schemaVersion: 1,
            operationId: requestOperation, requestId: request.clientRequestId, purpose: 'chat', requestTicket: 'fixture-ticket',
            expiresAt: 4_000_000_000, state: 'prepared' } : null }
      }
      return readiness()
    }) as never } })
  return { coordinator, operationId, setPause: (value: typeof preparePause) => { preparePause = value },
    replaceHost: () => { generation = randomUUID() }, setRetired: () => { retired = true }, write }
}
it('keeps duplicate model IDs in separate funding choices and accepts a Key-only native freeze', async () => {
  const { coordinator, operationId } = fixture()
  await coordinator.resume(scope, operationId)
  const rows = await coordinator.consumerCatalog(scope)
  expect(rows.map(row => row.selection.fundingSource)).toEqual(['platform', 'user_api'])
  expect(new Set(rows.map(row => row.handle)).size).toBe(2)
  expect(JSON.stringify(rows)).not.toContain('private-route-secret')
  const chosen = rows[1]!
  expect((await coordinator.prepareConsumerRequest(scope, { handle: chosen.handle, clientRequestId: randomUUID(),
    sessionId: 'fixture-session', protocol: chosen.selection.protocol })).route.routeId).toBe('user_api')
})
it('rejects a retired non-null native freeze before gateway recovery vault publication', async () => {
  const { coordinator, operationId, setRetired, write } = fixture()
  await coordinator.resume(scope, operationId)
  const chosen = (await coordinator.consumerCatalog(scope))[0]!
  setRetired()
  await expect(coordinator.prepareConsumerRequest(scope, { handle: chosen.handle, clientRequestId: randomUUID(),
    sessionId: 'fixture-session', protocol: chosen.selection.protocol })).rejects.toThrow('BUILTIN_REQUEST_FREEZE_INVALID')
  expect(write).not.toHaveBeenCalled()
})
it.each(['source', 'host'] as const)('rejects %s revocation during native preparation', async (mode) => {
  const { coordinator, operationId, setPause, replaceHost } = fixture()
  await coordinator.resume(scope, operationId)
  const chosen = (await coordinator.consumerCatalog(scope))[0]!
  setPause(async () => { if (mode === 'source') await coordinator.forgetSource(scope, 'source-1'); else replaceHost() })
  await expect(coordinator.prepareConsumerRequest(scope, { handle: chosen.handle, clientRequestId: randomUUID(),
    sessionId: 'fixture-session', protocol: chosen.selection.protocol })).rejects.toThrow()
})
