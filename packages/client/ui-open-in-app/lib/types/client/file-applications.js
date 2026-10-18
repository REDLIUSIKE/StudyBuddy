/** File association reads shared by mounted controls using the same reader and target. */
import { useCallback, useSyncExternalStore } from 'react';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
const EMPTY = { apps: [], loading: true, failed: false };
const readers = new WeakMap();
/** Each mounted consumer retains the query; the last release cancels and discards it. */
function subscribe(query, target, listener) {
    let targets = readers.get(query);
    if (targets === undefined) {
        targets = new Map();
        readers.set(query, targets);
    }
    let entry = targets.get(target);
    const initial = entry === undefined;
    if (entry === undefined) {
        const created = {
            state: createSnapshotStore(EMPTY), users: 0, controller: null,
            refresh: () => {
                created.controller?.abort();
                const controller = new AbortController();
                created.controller = controller;
                void query(target, controller.signal).then((apps) => {
                    if (!controller.signal.aborted)
                        created.state.set({ apps: apps ?? [], loading: false, failed: apps === null });
                });
            },
        };
        entry = created;
        targets.set(target, entry);
    }
    const retained = entry;
    retained.users += 1;
    const release = retained.state.subscribe(listener);
    if (initial)
        retained.refresh();
    return () => {
        release();
        retained.users -= 1;
        if (retained.users === 0) {
            retained.controller?.abort();
            targets.delete(target);
        }
    };
}
/**
 * Share associations and refreshes across mounted controls for the same file and reader.
 * @param target - path or authenticated route identifying the current file.
 * @param query - stable reader scoped to the serving Host; failures resolve to null.
 * @param enabled - whether a native desktop is available.
 * @returns metadata, initial loading state, failure state, and a shared refresh callback.
 */
export function useFileApplications(target, query, enabled) {
    const retain = useCallback((listener) => enabled ? subscribe(query, target, listener) : () => { }, [enabled, query, target]);
    const snapshot = useCallback(() => enabled ? readers.get(query)?.get(target)?.state.getSnapshot() ?? EMPTY : EMPTY, [enabled, query, target]);
    const state = useSyncExternalStore(retain, snapshot, snapshot);
    const refresh = useCallback(() => { readers.get(query)?.get(target)?.refresh(); }, [query, target]);
    return { ...state, refresh };
}
//# sourceMappingURL=file-applications.js.map