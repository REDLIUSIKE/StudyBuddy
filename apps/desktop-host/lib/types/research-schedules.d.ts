import type { Context } from '@deepseek-ai/cordis';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import { type HarnessResearchContextV1 } from '@studybuddy/contracts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        schedule: {
            kind: 'schedule';
        } & ContextFormed;
    }
}
/** Creation-time native model, saved specialist definitions and capability ceiling. */
export interface FrozenResearchScheduleTarget {
    model: string;
    workflowScript: string;
    target: unknown;
}
/** Private owner hooks; freeze performs reads only and dispatch starts the already frozen target once. */
export interface ResearchScheduleOptions {
    current(context: HarnessResearchContextV1): boolean;
    directory(context: HarnessResearchContextV1): string;
    freeze(context: HarnessResearchContextV1, target: unknown): Promise<FrozenResearchScheduleTarget>;
    dispatch(context: HarnessResearchContextV1, target: unknown, operationId: string): Promise<unknown>;
    inspect(context: HarnessResearchContextV1, operationId: string): Promise<unknown>;
    budget(context: HarnessResearchContextV1): Promise<{
        paused: boolean;
    }>;
    contextForSession?(sessionId: string): HarnessResearchContextV1 | undefined;
    budgetCheckSeconds?: number;
}
interface Run {
    id: string;
    operationId: string;
    plannedAt: string;
    dueReason: 'timer' | 'run-due' | 'manual';
    state: 'admitting' | 'running' | 'skipped' | 'missed' | 'completed' | 'failed_launch' | 'failed_run' | 'unknown';
    startedAt?: string;
    completedAt?: string;
    asyncId?: string;
    summary?: string;
    error?: string;
}
interface Delivery {
    nativeId: string;
    scheduledAt: string;
    deliveredAt: string;
    messageId: string;
    prompt?: string;
}
/** Install before native Schedule startup can restore a Session. Unbound private deliveries never start a parent model.
 * @param ctx - Original Host context before its reminder runtime activates. @returns Effect-owned guard disposer. */
export declare function installResearchScheduleSafetyGuard(ctx: Context): () => void;
/** Account/project-owned mapping keeps target outcomes distinct from Schedule inbox receipts. */
export declare class NativeResearchSchedules {
    private readonly ctx;
    private readonly options;
    private readonly rows;
    private readonly contexts;
    private readonly queues;
    private readonly startedAt;
    private readonly disposeGuard;
    private readonly budgetCheckSeconds;
    private closed;
    private readonly suspending;
    /** @param ctx - Running native Host. @param options - Existing admission, dispatch and budget owners. */
    constructor(ctx: Context, options: ResearchScheduleOptions);
    private text;
    private markers;
    private assert;
    private actor;
    private serial;
    private directory;
    private read;
    private decode;
    private save;
    private owned;
    /** @param context - Current privately bound account/project Session. @param value - Closed schedule control payload. @returns Panel view or real child outcome. */
    command(context: HarnessResearchContextV1, value: unknown): Promise<{
        runs: Run[];
        nativeDeliveryHistory: Delivery[];
        earlierDeliveriesUnavailable: boolean;
        lastRun?: Run;
        activeRunId?: string;
        createdAt: string;
        updatedAt: string;
        timeoutMs?: number;
        id: string;
        nativeScheduleId: string;
        name: string;
        ownerSessionId: string;
        sessionOnly: boolean;
        trigger: {
            nextRunAt?: string;
            kind: "once";
            at: string;
        } | {
            nextRunAt?: string;
            kind: "interval";
            every: string;
            everyMs: number;
            anchorAt: string;
        };
        workflowScript: string;
        model: string;
        quiet: boolean;
        paused: boolean;
        heldByBudget: boolean;
        catchUp: "none" | "latest";
    } | {
        schedules: {
            runs: Run[];
            nativeDeliveryHistory: Delivery[];
            earlierDeliveriesUnavailable: boolean;
            lastRun?: Run;
            activeRunId?: string;
            createdAt: string;
            updatedAt: string;
            timeoutMs?: number;
            id: string;
            nativeScheduleId: string;
            name: string;
            ownerSessionId: string;
            sessionOnly: boolean;
            trigger: {
                nextRunAt?: string;
                kind: "once";
                at: string;
            } | {
                nextRunAt?: string;
                kind: "interval";
                every: string;
                everyMs: number;
                anchorAt: string;
            };
            workflowScript: string;
            model: string;
            quiet: boolean;
            paused: boolean;
            heldByBudget: boolean;
            catchUp: "none" | "latest";
        }[];
        heldByBudget: string[];
        schedulerSessionId: string | null;
    } | {
        id: string;
        runs: Run[];
        runHistoryLimit: number;
        deliveries: Delivery[];
        earlierDeliveriesUnavailable: boolean;
    }>;
    private create;
    private list;
    private view;
    private refresh;
    private outcome;
    private retainDelivery;
    private capture;
    private recoverTimer;
    private arm;
    private stopTimer;
    private deliver;
    private armOrDue;
    private launch;
    /** Suspend native timers across account/project revocation; a later ensure-host restores owned mappings.
     * @param projectId - Optional closed project; omission suspends all bound projects. @returns Quiescent cleanup. */
    suspend(projectId?: string): Promise<void>;
    /** Permanently close the owner after suspending timers; guard disposal belongs to final Host shutdown.
     * @returns Quiescent cleanup with durable mapping bytes retained. */
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=research-schedules.d.ts.map