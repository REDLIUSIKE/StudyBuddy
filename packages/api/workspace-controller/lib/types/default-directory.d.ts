/** Resolve the Host account's Documents directory for first-use Workspace creation. */
import { type NativeCommandRunner } from '@deepseek-ai/dsh-native-command';
/** Platform observations replaceable in directory-resolution tests. */
interface DocumentsDirectoryInternals {
    readonly platform?: NodeJS.Platform;
    readonly home?: string;
    readonly run?: NativeCommandRunner;
}
/**
 * Validate a configured or OS-returned Documents path without resolving it against cwd.
 * @param directory - fully qualified directory spelling.
 * @param platform - Host platform.
 * @returns the normalized directory.
 */
export declare function validateDocumentsDirectory(directory: string, platform?: NodeJS.Platform): string;
/**
 * Resolve the Host account's system Documents directory without creating files.
 * @param documentsDirectory - explicit deployment override for the system Documents directory.
 * @param signal - caller lifetime and lookup deadline.
 * @param internals - platform facts and native command runner.
 * @returns the absolute system Documents path.
 */
export declare function resolveDocumentsDirectory(documentsDirectory: string | undefined, signal: AbortSignal, internals?: DocumentsDirectoryInternals): Promise<string>;
/**
 * Resolve the first-use Workspace location without creating directories.
 * @param documentsDirectory - system Documents override.
 * @param signal - caller lifetime and deadline.
 * @param internals - platform observations for native lookup.
 * @returns the fully qualified first-use Workspace path.
 */
export declare function defaultWorkspaceDirectory(documentsDirectory: string | undefined, signal: AbortSignal, internals?: DocumentsDirectoryInternals): Promise<string>;
export {};
//# sourceMappingURL=default-directory.d.ts.map