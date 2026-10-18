/** Main-only bridge to existing platform native-tool issuance and wallet authority. */
import { createHash, randomUUID } from 'node:crypto'
import type { AigcPlatformTextGrant, AigcTextRequest } from './aigc-types.ts'
import {
  parseNativeToolMaterialV2,
  parseNativeToolMaterialRequestV2,
  parseNativeToolAuthorityV2,
  parseNativeToolBindingRequestV2,
} from '@studybuddy/contracts'
import type { OwnedScope, NativeToolMaterialV2, NativeToolMaterialRequestV2 } from '@studybuddy/contracts'
import {
  parsePlatformSnapshot,
  parsePlatformRequest,
  parsePlatformPrepared,
  platformChoices,
} from '@deepseek-ai/dsh-llm-studybuddy-builtin'
import type { PlatformSnapshot, PlatformRequest, PlatformPrepared } from '@deepseek-ai/dsh-llm-studybuddy-builtin'
import type { MainSession, StudyBuddyFetch, StudyBuddyVault } from './services.ts'
import { BusinessFailure } from './business-api.ts'
interface PlatformHost {
  builtinContext(scope: OwnedScope): { scope: OwnedScope; hostGeneration: string }
  platformApply(snapshot: PlatformSnapshot): Promise<void>
  platformRevoke(scope: OwnedScope): Promise<void>
}
interface Dependencies {
  host(): PlatformHost | undefined
  isCurrent(scope: OwnedScope): boolean
  withSession<T>(scope: OwnedScope, run: (session: MainSession) => Promise<T>): Promise<T>
  fetch: StudyBuddyFetch
  vault(owner: string): StudyBuddyVault
  audit(scope: OwnedScope, request: PlatformRequest, authority: PlatformPrepared['authority']): Promise<void>
}
interface Stored {
  owner: string
  intent: NativeToolMaterialRequestV2
  material: NativeToolMaterialV2 | null
}
const key = (scope: OwnedScope) => JSON.stringify([scope.accountId, scope.generation])
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const failure = () => new BusinessFailure('BUILTIN_PLATFORM_UNAVAILABLE')
/** Publish catalog without inference, then admit exact platform requests independently of personal Keys. */
export class PlatformModels {
  private snapshot: PlatformSnapshot | undefined
  private readonly searchReady = new Set<string>()
  private readonly searchInitializations = new Map<string,Promise<void>>()
  private readonly revoked = new Set<string>()
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly deps: Dependencies) {}
  /** Read the reusable configured Key privately; never refresh product login. */
  async keyMaterial(scope:OwnedScope):Promise<{baseUrl:string;apiKey:string}>{
    const host=this.assert(scope),raw=await this.deps.vault(scope.accountId).read()
    if(!raw||this.assert(scope)!==host)throw failure()
    const stored=JSON.parse(raw) as Stored
    if(stored.owner!==scope.accountId||Object.keys(stored).sort().join(',')!=='intent,material,owner'||stored.material===null)throw failure()
    const material=parseNativeToolMaterialV2(stored.material)
    if(material.fundingSource!=='platform'||material.userApi!==undefined)throw failure()
    return{baseUrl:material.gatewayOrigin,apiKey:material.apiKey}
  }

  /** Account setup may issue the first Key. Inference and result reads only
   * consume keyMaterial and never enter this management operation. */
  initializeKey(scope:OwnedScope):Promise<void>{
    const run=this.queue.then(async()=>{
      const host=this.assert(scope),snapshot=this.snapshot
      if(!snapshot||!same(snapshot.scope,scope)||snapshot.hostGeneration!==host.builtinContext(scope).hostGeneration)throw failure()
      const raw=await this.deps.vault(scope.accountId).read()
      if(raw!==null){
        const stored=JSON.parse(raw) as Stored
        if(stored.owner!==scope.accountId||Object.keys(stored).sort().join(',')!=='intent,material,owner')throw failure()
        if(stored.material!==null){await this.keyMaterial(scope);return}
      }
      const choice=platformChoices(snapshot)[0]
      if(!choice)throw failure()
      // This member supplies the existing issuance template; no chat default
      // is changed and no model is invoked.
      await this.prepare({scope,hostGeneration:snapshot.hostGeneration,catalogRevision:snapshot.catalog.catalogRevision,
        clientRequestId:randomUUID(),sessionId:'platform-key-setup',exactModelId:choice.model.exactModelId})
    })
    this.queue=run.then(()=>undefined,()=>undefined)
    return run.then(()=>this.startSearchInitialization(scope))
  }
  private startSearchInitialization(scope:OwnedScope):void{
    const identity=key(scope)
    if(this.searchReady.has(identity)||this.searchInitializations.has(identity))return
    const pending=Promise.resolve().then(()=>this.initializeSearch(scope)).catch(()=>{
      console.error('STUDYBUDDY_SEARCH_SETUP_UNAVAILABLE')
    }).finally(()=>{
      if(this.searchInitializations.get(identity)===pending)this.searchInitializations.delete(identity)
    })
    this.searchInitializations.set(identity,pending)
  }
  private async initializeSearch(scope:OwnedScope):Promise<void>{
    if(this.searchReady.has(key(scope)))return
    const response=await this.deps.withSession(scope,session=>this.request(session,'/api/v2/native-tools/dsh/search-service',undefined,{schemaVersion:1,enabled:true}))
    if(response===null||typeof response!=='object'||Array.isArray(response)||Object.keys(response).sort().join(',')!=='enabled,schemaVersion'||!('schemaVersion' in response)||response.schemaVersion!==1||!('enabled' in response)||response.enabled!==true)throw failure()
    this.assert(scope);this.searchReady.add(key(scope))
  }
  /** Reuse the reviewed platform catalog for the account-owned creation consumer. */
  async consumerCatalog(scope: OwnedScope): Promise<readonly AigcPlatformTextGrant[]> {
    const host = this.assert(scope)
    if (!this.snapshot || !same(this.snapshot.scope, scope)) {
      await this.restore(scope)
    }
    const snapshot = this.snapshot
    if (!snapshot || this.assert(scope) !== host || snapshot.hostGeneration !== host.builtinContext(scope).hostGeneration) throw failure()
    return platformChoices(snapshot).map(({ model }) => ({ kind: 'platform',
      handle: createHash('sha256').update(JSON.stringify([scope, snapshot.hostGeneration, snapshot.catalog.catalogRevision, model])).digest('hex'),
      sourceLabel: 'StudyBuddy 平台额度', selection: { exactModelId: model.exactModelId, providerId: model.providerId,
        protocol: model.protocol, fundingSource: 'platform' }, authority: model,
      catalogVersion: snapshot.catalog.catalogRevision, catalogDigest: createHash('sha256').update(JSON.stringify(snapshot.catalog)).digest('hex') }))
  }
  /** The model handle cannot select a credential, endpoint or alternate funding source. */
  async prepareAigcRequest(scope: OwnedScope, input: AigcTextRequest): Promise<PlatformPrepared> {
    const choice = (await this.consumerCatalog(scope)).find(row => row.handle === input.handle)
    const snapshot = this.snapshot
    if (!choice || !snapshot || choice.selection.protocol !== input.protocol) throw failure()
    const prepared = await this.admit({ scope, hostGeneration: snapshot.hostGeneration,
      catalogRevision: choice.catalogVersion, clientRequestId: input.clientRequestId,
      sessionId: input.sessionId, exactModelId: choice.selection.exactModelId })
    const current = (await this.consumerCatalog(scope)).find(row => row.handle === choice.handle)
    if (!same(choice, current) || this.snapshot !== snapshot) throw failure()
    return prepared
  }
  private assert(scope: OwnedScope) {
    const host = this.deps.host()
    if (!host || this.revoked.has(key(scope)) || !this.deps.isCurrent(scope)) throw failure()
    return host
  }
  /** Restore only keyless visibility. Selection and default saving remain explicit Harness actions. */
  restore(scope: OwnedScope): Promise<void> {
    const run = this.queue.then(() => this.restoreCurrent(scope))
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }
  private async restoreCurrent(scope: OwnedScope): Promise<void> {
    const host = this.assert(scope),
      context = host.builtinContext(scope)
    const snapshot = await this.deps.withSession(scope, async (session) => {
      const document = await this.request(session, '/api/v2/native-tools/harness-platform-catalog')
      if (
        document === null ||
        typeof document !== 'object' ||
        Array.isArray(document) ||
        Object.keys(document).sort().join(',') !== 'catalog,checkedAt,expiresAt'
      )
        throw failure()
      return parsePlatformSnapshot({ ...context, ...document })
    })
    if (this.assert(scope) !== host) throw failure()
    if (this.snapshot && same(this.snapshot.scope, scope) && this.snapshot.hostGeneration === snapshot.hostGeneration) {
      if (this.snapshot.catalog.catalogRevision === snapshot.catalog.catalogRevision && !same(this.snapshot.catalog, snapshot.catalog))
        throw failure()
      if (same(this.snapshot, snapshot)) return
    }
    await host.platformApply(snapshot)
    if (this.assert(scope) !== host) throw failure()
    this.snapshot = snapshot
  }
  /** The private Host supplies no credential, funding switch or arbitrary URL. */
  admit(input: PlatformRequest): Promise<PlatformPrepared> {
    const request = parsePlatformRequest(input),
      run = this.queue.then(() => this.prepare(request))
    this.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
  private async request(
    session: MainSession,
    path: string,
    audience = 'studybuddy-native-tools-v2',
    body?: unknown,
  ): Promise<unknown> {
    this.assert(session.scope)
    let response: Response
    try {
      response = await this.deps.fetch('https://guijitongzhuo.com' + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + session.accessToken,
          'X-StudyBuddy-Client-Audience': audience,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      throw failure()
    }
    this.assert(session.scope)
    if (!response.ok) {
      let code = 'BUILTIN_PLATFORM_UNAVAILABLE'
      try {
        const value = (await response.json()) as { code?: unknown }
        if (typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(value.code)) code = value.code
      } catch {
        /* Fixed safe failure only. */
      }
      throw new BusinessFailure(code, response.status)
    }
    return response.json()
  }
  private binding(material: NativeToolMaterialV2) {
    return parseNativeToolBindingRequestV2({
      schemaVersion: 2,
      toolId: material.toolId,
      protocol: material.protocol,
      connectionId: material.connectionId,
      authorityHandle: material.authorityHandle,
      bindingRevision: material.pendingBindingRevision,
      credentialRevision: material.credentialRevision,
      receiptRevision: material.receiptRevision,
      catalogRevision: material.catalogRevision,
      policyRevision: material.policyRevision,
      membershipRevision: material.membershipRevision,
    })
  }
  private async configured(request: PlatformRequest, material: NativeToolMaterialV2,
    model: { exactModelId: string; providerId: string }): Promise<PlatformPrepared> {
    this.assert(request.scope)
    const prepared = parsePlatformPrepared({ request, material: { ...material,
      selectedModelId: model.exactModelId, selectedProviderId: model.providerId }, authority: null })
    await this.deps.audit(request.scope, request, null)
    this.assert(request.scope)
    return prepared
  }
  private async prepare(request: PlatformRequest, allowCancelledRecovery = true): Promise<PlatformPrepared> {
    const host = this.assert(request.scope),
      snapshot = this.snapshot
    if (
      snapshot === undefined ||
      !same(snapshot.scope, request.scope) ||
      host.builtinContext(request.scope).hostGeneration !== request.hostGeneration ||
      snapshot.hostGeneration !== request.hostGeneration ||
      snapshot.catalog.catalogRevision !== request.catalogRevision
    )
      throw failure()
    const choice = platformChoices(snapshot).find(row => row.model.exactModelId === request.exactModelId)
    if (choice === undefined) throw failure()
    const saved = await this.deps.vault(request.scope.accountId).read()
    if (saved !== null) {
      const row = JSON.parse(saved) as Stored
      if (row.owner !== request.scope.accountId || Object.keys(row).sort().join(',') !== 'intent,material,owner') throw failure()
      if (row.material !== null) {
        const material = parseNativeToolMaterialV2(row.material)
        return this.configured(request, material, choice.model)
      }
    }
    return this.deps.withSession(request.scope, async (session) => {
      const vault = this.deps.vault(request.scope.accountId),
        raw = await vault.read()
      let stored: Stored | undefined
      if (raw !== null) {
        const row = JSON.parse(raw) as Stored
        if (row.owner !== request.scope.accountId || Object.keys(row).sort().join(',') !== 'intent,material,owner')
          throw failure()
        stored = {
          owner: row.owner,
          intent: parseNativeToolMaterialRequestV2(row.intent),
          material: row.material === null ? null : parseNativeToolMaterialV2(row.material),
        }
      }
      if (stored?.material) {
        // An already completed bootstrap may have saved this Key after our
        // first read. Catalog changes never revoke, replace or reauthorize it.
        return this.configured(request, stored.material, choice.model)
      }
      // Retain an unfinished exact nonce; unknown outcomes never mint another Key.
      if (stored === undefined) {
        stored = {
          owner: request.scope.accountId,
          intent: parseNativeToolMaterialRequestV2({
            audience: 'studybuddy-native-tools-v2',
            toolId: 'dsh',
            selectedModelId: choice.member.logicalModelId,
            selectedProtocol: choice.member.protocol,
            catalogRevision: snapshot.catalog.catalogRevision,
            materialNonce: randomUUID(),
            receiptRevision: Date.now(),
          }),
          material: null,
        }
        this.assert(request.scope)
        await vault.write(JSON.stringify(stored))
      }
      if (
        stored.intent.selectedModelId !== choice.member.logicalModelId ||
        stored.intent.catalogRevision !== snapshot.catalog.catalogRevision
      )
        throw failure()
      if (stored.material === null) {
        let response: unknown
        try {
          response = await this.request(session, '/api/v2/native-tools/dsh/material', undefined, stored.intent)
        } catch (error) {
          // This closed response proves the original expired nonce never produced
          // a credential. Unknown failures, throttles and expiry alone do not.
          if (
            !allowCancelledRecovery ||
            !(error instanceof BusinessFailure) ||
            error.status !== 409 ||
            error.code !== 'NATIVE_TOOL_MATERIAL_CANCELLED'
          )
            throw error
          this.assert(request.scope)
          await vault.clear()
          return this.prepare(request, false)
        }
        const material = parseNativeToolMaterialV2(response)
        if (
          material.accountOwner !== request.scope.accountId ||
          material.fundingSource !== 'platform' ||
          material.userApi !== undefined ||
          material.selectedModelId !== choice.model.exactModelId ||
          material.selectedProviderId !== choice.model.providerId ||
          material.catalogRevision !== stored.intent.catalogRevision ||
          material.receiptRevision !== stored.intent.receiptRevision ||
          material.protocol !== choice.member.protocol ||
          !same(
            material.authorizedModels,
            snapshot.catalog.models
              .filter(
                row =>
                  row.toolId === 'dsh' && row.protocol === choice.member.protocol && row.availability === 'available',
              )
              .sort((a, b) => (a.exactModelId < b.exactModelId ? -1 : a.exactModelId > b.exactModelId ? 1 : 0)),
          )
        )
          throw failure()
        stored = { ...stored, material }
        this.assert(request.scope)
        await vault.write(JSON.stringify(stored))
      }
      const material = stored.material
      if (material === null) throw failure()
      const active = parseNativeToolAuthorityV2(
        await this.request(session, '/api/v2/native-tools/dsh/activate', undefined, this.binding(material)),
      )
      const prepared = parsePlatformPrepared({ request, material, authority: active })
      this.assert(request.scope)
      await this.deps.audit(request.scope, request, active)
      this.assert(request.scope)
      if (this.deps.host() !== host || this.snapshot !== snapshot) throw failure()
      return prepared
    })
  }
  /** Immediately fence old Host requests; keep protected recovery material until revocation is confirmed. */
  async revoke(scope: OwnedScope): Promise<void> {
    this.revoked.add(key(scope))
    if (this.snapshot && same(this.snapshot.scope, scope)) this.snapshot = undefined
    await this.deps.host()?.platformRevoke(scope)
  }
  /** Finish old presentation work while retaining the reusable protected Key. */
  async clearConfirmed(_scope: OwnedScope): Promise<void> {
    await this.queue
  }
}
