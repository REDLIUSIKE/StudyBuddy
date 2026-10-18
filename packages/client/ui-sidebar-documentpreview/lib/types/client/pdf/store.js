/** Restorable PDF viewing preferences; document objects and canvases remain component-local. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Declare the last visible page and zoom preference isolated by tab identity.
 * @returns a store declaration instantiated by the document slot for each Session.
 */
export function createPdfStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            /** @param draft - view state. @param tabId - owning tab. @param page - selected 1-based page. */
            page: (draft, tabId, page) => {
                draft.byTab[tabId] = { ...draft.byTab[tabId], page };
            },
            /** @param draft - view state. @param tabId - owning tab. @param zoom - selected scale multiplier. */
            zoom: (draft, tabId, zoom) => {
                draft.byTab[tabId] = { page: draft.byTab[tabId]?.page ?? 1, zoom };
            },
            /** @param draft - view state. @param tabId - closed tab whose preferences are discarded. */
            forget: (draft, tabId) => {
                const remaining = {};
                for (const [id, view] of Object.entries(draft.byTab)) {
                    if (id !== tabId)
                        remaining[id] = view;
                }
                draft.byTab = remaining;
            },
        },
    });
}
//# sourceMappingURL=store.js.map