import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ResearchPanelFace } from './index.ts';
type Props = PropsRuntime<'main'> & PropsLocale<'studybuddy.research'> & InjectFace<ResearchPanelFace>;
/** @param props - Owned guest state and geometry actions. @returns The workbench and native-column footprint. */
export declare function ResearchPanel({ usePage, attachGuest, attachNative, desktop, retry, t }: Props): import("react").JSX.Element;
/** @param props - Existing sidebar icon size. @returns Research entry icon. */
export declare function ResearchPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): import("react").JSX.Element;
export {};
//# sourceMappingURL=ResearchPanel.d.ts.map