import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { VideoPanelFace } from './index.ts';
type Props = PropsRuntime<'main'> & PropsLocale<'studybuddy.video'> & InjectFace<VideoPanelFace>;
/** Existing Studio stays in its isolated guest beside the native Conversation. */
export declare function VideoPanel({ usePage, attachGuest, attachNative, desktop, retry, t }: Props): import("react").JSX.Element;
export declare function VideoPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): import("react").JSX.Element;
export {};
//# sourceMappingURL=VideoPanel.d.ts.map