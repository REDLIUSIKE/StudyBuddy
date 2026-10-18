/** Original business pages admitted by the desktop, independently of model consumers. */
import type { EmbeddedLease, EmbeddedTheme, OwnedScope } from '@studybuddy/contracts';
export type CommunityTarget = 'zhilian' | 'skills';
/** The local shell receives leases and theme operations, never login credentials. */
export interface CommunitySurfaceHost {
    acquire(target: CommunityTarget): Promise<EmbeddedLease>;
    release(lease: string): Promise<void>;
    setTheme(lease: string, theme: EmbeddedTheme): Promise<void>;
    setVisible(lease: string, visible: boolean): Promise<void>;
    subscribeInvalid(listener: (lease: string) => void): () => void;
    subscribeNavigation(listener: (notice: {
        scope: OwnedScope;
        target: 'tools' | CommunityTarget;
    }) => void): () => void;
}
/** Dedicated channels keep remote Skill operations outside the model and tool-center bridge. */
export declare const COMMUNITY_IPC: {
    readonly acquire: "studybuddy:community-acquire";
    readonly release: "studybuddy:community-release";
    readonly theme: "studybuddy:community-theme";
    readonly visible: "studybuddy:community-visible";
    readonly invalid: "studybuddy:community-invalid";
    readonly navigation: "studybuddy:community-navigation";
    readonly startup: "studybuddy:skill-startup";
    readonly invoke: "studybuddy:skill-invoke";
    readonly event: "studybuddy:skill-event";
};
//# sourceMappingURL=community-types.d.ts.map