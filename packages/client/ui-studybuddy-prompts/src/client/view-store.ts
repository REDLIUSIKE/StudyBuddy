import { defineStore } from '@deepseek-ai/dsh-client-store'
export type PromptFeedbackKind = 'copied' | 'saved' | 'published' | 'copyError'
export interface PromptDraft { id: string; title: string; body: string; expectedRevision: number }
interface PromptView { tab: 'mine' | 'square'; query: string; editor: PromptDraft | null; feedback: PromptFeedbackKind | null; reveal: string | null }
const initial = (): PromptView => ({ tab: 'mine', query: '', editor: null, feedback: null, reveal: null })
/** Shared viewing state only; durable records belong to the authenticated controller. */
export function createPromptViewStore() { return defineStore({
  init: initial,
  actions: {
    selectTab: (draft: PromptView, tab: PromptView['tab']) => { draft.tab = tab; draft.query = ''; draft.editor = null; draft.reveal = null },
    published: (draft: PromptView, id: string) => { draft.tab = 'square'; draft.query = ''; draft.editor = null; draft.reveal = id },
    query: (draft: PromptView, query: string) => { draft.query = query },
    edit: (draft: PromptView, editor: PromptDraft | null) => { draft.editor = editor },
    updateDraft: (draft: PromptView, field: 'title' | 'body', value: string) => { if (draft.editor) draft.editor[field] = value },
    feedback: (draft: PromptView, feedback: PromptView['feedback']) => { draft.feedback = feedback },
    reset: (draft: PromptView) => { Object.assign(draft, initial()) },
  },
}) }
