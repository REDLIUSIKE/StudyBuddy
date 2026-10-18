/**
 * Session-scoped draft state for the generic question composer. The Slot
 * registry owns store instances; this module exports only the factory so a
 * plugin reload cannot reuse a module-global handle.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Declare the question composer's Session store. Drafts persist per Session so
 * leaving the Session or restarting the Client does not erase an unfinished answer.
 * @returns a persisted store handle whose instance is owned by the Slot registry.
 */
export function createQuestionDraftStore() {
    return defineStore({
        init: () => ({ progressByRequest: {} }),
        persist: 'dsh.user-questions.drafts.v1',
        actions: {
            replace: (draft, requestKey, progress) => {
                draft.progressByRequest[requestKey] = progress;
            },
            clear: (draft, requestKey) => {
                draft.progressByRequest = Object.fromEntries(Object.entries(draft.progressByRequest).filter(([key]) => key !== requestKey));
            },
            prune: (draft, keep) => {
                const live = new Set(keep);
                draft.progressByRequest = Object.fromEntries(Object.entries(draft.progressByRequest).filter(([key]) => live.has(key)));
            },
        },
    });
}
//# sourceMappingURL=draft-store.js.map