import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { createLayoutStore } from './stores.ts';
import './AppFrame.caption.css';
/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps = PropsRuntime<'root'> & PropsRenderSlots<'sidebar' | 'main' | 'rightbar' | 'shell.bottom' | 'shell.overlay' | 'shell.leading' | 'shell.actions'> & PropsStore<ReturnType<typeof createLayoutStore>> & PropsLocale<'common'>;
/** The three-column frame (see module doc). */
export declare function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, }: AppFrameProps): import("react").JSX.Element;
//# sourceMappingURL=AppFrame.d.ts.map