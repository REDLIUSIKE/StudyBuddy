import type { HarnessResearchContextV1, HarnessResearchToolOperationV1 } from '@studybuddy/contracts';
interface Options {
    send(value: object): Promise<void>;
    current(context: HarnessResearchContextV1): boolean;
}
/** Private Host-to-Main caller; no method is exposed to a guest or renderer. */
export declare class ResearchToolRpc {
    private readonly options;
    private readonly pending;
    constructor(options: Options);
    /** Submit a single native tool call with captured binding and caller identity. */
    invoke(context: HarnessResearchContextV1, operation: HarnessResearchToolOperationV1, toolCallId: string, record: unknown, signal: AbortSignal): Promise<unknown>;
    /** Accept only a response correlated to an outstanding current request. */
    result(value: unknown): void;
    /** Withdraw observers immediately on account or project admission revocation. */
    revoke(projectId?: string): void;
}
export {};
//# sourceMappingURL=research-tool-rpc.d.ts.map