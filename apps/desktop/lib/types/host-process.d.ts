/** Electron Node-mode child lifecycle for the shared Web application. */
import type { PlatformRequest, PlatformPrepared, PlatformSnapshot } from '@deepseek-ai/dsh-llm-studybuddy-builtin';
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account';
import type { NativeBuiltinCatalogAppliedV1, NativeBuiltinCatalogApplyV1, NativeBuiltinCatalogPublishV1, NativeBuiltinFrozenRequestV1, NativeBuiltinHostContextV1, NativeBuiltinRequestFreezeV1, NativeBuiltinValidationRequestV1, NativeBuiltinValidationResultV1, OwnedScope, HarnessMediaInvocationV1, HarnessResearchToolInvocationV1, HarnessAigcToolInvocationV1, HarnessCapabilityInvocationV1 } from '@studybuddy/contracts';
import type { SearchInvocation } from '@deepseek-ai/dsh-web-search-studybuddy';
import type { ToolSearchResultV1 } from '@studybuddy/contracts';
import type { SkillSafetyWireInvocation } from '@deepseek-ai/dsh-skill-safety-assistant/wire';
import type { VideoToolInvocation } from '../../desktop-host/src/video-control-wire.d.ts';
/** What quitting now would affect, as reported by the Host. */
export interface DesktopQuitInspection {
    readonly activeTasks: boolean;
    readonly scheduledTasks: boolean;
}
/** Quit inspection deadline; a slower Host counts as unknown work and the shell asks before quitting. */
export declare const QUIT_INSPECTION_DEADLINE_MS = 2000;
/** Browser authentication URL reported by the running Web application. */
export interface DesktopHostReady {
    readonly url: string;
    readonly injections?: readonly unknown[] | undefined;
    readonly hostGeneration?: string | undefined;
}
/** The child has exited, but task teardown did not finish successfully. */
export declare class DesktopHostUncleanExitError extends Error {
}
/**
 * A Host failure reported over IPC before the process exited. `message` is what
 * the Host chose to show; `diagnostic` is its complete inspected error, kept
 * separately so a crash report can print it verbatim instead of a string escaped
 * inside another error's properties.
 */
