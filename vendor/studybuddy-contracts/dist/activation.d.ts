export type UsbIdentityEnvelope = {
    payloadBase64url: string;
    signatureBase64url: string;
};
export type ActivationInspectResponse = {
    status: "claimable";
} | {
    status: "referral_required";
    referralToken: string;
    referralExpiresInSeconds: 604800;
} | {
    status: "revoked";
};
export interface ActivationClaimResponse {
    claimId: string;
    accessLevel: "lifetime";
    grantedAt: string;
}
export declare function parseActivationClaimResponse(value: unknown): ActivationClaimResponse;
export declare function parseUsbIdentityEnvelope(value: unknown): UsbIdentityEnvelope;
