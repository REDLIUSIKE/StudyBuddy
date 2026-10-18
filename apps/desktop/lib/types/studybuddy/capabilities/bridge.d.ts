import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityResultV1 as Result, HarnessCapabilityInvocationV1 as Invocation, NativeBuiltinHostContextV1 } from '@studybuddy/contracts';
import type { CapabilityProjects } from './projects.ts';
interface Options {
    owner(): NativeBuiltinHostContextV1 | null;
    projects: CapabilityProjects;
    import(caller: Caller, ref: string, target: Target, signal: AbortSignal): Promise<Result['artifacts'][number]>;
    importMetadata?(caller: Caller, target: Target, artifact: Result['artifacts'][number]): Promise<Invocation['input']>;
    deliver?(caller: Caller, ref: string, directory: string, signal: AbortSignal): Promise<{
        path: string;
    }>;
    open?(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
    projectAction?(caller: Caller, target: Target, signal: AbortSignal): Promise<{
        id: string;
    }>;
    restoreOrigin?(caller: Caller, signal: AbortSignal): Promise<boolean>;
}
/** Private Host IPC only. Guests cannot mint grants or select caller identity. */
export declare class CapabilityMainBridge {
    private readonly options;
    private identity;
    private readonly requests;
    constructor(options: Options);
    assert(caller: Caller, host?: string): void;
    handle(value: unknown, hostGeneration: string, signal: AbortSignal): Promise<Result>;
    private dispatch;
    revoke(): void;
}
export {};
//# sourceMappingURL=bridge.d.ts.map