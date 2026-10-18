import { EmbeddedPageController } from '@deepseek-ai/dsh-client-ui-primitives';
import type { EmbeddedPageHost, EmbeddedPageScope } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
export interface VideoReference {
    id: string;
    text: string;
    files: readonly string[];
}
export interface VideoView {
    projectId: string;
    sessionId: string;
    reference: SessionReference;
    selected: boolean;
    references: readonly VideoReference[];
}
export interface VideoViewSnapshot {
    views: readonly VideoView[];
    errorCode: string | null;
}
/** Native project references survive panel changes, while an account change releases every old view. */
export declare class VideoPageController {
    private readonly retain;
    readonly page: EmbeddedPageController<'video'>;
    private readonly views;
    private readonly listeners;
    private snapshot;
    private revision;
    constructor(host: EmbeddedPageHost<'video'> | undefined, retain: (id: string) => SessionReference);
    getSnapshot: () => VideoViewSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    setScope(scope: EmbeddedPageScope | null): void;
    accept(value: unknown): boolean;
    acknowledgeReference(id: string): void;
    active(reference: SessionReference, id?: string): boolean;
    dispose(): void;
}
//# sourceMappingURL=video-controller.d.ts.map