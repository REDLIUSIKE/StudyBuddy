/** The existing floating assistant rectangle hosts the actual native Conversation factory. */
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AigcOverlayFace, AigcQuestionFace, AigcWelcomeFace } from './index.ts';
type Props = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'studybuddy.aigc.conversation' | 'studybuddy.aigc.question'> & PropsLocale<'studybuddy.pages'> & InjectFace<AigcOverlayFace>;
export declare function AigcConversations({ useAigcViews, usePanelInfo, SessionProvider, renderSlot, t }: Props): import("react").JSX.Element;
export declare function AigcQuestion({ useSession, interactionId, presentation, readyInteraction, renderFactorySlot, t }: PropsRuntime<'studybuddy.aigc.question'> & PropsRenderFactories & PropsLocale<'studybuddy.pages'> & InjectFace<AigcQuestionFace>): import("react").JSX.Element;
export declare function AigcConversation({ useSession, renderFactorySlot, renderSlot }: PropsRuntime<'studybuddy.aigc.conversation'> & PropsRenderFactories & PropsRenderSlots<'studybuddy.aigc.welcome'>): import("react").JSX.Element;
/** The original welcome content fills the actual native Session draft, without dispatching it. */
export declare function AigcWelcome({ sessionId, useInput, inputActions, focusInput, t }: PropsRuntime<'studybuddy.aigc.welcome'> & PropsLocale<'studybuddy.pages'> & InjectFace<AigcWelcomeFace>): import("react").JSX.Element;
export {};
//# sourceMappingURL=native-conversation.d.ts.map