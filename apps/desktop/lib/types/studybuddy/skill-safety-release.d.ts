/** Stable keyless preparation failure; internal causes are never serialized to model/UI results. */
export declare class SkillScannerResourceError extends Error {
    readonly code: 'SKILL_SAFETY_RESOURCE_INVALID' | 'SKILL_SAFETY_RESOURCE_DISK_SPACE' | 'SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED' | 'SKILL_SAFETY_CANCELLED';
    constructor(code: 'SKILL_SAFETY_RESOURCE_INVALID' | 'SKILL_SAFETY_RESOURCE_DISK_SPACE' | 'SKILL_SAFETY_RESOURCE_DOWNLOAD_FAILED' | 'SKILL_SAFETY_CANCELLED', cause?: unknown);
}
export interface SkillScannerRelease {
    readonly schemaVersion: 1;
    readonly target: 'win32-x64';
    readonly pythonVersion: '3.12.14';
    readonly scannerVersion: '2.2.2';
    readonly archiveUrl: string;
    readonly archiveSha256: string;
    readonly archiveSizeBytes: number;
    readonly manifestSha256: string;
    readonly extractedSizeBytes: number;
    readonly fileCount: number;
}
/**
 * Validate one descriptor read from the client-owned file.
 * @param value - Untrusted file JSON, not an inference/tool input.
 * @returns Fixed origin, artifact digest, sizes and runtime identity.
 * @throws For extra fields, unsupported versions or expanded download authority.
 */
export declare function parseSkillScannerRelease(value: unknown): SkillScannerRelease;
//# sourceMappingURL=skill-safety-release.d.ts.map