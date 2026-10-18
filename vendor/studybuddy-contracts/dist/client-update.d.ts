export type ReleasePlatform = "windows" | "macos";
export type ReleaseArchitecture = "x64" | "aarch64";
export type ReleaseChannel = "stable";
export type ReleaseArtifactKind = "nsis" | "app_tar_gz";
export type ReleaseTarget = {
    platform: ReleasePlatform;
    architecture: ReleaseArchitecture;
    artifactKind: ReleaseArtifactKind;
};
export type DynamicUpdateResponse = {
    version: string;
    pub_date: string;
    url: string;
    signature: string;
    notes: string;
    release_id: string;
    sha256: string;
    file_size_bytes: string;
};
export type PersistedUpdateNotice = {
    targetVersion: string;
    notes: string;
    publishedAt: string;
    confirmedAt: string;
    releaseId: string;
};
export type UpdateStateView = {
    status: "checking";
    currentVersion: string;
} | {
    status: "current";
    currentVersion: string;
    checkedAt: string;
} | {
    status: "available";
    currentVersion: string;
    targetVersion: string;
    notes: string;
    publishedAt: string;
} | {
    status: "downloading";
    currentVersion: string;
    targetVersion: string;
    downloadedBytes: string;
    totalBytes: string | null;
} | {
    status: "verifying";
    currentVersion: string;
    targetVersion: string;
} | {
    status: "installing";
    currentVersion: string;
    targetVersion: string;
} | {
    status: "failed";
    currentVersion: string;
    targetVersion: string | null;
    errorCode: string;
    retryable: boolean;
} | {
    status: "unavailable";
    currentVersion: string;
    lastKnownUpdate: PersistedUpdateNotice | null;
};
export declare function parseReleaseTarget(value: unknown): ReleaseTarget;
export declare function parseDynamicUpdateResponse(value: unknown): DynamicUpdateResponse;
export declare function parsePersistedUpdateNotice(value: unknown): PersistedUpdateNotice;
export declare function parseUpdateStateView(value: unknown): UpdateStateView;
