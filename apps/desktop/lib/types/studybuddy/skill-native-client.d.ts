import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { MainSession } from './services.ts';
import type { SkillSafetyNativeInventory, SkillSafetyNativeSnapshot } from './skill-safety-sources.ts';
interface VerifiedSkillRuntime {
    directory: string;
    companion: string;
    sourceHead: string;
    files: Readonly<Record<string, string>>;
}
/** Reject changed bytes, links, traversal and unlisted DLLs before the companion can execute. */
export declare function verifySkillRuntime(directory: string): Promise<VerifiedSkillRuntime>;
export interface SkillsRuntime {
    start(): Promise<ChildProcessWithoutNullStreams>;
}
/** Main-owned fixed runtime location; credentials travel solely in the private bootstrap pipe. */
export declare function trustedSkillsRuntime(directory: string): SkillsRuntime;
/** Parallel requests let cancellation run while an install waits; EOF revokes every original bridge. */
export declare class SkillsNativeClient {
    #private;
    private readonly runtime;
    private session;
    private readonly home;
    private readonly version;
    constructor(runtime: SkillsRuntime, session: MainSession, home: string, version: string);
    private start;
    private receive;
    private frame;
    invoke(command: string, input: Record<string, unknown>, page: string, send?: (channel: string, payload: unknown) => void): Promise<unknown>;
    /**
     * Offer a Main-owned renewal between admitted operations without replacing the bridge.
     * @param session - Current credential for the original account generation; never a guest input.
     * @returns Resolves after the native owner/device checks and private acknowledgement.
     */
    renewSession(session: MainSession): Promise<void>;
    private sendFrame;
    /**
     * Query known installed sources over the Main-only pipe, without environment detection.
     * @param signal - Caller cancellation, checked before start and after native settlement.
     * @returns Validated metadata; no original filesystem paths or credentials.
     */
    safetyInventory(signal: AbortSignal): Promise<SkillSafetyNativeInventory>;
    /**
     * Copy one resolved instance to native-owned private staging; never modify the original.
     * @param input - Native instance/revision and deployment bounds, not a caller path.
     * @param signal - Caller cancellation; late replies cannot authorize further use.
     * @returns Private verified file witnesses, available only to Main.
     */
    safetySnapshot(input: {
        instanceId: string;
        revision: string;
        maxBytes: number;
        maxFiles: number;
    }, signal: AbortSignal): Promise<SkillSafetyNativeSnapshot>;
    /**
     * Recheck original selected bytes against the complete snapshot manifest.
     * @param input - Resolved native identity and actual immutable witnesses.
     * @param signal - Caller cancellation.
     * @throws {Error} for changed source, revoked scope or malformed native reply.
     */
    safetyVerify(input: {
        instanceId: string;
        revision: string;
        maxBytes: number;
        maxFiles: number;
        files: SkillSafetyNativeSnapshot['files'];
    }, signal: AbortSignal): Promise<void>;
    private safetyInvoke;
    private fail;
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=skill-native-client.d.ts.map