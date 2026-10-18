import type { Context } from '@deepseek-ai/cordis';
import type { HarnessMediaInvocationV1 } from '@studybuddy/contracts';
declare module '@deepseek-ai/dsh-jobs/view' {
    interface JobKindMap {
        media: 'media';
    }
}
/** Installed once in the actual Desktop Host; no callable page-side control methods. */
export declare class MediaHostController {
    private readonly ctx;
    private readonly hostGeneration;
    private readonly send;
    private scope;
    private readonly pending;
    private readonly waits;
    constructor(ctx: Context, hostGeneration: string, send: (message: object) => Promise<void>);
    /** Main-owned account epoch; updates revoke old RPCs, waits and notifications. */
    setScope(value: unknown): void;
    private context;
    private current;
    /** Correlate one private response to its captured account; unsolicited responses are ignored. */
    result(message: unknown): void;
    invoke(sessionId: string, operation: HarnessMediaInvocationV1['operation'], input: unknown, signal: AbortSignal): Promise<unknown>;
    private owner;
    private background;
    /** Purely typed definitions; images/video bytes never enter the reasoning content. */
    definitions(): import("@deepseek-ai/dsh-tools").ToolDefinition[];
    private fetch;
}
//# sourceMappingURL=media-tools.d.ts.map