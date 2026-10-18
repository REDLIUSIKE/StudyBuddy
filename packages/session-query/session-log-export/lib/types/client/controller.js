/** Browser download state shared by the Session Header button and `/export`. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { SESSION_LOG_EXPORT_ROUTE } from "../routes.js";
const INITIAL = { bySession: {} };
/**
 * Collapse an untrusted Session id into the filename convention owned by the host endpoint.
 * @param sessionId - Session whose archive is downloaded.
 * @returns one safe browser download filename.
 */
export function sessionLogZipFilename(sessionId) {
    return `dsh-session-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '_')}.zip`;
}
/**
 * Hand a Host download route to the browser download manager, which resolves it
 * against the document's own base.
 * @param url - document-relative Host download route.
 * @param filename - browser download filename.
 */
export function downloadUrl(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Owns one in-flight browser download per Session and publishes modal state. */
export class SessionLogDownloadController {
    fetcher;
    save;
    /** uSES-safe state source shared by every Session-scoped modal contribution. */
    store = createSnapshotStore(INITIAL);
    active = new Map();
    disposed = false;
    /**
     * @param fetcher - HTTP carrier used to read the host-streamed ZIP.
     * @param save - browser save operation.
     */
    constructor(fetcher = (input, init) => fetch(input, init), save = downloadUrl) {
        this.fetcher = fetcher;
        this.save = save;
    }
    /**
     * Download one Session tree; concurrent gestures for the same Session share one operation.
     * @param sessionId - root Session whose ZIP includes descendants and attachments.
     * @returns after the browser save starts, an error state is published, or a late post-disposal request is ignored.
     */
    download(sessionId) {
        const existing = this.active.get(sessionId);
        if (existing !== undefined)
            return existing.done;
        if (this.disposed)
            return Promise.resolve();
        const abort = new AbortController();
        const done = this.run(sessionId, abort.signal).finally(() => {
            this.active.delete(sessionId);
        });
        this.active.set(sessionId, { abort, done });
        return done;
    }
    /**
     * Close one Session's dialog without cancelling an in-flight browser download.
     * @param sessionId - Session whose modal closes.
     */
    dismiss(sessionId) {
        const current = this.store.getSnapshot().bySession[String(sessionId)];
        if (current === undefined || !current.open)
            return;
        this.publish(sessionId, { ...current, open: false });
    }
    /**
     * Abort active fetches and reach quiescence.
     * @returns after every active operation settles.
     */
    async dispose() {
        this.disposed = true;
        const active = [...this.active.values()];
        for (const operation of active)
            operation.abort.abort();
        await Promise.allSettled(active.map(operation => operation.done));
    }
    async run(sessionId, signal) {
        this.publish(sessionId, { open: true, status: 'downloading', error: null });
        try {
            const query = new URLSearchParams({ sessionId, includeDescendants: 'true' });
            const route = `${SESSION_LOG_EXPORT_ROUTE}?${query.toString()}`;
            const response = await this.fetcher(route, { method: 'HEAD', signal });
            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                throw new Error(`Export failed: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`);
            }
            this.save(route, sessionLogZipFilename(sessionId));
            const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true;
            this.publish(sessionId, { open, status: 'success', error: null });
        }
        catch (error) {
            if (signal.aborted)
                return;
            const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true;
            this.publish(sessionId, { open, status: 'error', error: messageOf(error) });
        }
    }
    publish(sessionId, entry) {
        this.store.update((state) => {
            state.bySession = { ...state.bySession, [String(sessionId)]: entry };
        });
    }
}
//# sourceMappingURL=controller.js.map