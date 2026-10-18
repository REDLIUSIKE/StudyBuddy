import { ResourceGroup } from "./document/resource-group.js";
/**
 * Bind the preview's face to one paged read and one complete-byte read.
 * @param read - the bound `workspaceFiles.read` call.
 * @param readAll - complete-byte workspace Remote read.
 * @param resources - shared metadata sources for the document and its dependencies.
 * @returns the Slot `inject` factory: bound actions in, face out. The slot's session id is unused because the address carries its own.
 */
export function textFace(read, readAll, resources) {
    return (_sessionId, actions) => {
        const tabs = new Map();
        // Reached with a live signal only: the record's end forgets the tab's
        // bucket and this bookkeeping in one listener, however often its body mounts.
        const readsOf = (tabId, signal) => {
            const held = tabs.get(tabId);
            if (held !== undefined)
                return held;
            const created = {
                generation: 0, version: undefined, mode: 'text-pages',
                group: new ResourceGroup(resources, () => { actions.resourceChanged(tabId); }),
            };
            tabs.set(tabId, created);
            signal.addEventListener('abort', () => {
                created.controller?.abort();
                created.group.close();
                tabs.delete(tabId);
                actions.forget(tabId);
            }, { once: true });
            return created;
        };
        const modeOf = (tabId, signal, mode, rendererId) => {
            const reads = readsOf(tabId, signal);
            if (reads.mode !== mode || reads.rendererId !== rendererId) {
                reads.controller?.abort();
                if (rendererId === undefined)
                    delete reads.rendererId;
                else
                    reads.rendererId = rendererId;
                reads.mode = mode;
                reads.generation++;
                reads.version = undefined;
                actions.reset(tabId);
            }
            return reads;
        };
        const loadPage = (tabId, file, offset, signal, observedVersion) => {
            if (signal.aborted)
                return;
            const reads = modeOf(tabId, signal, 'text-pages');
            const { generation } = reads;
            actions.loading(tabId, 'text-pages', observedVersion);
            void read(file.sessionId, file.path, offset, signal).then((result) => {
                if (signal.aborted || reads.generation !== generation)
                    return;
                if (!result.ok) {
                    actions.failed(tabId, result.error);
                    return;
                }
                // Pages of two versions never meet: a newer file past the first line
                // restarts the walk from line 1, where the store adopts the new version.
                if (offset !== 1 && reads.version !== undefined && result.value.version !== reads.version) {
                    restart(tabId, file, signal, observedVersion);
                    return;
                }
                reads.version = result.value.version;
                actions.page(tabId, result.value);
            });
        };
        const loadAll = (tabId, file, signal, observedVersion) => {
            if (signal.aborted)
                return;
            const reads = modeOf(tabId, signal, 'bytes-complete');
            reads.controller?.abort();
            const controller = new AbortController();
            reads.controller = controller;
            const lifetime = AbortSignal.any([signal, controller.signal]);
            actions.loading(tabId, 'bytes-complete', observedVersion);
            void readAll(file, lifetime).then((result) => {
                if (lifetime.aborted)
                    return;
                if (!result.ok) {
                    actions.failed(tabId, result.error);
                    return;
                }
                const file = result.value;
                reads.version = file.version;
                actions.complete(tabId, file);
            }, (error) => {
                if (lifetime.aborted)
                    return;
                actions.failed(tabId, Object.assign(new Error(error instanceof Error ? error.message : String(error), { cause: error }), { name: 'RemoteError', isDSHRemoteError: true, code: 'gateway/internal', details: {} }));
            });
        };
        const restart = (tabId, file, signal, observedVersion, mode = 'text-pages') => {
            if (signal.aborted)
                return;
            const reads = readsOf(tabId, signal);
            reads.controller?.abort();
            reads.generation += 1;
            reads.version = undefined;
            actions.reset(tabId);
            if (mode === 'text-pages')
                loadPage(tabId, file, 1, signal, observedVersion);
            else
                loadAll(tabId, file, signal, observedVersion);
        };
        return {
            addResource: (tabId, address, signal) => {
                if (!signal.aborted)
                    readsOf(tabId, signal).group.add(address);
            },
            setResources: (tabId, addresses, signal) => {
                if (!signal.aborted)
                    readsOf(tabId, signal).group.set(addresses);
            },
            loadPage, reloadPages: restart, loadAll,
            prepareRenderer: (tabId, signal, rendererId, observedVersion, reload = false) => {
                if (signal.aborted)
                    return;
                modeOf(tabId, signal, 'renderer', rendererId);
                if (reload)
                    actions.reset(tabId);
                actions.loading(tabId, 'renderer', observedVersion, rendererId);
            },
            reloadAll: (tabId, file, signal, observedVersion) => { restart(tabId, file, signal, observedVersion, 'bytes-complete'); },
        };
    };
}
//# sourceMappingURL=face.js.map