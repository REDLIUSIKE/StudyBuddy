import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import type { PromptController, PromptRecord } from './controller.ts';
import type { createPromptViewStore, PromptDraft, PromptFeedbackKind } from './view-store.ts';
import type { PromptLocaleKey } from './locales.ts';
type Translate = (key: PromptLocaleKey) => string;
export interface PromptFace {
    hooks: {
        prompts: PromptController;
        globalPanel: HostObservable<string | null>;
    };
    toggle(): void;
    close(): void;
    add(): void;
    edit(row: PromptRecord): void;
    copy(body: string): void;
    save(draft: PromptDraft): Promise<void>;
    publish(row: PromptRecord): void;
    loadMine(): void;
    loadSquare(query: string, page?: number): void;
}
export type PromptPanelProps = PropsRuntime<'rightbar.global'> & PropsStore<ReturnType<typeof createPromptViewStore>> & PropsLocale<'studybuddy.prompts'> & InjectFace<PromptFace>;
export type PromptEntryProps = PropsRuntime<'sidebar.header.action'> & PropsLocale<'studybuddy.prompts'> & InjectFace<PromptFace>;
export declare function PromptEntry({ useGlobalPanel, toggle, t }: PromptEntryProps): import("react").JSX.Element;
export declare function PromptCard({ row, busy, copy, edit, publish, t }: {
    row: PromptRecord;
    busy: boolean;
    copy(body: string): void;
    edit(): void;
    publish(): void;
    t: Translate;
}): import("react").JSX.Element;
export declare function PromptFeedback({ feedback, t }: {
    feedback: PromptFeedbackKind | null;
    t: Translate;
}): import("react").JSX.Element | null;
export declare function PromptPanel({ useStore, usePrompts, actions, close, add, edit, copy, save, publish, loadMine, loadSquare, t }: PromptPanelProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=PromptPanel.d.ts.map