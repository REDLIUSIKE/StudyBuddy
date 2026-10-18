export type PromptFeedbackKind = 'copied' | 'saved' | 'published' | 'copyError';
export interface PromptDraft {
    id: string;
    title: string;
    body: string;
    expectedRevision: number;
}
interface PromptView {
    tab: 'mine' | 'square';
    query: string;
    editor: PromptDraft | null;
    feedback: PromptFeedbackKind | null;
    reveal: string | null;
}
/** Shared viewing state only; durable records belong to the authenticated controller. */
export declare function createPromptViewStore(): import("@deepseek-ai/dsh-client-store").EngineStoreHandle<PromptView, {
    selectTab: (draft: PromptView, tab: PromptView["tab"]) => void;
    published: (draft: PromptView, id: string) => void;
    query: (draft: PromptView, query: string) => void;
    edit: (draft: PromptView, editor: PromptDraft | null) => void;
    updateDraft: (draft: PromptView, field: "title" | "body", value: string) => void;
    feedback: (draft: PromptView, feedback: PromptView["feedback"]) => void;
    reset: (draft: PromptView) => void;
}>;
export {};
//# sourceMappingURL=view-store.d.ts.map