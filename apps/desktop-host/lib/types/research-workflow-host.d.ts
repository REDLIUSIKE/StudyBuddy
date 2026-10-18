import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { HarnessResearchContextV1 } from '@studybuddy/contracts';
/** Existing private project/caller admission; this adapter never creates an Agent. */
export interface ResearchWorkflowHostOptions {
    current(context: HarnessResearchContextV1): boolean;
    directory(context: HarnessResearchContextV1): string;
    proveCaller(context: HarnessResearchContextV1, id: string): Promise<Agent>;
}
/** The original native foreground value, preserving independent process and output facts. */
export interface WorkflowHostForeground {
    kind: 'foreground';
    cwd: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    aborted: boolean;
    timeoutMs: number;
    stdout: {
        text: string;
        truncated: boolean;
        spillPath?: string;
    };
    stderr: {
        text: string;
        truncated: boolean;
        spillPath?: string;
    };
    stopped?: string;
    sandbox?: {
        mode: string;
        denied: boolean;
        enforcement?: string;
        runnerFailed?: boolean;
    };
}
/** Running intent is separate from actual native completion; absent result fields are never estimated. */
export interface ResearchWorkflowHostReceipt {
    operationId: string;
    callerSessionId: string;
    nativeCallId: string;
    state: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
    phase: 'intent' | 'dispatching' | 'terminal';
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    timedOut?: boolean;
    aborted?: boolean;
    cancelRequested?: boolean;
    canonicalResultUnavailable?: boolean;
    result?: WorkflowHostForeground;
    error?: string;
    nativeProcess?: {
        kind: 'background' | 'promoted';
        jobId: string;
        cleanupConfirmed?: boolean;
    };
}
/** Durable native command intents; uncertain operations remain unknown rather than starting again. */
export declare class NativeResearchWorkflowHost {
    private readonly ctx;
    private readonly options;
    private readonly rows;
    private readonly queues;
    private readonly suspending;
    private readonly dispatchOwner;
    private readonly removeDispatch;
    private disposed;
    constructor(ctx: Context, options: ResearchWorkflowHostOptions);
    private assert;
    private drain;
    private directory;
    private file;
    private save;
    private load;
    /** @param context - Privately admitted project/root. @param callerId - Existing proved native caller. @param value - Closed start/inspect/cancel request.
     * @returns A copied immediate receipt. Inspect again to observe actual terminal native output.
     */
    command(context: HarnessResearchContextV1, callerId: string, value: unknown): Promise<ResearchWorkflowHostReceipt>;
    private apply;
    private run;
    /** Stop original native tools and await their quiescence; terminal receipts remain owned and readable.
     * @param projectId - One project to stop; omit to stop all active operations without preventing later admitted work.
     */
    close(projectId?: string): Promise<void>;
    /** Permanently withdraw the effect-owned Host hook and wait for all dispatched tools to stop. */
    dispose(): Promise<void>;
}
//# sourceMappingURL=research-workflow-host.d.ts.map