/** Mandatory-update policy, independent of local business traffic and updater artifacts. */
import { type AccountClientMetadata } from '@deepseek-ai/dsh-deepseek-account';
/** Installed release identity; no field is supplied by a renderer. */
export interface DesktopPolicyIdentity {
    readonly platform: 'win32' | 'darwin';
    readonly bundledDshVersion: string;
    readonly arch: 'x64' | 'arm64';
    readonly channel: 'latest' | 'nightly';
}
/** Validated deployment choices; test authentication is explicitly enabled, never inferred from a redirect. */
export interface DesktopPolicyConfig {
    readonly origin: string;
    readonly allowedPageOrigins: readonly string[];
    readonly allowedAuthOrigins: readonly string[];
    readonly intervalMs: number;
    readonly timeoutMs: number;
    readonly maxBackoffMs: number;
    readonly jitter: number;
    readonly authentication: 'anonymous' | 'feishu-test';
}
/** A known block survives transport and parsing failures, but not a fresh no-force success. */
export interface DesktopPolicyState {
    readonly blocking: boolean;
    readonly checking: boolean;
    readonly title?: string;
    readonly detail?: string;
    readonly page?: string;
    readonly error?: 'unavailable' | 'authentication-required';
}
/**
 * Resolve deployment JSON without guessing a production service or download destination.
 * @param input - Parsed configuration with origin and allowedPageOrigins; absent configuration disables policy queries.
 * @param allowLoopback - Explicit unpackaged/test permission for an HTTP 127.0.0.1 policy origin only.
 * @returns Validated polling options, or undefined when unconfigured.
 */
export declare function resolveDesktopPolicyConfig(input: unknown, allowLoopback?: boolean): DesktopPolicyConfig | undefined;
/**
 * Validate the fallback page immediately before browser or clipboard use.
 * @param value - Policy-provided page, never an updater feed or shell command.
 * @param allowedOrigins - Exact HTTPS origins from deployment configuration.
 * @returns Normalized allowed URL, or undefined for a missing/disallowed destination.
 */
export declare function desktopPolicyPage(value: unknown, allowedOrigins: readonly string[]): string | undefined;
/** Owns one installed-client context, its in-flight request, and polling schedule. */
export declare class DesktopMandatoryUpdatePolicy {
    private readonly config;
    private readonly identity;
    private readonly publish;
    private readonly request;
    private readonly client;
    private readonly random;
    private current;
    private pending;
    private controller;
    private timer;
    private disposed;
    private failures;
    private nextCheck;
    /**
     * @param config - Resolved deployment settings.
     * @param identity - Installed software identity, fixed for this application build.
     * @param publish - Receives policy changes without controlling downloads or existing tasks.
     * @param request - Anonymous Fetch or the dedicated test-authentication Session transport.
     * @param client - UI build version, language, and UTC offset, sampled for every check.
     * @param random - Jitter source, replaceable for clock-driven tests.
     */
    constructor(config: DesktopPolicyConfig, identity: DesktopPolicyIdentity, publish: (state: DesktopPolicyState) => void, request: typeof fetch | undefined, client: () => AccountClientMetadata, random?: () => number);
    /** Platform headers for one check; the calling UI's language and UTC offset are read now. */
    private requestHeaders;
    /** Latest policy; failures never erase a known mandatory decision. */
    get state(): DesktopPolicyState;
    /**
     * Check immediately when manual, otherwise only when due; matching concurrent callers share one request.
     * @param scenario - Trigger recorded in the query, independent of backend matching.
     * @param manual - Bypass interval/backoff without bypassing request coalescing.
     * @returns Current decision or retained decision with an error; disposed instances reject.
     */
    check(scenario: string, manual?: boolean): Promise<DesktopPolicyState>;
    /** Abort the owned request and await settlement; late responses cannot publish or schedule work. */
    dispose(): Promise<void>;
    private setState;
}
//# sourceMappingURL=mandatory-update-policy.d.ts.map