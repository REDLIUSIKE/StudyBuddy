/** Loaded Office previews survive body remounts until reload or tab closure. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Retain Office contents across body remounts within a Session.
 * @returns the tab-content store declaration.
 */
export function createOfficeStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            /** @param state - draft. @param tab - owning tab. @param revision - new content revision. */
            loading(state, tab, revision) { state.byTab[tab] = { revision }; },
            /** @param state - draft. @param tab - owning tab. @param revision - completed revision. @param file - borrowed PDF bytes. */
            complete(state, tab, revision, file) {
                state.byTab[tab] = { revision, file };
            },
            /** @param state - draft. @param tab - owning tab. @param revision - failed revision. @param failure - displayable failure. */
            failed(state, tab, revision, failure) {
                state.byTab[tab] = { revision, failure };
            },
            /** @param state - draft. @param tab - closed tab. */
            forget(state, tab) {
                const { [tab]: _closed, ...remaining } = state.byTab;
                state.byTab = remaining;
            },
        },
    });
}
//# sourceMappingURL=store.js.map