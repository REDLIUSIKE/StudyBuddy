import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { OwnedScope } from '@studybuddy/contracts';
export { accountAigcDirectory } from './aigc-data.ts';
interface Options {
    userDataRoot: string;
    isCurrent(scope: OwnedScope): boolean;
    resources(): Promise<{
        directory: string;
        bun: string;
        entry: string;
    }>;
    gateway(scope: OwnedScope): Promise<{
        origin: string;
        authorization: string;
    } | undefined>;
    launch(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
    invalidated(): void;
}
/** Serialized account process owner; revocation waits for startup and child quiescence. */
export declare class AigcRuntime {
    private readonly options;
    private current;
    private cleanup;
    constructor(options: Options);
    /** Acquire the existing process or start one for the current account.
     * @param scope - Main-owned authenticated account generation.
     * @returns The admitted local origin without authorization material. */
    ensure(scope: OwnedScope): Promise<{
        origin: string;
    }>;
    private assert;
    private start;
    /** Authorization is injected only for the captured account and exact issued origin.
     * @param scope - Account generation that issued the guest.
     * @param entryUrl - Main-owned entry of this guest.
     * @param value - Request URL received from Electron's session dispatcher.
     * @returns Private headers or an empty record for any revoked/foreign request. */
    requestHeaders(scope: OwnedScope, entryUrl: string, value: string): Readonly<Record<string, string>>;
    private stop;
    /** Revoke access immediately and wait until owned asynchronous work cannot start a late child.
     * @param scope - Optional generation filter for account teardown.
     * @returns Completion after startup has settled and its child has exited. */
    revoke(scope?: OwnedScope): Promise<void>;
}
//# sourceMappingURL=aigc-runtime.d.ts.map