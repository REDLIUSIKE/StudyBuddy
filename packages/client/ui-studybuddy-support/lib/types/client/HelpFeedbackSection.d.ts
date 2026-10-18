import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { PropsStore } from '@deepseek-ai/dsh-client-store';
import type { SupportInjected } from './index.ts';
import type { createSupportViewStore } from './view-store.ts';
type Props = PropsRuntime<'settings.section'> & PropsLocale<'studybuddy.support'> & PropsStore<ReturnType<typeof createSupportViewStore>> & InjectFace<SupportInjected>;
export declare function HelpFeedbackSection({ useSupport, useStore, actions, preview, uploadLogs, submitIssue, selectScreenshots, copyReference, checkUpdates, t }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=HelpFeedbackSection.d.ts.map