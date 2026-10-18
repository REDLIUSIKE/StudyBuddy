import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { VideoOverlayFace } from './index.ts';
type Props = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'studybuddy.video.conversation'> & PropsLocale<'studybuddy.video'> & InjectFace<VideoOverlayFace>;
/** Retain each project's real SessionProvider and conceal input when its page is hidden. */
export declare function VideoConversations({ useViews, useGeometry, usePage, usePanelInfo, SessionProvider, renderSlot, applyReference, t }: Props): import("react").JSX.Element;
export declare function NativeVideoConversation({ renderFactorySlot, useSession }: PropsRuntime<'studybuddy.video.conversation'> & PropsRenderFactories): import("react").JSX.Element;
export {};
//# sourceMappingURL=native-conversation.d.ts.map