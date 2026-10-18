import { type ServiceBackendProvisioningStatus } from "./access.js";
export declare const EMAIL_CHALLENGE_TTL_SECONDS: 300;
export declare const EMAIL_RESEND_SECONDS: 60;
export type EmailChallengeResponse = {
    challengeExpiresInSeconds: 300;
    resendAfterSeconds: 60;
};
export type BrowserUserView = {
    id: string;
    emailMasked?: string;
    phoneMasked?: string;
    serviceBackendStatus: ServiceBackendProvisioningStatus;
};
export declare function normalizeEmailAddress(value: unknown): string;
export declare function parseEmailChallengeResponse(value: unknown): EmailChallengeResponse;
export declare function parseBrowserUserView(value: unknown): BrowserUserView;
