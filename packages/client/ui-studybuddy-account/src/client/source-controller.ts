/** Original source lifecycle, complete inventories and explicit pending-operation recovery. */
import type {
  NativeAccountApi, NativeUserSourceDraftV2, NativeUserSourceCheckV2, NativeUserSourceViewV2, NativeUserSourceSaveRequestV2,
  ModelConfig, OwnedScope, NativeUserModelDraftV1, NativeUserModelProbeResultV1, NativeDraftPing, NativeModelRegistrationView,
  NativeUserSourceDraftV3, NativeUserSourceCheckV3, NativeUserSourceViewV3, NativeUserSourceSaveRequestV3,
  NativeBuiltinPublicCatalogV1, NativeBuiltinReadinessV1, NativeBuiltinSourceDetailV1, NativeBuiltinSelectionRefV1,
  NativeBuiltinModelAuthorityV1,
} from '@studybuddy/contracts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { ObservableState,sameScope,errorCode } from './observable.ts'
type SourceApi = Pick<NativeAccountApi,
  'listNativeUserSources' | 'getNativeUserModels' | 'checkNativeUserSource' | 'saveNativeUserSource' | 'resumeNativeUserSourceSave' | 'deleteNativeUserModel' | 'reorderNativeUserModels' | 'updateNativeUserModel' | 'pingNativeUserModel' | 'testNativeUserModel' | 'listNativeUserModelRegistrations' | 'resumeNativeUserModelSave'> & Partial<Pick<NativeAccountApi, 'listNativeUserSourcesV3' | 'checkNativeUserSourceV3' | 'saveNativeUserSourceV3' | 'resumeNativeUserSourceSaveV3' | 'getNativeBuiltinCatalog' | 'listNativeBuiltinReadiness' | 'resumeNativeBuiltinSource' | 'getNativeBuiltinSourceDetail' | 'refreshNativeBuiltinBalance' | 'runNativeBuiltinDiagnostic' | 'validateNativeBuiltinSource'>>
/** Native draft accepted by the retained V2 and exact-selection V3 editors. */
export type SourceDraft = NativeUserSourceDraftV2 | NativeUserSourceDraftV3
/** Narrow a new view without changing the accepted V2 view contract.
 * @param source - Keyless owned source view.
 * @returns Whether the view follows the independent V3 lifecycle. */
