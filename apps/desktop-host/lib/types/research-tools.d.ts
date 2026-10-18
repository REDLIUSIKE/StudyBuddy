import type { Context } from '@deepseek-ai/cordis';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ResearchProjectBinding } from './research-session-execution.ts';
import type { ResearchToolRpc } from './research-tool-rpc.ts';
interface Owners {
    authorizeMission?(context: ResearchProjectBinding, exec: ToolRunContext, input: unknown): () => void;
}
/** Attach only to an admitted project's real Agent context; detach on account/project revocation. */
export declare class NativeResearchTools {
    private readonly ctx;
    private readonly rpc;
    private readonly current;
    private readonly mountReview?;
    private readonly owners;
    private readonly mounts;
    private readonly connectors;
    constructor(ctx: Context, rpc: ResearchToolRpc, current: (context: ResearchProjectBinding) => boolean, mountReview?: ((binding: ResearchProjectBinding, value: unknown) => void) | undefined, owners?: Owners);
    /** Read the source-owned catalog and compose it with the actual native tool registry. */
    mount(binding: ResearchProjectBinding, actor?: NonNullable<ReturnType<Context['agents']['get']>>): Promise<void>;
    private owns;
    /** Withdraw scoped registrations without deleting notebook, files or native histories. */
    unmount(projectId?: string): Promise<void>;
}
export {};
//# sourceMappingURL=research-tools.d.ts.map