/** Shortcut reference visibility and search state, shared by its entry points. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Declare the reference dialog store.
 * @returns root-scoped visibility, focus request, and search actions.
 */
export function createShortcutsStore() {
    return defineStore({
        init: () => ({ open: false, query: '', focusRequest: 0 }),
        actions: {
            open: (d) => { d.open = true; d.focusRequest++; },
            close: (d) => { d.open = false; d.query = ''; },
            search: (d, query) => { d.query = query; },
        },
    });
}
//# sourceMappingURL=store.js.map