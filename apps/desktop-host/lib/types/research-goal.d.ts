import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { HarnessResearchContextV1 } from '@studybuddy/contracts';
interface Frozen {
    modelRef: string;
    reasoningEffort: string | null;
    tools: string[];
    maxTokens: number;
}
interface Options {
    current(context: HarnessResearchContextV1): boolean;
    directory(context: HarnessResearchContextV1): string;
    freeze(context: HarnessResearchContextV1, missionId: string, objective: string): Promise<Frozen>;
    composeChild?(context: HarnessResearchContextV1, agent: Agent): void | Promise<void>;
    maxDepth?: number;
}
type Phase = 'active' | 'paused' | 'budget-exhausted' | 'complete' | 'cancelled' | 'disabled' | 'unknown';
/** Persist each request before dispatch and account only canonical terminal Session events. */
export declare class NativeResearchGoals {
    private readonly ctx;
    private readonly options;
    private readonly rows;
    private readonly handles;
    private readonly commands;
    private readonly dispose;
    private readonly blocking;
    private readonly grants;
    constructor(ctx: Context, options: Options);
    private assert;
    private key;
    private requireGrant;
    /** Attest an actual mission tool call using the native Goal tools' direct-human policy.
     * @param context - Current project binding captured by the native tool registrar.
     * @param exec - Registry-owned execution, with its actual calling root Agent and call id.
     * @param input - The original mission arguments; no JSON flag alone creates authority.
     * @returns A disposer to revoke the grant when that exact RPC finishes. */
    authorizeMission(context: HarnessResearchContextV1, exec: ToolRunContext, input: unknown): () => void;
    private forSession;
    private directory;
    private save;
    private prove;
    private allowed;
    private block;
    private blockNow;
    private unknown;
    private observe;
    private decode;
    /** Restore counters on project binding; restart never arms or replays a paid Goal start.
     * @param context - Current admitted project and root Session.
     * @returns Resolves after persisted requests have been reconciled. */
    mount(context: HarnessResearchContextV1): Promise<void>;
    private view;
    /** Compose an owned native conversation without injecting a human prompt or a second runner. */
    private child;
    /** Apply an authored mission setting or inspect its persisted accounting.
     * @param context - Admitted account, project and root Session.
     * @param value - Closed mission Goal command from the private channel.
     * @returns Native Goal identity, cumulative tokens and unconfirmed request identities. */
    command(context: HarnessResearchContextV1, value: unknown): Promise<{
        activation: import("@deepseek-ai/dsh-goal").GoalActivation;
        sessions: {
            sessionId: string;
            parentSessionId: string | null;
            tokensUsed: number;
        }[];
        accountingError?: string;
        missionId: string;
        nativeSessionId: string;
        goalSessionId: string;
        goalId: string | null;
        state: Phase;
        tokenBudget: number;
        tokensUsed: number;
        unknownRequests: string[];
    }>;
    private sync;
    /** Detach account or project rows while retaining observers for the next admitted binding.
     * @param projectId - Optional project; omission detaches every active account row.
     * @returns Resolves after local activation and outstanding authorization are withdrawn. */
    suspend(projectId?: string): Promise<void>;
    /** Permanently detach the Goal accounting observers owned by this Host lifecycle.
     * @returns Resolves after every row is disarmed and observers are removed. */
    close(): Promise<void>;
}
export {};
//# sourceMappingURL=research-goal.d.ts.map