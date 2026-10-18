/** Authoritative Schedule queries and deletion for Session and Host catalogs. */
/**
 * Create a catalog whose Remote subscriptions follow its framework subscribers.
 * Mutations retain visible rows until an authoritative list read succeeds, and
 * each deletion resolves with its own outcome for the caller to report.
 * @param deps - Remote calls and invalidation subscriptions.
 * @returns observable catalog and component callbacks.
 */
export function createCatalogSource(deps) {
    let snapshot = { records: [], status: 'loading', deleting: [], settled: false, readRequest: 0, readSettled: 0 };
    const listeners = new Set();
    let disposers = [];
    let epoch = 0;
    let lifecycle = 0;
    const publish = (next) => {
        snapshot = next;
        for (const listener of listeners)
            listener();
    };
    const read = async (request, current) => {
        let result;
        try {
            result = await deps.list();
        }
        catch (_error) {
            // Transport rejection has the same visible retry path as a Remote failure.
            if (current === epoch)
                publish({ ...snapshot, status: 'error' });
            return;
        }
        if (current !== epoch)
            return;
        publish(result.ok
            ? { ...snapshot, records: result.value, status: 'ready', settled: true, readSettled: request }
            : { ...snapshot, status: 'error' });
    };
    let batching = false;
    let inFlight;
    let inFlightRequest = 0;
    // Every mount effect of one commit flushes in one task, so requests made in the
    // same commit share one read: a conversation that renders several created-task
    // cards still sends one `list()` for all of them, which is the "one read for any
    // number of consumers" property this source owes its subscribers. The read is
    // issued synchronously, so a caller observes the read it asked for; the marker
    // clears in a microtask, and a request that has already seen the read in flight -
    // a later commit of the same task, or a caller naming that ordinal - starts its
    // own read and supersedes it, so a change published in between is not missed.
    const refresh = (supersede = false, since = 0) => {
        const request = snapshot.readRequest + 1;
        publish({ ...snapshot, status: 'loading', readRequest: request });
        if (!supersede && batching && inFlight !== undefined && inFlightRequest > since)
            return inFlight;
        if (!batching) {
            batching = true;
            void Promise.resolve().then(() => { batching = false; });
        }
        const current = ++epoch;
        const pending = read(request, current);
        inFlightRequest = request;
        inFlight = pending;
        // Only this read may clear the field: a newer request can replace it while it
        // is still in flight, and that handle stays joinable.
        void pending.finally(() => { if (inFlight === pending)
            inFlight = undefined; });
        return pending;
    };
    // A change or a reset states that the connection moved, so its read supersedes
    // whatever is in flight instead of joining it; only consumers asking for a
    // current answer - the created-task cards - share a read with their commit.
    const invalidate = () => { void refresh(true); };
    const remove = async (id) => {
        if (snapshot.deleting.includes(id))
            return 'pending';
        const started = lifecycle;
        publish({ ...snapshot, deleting: [...snapshot.deleting, id] });
        let result;
        try {
            result = await deps.remove(id);
        }
        catch (_error) {
            // A rejected deletion does not establish that the durable record changed.
            if (started === lifecycle) {
                publish({ ...snapshot, deleting: snapshot.deleting.filter(value => value !== id) });
            }
            return 'failed';
        }
        if (started !== lifecycle)
            return result.ok ? 'deleted' : 'failed';
        publish({ ...snapshot, deleting: snapshot.deleting.filter(value => value !== id) });
        // The deletion changed the authoritative state, so the acknowledgement reads
        // again rather than joining a read that may have been sent before it.
        if (result.ok)
            await refresh(true);
        return result.ok ? 'deleted' : 'failed';
    };
    return {
        hooks: {
            catalog: {
                getSnapshot: () => snapshot,
                subscribe(listener) {
                    listeners.add(listener);
                    if (listeners.size === 1) {
                        lifecycle++;
                        disposers = [deps.subscribeChanged(invalidate), deps.subscribeReset(invalidate)];
                        invalidate();
                    }
                    return () => {
                        listeners.delete(listener);
                        if (listeners.size !== 0)
                            return;
                        for (const dispose of disposers)
                            dispose();
                        disposers = [];
                        epoch++;
                        lifecycle++;
                        snapshot = { ...snapshot, deleting: [] };
                    };
                },
            },
        },
        onDelete: remove,
        onRetry: (since = 0) => refresh(false, since),
    };
}
//# sourceMappingURL=catalog-source.js.map