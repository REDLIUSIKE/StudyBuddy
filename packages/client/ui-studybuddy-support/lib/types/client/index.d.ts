/** Settings-only help and About contributions. */
import type { Context } from '@deepseek-ai/cordis';
import type { HarnessSupportIssueInput, SupportLogRange } from '@studybuddy/contracts';
import { SupportController } from './support-controller.ts';
import { type SupportKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.support': SupportKey;
    }
}
export interface SupportInjected {
    hooks: {
        support: SupportController;
    };
    preview(range: SupportLogRange): Promise<void>;
    uploadLogs(range: SupportLogRange): Promise<void>;
    submitIssue(input: Omit<HarnessSupportIssueInput, 'screenshotSelectionIds'>): Promise<void>;
    selectScreenshots(): Promise<void>;
    copyReference(reference: string): Promise<void>;
    checkUpdates(): Promise<void>;
}
export declare const inject: string[];
/** Register inside Settings and retain the account-owned workflow for this plugin's lifetime. @param ctx Client context. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map