/** Original source lifecycle, complete inventories and explicit pending-operation recovery. */
import type { NativeAccountApi, NativeUserSourceDraftV2, NativeUserSourceCheckV2, NativeUserSourceViewV2, NativeUserSourceSaveRequestV2, ModelConfig, OwnedScope, NativeUserModelDraftV1, NativeUserModelProbeResultV1, NativeDraftPing, NativeModelRegistrationView, NativeUserSourceDraftV3, NativeUserSourceCheckV3, NativeUserSourceViewV3, NativeUserSourceSaveRequestV3, NativeBuiltinPublicCatalogV1, NativeBuiltinReadinessV1, NativeBuiltinSourceDetailV1, NativeBuiltinSelectionRefV1, NativeBuiltinModelAuthorityV1 } from '@studybuddy/contracts';
import { ObservableState } from './observable.ts';
type SourceApi = Pick<NativeAccountApi, 'listNativeUserSources' | 'getNativeUserModels' | 'checkNativeUserSource' | 'saveNativeUserSource' | 'resumeNativeUserSourceSave' | 'deleteNativeUserModel' | 'reorderNativeUserModels' | 'updateNativeUserModel' | 'pingNativeUserModel' | 'testNativeUserModel' | 'listNativeUserModelRegistrations' | 'resumeNativeUserModelSave'> & Partial<Pick<NativeAccountApi, 'listNativeUserSourcesV3' | 'checkNativeUserSourceV3' | 'saveNativeUserSourceV3' | 'resumeNativeUserSourceSaveV3' | 'getNativeBuiltinCatalog' | 'listNativeBuiltinReadiness' | 'resumeNativeBuiltinSource' | 'getNativeBuiltinSourceDetail' | 'refreshNativeBuiltinBalance' | 'runNativeBuiltinDiagnostic' | 'validateNativeBuiltinSource'>>;
/** Native draft accepted by the retained V2 and exact-selection V3 editors. */
export type SourceDraft = NativeUserSourceDraftV2 | NativeUserSourceDraftV3;
/** Narrow a new view without changing the accepted V2 view contract.
 * @param source - Keyless owned source view.
 * @returns Whether the view follows the independent V3 lifecycle. */
