import type { HarnessResearchActionV1, HarnessResearchContextV1, HarnessResearchEventV1, HarnessResearchInvocationV1, HarnessResearchRunV1 } from '@studybuddy/contracts';
export { runNativeResearchHelper } from './research-helper.ts';
export { createNativeResearchExecution } from './research-session-execution.ts';
/** Provider supplied by the native Session/Workspace owner, not by a guest page. */
export interface NativeResearchExecution {
    admitted(context: HarnessResearchContextV1): Promise<boolean>;
    capabilities(context: HarnessResearchContextV1, signal: AbortSignal): Promise<unknown>;
    submit(context: HarnessResearchContextV1, action: HarnessResearchActionV1, signal: AbortSignal): Promise<HarnessResearchRunV1>;
    inspect(context: HarnessResearchContextV1, runId: string, signal: AbortSignal): Promise<HarnessResearchRunV1>;
    cancel(context: HarnessResearchContextV1, runId: string, signal: AbortSignal): Promise<HarnessResearchRunV1>;
    answer(context: HarnessResearchContextV1, interactionId: string, answer: unknown, signal: AbortSignal): Promise<void>;
    subscribe(context: HarnessResearchContextV1, listener: (event: HarnessResearchEventV1) => void): () => void;
}
export interface ResearchHostOptions {
    readonly hostGeneration: string;
    readonly execution: NativeResearchExecution;
}
export declare class ResearchHostController {
    private readonly options;
    private scope;
    private revocation;
    private readonly operations;
    private readonly subscriptions;
    /** @param options - private native execution owner and this Host process identity. */
    constructor(options: ResearchHostOptions);
    /** @param value - Main-owned account generation; null invalidates all old waiters and listeners. */
    setScope(value: unknown): void;
    private current;
    private guarded;
    /** @param value - closed private invocation. @param signal - this wait's cancellation. @returns a captured native receipt. */
    invoke(value: HarnessResearchInvocationV1, signal: AbortSignal): Promise<unknown>;
    /** @param value - captured context. @param listener - observed native events only. @returns the owned listener disposer. */
    subscribe(value: HarnessResearchContextV1, listener: (event: HarnessResearchEventV1) => void): () => void;
}
//# sourceMappingURL=research-host.d.ts.map