/**
 * Browser-local object layer over one Session's durable message-feedback
 * sidecar. The Host owns per-item compare-and-set: every mutation carries the
 * version this controller last observed, and a `version-conflict` reply carries
 * the authoritative item, so a lost race reconciles from the reply itself
 * instead of refetching the whole Session.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client/controller
 */
// `Object.freeze` does not protect a Map: `set`/`delete` write internal slots,
// not properties. Immutability here is by discipline instead — the view type is
// ReadonlyMap and every publish hands over a freshly built Map that this class
// keeps no mutable reference to.
const EMPTY_ITEMS = new Map();
const INITIAL_VIEW = Object.freeze({
    status: 'cold',
    items: EMPTY_ITEMS,
    error: null,
});
const OK = Object.freeze({ ok: true });
const DISPOSED = Object.freeze({
    ok: false,
    error: Object.freeze({ code: 'disposed', message: 'feedback controller is disposed' }),
});
/**
 * Human-readable text for one business failure code.
 * @param code - the Host's business failure code.
 * @returns the developer-facing description carried in the failure branch.
 */
export function describe(code) {
    switch (code) {
        case 'session-not-found': return 'this session is no longer persisted';
        case 'target-not-found': return 'this message is not a persisted assistant message';
        case 'version-conflict': return 'feedback changed elsewhere';
        case 'note-blank': return 'a note must contain a non-whitespace character';
        case 'note-too-large': return 'the note is too long';
        default: return code;
    }
}
/** Build the rejected branch for one business failure code. */
function fail(code) {
    return { ok: false, error: { code, message: describe(code) } };
}
/** Carrier failure rendered with the Host-supplied code and message. */
function carrierFailure(error) {
    return { ok: false, error: { code: error.code, message: error.message } };
}
/**
 * Per-session feedback object layer. One instance backs every per-message
 * control in that Session, so a single list read seeds them all.
 */
