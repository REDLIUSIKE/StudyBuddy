/** Reuse the native factory under independently retained project SessionProviders. */
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { ResearchOverlayFace } from './index.ts';
type OverlayProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'studybuddy.research.conversation'> & PropsLocale<'studybuddy.research'> & InjectFace<ResearchOverlayFace>;
/** @param props - Retained references and native-column geometry. @returns Persistent native project Conversations. */
export declare function ResearchConversations({ useViews, useGeometry, usePage, usePanelInfo, SessionProvider, renderSlot, applyIntent, t }: OverlayProps): import("react").JSX.Element;
/** @param props - Framework native Session hooks and factory renderer. @returns Existing embedded Conversation content. */
export declare function NativeConversation({ renderFactorySlot, useSession }: PropsRuntime<'studybuddy.research.conversation'> & PropsRenderFactories): import("react").JSX.Element;
export {};
//# sourceMappingURL=native-conversation.d.ts.map