export declare class DesktopHostFatalError extends Error {
    #private;
    /**
     * @param message - The Host's failure message.
     * @param diagnostic - The Host's inspected error, when the Host supplied one.
     */
    constructor(message: string, diagnostic: string | undefined);
    /** The Host's inspected error; a getter so `util.inspect` of this error does not repeat it as an escaped property. */
    get diagnostic(): string | undefined;
}
/** One Web backend running under the Electron executable in Node mode. */
export declare class DesktopHostProcess {
    private readonly node;
    private readonly runtimeDir;
    private readonly projectDir;
    private readonly inspectPort?;
    private readonly environment;
    private readonly onFailure?;
    private readonly primaryRuntime?;
    private readonly packageManager?;
    private readonly onPlatformSession?;
    private readonly onBuiltinRequest?;
    private readonly onPlatformRequest?;
    private readonly onMediaRequest?;
    private readonly onResearchToolRequest?;
    private readonly onSkillSafetyRequest?;
    private readonly onSearchRequest?;
    private readonly onAigcToolRequest?;
    private readonly onVideoToolRequest?;
    private readonly onCapabilityRequest?;
    private child;
    private readyResolve;
    private readyReject;
    private readonly readyPromise;
    private exitPromise;
    private stderr;
    private failureReported;
    private stopping;
    private shutdownCompleted;
    private nextControlId;
    private hostGeneration;
    private readonly searchRequests;
    private readonly mediaRequests;
    private readonly researchToolRequests;
    private readonly aigcToolRequests;
    private readonly videoToolRequests;
    private readonly capabilityRequests;
    private readonly capabilityTasks;
    private readonly skillSafetyRequests;
    private readonly controlRequests;
    /**
     * @param node - Absolute Electron executable in Node mode.
     * @param runtimeDir - Immutable packages carried by the current application.
     * @param projectDir - Desktop plugin profile and child working directory.
     * @param inspectPort - Optional loopback inspector port for workspace development.
     * @param environment - Environment inherited by the Host and its plugin subprocesses.
     * @param onFailure - Receives the first unexpected child failure, including after readiness.
     * @param primaryRuntime - Optional bundled dependency payload; when supplied, missing sibling
     *   `office-skills` resources fail Host startup.
     * @param packageManager - Bundled pnpm entry and Node launcher directory, scoped to package operations.
     * @param onPlatformSession - Private credential updates for embedded Platform views.
     */
    constructor(node: string, runtimeDir: string, projectDir: string, inspectPort?: number | undefined, environment?: NodeJS.ProcessEnv, onFailure?: ((error: Error) => void) | undefined, primaryRuntime?: string | undefined, packageManager?: {
        readonly pnpm: string;
        readonly nodeBin: string;
    } | undefined, onPlatformSession?: ((session: PlatformSession | null) => void) | undefined, onBuiltinRequest?: ((request: NativeBuiltinRequestFreezeV1) => Promise<NativeBuiltinFrozenRequestV1>) | undefined, onPlatformRequest?: ((request: PlatformRequest) => Promise<PlatformPrepared>) | undefined, onMediaRequest?: ((request: HarnessMediaInvocationV1, signal: AbortSignal) => Promise<unknown>) | undefined, onResearchToolRequest?: ((request: HarnessResearchToolInvocationV1, signal: AbortSignal) => Promise<unknown>) | undefined, onSkillSafetyRequest?: ((request: SkillSafetyWireInvocation, signal: AbortSignal) => Promise<unknown>) | undefined, onSearchRequest?: ((request: SearchInvocation, signal: AbortSignal) => Promise<ToolSearchResultV1>) | undefined, onAigcToolRequest?: ((request: HarnessAigcToolInvocationV1, signal: AbortSignal) => Promise<unknown>) | undefined, onVideoToolRequest?: ((request: VideoToolInvocation, signal: AbortSignal) => Promise<unknown>) | undefined, onCapabilityRequest?: ((request: HarnessCapabilityInvocationV1, signal: AbortSignal) => Promise<unknown>) | undefined);
    /**
     * Start this child once and await its Web application URL.
     * @returns Ready facts supplied by the child after application startup.
     */
    start(): Promise<DesktopHostReady>;
    /**
     * Inspect active work or lock request admission for update handoff.
     * @param action - Read-only inspection, admission lock, or recovery unlock.
     * @returns Whether live tasks would be affected. Locking drains admitted API requests before inspecting tasks;
     * an unanswered drain fails at the control-request deadline without authorizing installation.
     */
    updateTasks(action: 'inspect' | 'lock' | 'unlock'): Promise<boolean>;
    /**
     * Ask the Host what quitting now would interrupt.
     * @returns Active tasks and armed scheduled reminders; rejects when the Host is unavailable or misses
     * {@link QUIT_INSPECTION_DEADLINE_MS}, and the shell then asks before quitting.
     */
    inspectQuit(): Promise<DesktopQuitInspection>;
    /** Main-owned Host context; absent private protocol support fails closed.
     * @param scope - Authenticated account generation captured by Main.
     * @returns The current process incarnation. */
    builtinContext(scope: OwnedScope): NativeBuiltinHostContextV1;
    /** Atomically install native material through private Node IPC.
     * @param snapshot - Exact source snapshot, never exposed to a renderer.
     * @returns Current secret-free readback. */
    builtinApply(snapshot: NativeBuiltinCatalogApplyV1): Promise<NativeBuiltinCatalogAppliedV1>;
    /** Read only one source's installed proof.
     * @param scope - Authenticated account generation.
     * @param operationId - Original native source journal identity.
     * @returns The exact installed source acknowledgement. */
    builtinReadback(scope: OwnedScope, operationId: string): Promise<NativeBuiltinCatalogAppliedV1>;
    /** Publish only native-confirmed ready models.
     * @param proof - Native readiness bound to current private readback. */
    builtinPublish(proof: NativeBuiltinCatalogPublishV1): Promise<void>;
    /** Close account or source admission before further IPC can complete.
     * @param scope - Account generation to fence.
     * @param localRef - Optional single-source revocation. */
    builtinRevoke(scope: OwnedScope, localRef?: string): Promise<void>;
    /** Dispatch one protected diagnostic or user-approved validation.
     * @param request - Exact pending source selection and native request identity.
     * @returns Measured timings and actual provider terminal facts. */
    builtinValidate(request: NativeBuiltinValidationRequestV1): Promise<NativeBuiltinValidationResultV1>;
    /** Publish the keyless native platform catalog through Main-owned IPC only. */
    platformApply(snapshot: PlatformSnapshot): Promise<void>;
    /** Fence one platform account alongside personal source revocation. */
    platformRevoke(scope: OwnedScope): Promise<void>;
    /** Bind media tools to the original product account; private control only. */
    mediaApply(scope: OwnedScope | null): Promise<void>;
    capabilityApply(scope: OwnedScope | null, modules: readonly string[]): Promise<void>;
    capabilityCommand(action: string, data: unknown, signal?: AbortSignal): Promise<unknown>;
    /** Invoke only the registered native research owner over the private child channel.
     * @param action - Closed Main-owned lifecycle or native action.
     * @param data - Validated private project/admission request.
     * @returns Correlated native result. */
    researchCommand(action: 'scope' | 'bind' | 'tools' | 'invoke' | 'project-close' | 'journal' | 'journal-export' | 'model-catalog' | 'advanced' | 'goal' | 'schedules', data: unknown): Promise<unknown>;
    /** Private admission and native video-tool lifecycle; never renderer RPC. */
    videoCommand(action: 'scope' | 'bind' | 'tools' | 'project-close' | 'native' | 'cancel-native', data: unknown, signal?: AbortSignal): Promise<unknown>;
    /** A native foreground operation waits for its own cancellation or result; it is never replayed. */
    aigcCommand(action: 'scope' | 'bind' | 'tools' | 'project-close' | 'native' | 'cancel-native' | 'chat-title' | 'project-title' | 'submit' | 'records', data: unknown, signal?: AbortSignal): Promise<unknown>;
    /** Call only the native Skill Safety owner. @param action - Private closed operation. @param data - Keyless owner data. */
    skillSafetyCommand(action: 'scope' | 'bind' | 'inspect-model' | 'begin-session' | 'registry-readback', data: unknown): Promise<unknown>;
    private builtinControl;
    private control;
    /**
     * Request teardown and await child exit, escalating termination when needed.
     * @param requireGraceful - Reject update handoff after forced termination or unsuccessful child exit.
     * @returns Completion of owned process teardown. DesktopHostUncleanExitError confirms exit but refuses installation;
     * other failures do not confirm exit.
     */
    stop(requireGraceful?: boolean): Promise<void>;
    private fail;
    private cancelMediaRequests;
}
//# sourceMappingURL=host-process.d.ts.map