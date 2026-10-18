import type { AppUpdater } from 'electron-updater';
/**
 * Verify Windows trust and timestamp after electron-updater has checked the downloaded file's hash.
 * @param _publishers - Legacy updater metadata; replacement certificate subjects are permitted.
 * @param path - Downloaded executable inspected as data, never executed.
 * @returns Null for a valid timestamped signature, or a rejection understood by NsisUpdater.
 */
export declare function verifyWindowsUpdateSignature(_publishers: string[], path: string): Promise<string | null>;
/**
 * Install the rotating-certificate policy on Windows NSIS updaters before any download starts.
 * @param updater - Process-owned updater, or an injected updater used by qualification.
 * @param platform - Runtime OS; other platform updaters keep their own signature checks.
 * @returns Download-scoped verification, or undefined for non-Windows/non-NSIS updaters.
 */
export declare function configureWindowsUpdateSignature(updater: AppUpdater, platform?: NodeJS.Platform): {
    beginDownload(): void;
    verifyDownload(files: string[]): Promise<void>;
} | undefined;
//# sourceMappingURL=windows-update-signature.d.ts.map