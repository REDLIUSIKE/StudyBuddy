import type { Context } from '@deepseek-ai/cordis';
import { type PromptLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.prompts': PromptLocaleKey;
    }
}
export type { PromptFace, PromptPanelProps, PromptEntryProps } from './PromptPanel.tsx';
export type { PromptRecord, PromptHost } from './controller.ts';
export { createPromptViewStore } from './view-store.ts';
export declare const inject: string[];
/** A global utility contribution, never a main-panel route or model-visible instruction. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map