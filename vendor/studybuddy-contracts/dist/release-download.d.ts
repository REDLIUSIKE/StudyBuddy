import { type DeviceProofInput } from "./device-authorization.js";
export type ReleaseManifestResponse = {
    packageCode: string;
    version: string;
    platform: "windows";
    architecture: "x64";
    channel: "stable";
    fileSizeBytes: string;
    sha256: string;
    publisherSignature: string;
    publishedAt: string;
};
export type DownloadTicketRequest = {
    packageCode: string;
    proof: DeviceProofInput;
};
export type DownloadTicketResponse = {
    ticket: string;
    expiresInSeconds: 600;
};
export type DownloadRedeemRequest = {
    ticket: string;
};
export type DownloadRedeemResponse = {
    downloadUrl: string;
    expiresInSeconds: number;
};
export type PublicWindowsReleaseArtifact = {
    kind: "installer_exe" | "portable_zip" | "updater_nsis";
    fileName: string;
    fileSizeBytes: string;
    sha256: string;
    downloadUrl: string;
    expiresInSeconds?: number;
};
export type PublicWindowsReleaseResponse = {
    packageCode: string;
    version: string;
    platform: "windows";
    architecture: "x64";
    channel: "stable";
    publishedAt: string;
    unsignedEarlyTest: boolean;
    artifacts: readonly [PublicWindowsReleaseArtifact] | readonly [
        PublicWindowsReleaseArtifact,
        PublicWindowsReleaseArtifact,
        PublicWindowsReleaseArtifact
    ];
};
export declare function parsePublicWindowsReleaseResponse(value: unknown): PublicWindowsReleaseResponse;
export declare function parseDownloadTicketRequest(value: unknown): DownloadTicketRequest;
export declare function parseDownloadRedeemRequest(value: unknown): DownloadRedeemRequest;
