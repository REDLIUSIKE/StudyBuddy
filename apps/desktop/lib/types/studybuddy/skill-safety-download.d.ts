import { type SkillScannerRelease } from './skill-safety-release.ts';
import { type SkillScannerResourceManifest } from './skill-safety-resources.ts';
/** Actual network response; the owner validates status, headers and every streamed byte. */
export interface SkillScannerDownloadReply {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: AsyncIterable<Uint8Array>;
    /** Close the response, including a rejected/unconsumed body, and await its transport. */
    close(): Promise<void>;
}
/** Real transport and disk boundary, without changing preparation or verification in tests. */
export interface SkillScannerDownloadDependencies {
    readonly open: (url: URL, signal: AbortSignal) => Promise<SkillScannerDownloadReply>;
    readonly freeBytes: (directory: string) => Promise<number>;
}
/** Keyless current resource state; HTTP completion is not readiness. */
export interface SkillScannerDownloadStatus {
    readonly state: 'missing' | 'downloading' | 'ready' | 'failed';
    readonly scannerVersion: '2.2.2';
    readonly receivedBytes: number;
    readonly totalBytes: number;
    readonly code?: string;
}
/** Private verified paths, never a renderer/model result. */
export interface SkillScannerVerifiedResources {
    readonly directory: string;
    readonly runtimeDirectory: string;
    readonly manifest: SkillScannerResourceManifest;
}
/** One native resource manager shared by manual and helper callers. */
export interface SkillScannerDownload {
    /** Inspect local bytes without downloading. */
    status(signal: AbortSignal): Promise<SkillScannerDownloadStatus>;
    /** Verify a cache or prepare it for the requesting caller. */
    prepare(signal: AbortSignal, onProgress?: (status: SkillScannerDownloadStatus) => void): Promise<SkillScannerVerifiedResources>;
    /** Stop owned work and await quiescence. */
    dispose(): Promise<void>;
}
/**
 * Create one fixed preparation owner; its external transport/disk operations may be injected.
 * @param input - Client-owned release and private cache/runtime roots, never model JSON.
 * @param dependencies - Native I/O boundaries; omitted for the actual desktop transport.
 * @returns One shared preparation owner; failures preserve other versions and clean only owned staging.
 */
export declare function createSkillScannerDownload(input: {
    release: SkillScannerRelease;
    cacheDirectory: string;
    runtimeDirectory: string;
}, dependencies?: SkillScannerDownloadDependencies): SkillScannerDownload;
//# sourceMappingURL=skill-safety-download.d.ts.map