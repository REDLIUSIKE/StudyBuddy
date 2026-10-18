import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import type { AccountFace } from './face.ts';
import type { createMyAiViewStore } from './view-store.ts';
type SharedProps = PropsLocale<'studybuddy.account'> & InjectFace<AccountFace> & PropsStore<ReturnType<typeof createMyAiViewStore>>;
export type MyAiPanelProps = PropsRuntime<'main'> & PropsRenderSlots<'studybuddy.my-ai.leaderboard'> & SharedProps;
export declare function MyAiPanel(props: MyAiPanelProps): import("react").JSX.Element;
export declare function AccountPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): import("react").JSX.Element;
export {};
//# sourceMappingURL=MyAiPanel.d.ts.map