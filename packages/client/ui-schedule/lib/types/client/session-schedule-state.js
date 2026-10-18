/**
 * One Session's scheduled-task state for the ambient surfaces: the Sidebar
 * row mark and the row hover-card task section.
 *
 * Both project the ONE Host catalog the page already owns — `schedule/catalog()`
 * returns active and ended tasks with their originating `sessionId` — so N
 * visible rows share one Remote read and follow one `schedule/changed`
 * invalidation instead of issuing a query per row. The Session-header catalog
 * keeps its own per-Session `schedule/list` source because it also lists the
 * open Session's tasks.
 */
import { createCatalogSource } from "./catalog-source.js";
/**
 * Create the durable reminder source for one Session.
 *
 * The stored read is `schedule/list`, which admits only tasks whose durable
 * status is active; loading and error reads carry no authoritative answer.
 * @param ctx - client context carrying the Remote schedule face.
 * @param sessionId - Session whose tasks are read; reading never activates it.
 * @returns observable catalog plus its mutation callbacks.
 */
export function createSessionScheduleSource(ctx, sessionId) {
    return createCatalogSource({
        list: () => ctx.remote.schedule.list({ sessionId }),
        remove: id => ctx.remote.schedule.delete({ sessionId, id }),
        subscribeChanged: listener => ctx.remote.$on('schedule/changed', listener),
        subscribeReset: listener => ctx.on('connection/reset', listener),
    });
}
const NO_RECORDS = [];
/**
 * Project the shared Host catalog onto one Session's active tasks.
 *
 * `schedule/catalog()` returns active and ended tasks for every Session, so
 * both facts come from this one snapshot filtered by `sessionId` and
 * `status === 'active'`. A read that never settled answers no active task; a
 * refresh republishes `loading` over the records of the last successful read, and
 * the Host emits `schedule/changed` after every delivery, so following `status`
 * here would blank a Session's mark for each roundtrip. An ended-only Session
 * lists nothing.
 * @param snapshot - shared Host catalog snapshot.
 * @param sessionId - Session whose facts are selected.
 * @returns this Session's active-task facts.
 */
export function selectSessionScheduleFacts(snapshot, sessionId) {
    if (!snapshot.settled)
        return { hasActive: false, records: NO_RECORDS };
    const records = snapshot.records.filter(record => record.sessionId === sessionId && record.status === 'active');
    return { hasActive: records.length > 0, records };
}
/**
 * Compare two projections so a row keeps its previous render while its own
 * active tasks are unchanged, even when another Session's tasks move.
 * @param left - current projection.
 * @param right - previously selected projection.
 * @returns whether both projections describe the same active tasks.
 */
function sameSessionScheduleFacts(left, right) {
    return left.hasActive === right.hasActive
        && left.records.length === right.records.length
        && left.records.every((record, index) => record === right.records[index]);
}
/**
 * Select one Session's active-task facts from the shared Host catalog.
 * @param useCatalog - selector hook bound to the shared Host catalog observable.
 * @param sessionId - Session whose row is observed; reading activates nothing.
 * @returns this Session's facts, stable across other Sessions' updates.
 */
export function useSessionScheduleFacts(useCatalog, sessionId) {
    return useCatalog(snapshot => selectSessionScheduleFacts(snapshot, sessionId), sameSessionScheduleFacts);
}
//# sourceMappingURL=session-schedule-state.js.map