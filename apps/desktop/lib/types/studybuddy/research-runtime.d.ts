import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { OwnedScope } from '@studybuddy/contracts';
import type { PrivateResearchRequest, ResearchLaunchResources } from './research-types.ts';
interface Options {
    userDataRoot: string;
    isCurrent(scope: OwnedScope): boolean;
    resources(): Promise<ResearchLaunchResources>;
    invoke(scope: OwnedScope, request: PrivateResearchRequest, signal: AbortSignal): Promise<unknown>;
    launch(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
    terminate?(child: ChildProcessWithoutNullStreams): Promise<void>;
    invalidated(): void;
}
/** Stable storage identity keeps credentials/account text out of file names.
 * @param root - Original desktop data root.
 * @param accountId - Authenticated account identity.
 * @returns Account research data directory. */
export declare function accountResearchDirectory(root: string, accountId: string): string;
/** Serialized private process owner; no page credentials enter a public URL or environment. */
export declare class ResearchRuntime {
    private readonly options;
    private current;
    private cleanup;
    constructor(options: Options);
    /** Share readiness for the captured authenticated generation.
     * @param scope - Main-owned account generation.
     * @returns Exact workbench origin. */
    ensure(scope: OwnedScope): Promise<{
        origin: string;
    }>;
    private assert;
    private start;
    private cancelRpc;
    private relay;
    /** Inject guest authorization only for this current account's exact local origin.
     * @param scope - Captured account generation.
     * @param value - Request URL from the owned guest dispatcher.
     * @returns Private request headers, or no authorization for foreign/stale requests. */
    requestHeaders(scope: OwnedScope, value: string): Readonly<Record<string, string>>;
    /** Native model tools receive a separate private caller token.
     * @param scope - Captured native account generation.
     * @param value - Main-selected exact local request URL.
     * @returns Private headers unavailable to the web guest. */
    toolHeaders(scope: OwnedScope, value: string): Readonly<Record<string, string>>;
    private stop;
    /** Revoke immediately and wait for startup settlement and owned process exit.
     * @returns Completion without removing saved projects. */
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=research-runtime.d.ts.map