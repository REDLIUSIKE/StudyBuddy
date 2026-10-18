import type { Context } from '@deepseek-ai/cordis';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import type { EmbeddedPageSnapshot, SurfaceProjection } from '@deepseek-ai/dsh-client-ui-primitives';
import { type VideoViewSnapshot } from './video-controller.ts';
import { type VideoLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.video': VideoLocaleKey;
    }
    interface SlotMap {
        'studybuddy.video.conversation': {
            kind: 'single';
            scope: 'session';
            owner: Record<never, never>;
        };
    }
}
declare module '@deepseek-ai/dsh-api-session-controller/client' {
    interface SessionReferenceSourceMap {
        videoView: unknown;
    }
}
export interface VideoPanelFace {
    hooks: {
        page: HostObservable<EmbeddedPageSnapshot>;
    };
    desktop: boolean;
    attachGuest(element: HTMLElement): () => void;
    attachNative(element: HTMLElement): () => void;
    retry(): Promise<void>;
}
export interface VideoOverlayFace {
    hooks: {
        views: HostObservable<VideoViewSnapshot>;
        geometry: HostObservable<SurfaceProjection>;
        page: HostObservable<EmbeddedPageSnapshot>;
    };
    applyReference(id: string): Promise<void>;
}
export declare const inject: string[];
/** Register the video page and native Conversation through reversible client effects. */
export declare function apply(ctx: Context): Promise<void>;
//# sourceMappingURL=index.d.ts.map