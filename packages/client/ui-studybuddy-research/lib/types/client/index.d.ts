/** StudyBuddy research entry, retained guest and actual native Conversation assembly. */
import type { Context } from '@deepseek-ai/cordis';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import type { EmbeddedPageSnapshot, SurfaceProjection } from '@deepseek-ai/dsh-client-ui-primitives';
import { type ResearchViewSnapshot } from './research-controller.ts';
import { type ResearchLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.research': ResearchLocaleKey;
    }
    interface SlotMap {
        'studybuddy.research.conversation': {
            kind: 'single';
            scope: 'session';
            owner: Record<never, never>;
        };
    }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        researchView: unknown;
    }
}
export interface ResearchPanelFace {
    hooks: {
        page: HostObservable<EmbeddedPageSnapshot>;
    };
    desktop: boolean;
    attachGuest(container: HTMLElement): () => void;
    attachNative(container: HTMLElement): () => void;
    retry(): Promise<void>;
}
export interface ResearchOverlayFace {
    hooks: {
        views: HostObservable<ResearchViewSnapshot>;
        geometry: HostObservable<SurfaceProjection>;
        page: HostObservable<EmbeddedPageSnapshot>;
    };
    applyIntent(id: string): Promise<void>;
}
export declare const inject: string[];
/** @param ctx - Original browser plugin context. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map