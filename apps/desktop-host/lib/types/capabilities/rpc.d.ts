import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityInvocationV1 as Invocation, HarnessCapabilityResultV1 as Result, HarnessCapabilityTargetV1 as Target, HarnessCapabilityJsonV1 as Json } from '@studybuddy/contracts';
/** Private IPC observation only; unknown mutations retain their original identity and are never submitted twice. */
export declare class CapabilityRpc {
    private readonly hostGeneration;
    private readonly send;
    private scope;
    private readonly pending;
    private readonly observations;
    constructor(hostGeneration: string, send: (value: object) => Promise<void>);
    owner: () => Readonly<{
        scope: import("@studybuddy/contracts").OwnedScope;
        hostGeneration: string;
    }> | null;
    private assert;
    setScope(value: unknown): void;
    invoke(caller: Caller, operation: Invocation['operation'], target: Target | null, input: Json, signal: AbortSignal): Promise<Result>;
    request(value: Invocation, signal: AbortSignal): Promise<Result>;
    result(value: unknown): void;
    owns(caller: Caller): boolean;
    close(): Promise<void>;
}
//# sourceMappingURL=rpc.d.ts.map