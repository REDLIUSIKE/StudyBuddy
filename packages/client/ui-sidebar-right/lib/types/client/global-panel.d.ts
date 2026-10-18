import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { SidebarRightPresentation } from './shell/SidebarRight.tsx';
/** Root presentation that temporarily covers, rather than replaces, Session previews. */
export declare class GlobalRightPanel {
    private readonly layout;
    readonly source: import("@deepseek-ai/dsh-client-store").SnapshotStore<string | null>;
    private sessionVisible;
    private session;
    constructor(layout: Pick<ILayout, 'openRightbar' | 'closeRightbar'>);
    /** @param key - registered root panel key. */
    open(key: string): void;
    /** Restore the current context without navigating to a previous Session. */
    close(): void;
    /** @param visible - whether the main column currently displays Conversation. */
    setSessionVisible(visible: boolean): void;
    /** @param presentation - active Session's committed presentation. */
    reportSession(presentation: SidebarRightPresentation): void;
    private presentSession;
}
//# sourceMappingURL=global-panel.d.ts.map