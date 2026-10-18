/** Original AIGC tool descriptors execute on the domain; native agents own calls and durable results. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AigcProjectBinding } from './aigc-projects.ts';
import type { AigcToolRpc } from './aigc-tool-rpc.ts';
export declare class NativeAigcTools {
    private readonly ctx;
    private readonly rpc;
    private readonly current;
    private readonly owns;
    private readonly mounts;
    private readonly pending;
    private readonly fences;
    constructor(ctx: Context, rpc: Pick<AigcToolRpc, 'invoke'>, current: (binding: AigcProjectBinding) => boolean, owns: (id: string, binding: AigcProjectBinding) => boolean);
    mount(binding: AigcProjectBinding, agent: Agent, historyContext?: string): Promise<void>;
    /** A resumed private actor remains closed until Main has admitted and mounted it again. */
    protect(agent: Agent): void;
    private assert;
    private attach;
    unmount(projectId?: string): Promise<void>;
    disposed(agent: Agent): Promise<void>;
}
//# sourceMappingURL=aigc-tools.d.ts.map