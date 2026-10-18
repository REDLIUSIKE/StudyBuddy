/** Tab-local zoom preferences for renderers without additional view state. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
import { FIT_WIDTH } from "./types.js";
/**
 * Create tab-local zoom state for a document renderer registration.
 * @returns a store declaration retaining zoom until its tab closes.
 */
export function createZoomStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            zoom: (draft, tabId, preference) => { draft.byTab[tabId] = preference; },
            forget: (draft, tabId) => {
                const { [tabId]: _closed, ...remaining } = draft.byTab;
                draft.byTab = remaining;
            },
        },
    });
}
/** Default zoom value for a tab without retained state. */
export const DEFAULT_ZOOM = FIT_WIDTH;
//# sourceMappingURL=store.js.map