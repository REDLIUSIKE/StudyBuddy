/** Independent native references remain retained while only project selection changes. */
import { EmbeddedPageController } from '@deepseek-ai/dsh-client-ui-primitives';
import type { EmbeddedPageHost } from '@deepseek-ai/dsh-client-ui-primitives';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { OwnedScope } from '@studybuddy/contracts';
export interface ResearchViewIntent {
    id: string;
    text: string;
    references: readonly string[];
}
export interface ResearchView {
    projectId: string;
    sessionId: string;
    reference: SessionReference;
    selected: boolean;
    intents: readonly ResearchViewIntent[];
}
export interface ResearchViewSnapshot {
    views: readonly ResearchView[];
    selectionError?: {
        projectId: string;
    };
}
/** Page admission and native view retention share the authenticated generation. */
export declare class ResearchPageController {
    private readonly retain;
    readonly page: EmbeddedPageController<'research'>;
    private views;
    private snapshot;
    private listeners;
    private revision;
    private selectionError;
    constructor(host: EmbeddedPageHost<'research'> | undefined, retain: (id: string) => SessionReference);
    getSnapshot: () => ResearchViewSnapshot;
    subscribe: (listener: () => void) => (() => void);
    private publish;
    setScope(scope: OwnedScope | null): void;
    accept(value: unknown): boolean;
    /** Remove only an intake acknowledged by the original native composer. */
    acknowledgeIntent(id: string): void;
    dispose(): void;
}
//# sourceMappingURL=research-controller.d.ts.map