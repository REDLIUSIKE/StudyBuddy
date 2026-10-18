import type { Context } from '@deepseek-ai/cordis';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { AigcViewSnapshot } from './aigc-views.ts';
import { PageController, type PageTarget } from './page-controller.ts';
import { type PageLocaleKey } from './locales.ts';
export { PageController } from './page-controller.ts';
export type { PageHost, PageSnapshot } from './page-controller.ts';
export { PagePresentation } from './PagePresentation.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.pages': PageLocaleKey;
    }
    interface SlotMap {
        'studybuddy.aigc.conversation': {
            kind: 'single';
            scope: 'session';
            owner: Record<never, never>;
        };
        'studybuddy.aigc.welcome': {
            kind: 'single';
            scope: 'session';
            owner: Record<never, never>;
        };
        'studybuddy.aigc.question': {
            kind: 'single';
            scope: 'session';
            owner: {
                interactionId: string;
                presentation: 'inline' | 'floating';
            };
        };
    }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        aigcView: unknown;
    }
}
export interface AigcOverlayFace {
    hooks: {
        aigcViews: HostObservable<AigcViewSnapshot>;
    };
}
export interface AigcQuestionFace {
    readyInteraction(id: string): Promise<unknown>;
    dismissInteraction(id: string): Promise<unknown>;
}
export interface AigcWelcomeFace {
    focusInput(id: SessionId): void;
}
export interface PageFace {
    hooks: {
        page: PageController;
    };
    target: PageTarget;
    desktop: boolean;
    attach(container: HTMLElement): () => void;
    retry(): Promise<void>;
}
export declare const inject: string[];
/** Cordis owns entry, account, and presentation lifetimes; the remote page owns its business flow. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map