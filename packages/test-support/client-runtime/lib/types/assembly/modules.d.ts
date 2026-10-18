import type { ClientModuleLoader, WebBootGraph } from '@deepseek-ai/dsh-client-modules/client';
import type { AssemblyPlan, ClientPluginModule } from './roster.ts';
/** The bootstrap row: always this process's static namespace, never a dynamic import or a `provide` replacement. */
export declare const MODULES_PACKAGE = "@deepseek-ai/dsh-client-modules";
/**
 * Resolve each roster row to its plugin module: `plan.provide[name]` when
 * present, otherwise a `/client` import resolved by the repository's tsconfig
 * path aliases under Vitest. The bootstrap row is the
 * statically imported `@deepseek-ai/dsh-client-modules/client` namespace.
 * @param plan - validated plan.
 * @returns package name → module, in roster order.
 * @throws {Error} when an import fails (the package name prefixes the original message) or the bootstrap row is provided.
 */
export declare function loadPluginModules(plan: AssemblyPlan): Promise<ReadonlyMap<string, ClientPluginModule>>;
/**
 * Build the production module system over queued factories returning the
 * loaded namespaces. The bootstrap row uses `bootstrapModule`; `staticModules`
 * is empty because namespaces already hold their own imports. Missing factories
 * reject through `loadBundle` without fetching.
 * @param graph - raw boot graph from `graphFromRoster`; `createClientModuleSystem` parses it.
 * @param modules - loaded plugin modules keyed by package name.
 * @returns module system to install as `loader.internal`; its `manifest` is the parsed graph.
 */
export declare function createInProcessModules(graph: WebBootGraph, modules: ReadonlyMap<string, ClientPluginModule>): ClientModuleLoader;
//# sourceMappingURL=modules.d.ts.map