/** Reversible command-link ownership; operations never follow or overwrite a changed command entry. */
/** Fixed installation locations supplied by the Desktop shell. */
export interface FileCommandInstallation {
    readonly destination: string;
    readonly launcher: string;
    readonly linkHelper: string;
}
type Entry = {
    readonly kind: 'symlink';
    readonly fingerprint: string;
    readonly target: string;
} | {
    readonly kind: 'missing' | 'file' | 'unsupported';
    readonly fingerprint: string;
};
/** State displayed before a command-management operation. */
export interface CommandInspection {
    readonly fingerprint: string;
    readonly destination: string;
    readonly launcher: string;
    readonly kind: Entry['kind'];
    readonly managed: boolean;
    readonly available: boolean;
    readonly target?: string;
    readonly backup?: string;
    readonly preservedBackup?: string;
}
/** A declined stale operation or a command entry outside this installer's ownership. */
export declare class CommandInstallationError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Read the command and receipt without changing either.
 * @param options - Fixed command destination and current installed launcher.
 * @returns A fingerprint to bind a later user decision to the observed entries.
 */
export declare function inspectFileCommand(options: FileCommandInstallation): Promise<CommandInspection>;
/**
 * Install or repair a link, keeping the previous launcher available for removal.
 * @param options - Fixed command destination and current installed launcher.
 * @param expected - Fingerprint displayed in the user's confirmation.
 * @returns Updated state and any older backup preserved after an external command replacement.
 */
export declare function installFileCommand(options: FileCommandInstallation, expected: string): Promise<CommandInspection>;
/**
 * Remove only a recorded Desktop link and restore its unchanged previous entry.
 * @param options - Fixed command destination and current installed launcher.
 * @param expected - Fingerprint displayed when removal was requested.
 * @returns State after removal; an externally replaced command remains untouched.
 */
export declare function removeFileCommand(options: FileCommandInstallation, expected: string): Promise<CommandInspection>;
export {};
//# sourceMappingURL=command-installation.d.ts.map