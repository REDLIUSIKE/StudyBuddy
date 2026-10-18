export declare const DESKTOP_AUTH_REQUEST_TTL_SECONDS: 300;
export declare const DESKTOP_AUTH_CODE_TTL_SECONDS: 60;
export declare const DESKTOP_AUTH_POLL_INTERVAL_MILLISECONDS: 2000;
export declare const CURRENT_TERMS_VERSION: "2026-08-08";
export declare const CURRENT_PRIVACY_VERSION: "2026-08-08";
export type DesktopAuthStatus = "pending" | "approved" | "consumed" | "cancelled" | "expired";
export type DesktopAuthStartRequest = {
    state: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    clientLabel: "StudyBuddy Windows";
};
export type DesktopAuthStartResponse = {
    requestId: string;
    authorizationUrl: string;
    cancelToken: string;
    pollToken: string;
    nextPollAfterMs: 2000;
    expiresInSeconds: 300;
};
export type DesktopAuthRequestView = {
    status: "pending" | "approved" | "cancelled" | "expired";
};
export type DesktopAuthApproveResponse = {
    redirectUrl: string;
};
export type DesktopAuthExchangeRequest = {
    authorizationCode: string;
    codeVerifier: string;
};
export type DesktopAuthCancelRequest = {
    requestId: string;
    cancelToken: string;
};
export type DesktopAuthPollRequest = {
    requestId: string;
    pollToken: string;
    codeVerifier: string;
};
export type DesktopAuthPollResponse = {
    status: "pending";
    nextPollAfterMs: 2000;
} | {
    status: "authenticated";
    accessToken: string;
    accessTokenExpiresInSeconds: 900;
    refreshToken: string;
    refreshTokenExpiresInSeconds: 2592000;
};
export type DesktopAuthCallback = {
    authorizationCode: string;
    state: string;
};
export declare function parseDesktopAuthStartRequest(value: unknown): DesktopAuthStartRequest;
export declare function parseDesktopAuthStartResponse(value: unknown): DesktopAuthStartResponse;
export declare function parseDesktopAuthRequestView(value: unknown): DesktopAuthRequestView;
export declare function parseDesktopAuthApproveResponse(value: unknown): DesktopAuthApproveResponse;
export declare function parseDesktopAuthExchangeRequest(value: unknown): DesktopAuthExchangeRequest;
export declare function parseDesktopAuthCancelRequest(value: unknown): DesktopAuthCancelRequest;
export declare function parseDesktopAuthPollRequest(value: unknown): DesktopAuthPollRequest;
export declare function parseDesktopAuthPollResponse(value: unknown): DesktopAuthPollResponse;
export declare function parseDesktopAuthCallback(value: unknown): DesktopAuthCallback;
export declare function isDesktopAuthCallback(value: unknown): value is string;
//# sourceMappingURL=browser-auth.d.ts.map