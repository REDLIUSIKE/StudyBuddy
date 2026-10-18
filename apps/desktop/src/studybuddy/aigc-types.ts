/** Source-bound local creation runtime. No credential is part of its resource manifest. */
import type { EmbeddedLease, EmbeddedTheme } from '@studybuddy/contracts'
import type {
  NativeBuiltinFrozenRequestV1, NativeBuiltinGatewayRouteV1, NativeBuiltinModelAuthorityV1,
  NativeBuiltinRequestReceiptV1, NativeBuiltinSelectionRefV1, NativeProtocol, OwnedScope,
  NativeCatalogModelV2,
  NativeToolMaterialV2, NativeToolAuthorityV2,
} from '@studybuddy/contracts'

/** Exact keyless choice from a currently published native gateway source. */
export interface AigcTextGrant {
  handle: string
  sourceLabel: string
  selection: NativeBuiltinSelectionRefV1
  authority: NativeBuiltinModelAuthorityV1
  catalogVersion: string
  catalogDigest: string
}
/** Platform authority remains distinct from the personal builtin ticket contract. */
export interface AigcPlatformTextGrant {
  kind: 'platform'
  handle: string
  sourceLabel: string
  selection: { exactModelId: string; providerId: string; protocol: NativeProtocol; fundingSource: 'platform' }
  authority: NativeCatalogModelV2
  catalogVersion: string
  catalogDigest: string
}
export type AigcTextChoice = AigcTextGrant | AigcPlatformTextGrant
export interface AigcPlatformConsumer {
  consumerCatalog(scope: OwnedScope): Promise<readonly AigcPlatformTextGrant[]>
  prepareAigcRequest(scope: OwnedScope, input: AigcTextRequest): Promise<{
    request: { scope: OwnedScope; hostGeneration: string; catalogRevision: string; clientRequestId: string; sessionId: string; exactModelId: string }
    material: NativeToolMaterialV2
    authority: NativeToolAuthorityV2 | null
  }>
}
export interface AigcTextRequest {
  handle: string
  clientRequestId: string
  sessionId: string
  protocol: NativeProtocol
}
/** Private Main admission result. Never serialize the route into renderer or journals. */
export interface AigcPreparedRequest {
  frozen: NativeBuiltinFrozenRequestV1
  route: NativeBuiltinGatewayRouteV1
}
export interface AigcTextConsumer {
  consumerCatalog(scope: OwnedScope): Promise<readonly AigcTextGrant[]>
  prepareConsumerRequest(scope: OwnedScope, input: AigcTextRequest): Promise<AigcPreparedRequest>
  consumerRequestStatus(scope: OwnedScope, requestId: string): Promise<NativeBuiltinRequestReceiptV1 | null>
}

/** Closed shell operations; local and upstream authorization never cross these methods. */
export interface AigcSurfaceHost {
  acquire(): Promise<EmbeddedLease>
  release(lease: string): Promise<void>
  setTheme(lease: string, theme: EmbeddedTheme): Promise<void>
  setVisible(lease: string, visible: boolean): Promise<void>
  subscribeInvalid(listener: (lease: string) => void): () => void
}
/** Dedicated Main/preload channels for the local creation page. */
export const AIGC_IPC = { acquire: 'studybuddy:aigc-acquire', release: 'studybuddy:aigc-release',
  theme: 'studybuddy:aigc-theme', visible: 'studybuddy:aigc-visible', invalid: 'studybuddy:aigc-invalid', guestAction: 'studybuddy:aigc-guest-action', action: 'studybuddy:aigc-action', interactionReady: 'studybuddy:aigc-interaction-ready' } as const

export interface AigcRuntimeManifest {
  schemaVersion: 1
  platform: string
  arch: string
  upstream: { repository: string; commit: string }
  sourceCommit: string
  sourceDigest: string
  lockDigest: string
  bunVersion: string
  entry: string
  files: readonly { path: string; sha256: string; size: number }[]
}

/** Main-verified paths for the Node domain candidate; no private material is persisted in its profile. */
export interface AigcLaunchResources {
  directory: string
  node: string
  entry: string
  plugin: string
  domainEntry: string
  staticDirectory: string
  manifestSha256: string
}