export class MessageFeedbackController {
    remote;
    sessionId;
    view = INITIAL_VIEW;
    listeners = new Set();
    loadPromise = null;
    operationTail = Promise.resolve();
    disposed = false;
    /**
     * @param remote - the messageFeedback Remote namespace.
     * @param sessionId - Session owning every addressed assistant message.
     */
    constructor(remote, sessionId) {
        this.remote = remote;
        this.sessionId = sessionId;
    }
    /** Return the cached immutable view. */
    getSnapshot = () => this.view;
    /** Subscribe to view replacement. */
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    /**
     * Load once; a failed load stays retryable.
     * @returns the settled load result, shared by concurrent callers.
     */
    ensure() {
        if (this.view.status === 'ready')
            return Promise.resolve(OK);
        return this.refresh();
    }
    /**
     * Re-read the authoritative list, collapsing concurrent callers onto one
     * in-flight read.
     *
     * This is the unserialized read used to seed a cold controller, where no
     * mutation can be in flight yet. A reconnect must use {@link resync} instead:
     * an unserialized list response can otherwise arrive after a newer mutation's
     * reply and overwrite the version that mutation just committed.
     * @returns the settled reload result.
     */
    refresh() {
        if (this.loadPromise !== null)
            return this.loadPromise;
        this.publish({ status: 'loading', items: this.view.items, error: null });
        const pending = this.load();
        this.loadPromise = pending;
        return pending.finally(() => { this.loadPromise = null; });
    }
    /**
     * Re-read the list behind this Session's queued mutations, so a reconnect
     * cannot resurrect a version an in-flight mutation already replaced.
     * @returns the settled reload result.
     */
    resync() {
        // seed: false — this operation *is* the read, so pre-seeding would either
        // short-circuit it (status already ready) or run it twice.
        return this.mutate(() => this.refresh(), { seed: false });
    }
    /**
     * Create or replace feedback for one message, comparing against the version
     * this controller last observed. The item stores exactly `entry`: an entry
     * without a note or category replaces whatever the stored item carried.
     * @param messageId - target assistant message.
     * @param rating - desired judgment.
     * @param entry - explanation and category to store with the judgment.
     * @returns the settled mutation result.
     */
    rate(messageId, rating, entry = {}) {
        return this.mutate(async () => {
            const observed = this.view.items.get(messageId);
            return await this.putCommitted(messageId, rating, entry, observed);
        });
    }
    /**
     * Retract one message's matching committed rating. The serialized operation
     * rechecks the current item and becomes a no-op if another operation already
     * changed or removed it, so a stale retraction can never record a bare rating.
     * @param messageId - target assistant message.
     * @param rating - judgment the human asked to retract.
     * @returns the settled mutation result.
     */
    retract(messageId, rating) {
        return this.mutate(async () => {
            const observed = this.view.items.get(messageId);
            return observed?.rating === rating
                ? await this.deleteCommitted(messageId, observed)
                : OK;
        });
    }
    /** Commit one put against the observed version and reconcile a conflict. */
    async putCommitted(messageId, rating, entry, observed) {
        const carried = await this.remote.put({
            sessionId: this.sessionId,
            messageId,
            rating,
            ...(entry.text === undefined ? {} : { note: entry.text }),
            ...(entry.category === undefined ? {} : { category: entry.category }),
            ifVersion: observed?.version ?? null,
        });
        if (!carried.ok)
            return carrierFailure(carried.error);
        const result = carried.value;
        if (result.ok) {
            this.commit(messageId, result.value);
            return OK;
        }
        if (result.error.code === 'version-conflict')
            this.commit(messageId, result.error.current);
        return fail(result.error.code);
    }
    /** Commit one delete against the observed version and reconcile a conflict. */
    async deleteCommitted(messageId, observed) {
        const carried = await this.remote.delete({
            sessionId: this.sessionId,
            messageId,
            ifVersion: observed.version,
        });
        if (!carried.ok)
            return carrierFailure(carried.error);
        const result = carried.value;
        if (result.ok) {
            this.commit(messageId, null);
            return OK;
        }
        if (result.error.code === 'version-conflict')
            this.commit(messageId, result.error.current);
        return fail(result.error.code);
    }
    /** Drop subscribers and refuse further work when the owning fiber unloads. */
    dispose() {
        this.disposed = true;
        this.listeners.clear();
    }
    /** Fetch the whole sidecar and publish it as the seeded view. */
    async load() {
        const carried = await this.remote.list({ sessionId: this.sessionId });
        if (this.disposed)
            return OK;
        if (!carried.ok) {
            this.publish({ status: 'error', items: this.view.items, error: carried.error.message });
            return carrierFailure(carried.error);
        }
        const result = carried.value;
        if (!result.ok) {
            this.publish({ status: 'error', items: this.view.items, error: describe(result.error.code) });
            return fail(result.error.code);
        }
        const items = new Map();
        for (const item of result.value.items)
            items.set(item.messageId, item);
        this.publish({ status: 'ready', items, error: null });
        return OK;
    }
    /**
     * Serialize one mutation behind this Session's prior mutation so queued
     * operations always compare against the committed version.
     */
    mutate(operation, options = {}) {
        const guarded = async () => {
            if (this.disposed)
                return DISPOSED;
            if (options.seed !== false) {
                const loaded = await this.ensure();
                if (!loaded.ok)
                    return loaded;
                // Disposal can land while the seeding read is in flight; without this
                // second check the fiber would still reach the wire after unloading.
                // oxlint-disable-next-line typescript/no-unnecessary-condition -- dispose() can run during the await.
                if (this.disposed)
                    return DISPOSED;
            }
            return await operation();
        };
        const result = this.operationTail.then(guarded, guarded);
        // `guarded` settles every carrier and business failure as a
        // MessageFeedbackActionResult and never rethrows, so this tail cannot reject and
        // needs no rejection handler.
        this.operationTail = result.then(() => undefined);
        return result;
    }
    /**
     * Replace one message's entry, keeping every other entry's identity. Only a
     * `mutate` operation reaches this, and `mutate` refuses admission once the
     * controller is disposed, so no disposal guard belongs here; `publish` is
     * the single place that stops notifying after listeners are dropped.
     */
    commit(messageId, item) {
        const items = new Map(this.view.items);
        if (item === null)
            items.delete(messageId);
        else
            items.set(messageId, item);
        this.publish({ status: 'ready', items, error: null });
    }
    /** Replace the view and contain subscriber failures at the observable boundary. */
    publish(view) {
        this.view = Object.freeze(view);
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch (error) {
                console.error('[ui-message-feedback] subscriber threw:', error);
            }
        }
    }
}
//# sourceMappingURL=controller.js.map