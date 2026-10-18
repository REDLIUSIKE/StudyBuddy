/** Plugin page selection shared by the page and cross-plugin navigation. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Create plugin page selection before the first page render.
 * @returns the registration-owned navigation store handle.
 */
export function createNavigationStore() {
    return defineStore({
        init: () => ({ view: { kind: 'list' } }),
        actions: {
            setView: (draft, view) => { draft.view = view; },
        },
    });
}
//# sourceMappingURL=navigation-store.js.map