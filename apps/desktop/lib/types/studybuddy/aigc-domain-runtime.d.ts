import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { OwnedScope } from '@studybuddy/contracts';
import type { AigcLaunchResources } from './aigc-types.ts';
type NativeOperation = 'question' | 'temporary' | 'budget';
interface Options {
    userDataRoot: string;
    isCurrent(scope: OwnedScope): boolean;
    resources(): Promise<AigcLaunchResources>;
    gateway(scope: OwnedScope): Promise<{
        origin: string;
        authorization: string;
    } | undefined>;
    native(scope: OwnedScope, operation: NativeOperation, input: unknown, signal: AbortSignal): Promise<unknown>;
    launch(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
    invalidated(): void;
}
export declare class AigcDomainRuntime {
    private readonly options;
    private current;
    private cleanup;
    constructor(options: Options);
    private assert;
    ensure(scope: OwnedScope): Promise<{
        origin: string;
    }>;
    private send;
    private start;
    private message;
    invoke(scope: OwnedScope, input: unknown, signal: AbortSignal): Promise<unknown>;
    requestHeaders(scope: OwnedScope, entryUrl: string, target: string): Readonly<Record<string, string>>;
    private stop;
    revoke(scope?: OwnedScope): Promise<void>;
}
export {};
//# sourceMappingURL=aigc-domain-runtime.d.ts.map