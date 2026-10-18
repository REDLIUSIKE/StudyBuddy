import { BrowserWindow } from 'electron';
import type { DesktopLocale } from './locale.ts';
/** Navigation completion is not proof of authentication or a valid update policy. */
export type DesktopPolicyLoginResult = 'returned' | 'cancelled' | 'failed';
/** Owns the login window and its nonpersistent Session; no product window shares its cookies or privileges. */
export declare class DesktopPolicyTestAuth {
    private readonly origin;
    private readonly allowedAuthOrigins;
    private readonly locale;
    private readonly parent;
    private readonly record;
    private readonly browserSession;
    private window;
    private pending;
    private disposed;
    private rejectLogin;
    /** Return to an existing login window without starting another authentication flow. */
    focus(): void;
    /**
     * @param origin Validated HTTPS policy origin; login always starts at its root with fresh gateway state.
     * @param allowedAuthOrigins Validated HTTPS origins for login document navigation.
     * @param locale Shell-owned login title.
     * @param parent Current application or mandatory-update window.
     * @param record Fixed, nonsecret login outcomes for diagnostic evidence.
     */
    constructor(origin: string, allowedAuthOrigins: readonly string[], locale: DesktopLocale, parent: () => BrowserWindow | undefined, record: (event: 'opened' | DesktopPolicyLoginResult) => void);
    /**
     * Send only the configured policy request through the login Session; redirects remain forbidden.
     * @param input Policy URL supplied by the main-process coordinator.
     * @param init Request headers, credentials, and cancellation owned by that coordinator.
     * @returns Chromium response without exposing cookies to JavaScript.
     */
    readonly request: typeof fetch;
    /**
     * Open only after a user action; repeated callers focus and join the same login.
     * @returns Navigation, cancellation, or failure; the caller must query policy after returning.
     */
    login(): Promise<DesktopPolicyLoginResult>;
    /** Close the login and erase session data after the policy coordinator has stopped its requests. */
    dispose(): Promise<void>;
    private allowed;
    /**
     * Recognize the owned placeholder document. Only the request filter and the
     * load-failure handler accept it; navigation events still require {@link allowed},
     * so the remote page cannot steer the window back to a local file.
     */
    private isLoadingDocument;
}
//# sourceMappingURL=policy-test-auth.d.ts.map