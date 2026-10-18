/** In-memory profile package routing for Node's default ESM and CommonJS loaders. */
import type { RuntimeResolution } from '../profile.ts';
/** Active interception in one Node isolate. */
export interface RuntimeInterception {
    /**
     * Locate a bare package without requiring one of its exports.
     * A package subpath selects its package directory without resolving or validating the requested file.
     * @param specifier - bare package or package-subpath specifier.
     * @param parentURL - file URL whose lookup order applies.
     * @returns selected package directory, or undefined when it is absent.
     */
    packageDir(specifier: string, parentURL: string): string | undefined;
    /**
     * Atomically publish a complete successor and fresh caches. Profile-scoped mappings, local names, and linked
     * roots may be removed; removed roots stop intercepting uncovered directories. Existing modules and Node caches
     * remain intact, so callers remove a package only after its plugins stop.
     * A retained profile mapping may change its declarer if its normalized directory, version, and scope stay unchanged.
     * @param successor - fully constructed generation retaining the installation mappings.
     * @throws when the profile scope, a retained directory, version, scope, or installation declarer changes;
     * an installation mapping is removed; a new local name overrides an existing mapping; or a previously published
     * link name selects a different real directory.
     */
    replace(successor: RuntimeResolution): void;
    /** Restore the native resolver methods. Interceptions dispose in reverse order. */
    dispose(): void;
}
/**
 * Split a bare request into its package name without allocating path segments.
 * @param request - module specifier to classify.
 * @returns the bare package name, or undefined for non-package requests.
 */
export declare function barePackageName(request: string): string | undefined;
/**
 * Install one runtime resolution as the interception on Node's default ESM and CommonJS resolvers.
 * @param resolution - complete package table and profile scope.
 * @returns an interception that publishes a successor or restores the native methods.
 */
export declare function installRuntimeInterception(resolution: RuntimeResolution): RuntimeInterception;
/**
 * Publish one runtime resolution for Harness-owned Workers.
 * @param resolution - complete package table and profile scope.
 * @returns a disposer restoring the previous thread environment data.
 */
export declare function registerWorkerResolution(resolution: RuntimeResolution): () => void;
//# sourceMappingURL=resolver.d.ts.map