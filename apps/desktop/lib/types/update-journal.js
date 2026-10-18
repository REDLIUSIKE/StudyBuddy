/** Opt-in qualification evidence outside the installation directory; no raw diagnostics or request data. */
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
const ERROR_CODES = ['ETIMEDOUT', 'ENOSPC', 'ERR_INTERNET_DISCONNECTED', 'ERR_CONNECTION_RESET',
    'ERR_CONNECTION_CLOSED', 'ERR_NAME_NOT_RESOLVED', 'ERR_UPDATER_INVALID_SIGNATURE', 'ERR_UPDATER_CHECKSUM_MISMATCH'];
/**
 * Whitelist one update state for disk; neither error text nor unexpected object fields survive.
 * @param state Main-process-owned update state.
 * @returns Only phase, target version, integer progress, operation, and a fixed error classification.
 */
export function desktopUpdateJournalState(state) {
    return {
        phase: state.phase,
        ...(state.version !== undefined ? { targetVersion: state.version } : {}),
        ...(state.phase === 'downloading' && state.percent !== undefined ? { percent: Math.floor(state.percent) } : {}),
        ...(state.phase === 'error' ? {
            failedOperation: state.failedOperation,
            errorCode: ERROR_CODES.find(code => state.message?.includes(code)) ?? 'UNCLASSIFIED',
        } : {}),
    };
}
/** Process-owned JSONL evidence; each append is flushed before the caller continues. */
export class DesktopUpdateJournal {
    version;
    path;
    sequence = 0;
    previousState;
    /**
     * @param directory Absolute evidence directory, retained across installs; creation errors stop qualification.
     * @param version Installed application version, not a version supplied by the feed.
     */
    constructor(directory, version) {
        this.version = version;
        if (!isAbsolute(directory))
            throw new Error('desktop update journal: directory must be absolute');
        mkdirSync(directory, { recursive: true });
        this.path = join(directory, `${Date.now()}-${randomUUID()}.jsonl`);
        writeFileSync(this.path, '', { flag: 'wx', mode: 0o600, flush: true });
        this.action('started');
    }
    /**
     * Append a fixed action; failures propagate so incomplete qualification is never reported as traced.
     * @param action Update operation or process milestone; no free-text fields are accepted.
     * @returns Nothing after the record has been flushed.
     */
    action(action) { this.append({ event: action }); }
    /**
     * Retain state changes and integer progress increments without raw errors, URLs, or request data.
     * @param state Main-process-owned update state.
     * @returns Nothing after the changed state has been flushed; duplicate states add no record.
     */
    state(state) {
        const fields = desktopUpdateJournalState(state);
        const encoded = JSON.stringify(fields);
        if (encoded === this.previousState)
            return;
        this.append({ event: 'state', ...fields });
        this.previousState = encoded;
    }
    append(fields) {
        appendFileSync(this.path, `${JSON.stringify({ schemaVersion: 1, sequence: this.sequence++,
            time: new Date().toISOString(), pid: process.pid, version: this.version, ...fields })}\n`, { flush: true });
    }
}
//# sourceMappingURL=update-journal.js.map