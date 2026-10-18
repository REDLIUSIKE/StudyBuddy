/** Resolve packaged Office engine manifests from their complete, unpacked resource directories. */
import { type ModuleHooks } from 'node:module';
/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export declare function runtimeArchivePath(runtimeDir: string): string | undefined;
/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 * Hooks apply only to this thread; worker threads must install their own resolver.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export declare function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined;
//# sourceMappingURL=office-engine.d.ts.map