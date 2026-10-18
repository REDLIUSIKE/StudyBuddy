import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { PageFace } from './index.ts';
export type PagePanelProps = (PropsRuntime<'main'> | PropsRuntime<'studybuddy.my-ai.leaderboard'>) & PropsLocale<'studybuddy.pages'> & InjectFace<PageFace>;
export declare function PagePanel({ usePage, target, desktop, attach, retry, t }: PagePanelProps): import("react").JSX.Element;
export declare function SkillsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): import("react").JSX.Element;
export declare function AigcPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): import("react").JSX.Element;
//# sourceMappingURL=PagePanel.d.ts.map