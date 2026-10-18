import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Selects the Session actually displayed by the active main panel, without changing chat navigation. */
export declare class SidebarSessionSurfaces {
    private readonly panel;
    private readonly conversation;
    readonly source: import("@deepseek-ai/dsh-client-store").SnapshotStore<SessionId | undefined>;
    private readonly panels;
    private readonly stop;
    private disposed;
    constructor(panel: HostObservable<string | null>, conversation: HostObservable<SessionId | undefined>);
    /** Register one panel-owned selected Session source; disposal withdraws its preview surface immediately. */
    register(panelId: string, source: HostObservable<SessionId | undefined>): () => void;
    /** Release every source and clear the foreground Session when the provider unloads. */
    dispose(): void;
    private sync;
}
//# sourceMappingURL=session-surfaces.d.ts.map