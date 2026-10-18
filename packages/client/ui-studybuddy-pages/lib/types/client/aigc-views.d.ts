/** Native Session references belong to project identity; guest rectangles never own a Conversation. */
import type { OwnedScope } from '@studybuddy/contracts';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SurfaceProjection } from '@deepseek-ai/dsh-client-ui-primitives';
interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface AigcView {
    projectId: string;
    workspaceId: string;
    sessionId: string;
    reference: SessionReference;
    selected: boolean;
}
interface AigcReference {
    id: string;
    sessionId: string;
    text: string;
}
export interface AigcViewSnapshot {
    views: readonly AigcView[];
    geometry: SurfaceProjection;
    errorCode?: string;
    interactionSessionId?: string;
    interactionId?: string;
    references: readonly AigcReference[];
}
export declare class AigcViews {
    private readonly retain;
    private scope;
    private lease;
    private frame;
    private surface;
    private revision;
    private readonly interactions;
    private readonly references;
    private readonly views;
    private readonly listeners;
    private snapshot;
    constructor(retain: (id: string) => SessionReference);
    getSnapshot: () => AigcViewSnapshot;
    subscribe: (listener: () => void) => () => void;
    private publish;
    setFrame(value: Rect | null): void;
    acknowledgeReference(id: string): void;
    setScope(scope: OwnedScope | null, lease: string | null): void;
    accept(value: unknown): boolean;
    dispose(): void;
}
export {};
//# sourceMappingURL=aigc-views.d.ts.map