/**
 * The review tab's view state: which listed file is shown, whether hunks are
 * drawn side by side, and whether long lines wrap. One bucket per tab, so two
 * reviews in one session keep their own choices; the bucket ends with the
 * tab record's signal.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store';
function bucket(state, tabId) {
    const tab = state.byTab[tabId];
    if (tab === undefined)
        throw new Error(`ui-deliverables: no review state for tab "${tabId}"`);
    return tab;
}
/**
 * Declare the review tab's store; the registration declares it as an
 * exclusive store, so the framework mints one instance per session.
 * @returns the store handle to declare on the registration.
 */
export function createReviewStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            /**
             * Apply a navigation: seed a side-by-side, unwrapped tab on its first one, then show the navigated file.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param revision - the navigation revision being applied.
             * @param index - the file index the navigation named, or the current one.
             */
            navigated: (d, tabId, revision, index) => {
                const tab = d.byTab[tabId];
                if (tab === undefined)
                    d.byTab[tabId] = { index, split: true, wrap: false, navigated: revision };
                else {
                    tab.index = index;
                    tab.navigated = revision;
                }
            },
            /**
             * Show another listed file.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param index - original index in the summary's files array.
             */
            selected: (d, tabId, index) => { bucket(d, tabId).index = index; },
            /**
             * Switch between the unified and the side-by-side view.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            toggledSplit: (d, tabId) => { const tab = bucket(d, tabId); tab.split = !tab.split; },
            /**
             * Switch line wrapping.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            toggledWrap: (d, tabId) => { const tab = bucket(d, tabId); tab.wrap = !tab.wrap; },
            /**
             * Drop a tab's bucket once its record is gone.
             * @param d - draft state.
             * @param tabId - the tab that ended.
             */
            forget: (d, tabId) => {
                d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId));
            },
        },
    });
}
//# sourceMappingURL=review-store.js.map