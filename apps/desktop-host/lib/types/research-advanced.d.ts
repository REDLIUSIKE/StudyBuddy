import type { Context } from '@deepseek-ai/cordis';
import { type ModelSelection } from '@deepseek-ai/dsh-agent';
import { type HarnessResearchContextV1 } from '@studybuddy/contracts';
interface Options {
    current(context: HarnessResearchContextV1): boolean;
    directory(context: HarnessResearchContextV1): string;
    catalog(): Promise<{
        groups: readonly {
            id: string;
            models: readonly {
                id: string;
                reasoning?: {
                    efforts: readonly {
                        id: string;
                    }[];
                };
            }[];
        }[];
    }>;
    composeChild?(context: HarnessResearchContextV1, agent: NonNullable<ReturnType<Context['agents']['get']>>): Promise<void>;
    maxDepth?: number;
}
interface Start {
    action: 'start';
    operationId: string;
    label: string;
    prompt: string;
    persona: string;
    modelRef: string | null;
    reasoningEffort: string | null;
    tools: string[] | null;
    inheritParentContext: boolean;
    maxTokens: number;
    systemPromptMode?: 'append' | 'replace';
    inheritProjectContext?: boolean;
    inheritSkills?: boolean;
}
interface Receipt {
    operationId: string;
    nativeSessionId: string;
    parentSessionId: string;
    state: 'admitting' | 'running' | 'completed' | 'failed' | 'unknown';
    selection: Readonly<ModelSelection>;
    tools: string[];
    text?: string;
    error?: string;
}
/** Account revocation immediately denies old results; durable admitting receipts prevent duplicate paid starts. */
export declare class NativeResearchAdvanced {
    private readonly ctx;
    private readonly options;
    private readonly rows;
    private readonly pending;
    private readonly cancelledStarts;
    constructor(ctx: Context, options: Options);
    private assert;
    private proveParent;
    private caller;
    private owned;
    private restore;
    private file;
    private save;
    command(context: HarnessResearchContextV1, value: unknown): Promise<Receipt | {
        text: string;
        nativeSessionId: string;
    } | {
        accepted: true;
    }>;
    /** Execute under a trusted native workflow caller; JSON never selects the caller or ceiling. */
    commandForCaller(context: HarnessResearchContextV1, value: unknown, callerSessionId: string, ceiling?: readonly string[]): Promise<Receipt | {
        text: string;
        nativeSessionId: string;
    } | {
        accepted: true;
    }>;
    /** Resolve exact creation-time model/tools without creating an Agent or starting model work. */
    freezeStart(context: HarnessResearchContextV1, value: unknown, callerSessionId?: string, ceiling?: readonly string[]): Promise<Start>;
    private resolveStart;
    private start;
    settled(operationId: string): Promise<void>;
    private transcript;
    close(projectId?: string): Promise<void>;
}
export {};
//# sourceMappingURL=research-advanced.d.ts.map