import type { Context } from '@deepseek-ai/cordis';
import { type ReviewRecord } from './research-review.ts';
import type { NativeResearchAdvanced } from './research-advanced.ts';
import type { ResearchProjectBinding } from './research-session-execution.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'research-review': {
            kind: 'research-review';
            operationId: string;
            nativeSessionId: string;
            sourceTurn: number;
            sourceSeq: number;
        };
    }
}
export declare class NativeResearchReviews {
    private readonly ctx;
    private readonly advanced;
    private readonly current;
    private readonly mounts;
    constructor(ctx: Context, advanced: NativeResearchAdvanced, current: (binding: ResearchProjectBinding) => boolean);
    private owns;
    mount(binding: ResearchProjectBinding, value: unknown): void;
    records(binding: ResearchProjectBinding): ReviewRecord[];
    unmount(projectId?: string): void;
}
//# sourceMappingURL=research-review-mount.d.ts.map