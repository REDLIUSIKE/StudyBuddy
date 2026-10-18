import type { HarnessAigcContextV1, HarnessAigcToolOperationV1 } from '@studybuddy/contracts';
interface Options {
    send(value: object): Promise<void>;
    current(context: HarnessAigcContextV1): boolean;
}
export declare class AigcToolRpc {
    private readonly options;
    private readonly pending;
    constructor(options: Options);
    private send;
    invoke(context: HarnessAigcContextV1, callerSessionId: string, operation: HarnessAigcToolOperationV1, toolCallId: string, input: unknown, signal: AbortSignal): Promise<unknown>;
    result(value: unknown): void;
    revoke(projectId?: string): void;
}
export {};
//# sourceMappingURL=aigc-tool-rpc.d.ts.map