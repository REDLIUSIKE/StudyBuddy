import type { Context } from '@deepseek-ai/cordis';
import { type HarnessResearchContextV1 } from '@studybuddy/contracts';
import type { NativeResearchAdvanced } from './research-advanced.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'research-composition': {
            kind: 'research-composition';
            operationId: string;
            nativeSessionIds: readonly string[];
        };
    }
}
interface Component {
    modelRef: string;
    operationId: string;
    nativeSessionId?: string;
    state: string;
    text?: string;
}
interface Receipt {
    operationId: string;
    state: 'running' | 'completed' | 'failed' | 'unknown' | 'cancelled';
    components: Component[];
    judge?: Component;
    error?: string;
    limitations: string;
}
/** Intent persistence precedes dispatch; observing a saved unknown combination cannot resubmit it. */
export declare class NativeResearchCompositions {
    private readonly ctx;
    private readonly advanced;
    private readonly current;
    private readonly directory;
    private readonly rows;
    private readonly pending;
    constructor(ctx: Context, advanced: NativeResearchAdvanced, current: (context: HarnessResearchContextV1) => boolean, directory: (context: HarnessResearchContextV1) => string);
    private assert;
    private file;
    private save;
    private restore;
    compose(context: HarnessResearchContextV1, value: unknown): Promise<Receipt>;
    private start;
    private component;
    private run;
    settled(id: string): Promise<void>;
    inspect(context: HarnessResearchContextV1, id: string): Receipt;
    cancel(context: HarnessResearchContextV1, id: string): Promise<Receipt>;
    close(projectId?: string): Promise<void>;
}
export {};
//# sourceMappingURL=research-compositions.d.ts.map