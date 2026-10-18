import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ResearchProjectBinding } from './research-session-execution.ts';
import type { ResearchToolRpc } from './research-tool-rpc.ts';
/** Reuse real tool execution; the observation RPC is never advertised to models or guests. */
export declare class NativeResearchProvenance {
    private readonly ctx;
    private readonly rpc;
    private readonly current;
    private readonly bindings;
    private readonly executions;
    private readonly pending;
    private readonly dispose;
    private closed;
    constructor(ctx: Context, rpc: Pick<ResearchToolRpc, 'invoke'>, current: (binding: ResearchProjectBinding) => boolean);
    private binding;
    private request;
    private finish;
    /** @param binding - Privately admitted root/project. @param actor - Optional owned child; no additional observer is installed. */
    mount(binding: ResearchProjectBinding, actor?: Agent): void;
    /** Withdraw observations first; keep pending local records uncertain if their owner was revoked.
     * @param projectId - One project to detach; omit to detach all projects without destroying the Host contribution.
     */
    unmount(projectId?: string): Promise<void>;
    /** Dispose the Host contribution after project revocation; no observer survives Host shutdown. */
    close(): Promise<void>;
}
//# sourceMappingURL=research-provenance.d.ts.map