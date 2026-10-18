import { defineStore } from '@deepseek-ai/dsh-client-store';
const initial = () => ({ tab: 'mine', query: '', editor: null, feedback: null, reveal: null });
/** Shared viewing state only; durable records belong to the authenticated controller. */
export function createPromptViewStore() {
    return defineStore({
        init: initial,
        actions: {
            selectTab: (draft, tab) => { draft.tab = tab; draft.query = ''; draft.editor = null; draft.reveal = null; },
            published: (draft, id) => { draft.tab = 'square'; draft.query = ''; draft.editor = null; draft.reveal = id; },
            query: (draft, query) => { draft.query = query; },
            edit: (draft, editor) => { draft.editor = editor; },
            updateDraft: (draft, field, value) => { if (draft.editor)
                draft.editor[field] = value; },
            feedback: (draft, feedback) => { draft.feedback = feedback; },
            reset: (draft) => { Object.assign(draft, initial()); },
        },
    });
}
//# sourceMappingURL=view-store.js.map