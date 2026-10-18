import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { type HarnessNativeOperationMap, type HarnessInstallEventV2, type HarnessSupportMethod, type HarnessSupportOperationMap, type HarnessSupportEvent, type NativeBuiltinPrivateOperationMap, type NativeOperationMap, type OwnedScope } from '@studybuddy/contracts';
import type { MainSession } from './services.ts';
import type { StudyBuddyLogoutOutcome, StudyBuddyLogoutRecovery } from './types.ts';
export declare const NATIVE_OPERATIONS: readonly (keyof NativeOperationMap)[];
interface NativeRuntime {
    start(): Promise<ChildProcessWithoutNullStreams>;
}
/** Validate the exact assembled companion bytes before launching a hidden private child. */
export declare function trustedNativeRuntime(directory: string): NativeRuntime;
/** Own one account's native process; replacement waits for the old process to exit. */
export declare class NativeAccountClient {
    #private;
    private readonly runtime;
    constructor(runtime: NativeRuntime);
    useSession(session: MainSession): void;
    revoke(): void;
    subscribeInstallEvents(scope: OwnedScope, listener: (event: HarnessInstallEventV2) => void): () => void;
    /** Subscribe to validated progress for this private account generation.
     * @param scope Current authenticated scope.
     * @param listener Controlled support progress consumer.
     * @returns A disposer that does not cancel an upload. */
    subscribeSupportEvents(scope: OwnedScope, listener: (event: HarnessSupportEvent) => void): () => void;
    /** Private main-owner notification; never a fabricated install journal event. */
    subscribeInstallStream(scope: OwnedScope, listener: (streamId: string) => void): () => void;
    invoke<K extends keyof HarnessNativeOperationMap>(scope: OwnedScope, method: K, args: HarnessNativeOperationMap[K]['args']): Promise<HarnessNativeOperationMap[K]['result']>;
    /** Main-owned private built-in RPC; this allowlist is never published to tool pages.
     * @param scope Current authenticated account generation.
     * @param method Closed built-in native capability.
     * @param args Arguments owned by Main rather than renderer JSON.
     * @returns Parsed native result after account fencing. */
    invokeBuiltin<K extends keyof NativeBuiltinPrivateOperationMap>(scope: OwnedScope, method: K, args: NativeBuiltinPrivateOperationMap[K]['args']): Promise<NativeBuiltinPrivateOperationMap[K]['result']>;
    /** Closed support RPC, independent of the tool-page allowlist and its serialized writes.
     * @param scope Main's current authenticated account generation.
     * @param method Private support operation.
     * @param args Validated support arguments; trusted file paths are main-only.
     * @returns Parsed native support result after the original session checks. */
    invokeSupport<K extends HarnessSupportMethod>(scope: OwnedScope, method: K, args: HarnessSupportOperationMap[K]['args']): Promise<HarnessSupportOperationMap[K]['result']>;
    /** Main-only exact logout. Failed proof retains the original process checkpoint.
     * @param session Current private login whose native authorization must be revoked.
     * @returns Original logout facts after old work terminates; rejects unconfirmed proof.
     */
    logout(session: MainSession): Promise<StudyBuddyLogoutOutcome>;
    /** Main-only recovery: no credential, account scope, endpoint or arbitrary operation is accepted. */
    recoverLogout(): Promise<StudyBuddyLogoutRecovery>;
    /** Acknowledge only after the main auth owner has removed its own refresh credential. */
    acknowledgeLogout(): Promise<void>;
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=native-account-client.d.ts.map