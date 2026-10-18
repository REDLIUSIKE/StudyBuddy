import type { Context } from '@deepseek-ai/cordis';
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
type Event = Record<string, unknown>;
export declare class NativeAigcTemporary {
    private readonly ctx;
    private readonly current;
    private readonly sessions;
    private readonly opening;
    constructor(ctx: Context, current: (projectId: string) => boolean);
    ownsSession(id: string): boolean;
    inProject(id: string, projectId: string): boolean;
    private row;
    private emit;
    open(parent: Agent, projectId: string, value: unknown): Promise<{
        sessionId: string;
        nativeSessionId: string;
    }>;
    private gate;
    start(id: string, runId: string, selection: ModelSelection, content: ContentBlock[]): Promise<void>;
    poll(id: string, runId: string, cursor: number, signal: AbortSignal): Promise<{
        cursor: number;
        events: Event[];
        finished: boolean;
    }>;
    toolResult(id: string, callId: string, value: unknown): void;
    control(id: string, action: 'pause' | 'resume' | 'stop' | 'close', runId?: string): Promise<{
        status: string;
    }>;
    close(projectId?: string): Promise<void>;
}
export {};
//# sourceMappingURL=aigc-temporary.d.ts.map