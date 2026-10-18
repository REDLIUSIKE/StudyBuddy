import type { DesktopUpdateState } from './ipc.ts';
/** User and process milestones that connect update states across application restarts. */
export type DesktopUpdateJournalAction = 'started' | 'workspace-ready' | 'workspace-failed' | 'check-requested' | 'download-requested' | 'install-confirmed' | 'quit-requested' | 'policy-login-opened' | 'policy-login-returned' | 'policy-login-cancelled' | 'policy-login-failed';
/**
 * Whitelist one update state for disk; neither error text nor unexpected object fields survive.
 * @param state Main-process-owned update state.
 * @returns Only phase, target version, integer progress, operation, and a fixed error classification.
 */
export declare function desktopUpdateJournalState(state: DesktopUpdateState): object;
/** Process-owned JSONL evidence; each append is flushed before the caller continues. */
export declare class DesktopUpdateJournal {
    private readonly version;
    readonly path: string;
    private sequence;
    private previousState;
    /**
     * @param directory Absolute evidence directory, retained across installs; creation errors stop qualification.
     * @param version Installed application version, not a version supplied by the feed.
     */
    constructor(directory: string, version: string);
    /**
     * Append a fixed action; failures propagate so incomplete qualification is never reported as traced.
     * @param action Update operation or process milestone; no free-text fields are accepted.
     * @returns Nothing after the record has been flushed.
     */
    action(action: DesktopUpdateJournalAction): void;
    /**
     * Retain state changes and integer progress increments without raw errors, URLs, or request data.
     * @param state Main-process-owned update state.
     * @returns Nothing after the changed state has been flushed; duplicate states add no record.
     */
    state(state: DesktopUpdateState): void;
    private append;
}
//# sourceMappingURL=update-journal.d.ts.map