export declare function isSourceV3(source: NativeUserSourceViewV2 | NativeUserSourceViewV3): source is NativeUserSourceViewV3;
type SourceCheck = NativeUserSourceCheckV2 | NativeUserSourceCheckV3;
/** Account-scoped source, editor, recovery and cached diagnostic state. */
export interface SourceSnapshot {
    scope: OwnedScope | null;
    sources: readonly (NativeUserSourceViewV2 | NativeUserSourceViewV3)[];
    models: readonly ModelConfig[];
    registrations: readonly NativeModelRegistrationView[];
    draft: SourceDraft | null;
    checkResult: SourceCheck | null;
    pending: NativeUserSourceSaveRequestV2 | NativeUserSourceSaveRequestV3 | null;
    nativeCatalog: NativeBuiltinPublicCatalogV1 | null;
    /** Public model metadata loads only for the editor, independently of local rows. */
    catalogBusy?: boolean;
    /** Current draft's native manual candidates; they are not save or response proofs. */
    admittedModels?: readonly NativeBuiltinModelAuthorityV1[];
    readiness: readonly NativeBuiltinReadinessV1[];
    details: Readonly<Record<string, NativeBuiltinSourceDetailV1>>;
    busy: boolean;
    errorCode: string | null;
    probe: NativeUserModelProbeResultV1 | null;
    ping: NativeDraftPing | null;
}
/** Own source operations and reject stale account, draft and revision responses. */
export declare class SourceController extends ObservableState<SourceSnapshot> {
    #private;
    private readonly api;
    constructor(api: SourceApi);
    /** Replace the owned account and invalidate older asynchronous writes.
     * @param scope - Current signed-in account generation, or null after logout. */
    setScope(scope: OwnedScope | null): void;
    /** Reuse current presentation facts for 30 seconds; actions still use native authority. */
    ensureLoaded(): Promise<void>;
    /** Prepare the model view before unrelated pages; directory latency never holds local rows busy. */
    prepare(): Promise<void>;
    /** Refresh source facts and actual ready receipts without inference or balance refresh. */
    load(): Promise<void>;
    private readSources;
    /** Ancillary native receipts never hold the source list or editor controls busy. */
    private readSourceStatus;
    /** Reuse only unexpired, account-owned directory metadata; validation remains native. */
    private loadEditorCatalog;
    /** Start an unselected draft unless an original operation needs recovery. */
    createDraft: () => void;
    /** Open an owned source with its exact saved selection and existing native credential.
     * @param id - Native local source identity. */
    editSource: (id: string) => void;
    /** Update editor values and invalidate facts affected by changed credentials or selection.
     * @param patch - Edited draft fields. */
    editDraft: (patch: Partial<SourceDraft>) => void;
    /** Discard the current verification lease and invalidate older check responses. */
    invalidateCheck: () => void;
    /** Close the editor and discard transient discovery and verification facts. */
    clearDraft: () => void;
    /** Check V3 connectivity and manual selection without inference; retain the original V2 detection behavior. */
    check: () => Promise<void>;
    /** Execute the user's explicit save action using one current source verification. */
    detectAndSave: () => Promise<void>;
    /** Persist one original save operation; V3 Main performs one explicit protected model validation. */
    save: () => Promise<void>;
    /** Resume the original durable save without inventing a replacement operation.
     * @param operationId - Original operation, or the current pending operation when omitted. */
    resume: (operationId?: string) => Promise<void>;
    /** Delete one native source and refresh its current owned facts.
     * @param id - Native local source identity. */
    remove: (id: string) => Promise<void>;
    /** Recover an existing legacy model registration.
     * @param operationId - Original legacy save identity. */
    resumeLegacy: (operationId: string) => Promise<void>;
    /** Rename a source without changing credential or model authority.
     * @param id - Native local source identity.
     * @param name - User-supplied source name. */
    rename: (id: string, name: string) => Promise<void>;
    /** Persist source ordering through the existing native operation.
     * @param ids - Complete ordered source identities. */
    reorder: (ids: string[]) => Promise<void>;
    /** Continue private consumer preparation without inference or balance calls.
     * @param operationId - Current original source save identity. */
    resumeBuiltin: (operationId: string) => Promise<void>;
    /** Explicitly validate the native-owned selection; this action may incur supplier charges.
     * @param operationId - Current original source save identity. */
    validateBuiltin: (operationId: string) => Promise<void>;
    /** Read cached diagnostics and readiness without inference or balance refresh.
     * @param localRef - Native local source identity. */
    loadDetail: (localRef: string) => Promise<void>;
    /** Refresh supplier balance only in response to the user's explicit action.
     * @param localRef - Native local source identity. */
    refreshBalance: (localRef: string) => Promise<void>;
    /** Run an explicit protected diagnostic, separate from consumer validation authority.
     * @param operationId - Current original source save identity.
     * @param selection - Exact installed model reference.
     * @param prompt - User-supplied short diagnostic prompt. */
    diagnostic: (operationId: string, selection: NativeBuiltinSelectionRefV1, prompt: string) => Promise<void>;
    private mutate;
    /** Run the retained explicit endpoint connectivity action.
     * @param baseUrl - Native source endpoint.
     * @param anthropicUrl - Optional explicit Messages endpoint. */
    ping: (baseUrl: string, anthropicUrl: string | null) => Promise<void>;
    /** Run the retained explicit legacy model probe.
     * @param draft - Original native model draft.
     * @param prompt - Optional user-supplied probe text. */
    probe: (draft: NativeUserModelDraftV1, prompt?: string) => Promise<void>;
    dispose(): void;
}
export {};
//# sourceMappingURL=source-controller.d.ts.map