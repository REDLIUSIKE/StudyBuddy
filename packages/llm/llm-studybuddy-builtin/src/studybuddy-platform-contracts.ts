/** Private desktop control plane for the existing native platform contract. */
import {
  parseNativeBuiltinHostContextV1,
  parseNativeToolCatalogV2,
  parseNativeToolMaterialV2,
  parseNativeToolAuthorityV2,
} from '@studybuddy/contracts'
import type {
  OwnedScope,
  NativeToolCatalogV2,
  NativeCatalogModelV2,
  NativeToolMaterialV2,
  NativeToolAuthorityV2,
} from '@studybuddy/contracts'

export const PLATFORM_PROVIDER = 'studybuddy-platform'
export interface PlatformSnapshot {
  readonly scope: OwnedScope
  readonly hostGeneration: string
  readonly catalog: NativeToolCatalogV2
  readonly checkedAt: string
  readonly expiresAt: string
}
export interface PlatformChoice {
  readonly member: NativeCatalogModelV2
  readonly model: NativeCatalogModelV2
}
export interface PlatformRequest {
  readonly scope: OwnedScope
  readonly hostGeneration: string
  readonly catalogRevision: string
  readonly clientRequestId: string
  readonly sessionId: string
  readonly exactModelId: string
}
export interface PlatformPrepared {
  readonly request: PlatformRequest
  readonly material: NativeToolMaterialV2
  readonly authority: NativeToolAuthorityV2 | null
}
function fail(): never {
  throw new Error('BUILTIN_PLATFORM_AUTHORITY_INVALID')
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail()
  const d = Object.getOwnPropertyDescriptors(value),
    actual = Reflect.ownKeys(value)
  if (
    actual.length !== keys.length ||
    actual.some(k => typeof k !== 'string' || !keys.includes(k) || d[k] === undefined || !Object.hasOwn(d[k], 'value'))
  )
    fail()
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128 || /\p{Cc}/u.test(value)) fail()
  return value
}
function instant(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail()
  return value
}
/** Validate the separately leased, manually reviewed platform authority. */
export function parsePlatformSnapshot(value: unknown): PlatformSnapshot {
  const r = record(value, ['scope', 'hostGeneration', 'catalog', 'checkedAt', 'expiresAt']),
    context = parseNativeBuiltinHostContextV1({ scope: r.scope, hostGeneration: r.hostGeneration })
  const checkedAt = instant(r.checkedAt),
    expiresAt = instant(r.expiresAt),
    catalog = parseNativeToolCatalogV2(r.catalog)
  if (
    Date.parse(expiresAt) <= Date.now() ||
    Date.parse(checkedAt) > Date.now() ||
    Date.parse(expiresAt) <= Date.parse(checkedAt) ||
    !catalog.catalogRevision.startsWith('harness-platform-') ||
    catalog.models.some(m => m.toolId !== 'dsh' || m.protocol !== 'openai_chat_completions')
  )
    fail()
  return { ...context, catalog, checkedAt, expiresAt }
}
/** Expose native Harness Chat memberships joined to exact current reviewed facts. */
export function platformChoices(snapshot: PlatformSnapshot): readonly PlatformChoice[] {
  // This is a management refresh lease, not the configured API Key's expiry.
  // The target gateway enforces current Key/model permissions on each call.
  return snapshot.catalog.models.flatMap((member) => {
    if (member.toolId !== 'dsh' || member.protocol !== 'openai_chat_completions' || member.availability !== 'available')
      return []
    return member.maxOutputTokens === null ? [] : [{ member, model: member }]
  })
}
/** Parse only the keyless private Host request, never a browser-authorized selection. */
export function parsePlatformRequest(value: unknown): PlatformRequest {
  const r = record(value, [
    'scope',
    'hostGeneration',
    'catalogRevision',
    'clientRequestId',
    'sessionId',
    'exactModelId',
  ])
  const context = parseNativeBuiltinHostContextV1({ scope: r.scope, hostGeneration: r.hostGeneration })
  const clientRequestId = text(r.clientRequestId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clientRequestId)) fail()
  return {
    ...context,
    clientRequestId,
    catalogRevision: text(r.catalogRevision),
    sessionId: text(r.sessionId),
    exactModelId: text(r.exactModelId),
  }
}
/** Parse configured Key transport, or the legacy management disclosure receipt.
 * A null authority uses bearer-Key admission at the gateway, without an account grant. */
export function parsePlatformPrepared(value: unknown): PlatformPrepared {
  const r = record(value, ['request', 'material', 'authority']),
    request = parsePlatformRequest(r.request),
    material = parseNativeToolMaterialV2(r.material),
    authority = r.authority === null ? null : parseNativeToolAuthorityV2(r.authority)

  if (authority === null) {
    if (material.fundingSource !== 'platform' || material.userApi !== undefined ||
      material.selectedModelId !== request.exactModelId || material.protocol !== 'openai_chat_completions' ||
      !material.authorizedModelIds.includes(request.exactModelId)) fail()
    return { request, material, authority: null }
  }
  if (
    material.fundingSource !== 'platform' ||
    authority.fundingSource !== 'platform' ||
    material.toolId !== 'dsh' ||
    authority.toolId !== 'dsh' ||
    material.userApi !== undefined ||
    authority.userApi !== undefined ||
    material.gatewayOrigin !== 'https://guijitongzhuo.com' ||
    material.protocol !== 'openai_chat_completions' ||
    material.selectedModelId !== request.exactModelId ||
    material.accountOwner !== request.scope.accountId ||
    material.catalogRevision !== request.catalogRevision ||
    authority.state !== 'connected' ||
    authority.permissionState !== 'eligible' ||
    authority.accountOwner !== material.accountOwner ||
    authority.deviceId !== material.deviceId ||
    authority.protocol !== material.protocol ||
    authority.authorityHandle !== material.authorityHandle ||
    authority.bindingRevision !== material.pendingBindingRevision ||
    authority.credentialRevision !== material.credentialRevision ||
    authority.receiptRevision !== material.receiptRevision ||
    authority.catalogRevision !== material.catalogRevision ||
    authority.policyRevision !== material.policyRevision ||
    authority.membershipRevision !== material.membershipRevision ||
    JSON.stringify(authority.authorizedModels) !== JSON.stringify(material.authorizedModels)
  )
    fail()
  return { request, material, authority }
}
