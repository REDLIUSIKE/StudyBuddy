import type { HostObservable, InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { SidebarSessionViewSnapshot } from '../session-views.ts';
/** Root-only retained Session targets and their committed mount lifetimes. */
export interface RightbarRootInjected {
    readonly hooks: {
        readonly views: HostObservable<readonly SidebarSessionViewSnapshot[]>;
        readonly globalPanel: HostObservable<string | null>;
        readonly activeSession: HostObservable<SessionId | undefined>;
    };
    readonly mountView: (reference: SessionReference) => () => void;
}
type RootProps = PropsRuntime<'rightbar'> & PropsRenderSlots<'rightbar.session' | 'rightbar.global'> & InjectFace<RightbarRootInjected>;
/**
 * Keep independent Session subtrees and hide those outside the selected Conversation.
 * @param props - frame geometry, view targets and the authorized Session renderer.
 * @returns the foreground and retained background Sidebars.
 */
export declare function RightbarRoot({ useActiveSession, useViews, useGlobalPanel, ...props }: RootProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=RightbarRoot.d.ts.map