import type { StudyBuddyAuthState, StudyBuddyLogoutOutcome, StudyBuddyLogoutRecovery } from './types.ts';
import type { OwnedScope } from '@studybuddy/contracts';
export interface MainSession {
    readonly scope: OwnedScope;
    readonly accessToken: string;
}
export type StudyBuddyFetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface StudyBuddyVault {
    read(): Promise<string | null>;
    write(value: string): Promise<void>;
    clear(): Promise<void>;
}
interface AuthDependencies {
    fetch: StudyBuddyFetch;
    vault: StudyBuddyVault;
    openBrowser(url: string): Promise<void>;
    schedule(callback: () => void, milliseconds: number): () => void;
    /** Main-only original native logout; never a renderer business operation. */
    logoutSession?(session: MainSession): Promise<StudyBuddyLogoutOutcome>;
    /** Check the original protected checkpoint before any refresh; acknowledge after host vault deletion. */
    logoutRecovery?: {
        recover(): Promise<StudyBuddyLogoutRecovery>;
        acknowledge(): Promise<void>;
    };
}
/** One main-process authorization owner, with generation checks for late responses. */
export declare class StudyBuddyAuth {
    #private;
    private readonly deps;
    state: StudyBuddyAuthState;
    constructor(deps: AuthDependencies);
    subscribe(listener: (state: StudyBuddyAuthState) => void): () => void;
    /** Main-only login lifecycle. Refreshing an access credential preserves this scope. */
    scope(): OwnedScope | null;
    /** Run with the current private access credential and reject results from a replaced login. */
    withSession<T>(run: (session: MainSession) => Promise<T>): Promise<T>;
    restore(): Promise<StudyBuddyAuthState>;
    start(): Promise<StudyBuddyAuthState>;
    poll(): Promise<void>;
    cancel(): Promise<StudyBuddyAuthState>;
    /** Revoke the exact native session before clearing this application's refresh credential.
     * @returns Safe original logout facts, or retained failure state for an explicit retry.
     */
    logout(): Promise<StudyBuddyAuthState>;
    dispose(): void;
}
export {};
//# sourceMappingURL=services.d.ts.map