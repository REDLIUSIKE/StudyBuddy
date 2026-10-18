/** UI-safe login state. Master login credentials never cross the preload boundary. */
import type { BusinessOperationMap, EmbeddedLease, EmbeddedTheme, OwnedScope, ToolViewLease, ToolSurfaceBounds, ToolNavigationNotice, HarnessSupportApi } from '@studybuddy/contracts';
import type { CommunitySurfaceHost } from './community-types.ts';
import type { AigcSurfaceHost } from './aigc-types.ts';
import type { ResearchSurfaceHost } from './research-types.ts';
import type { VideoSurfaceHost } from './video-types.ts';
export interface ToolsSurfaceHost {
    acquire(target?: 'tools' | 'labs'): Promise<ToolViewLease>;
    resize(lease: string, bounds: ToolSurfaceBounds): Promise<void>;
    setVisible(lease: string, visible: boolean): Promise<void>;
    setTheme(lease: string, theme: EmbeddedTheme): Promise<void>;
    release(lease: string): Promise<void>;
    subscribeInvalid(listener: (lease: string) => void): () => void;
}
export interface StudyBuddyAccount {
    readonly id: string;
    readonly label: string;
}
/** Original native LogoutView facts; remote revocation and local repair are independent. */
export interface StudyBuddyLogoutOutcome {
    readonly localCleared: boolean;
    readonly remoteRevoked: boolean;
    readonly persistentCleanupRequired: boolean;
}
/** Private native startup status. No credential or account content is returned. */
export type StudyBuddyLogoutRecovery = {
    readonly state: 'none';
} | {
    readonly state: 'pending' | 'complete';
    readonly outcome: StudyBuddyLogoutOutcome;
    readonly error?: {
        readonly code: string;
    };
};
export interface StudyBuddyAuthState {
    readonly phase: 'signed-out' | 'starting' | 'waiting' | 'authenticated' | 'error';
    readonly account?: StudyBuddyAccount;
    readonly message?: string;
    readonly scope?: OwnedScope | null;
    readonly logoutOutcome?: StudyBuddyLogoutOutcome;
    /** A retained logout blocks login until the original native outcome is known. */
    readonly logoutPending?: boolean;
    /** Startup detection failed before a cleanup outcome was known; retry checks without requesting logout. */
    readonly startupRecoveryFailed?: boolean;
}
export interface StudyBuddyUpdateState {
    readonly phase: 'idle' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error';
    readonly version?: string;
    readonly message: string;
}
export interface StudyBuddyApi {
    readonly prompts?: {
        invoke(method: 'mine' | 'square' | 'save' | 'publish', args: readonly unknown[]): Promise<unknown>;
    };
    readonly support?: HarnessSupportApi;
    readonly aigc?: AigcSurfaceHost;
    readonly research?: ResearchSurfaceHost;
    readonly video?: VideoSurfaceHost;
    readonly community?: CommunitySurfaceHost;
    readonly tools?: ToolsSurfaceHost;
    subscribeNavigation?(listener: (notice: ToolNavigationNotice) => void): () => void;
    readonly business?: {
        invoke<K extends keyof BusinessOperationMap>(method: K, args: BusinessOperationMap[K]['args']): Promise<BusinessOperationMap[K]['result']>;
    };
    readonly embedded?: {
        acquire(target: 'personal_profile' | 'model_insights'): Promise<EmbeddedLease>;
        release(lease: string): Promise<void>;
        setTheme(lease: string, theme: EmbeddedTheme): Promise<void>;
        subscribeInvalid?(listener: (lease: string) => void): () => void;
    };
    status(this: void): Promise<StudyBuddyAuthState>;
    start(this: void): Promise<StudyBuddyAuthState>;
    cancel(this: void): Promise<StudyBuddyAuthState>;
    logout(this: void): Promise<StudyBuddyAuthState>;
    checkUpdates(this: void): Promise<StudyBuddyUpdateState>;
    subscribe(listener: (state: StudyBuddyAuthState) => void): () => void;
}
/** Private product channels; no renderer-supplied URL or token is accepted. */
export declare const STUDYBUDDY_IPC: {
    readonly status: "studybuddy:auth-status";
    readonly start: "studybuddy:auth-start";
    readonly cancel: "studybuddy:auth-cancel";
    readonly logout: "studybuddy:auth-logout";
    readonly state: "studybuddy:auth-state";
    readonly updates: "studybuddy:updates-check";
    readonly business: "studybuddy:business-invoke";
    readonly embeddedAcquire: "studybuddy:embedded-acquire";
    readonly embeddedRelease: "studybuddy:embedded-release";
    readonly embeddedTheme: "studybuddy:embedded-theme";
    readonly embeddedInvalid: "studybuddy:embedded-invalid";
    readonly toolsAcquire: "studybuddy:tools-acquire";
    readonly toolsResize: "studybuddy:tools-resize";
    readonly toolsVisible: "studybuddy:tools-visible";
    readonly toolsTheme: "studybuddy:tools-theme";
    readonly toolsRelease: "studybuddy:tools-release";
    readonly toolsInvalid: "studybuddy:tools-invalid";
    readonly toolPageState: "studybuddy:tool-page-state";
    readonly toolOperation: "studybuddy:tool-operation";
    readonly toolNavigate: "studybuddy:tool-navigate";
    readonly toolInstallSubscribe: "studybuddy:tool-install-subscribe";
    readonly toolInstallUnsubscribe: "studybuddy:tool-install-unsubscribe";
    readonly toolInstallEvent: "studybuddy:tool-install-event";
    readonly toolNavigation: "studybuddy:tool-navigation";
};
//# sourceMappingURL=types.d.ts.map