import type { AccountClientMetadata, AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types';
/** Authenticated unary caller shared with native onboarding. */
export type AccountInvoke = (request: {
    namespace: string;
    method: string;
    args: Record<string, unknown>;
}) => Promise<unknown>;
/** Decode the UI-safe state received across HTTP or WebSocket. @param value - wire value. @returns account projection. */
export declare function accountView(value: unknown): AccountView;
/** Native account operations and explicitly owned stream lifetime. */
export interface DesktopAccountBackend {
    /** @returns current account snapshot. */
    state(): Promise<AccountView>;
    /** @param client - this window's identity and current language. @returns new or already-running login attempt. */
    start(client: AccountClientMetadata): Promise<AccountView>;
    /** @param id - attempt to cancel. @returns cancellation or completed commit state. */
    cancel(id: SignInAttemptId): Promise<AccountView>;
    /** @param client - this window's identity. @returns state after local sign-out. */
    signOut(client: AccountClientMetadata): Promise<AccountView>;
    /**
     * @param listener - state recipient.
     * @param failed - stream failure recipient.
     * @param expired - live credential-expiry recipient.
     * @param onAnalyticsEnabledChanged - optional Desktop collection-policy recipient; disconnected streams publish false.
     * @returns stream disposer.
     */
    watch(listener: (state: AccountView) => void, failed: () => void, expired: () => void, onAnalyticsEnabledChanged?: (enabled: boolean) => void): () => void;
}
/**
 * Connect native account operations to the standard authenticated Web backend.
 * @param origin - Host Web origin.
 * @param invoke - validated unary RPC caller.
 * @param cookies - Electron session cookie reader.
 * @returns account operations; watch callers own their subscriptions.
 */
export declare function desktopAccountBackend(origin: string, invoke: AccountInvoke, cookies: () => Promise<string>): DesktopAccountBackend;
//# sourceMappingURL=account-backend.d.ts.map