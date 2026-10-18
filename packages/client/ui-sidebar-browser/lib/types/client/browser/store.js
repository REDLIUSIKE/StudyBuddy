/** Persisted Browser tab snapshots shared by the body and title slots. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Declare the Session-scoped Browser persistence store.
 * @returns a fresh store handle for Slot registration.
 */
export function createBrowserStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        persist: 'dsh.sidebar-browser.v1',
        actions: {
            replace: (draft, tabId, state) => { draft.byTab[tabId] = state; },
            forget: (draft, tabId) => {
                const byTab = {};
                for (const [id, state] of Object.entries(draft.byTab)) {
                    if (id !== tabId)
                        byTab[id] = state;
                }
                draft.byTab = byTab;
            },
        },
    });
}
//# sourceMappingURL=store.js.map