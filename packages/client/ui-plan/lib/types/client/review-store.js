/** Session-owned memory of pending plans already opened automatically. */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Keep manual sidebar closure effective across review component remounts.
 * @returns a transient store handle whose instances belong to Session scopes.
 */
export function createPlanReviewStore() {
    return defineStore({
        init: () => ({ opened: {} }),
        actions: {
            markOpened: (draft, reviewKey) => { draft.opened[reviewKey] = true; },
        },
    });
}
//# sourceMappingURL=review-store.js.map