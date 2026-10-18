/**
 * The file tree's view state: which directories are expanded, what each
 * loaded level contains, and where the body is scrolled to.
 *
 * The tree is not one resource. A directory listing per level, expanded lazily,
 * is state the type owns — so it lives in a Slot-standard exclusive store
 * (one instance per session), bucketed by tab id because two tabs of this kind
 * in one session expand independently.
 *
 * Writers run between `start` and `forget`: the owner's `signal` is what ends a
 * bucket's life, and the face stops dispatching once it aborts.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * One tab's bucket, which every writer after `start` relies on: the face only
 * dispatches while the record's signal is live, and `forget` runs on its abort.
 * @param state - the draft.
 * @param tabId - the tab being written.
 * @returns the tab's tree.
 */
function bucket(state, tabId) {
    const tree = state.byTab[tabId];
    if (tree === undefined)
        throw new Error(`ui-sidebar-files: no tree for tab "${tabId}"`);
    return tree;
}
/**
 * Declare the file tree's store.
 *
 * A factory rather than a shared handle: the registration declares it as an
 * exclusive store, so the framework mints one instance per session.
 * @returns the store handle to declare on the registration.
 */
export function createFilesStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            autoRefresh: (d, tabId, enabled) => { bucket(d, tabId).autoRefresh = enabled; },
            /**
             * Seed one tab's tree at its workspace root, with the root expanded.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param root - absolute path of the workspace root.
             */
            start: (d, tabId, root) => {
                d.byTab[tabId] = { root, levels: {}, expanded: [root], scrollTop: 0, autoRefresh: true };
            },
            /**
             * Mark one directory as being listed.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             */
            loading: (d, tabId, path) => {
                const state = bucket(d, tabId);
                if (state.levels[path]?.kind !== 'ready')
                    state.levels[path] = { kind: 'loading' };
            },
            /**
             * Record one directory's contents.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             * @param level - the listing to show under it.
             */
            loaded: (d, tabId, path, level) => {
                const state = bucket(d, tabId);
                const previous = state.levels[path];
                if (previous?.kind === 'ready') {
                    const directories = new Set(level.entries.filter(entry => entry.type === 'directory').map(entry => entry.name));
                    for (const entry of previous.level.entries) {
                        if (entry.type !== 'directory' || directories.has(entry.name))
                            continue;
                        const removed = `${path.replace(/[/\\]+$/, '')}/${entry.name}`;
                        state.expanded = state.expanded.filter(value => value !== removed && !value.startsWith(`${removed}/`));
                        state.levels = Object.fromEntries(Object.entries(state.levels)
                            .filter(([key]) => key !== removed && !key.startsWith(`${removed}/`)));
                    }
                }
                state.levels[path] = { kind: 'ready', level };
            },
            /**
             * Record why one directory could not be listed.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             * @param failure - the settled Remote failure.
             */
            failed: (d, tabId, path, failure) => {
                const level = bucket(d, tabId).levels[path];
                bucket(d, tabId).levels[path] = level?.kind === 'ready'
                    ? { ...level, failure }
                    : { kind: 'failed', failure };
            },
            /**
             * Open a collapsed directory, or collapse an open one.
             *
             * A collapsed level keeps what it loaded, so reopening it draws at once.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             */
            toggled: (d, tabId, path) => {
                const state = bucket(d, tabId);
                const at = state.expanded.indexOf(path);
                if (at >= 0)
                    state.expanded.splice(at, 1);
                else
                    state.expanded.push(path);
            },
            /**
             * Record where one tab's body is scrolled to.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param scrollTop - the body's scroll offset, in px.
             */
            scrolled: (d, tabId, scrollTop) => {
                bucket(d, tabId).scrollTop = scrollTop;
            },
            /**
             * Drop every loaded level, keeping what is expanded.
             *
             * This is the reload gesture's first half: the expanded set says which
             * levels to fetch again.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            reset: (d, tabId) => {
                bucket(d, tabId).levels = {};
            },
            /**
             * Forget one tab's tree, for a tab record that is gone.
             * @param d - draft state.
             * @param tabId - the tab that went away.
             */
            forget: (d, tabId) => {
                d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId));
            },
        },
    });
}
//# sourceMappingURL=store.js.map