export type DeviceChallengePurpose = "bind" | "transfer" | "download";
export type DeviceProofInput = {
    challengeId: string;
    publicKeyBase64url: string;
    signatureBase64url: string;
};
export type DeviceChallengeRequest = {
    purpose: DeviceChallengePurpose;
};
export type DeviceMutationRequest = {
    displayName: string;
    proof: DeviceProofInput;
};
export type SupportResetRequest = {
    operatorId: string;
    reason: string;
};
export declare class DeviceMutationRequestParseError extends TypeError {
    readonly kind: "request" | "proof";
    constructor(kind: "request" | "proof", message: string);
}
export type DeviceChallengeResponse = {
    challengeId: string;
    challenge: string;
    expiresInSeconds: 300;
};
export type CurrentDeviceResponse = {
    device: null | {
        id: string;
        displayName: string;
        publicKeyFingerprint: string;
        boundAt: string;
    };
    selfTransfer: {
        allowed: boolean;
        availableAt: string | null;
    };
};
export type DeviceMutationResponse = {
    device: Exclude<CurrentDeviceResponse["device"], null>;
};
export declare function parseDeviceChallengePurpose(value: unknown): DeviceChallengePurpose;
export declare function parseCurrentDeviceResponse(value: unknown): CurrentDeviceResponse;
export declare function parseDeviceChallengeRequest(value: unknown): DeviceChallengeRequest;
export declare function parseDeviceProofInput(value: unknown): DeviceProofInput;
export declare function parseDeviceMutationRequest(value: unknown): DeviceMutationRequest;
export declare function parseDeviceDisplayName(value: unknown): string;
export declare function parseSupportResetRequest(value: unknown): SupportResetRequest;
export declare function parseIdempotencyKeyValue(value: unknown): string;
