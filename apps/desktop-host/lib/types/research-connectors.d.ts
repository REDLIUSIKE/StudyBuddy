/** Native MCP lifetimes belong to the admitted research Agent, not a second Pi agent. */
import type { Context } from '@deepseek-ai/cordis';
import type { ResearchProjectBinding } from './research-session-execution.ts';
interface Status {
    name: string;
    state: 'ready' | 'disabled' | 'unavailable';
    reason?: string;
}
export declare class NativeResearchConnectors {
    private readonly ctx;
    private readonly current;
    private readonly mounts;
    constructor(ctx: Context, current: (binding: ResearchProjectBinding) => boolean);
    mount(binding: ResearchProjectBinding, value: unknown, actor?: NonNullable<ReturnType<Context['agents']['get']>>): Promise<void>;
    status(sessionId: string): readonly Status[];
    unmountSession(sessionId: string): Promise<void>;
    unmount(projectId?: string): Promise<void>;
}
export {};
//# sourceMappingURL=research-connectors.d.ts.map