export function isSourceV3(source: NativeUserSourceViewV2 | NativeUserSourceViewV3): source is NativeUserSourceViewV3 {
  return 'schemaVersion' in source && source.schemaVersion === 3
}
type SourceCheck = NativeUserSourceCheckV2 | NativeUserSourceCheckV3
/** Account-scoped source, editor, recovery and cached diagnostic state. */
export interface SourceSnapshot {
  scope:OwnedScope|null
  sources: readonly (NativeUserSourceViewV2 | NativeUserSourceViewV3)[]
  models:readonly ModelConfig[]
  registrations:readonly NativeModelRegistrationView[]
  draft: SourceDraft | null
  checkResult: SourceCheck | null
  pending: NativeUserSourceSaveRequestV2 | NativeUserSourceSaveRequestV3 | null
  nativeCatalog: NativeBuiltinPublicCatalogV1 | null
  /** Public model metadata loads only for the editor, independently of local rows. */
  catalogBusy?: boolean
  /** Current draft's native manual candidates; they are not save or response proofs. */
  admittedModels?: readonly NativeBuiltinModelAuthorityV1[]
  readiness: readonly NativeBuiltinReadinessV1[]
  details: Readonly<Record<string, NativeBuiltinSourceDetailV1>>
  busy:boolean
  errorCode:string|null
  probe:NativeUserModelProbeResultV1|null
  ping:NativeDraftPing|null
}
const initial = (scope: OwnedScope | null): SourceSnapshot => ({
  scope, sources: [], models: [], registrations: [], draft: null, checkResult: null, pending: null,
  busy: false, errorCode: null, probe: null, ping: null, nativeCatalog: null, admittedModels: [], readiness: [], details: {},
})
// Match the original endpoint editor, without rewriting custom catalog URLs.
function normalizeDraft<T extends SourceDraft>(draft: T): T {
  if(!draft.advanced)return draft
  return { ...draft,advanced:{ ...draft.advanced,
    baseUrl:draft.advanced.baseUrl.replace(/\/chat\/completions\/?$/i,''),
    anthropicUrl:draft.advanced.anthropicUrl?.replace(/\/(?:v1\/)?messages\/?$/i,'')??null,
  } }
}
// Names do not change the credential or endpoint verified by the native runtime.
function fingerprint(draft: SourceDraft | null, includeSelection = true): string {
  return draft === null ? '' : JSON.stringify([draft.internalId, draft.expectedLocalRevision, draft.apiKey, draft.sourcePresetId,
    draft.advanced?.baseUrl ?? null, draft.advanced?.anthropicUrl ?? null, draft.advanced?.modelsUrl ?? null,
    draft.advanced?.protocol ?? null, includeSelection && draft.schemaVersion === 3 ? draft.probeSelection : null])
}
function verified(check: SourceCheck | null): check is SourceCheck & { verificationId: string } {
  return !!check?.verificationId && !check.errorCode && (check.schemaVersion === 3 ? check.state === 'source_checked' &&
    check.probeSelection !== null : check.probe?.success === true) && !!check.expiresAt && Date.parse(check.expiresAt) > Date.now()
}
/** Own source operations and reject stale account, draft and revision responses. */
export class SourceController extends ObservableState<SourceSnapshot> {
  #epoch=0
  #check=0
  #read=0
  #loadedAt:number|null=null
  #loading:{epoch:number;promise:Promise<void>}|null=null
  #catalogLoading:{epoch:number;promise:Promise<void>}|null=null
  constructor(private readonly api:SourceApi){super(initial(null))}
  /** Replace the owned account and invalidate older asynchronous writes.
   * @param scope - Current signed-in account generation, or null after logout. */
  setScope(scope: OwnedScope | null): void {
    if (sameScope(scope, this.snapshot.scope)) return
    ++this.#epoch; ++this.#check; ++this.#read; this.#loadedAt=null; this.#loading=null; this.#catalogLoading=null; this.publish(initial(scope))
  }
  /** Reuse current presentation facts for 30 seconds; actions still use native authority. */
  ensureLoaded():Promise<void>{
    if(this.#loading?.epoch===this.#epoch)return this.#loading.promise
    if(this.#loadedAt!==null&&Date.now()-this.#loadedAt<30000)return Promise.resolve()
    return this.load()
  }
  /** Prepare the model view before unrelated pages; directory latency never holds local rows busy. */
  async prepare():Promise<void>{
    const epoch=this.#epoch
    await this.ensureLoaded()
    if(epoch===this.#epoch&&this.#loadedAt!==null)await this.loadEditorCatalog()
  }
  /** Refresh source facts and actual ready receipts without inference or balance refresh. */
  load(): Promise<void> {
    if (this.snapshot.scope === null) return Promise.resolve()
    const epoch=this.#epoch,read=++this.#read
    const promise=this.readSources(epoch,read).finally(()=>{if(this.#loading?.promise===promise)this.#loading=null})
    this.#loading={epoch,promise};return promise
  }
  private async readSources(epoch:number,read:number):Promise<void>{
    this.publish({ ...this.snapshot, busy: true, errorCode: null })
    try {
      const [sources, models] = await Promise.all([
        this.api.listNativeUserSourcesV3?.() ?? this.api.listNativeUserSources(), this.api.getNativeUserModels(),
      ])
      if (epoch === this.#epoch && read === this.#read) {
        this.#loadedAt=Date.now()
        this.publish({
        ...this.snapshot, sources, models,
        readiness: this.snapshot.readiness.filter(row => sources.some(source => source.localRef === row.localRef &&
          source.sourceRevision === row.sourceRevision && (!isSourceV3(source) || source.operationId === row.operationId))),
        details: Object.fromEntries(Object.entries(this.snapshot.details).filter(([id]) => sources.some(row =>
          row.localRef === id && this.snapshot.sources.find(old => old.localRef === id)?.localRevision === row.localRevision))),
        })
        void this.readSourceStatus(epoch, read)
      }
    }
    catch (error) { if (epoch === this.#epoch && read === this.#read) {this.#loadedAt=null;this.publish({ ...this.snapshot, errorCode: errorCode(error) })} }
    finally { if (epoch === this.#epoch && read === this.#read) this.publish({ ...this.snapshot, busy: false }) }
  }
  /** Ancillary native receipts never hold the source list or editor controls busy. */
  private async readSourceStatus(epoch:number,read:number):Promise<void>{
    const [registrations, readiness] = await Promise.allSettled([
      this.api.listNativeUserModelRegistrations(), this.api.listNativeBuiltinReadiness?.() ?? Promise.resolve([]),
    ])
    if(epoch!==this.#epoch||read!==this.#read)return
    const failure=registrations.status==='rejected'?registrations:readiness.status==='rejected'?readiness:null
    const sources=this.snapshot.sources
    this.publish({...this.snapshot,registrations:registrations.status==='fulfilled'?registrations.value:[],
      readiness:readiness.status==='fulfilled'?readiness.value.filter(row=>sources.some(source=>
        source.localRef===row.localRef&&source.sourceRevision===row.sourceRevision&&
        (!isSourceV3(source)||source.operationId===row.operationId))):[],
      errorCode:this.snapshot.errorCode??(failure?errorCode(failure.reason):null)})
  }
  /** Reuse only unexpired, account-owned directory metadata; validation remains native. */
  private loadEditorCatalog():Promise<void>{
    if(!this.api.getNativeBuiltinCatalog||this.snapshot.scope===null)return Promise.resolve()
    if(this.snapshot.nativeCatalog&&Date.parse(this.snapshot.nativeCatalog.expiresAt)>Date.now())return Promise.resolve()
    if(this.#catalogLoading?.epoch===this.#epoch)return this.#catalogLoading.promise
    const epoch=this.#epoch
    this.publish({...this.snapshot,catalogBusy:true})
    const promise=this.api.getNativeBuiltinCatalog().then(nativeCatalog=>{
      if(epoch===this.#epoch)this.publish({...this.snapshot,nativeCatalog})
    }).catch(error=>{if(epoch===this.#epoch)this.publish({...this.snapshot,errorCode:this.snapshot.errorCode??errorCode(error)})})
      .finally(()=>{if(epoch===this.#epoch){this.#catalogLoading=null;this.publish({...this.snapshot,catalogBusy:false})}})
    this.#catalogLoading={epoch,promise};return promise
  }
  /** Start an unselected draft unless an original operation needs recovery. */
  createDraft = (): void => {
    if (this.snapshot.pending || this.snapshot.busy) {
      this.publish({
        ...this.snapshot, errorCode:
          'NATIVE_SAVE_RECOVERY_REQUIRED',
      }); return
    } ++this.#check; this.publish({
      ...this.snapshot, draft:
        this.api.checkNativeUserSourceV3 ? {
          schemaVersion: 3, internalId: null, expectedLocalRevision: null, name: '', apiKey: '',
          sourcePresetId: null, advanced: null, probeSelection: null,
        } : {
          schemaVersion: 2, internalId: null, expectedLocalRevision:
            null, name: '', apiKey: '', sourcePresetId: null, advanced: null,
        }, checkResult: null, admittedModels: [], pending: null,
      errorCode: null, probe: null, ping: null,
    })
    void this.loadEditorCatalog()
  }
  /** Open an owned source with its exact saved selection and existing native credential.
   * @param id - Native local source identity. */
  editSource = (id: string): void => {
    if (this.snapshot.pending || this.snapshot.busy) { this.publish({ ...this.snapshot, errorCode:
      'NATIVE_SAVE_RECOVERY_REQUIRED' }); return }
    const model = this.snapshot.models.find(row => row.internalId === id), source = this.snapshot.sources.find(row => row.localRef === id)
    if (!model || !source) { this.publish({ ...this.snapshot, errorCode: 'NATIVE_SOURCE_UNAVAILABLE' }); return }
    ++this.#check
    this.publish({
      ...this.snapshot, draft: isSourceV3(source) ? {
        schemaVersion: 3, internalId: id, expectedLocalRevision: source.localRevision, name: source.name, apiKey: model.apiKey,
        sourcePresetId: source.configuration.sourcePresetId, probeSelection: source.probeSelection,
        advanced: source.configuration.sourcePresetId ? null : {
          baseUrl: source.configuration.baseUrl, anthropicUrl:
            source.configuration.anthropicUrl, modelsUrl: null, protocol: source.probeSelection?.protocol ?? null,
        },
      } : {
        schemaVersion: 2, internalId: id, expectedLocalRevision: source.localRevision, name: model.name, apiKey: model.apiKey,
        sourcePresetId: null, advanced: { baseUrl: model.baseUrl, anthropicUrl: model.anthropicUrl ?? null, modelsUrl:
          null, protocol: null },
      }, checkResult: null, admittedModels: [], pending: null, errorCode: null, probe: null, ping: null,
    })
    void this.loadEditorCatalog()
  }
  /** Update editor values and invalidate facts affected by changed credentials or selection.
   * @param patch - Edited draft fields. */
  editDraft = (patch: Partial<SourceDraft>): void => {
    if (!this.snapshot.draft || this.snapshot.pending) return
    const draft = normalizeDraft({ ...this.snapshot.draft, ...patch } as SourceDraft),
      changed = fingerprint(draft) !== fingerprint(this.snapshot.draft)
    if (changed) ++this.#check
    const sourceChanged = fingerprint(draft, false) !== fingerprint(this.snapshot.draft, false)
    this.publish({
      ...this.snapshot, draft, errorCode: null, ...(changed ? { checkResult: null, probe: null, ping: null } : {}),
      ...(sourceChanged ? { admittedModels: [] } : {}),
    })
  }
  /** Discard the current verification lease and invalidate older check responses. */
  invalidateCheck = (): void => { ++this.#check; this.publish({ ...this.snapshot, checkResult: null }) }
  /** Close the editor and discard transient discovery and verification facts. */
  clearDraft = (): void => { ++this.#check; this.publish({ ...this.snapshot, draft: null, checkResult: null,
    admittedModels: [], probe: null, ping: null }) }
  /** Check V3 connectivity and manual selection without inference; retain the original V2 detection behavior. */
  check = async (): Promise<void> => {
    const draft = this.snapshot.draft; if (!draft || this.snapshot.scope === null || this.snapshot.busy) return
    const revision = ++this.#check, epoch = this.#epoch; this.publish({ ...this.snapshot, busy: true, errorCode: null, checkResult: null })
    try {
      const result = draft.schemaVersion === 3 ? await this.api.checkNativeUserSourceV3?.(draft) :
        await this.api.checkNativeUserSource(draft)
      if (result === undefined) throw new Error('NATIVE_SOURCE_V3_UNAVAILABLE')
      if (epoch === this.#epoch && revision === this.#check) this.publish({
        ...this.snapshot, checkResult: result, errorCode:
          result.errorCode, admittedModels: result.schemaVersion === 3 && !result.errorCode ? result.admittedModels : [],
      })
    }
    catch (error) { if (epoch === this.#epoch && revision === this.#check) this.publish({ ...this.snapshot, errorCode: errorCode(error) }) }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  /** Execute the user's explicit save action using one current source verification. */
  detectAndSave = async (): Promise<void> => {
    if (this.snapshot.busy || this.snapshot.scope === null) return
    if (this.snapshot.pending) { this.publish({ ...this.snapshot, errorCode: 'NATIVE_SAVE_RECOVERY_REQUIRED' }); return }
    const draft = this.snapshot.draft
    if (!draft?.name.trim() || !draft.apiKey.trim()) { this.publish({ ...this.snapshot, errorCode:
      'NATIVE_SOURCE_FIELDS_REQUIRED' }); return }
    const epoch = this.#epoch, source = fingerprint(draft)
    if (!verified(this.snapshot.checkResult)) await this.check()
    if (epoch !== this.#epoch || source !== fingerprint(this.snapshot.draft)) return
    if (this.snapshot.errorCode) return
    await this.save()
  }
  /** Persist one original save operation; V3 Main performs one explicit protected model validation. */
  save = async (): Promise<void> => {
    if (this.snapshot.busy) return
    if (this.snapshot.pending !== null) { this.publish({ ...this.snapshot, errorCode: 'NATIVE_SAVE_RECOVERY_REQUIRED' }); return }
    const { draft, checkResult, scope } = this.snapshot
    if (!scope || !draft || !draft.name.trim() || !draft.apiKey.trim() || !verified(checkResult)) {
      this.publish({ ...this.snapshot, errorCode: 'NATIVE_VERIFICATION_REQUIRED' }); return
    }
    if (draft.schemaVersion !== checkResult.schemaVersion || draft.schemaVersion === 3 && draft.probeSelection === null) {
      this.publish({ ...this.snapshot, errorCode: 'NATIVE_VERIFICATION_REQUIRED' }); return
    }
    const request: NativeUserSourceSaveRequestV2 | NativeUserSourceSaveRequestV3 = draft.schemaVersion === 3 ?
      { schemaVersion: 3, operationId: randomUUID(), draft, verificationId: checkResult.verificationId } :
      { schemaVersion: 2, operationId: randomUUID(), draft, verificationId: checkResult.verificationId }
    const epoch = this.#epoch; this.publish({ ...this.snapshot, busy: true, errorCode: null, pending: request })
    try {
      const result = request.schemaVersion === 3 ? await this.api.saveNativeUserSourceV3?.(request) :
        await this.api.saveNativeUserSource(request)
      if (result === undefined) throw new Error('NATIVE_SOURCE_V3_UNAVAILABLE')
      if (epoch !== this.#epoch) return
      this.publish({
        ...this.snapshot, pending: result.state === 'pending' ? request : null, draft: result.state === 'saved' ? null :
          draft, checkResult: null,
      })
      await this.load()
    } catch (error) {
      if (epoch === this.#epoch) {
        const code = errorCode(error); this.publish({
          ...this.snapshot, errorCode: code,
          ...(code === 'NATIVE_VERIFICATION_REQUIRED' ? { pending: null, checkResult: null } : {}),
        })
      }
    }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  /** Resume the original durable save without inventing a replacement operation.
   * @param operationId - Original operation, or the current pending operation when omitted. */
  resume = async (operationId?: string): Promise<void> => {
    const id = operationId ?? this.snapshot.pending?.operationId
    if (!id || this.snapshot.scope === null || this.snapshot.busy) return
    const epoch = this.#epoch; this.publish({ ...this.snapshot, busy: true, errorCode: null })
    try {
      const v3 = this.snapshot.pending?.schemaVersion === 3 || this.snapshot.sources.some(row => isSourceV3(row) &&
        row.operationId === id), result = v3 ? await this.api.resumeNativeUserSourceSaveV3?.(id) :
          await this.api.resumeNativeUserSourceSave(id)
      if (result === undefined) throw new Error('NATIVE_SOURCE_V3_UNAVAILABLE'); if (epoch === this.#epoch) {
        this.publish({
          ...this.snapshot, pending: result.state === 'saved' ? null : this.snapshot.pending, draft:
            result.state === 'saved' ? null : this.snapshot.draft,
        }); await this.load()
      }
    }
    catch (error) {
      if (epoch === this.#epoch) {
        const code = errorCode(error), missing = code === 'NATIVE_SOURCE_SAVE_JOURNAL_MISSING'
        this.publish({
          ...this.snapshot, errorCode: missing ? 'NATIVE_SAVE_JOURNAL_MISSING' : code,
          ...(missing ? { pending: null, checkResult: null } : {}),
        })
      }
    }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  /** Delete one native source and refresh its current owned facts.
   * @param id - Native local source identity. */
  remove = async (id: string): Promise<void> => this.mutate(() => this.api.deleteNativeUserModel(id))
  /** Recover an existing legacy model registration.
   * @param operationId - Original legacy save identity. */
  resumeLegacy = async (operationId: string): Promise<void> => this.mutate(() => this.api.resumeNativeUserModelSave(operationId))
  /** Rename a source without changing credential or model authority.
   * @param id - Native local source identity.
   * @param name - User-supplied source name. */
  rename = async (id: string, name: string): Promise<void> => this.mutate(() => this.api.updateNativeUserModel(id, { name }))
  /** Persist source ordering through the existing native operation.
   * @param ids - Complete ordered source identities. */
  reorder = async (ids: string[]): Promise<void> => this.mutate(() => this.api.reorderNativeUserModels(ids))
  /** Continue private consumer preparation without inference or balance calls.
   * @param operationId - Current original source save identity. */
  resumeBuiltin = async (operationId: string): Promise<void> => this.mutate(() =>
    this.api.resumeNativeBuiltinSource?.(operationId) ?? Promise.reject(new Error('BUILTIN_UNAVAILABLE')))
  /** Explicitly validate the native-owned selection; this action may incur supplier charges.
   * @param operationId - Current original source save identity. */
  validateBuiltin = async (operationId: string): Promise<void> => this.mutate(() =>
    this.api.validateNativeBuiltinSource?.(operationId) ?? Promise.reject(new Error('BUILTIN_UNAVAILABLE')))
  /** Read cached diagnostics and readiness without inference or balance refresh.
   * @param localRef - Native local source identity. */
  loadDetail = async (localRef: string): Promise<void> => {
    if (this.snapshot.scope === null || !this.api.getNativeBuiltinSourceDetail) return
    const epoch = this.#epoch, revision = this.snapshot.sources.find(row => row.localRef === localRef)?.localRevision
    try {
      const detail = await this.api.getNativeBuiltinSourceDetail(localRef); if (epoch === this.#epoch &&
        revision === this.snapshot.sources.find(row => row.localRef === localRef)?.localRevision) this.publish({
        ...this.snapshot, details: { ...this.snapshot.details, [localRef]: detail },
      })
    }
    catch (error) { if (epoch === this.#epoch) this.publish({ ...this.snapshot, errorCode: errorCode(error) }) }
  }
  /** Refresh supplier balance only in response to the user's explicit action.
   * @param localRef - Native local source identity. */
  refreshBalance = async (localRef: string): Promise<void> => {
    if (this.snapshot.scope === null || this.snapshot.busy || !this.api.refreshNativeBuiltinBalance) return
    const epoch = this.#epoch, revision = this.snapshot.sources.find(row => row.localRef === localRef)?.localRevision
    this.publish({ ...this.snapshot, busy: true, errorCode: null })
    try {
      await this.api.refreshNativeBuiltinBalance(localRef); if (epoch === this.#epoch &&
        revision === this.snapshot.sources.find(row => row.localRef === localRef)?.localRevision) await this.loadDetail(localRef)
    }
    catch (error) { if (epoch === this.#epoch) this.publish({ ...this.snapshot, errorCode: errorCode(error) }) }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  /** Run an explicit protected diagnostic, separate from consumer validation authority.
   * @param operationId - Current original source save identity.
   * @param selection - Exact installed model reference.
   * @param prompt - User-supplied short diagnostic prompt. */
  diagnostic = async (operationId: string, selection: NativeBuiltinSelectionRefV1, prompt: string): Promise<void> => {
    if (this.snapshot.scope === null || this.snapshot.busy || !this.api.runNativeBuiltinDiagnostic) return
    const epoch = this.#epoch, revision = this.snapshot.sources.find(row => row.localRef === selection.localRef)?.localRevision
    this.publish({ ...this.snapshot, busy: true, errorCode: null })
    try {
      await this.api.runNativeBuiltinDiagnostic({
        schemaVersion: 1, operationId, selection, clientRequestId: randomUUID(),
        purpose: 'diagnostic', prompt,
      }); if (epoch === this.#epoch && revision === this.snapshot.sources.find(row =>
        row.localRef === selection.localRef)?.localRevision) await this.loadDetail(selection.localRef)
    }
    catch (error) { if (epoch === this.#epoch) this.publish({ ...this.snapshot, errorCode: errorCode(error) }) }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  private async mutate(run:()=>Promise<unknown>):Promise<void>{
    if(this.snapshot.scope===null||this.snapshot.busy)return
    const epoch=this.#epoch;this.publish({ ...this.snapshot,busy:true,errorCode:null })
    try{await run();if(epoch===this.#epoch)await this.load()}
    catch(error){if(epoch===this.#epoch)this.publish({ ...this.snapshot,errorCode:errorCode(error) })}
    finally{if(epoch===this.#epoch)this.publish({ ...this.snapshot,busy:false })}
  }
  /** Run the retained explicit endpoint connectivity action.
   * @param baseUrl - Native source endpoint.
   * @param anthropicUrl - Optional explicit Messages endpoint. */
  ping = async (baseUrl: string, anthropicUrl: string | null): Promise<void> => {
    if (this.snapshot.scope === null || this.snapshot.busy) return
    const epoch = this.#epoch, revision = this.#check
    this.publish({ ...this.snapshot, busy: true, errorCode: null })
    try {
      const ping = await this.api.pingNativeUserModel(baseUrl, anthropicUrl)
      if (epoch === this.#epoch && revision === this.#check) this.publish({ ...this.snapshot, ping, errorCode: ping.errorCode })
    }
    catch (error) { if (epoch === this.#epoch && revision === this.#check) this.publish({ ...this.snapshot, errorCode: errorCode(error) }) }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  /** Run the retained explicit legacy model probe.
   * @param draft - Original native model draft.
   * @param prompt - Optional user-supplied probe text. */
  probe = async (draft: NativeUserModelDraftV1, prompt?: string): Promise<void> => {
    if (this.snapshot.scope === null || this.snapshot.busy || this.snapshot.pending) return
    const epoch = this.#epoch, revision = this.#check
    this.publish({ ...this.snapshot, busy: true, errorCode: null })
    try {
      const probe = await this.api.testNativeUserModel(draft, prompt)
      if (epoch === this.#epoch && revision === this.#check) this.publish({ ...this.snapshot, probe })
    }
    catch (error) { if (epoch === this.#epoch && revision === this.#check) this.publish({ ...this.snapshot, errorCode: errorCode(error) }) }
    finally { if (epoch === this.#epoch) this.publish({ ...this.snapshot, busy: false }) }
  }
  override dispose():void{this.setScope(null);super.dispose()}
}
