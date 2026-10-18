import type { ProductEvent } from '@deepseek-ai/dsh-client-product-analytics/types';
import { type DesktopAccountBackend } from './account-backend.ts';
/** Metadata needed before the native entry or workspace becomes visible. */
export interface WelcomeState {
    readonly loggedIn: boolean;
    readonly hasApiKey: boolean;
    readonly writable: boolean;
    readonly localePreference: string | null;
}
/** Narrow operations available to the native welcome flow. */
export interface DesktopWelcomeBackend {
    /** @returns the current Host policy; every read observes live configuration. */
    analyticsEnabled(): Promise<boolean>;
    readonly account: DesktopAccountBackend;
    /** @param event - desktop-owned fields. @returns after local Host intake. */
    report(event: ProductEvent): Promise<void>;
    /** @returns Configured-key presence and the shared language preference, without credential values. */
    read(): Promise<WelcomeState>;
    /** @returns The saved UI language without account or provider requests. */
    readLocalePreference(): Promise<string | null>;
    /**
     * @param apiKey - User-entered official provider key.
     * @returns A safe write outcome without provider diagnostics.
     */
    save(apiKey: string): Promise<{
        ok: boolean;
    }>;
}
/** Reuse the Main-owned Host cookie without a second browser-cookie exchange. */
export declare function connectAuthenticatedDesktopWelcome(authenticatedUrl: string, cookie: string, send?: (input: string, init?: RequestInit) => Promise<Response>): Promise<DesktopWelcomeBackend>;
/**
 * Authenticate the native HTTP client through the Web application's launch URL.
 * @param authenticatedUrl - URL supplied by the running Desktop Host.
 * @param send - Electron session fetch, retaining the Web authentication cookie.
 * @returns metadata reads and write-only credential operations over standard RPC.
 */
export declare function connectDesktopWelcome(authenticatedUrl: string, send: (input: string, init?: RequestInit) => Promise<Response>, cookies?: () => Promise<string>): Promise<DesktopWelcomeBackend>;
//# sourceMappingURL=welcome-backend.d.ts.map