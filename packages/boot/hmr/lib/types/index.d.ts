import { Context, Service, type Fiber, type Plugin } from '@deepseek-ai/cordis';
import type { ModuleJob } from '@deepseek-ai/cordis-plugin-loader';
import { type ChokidarOptions } from 'chokidar';
import z from '@deepseek-ai/schemastery';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Serialized plugin-code and configuration reloads. */
        hmr: Hmr;
    }
    interface Events {
        /** A watched file has no module or configuration handler.
         * @mode emit
         * @param url Canonical file URL.
         */
        'hmr/change'(url: string): void;
        /** Module replacements have finished loading.
         * @mode emit
         * @param reloads Replaced plugins and their module locations.
         */
        'hmr/reload'(reloads: Map<Plugin, Reload>): void;
    }
}
/** Module roots and watcher timing, with Chokidar deployment options. */
export interface HmrConfig extends ChokidarOptions {
    /** Directory resolved against the owning context's base URL. */
    base?: string;
    /** Module watch roots; an empty list leaves only explicit configuration watches. */
    root: string[];
    /** Milliseconds for combining module changes. */
    debounce: number;
    /** Glob patterns excluded from module watching. */
    ignored: string[];
}
/** Module location and runtime retained during a replacement. */
export interface Reload {
    filename: string;
    /** Original namespaces and URLs of all entry modules participating in this runtime replacement. */
    modules: ReloadModules;
    runtime?: Plugin.Runtime | undefined;
}
type ReloadFiber = {
    fiber: Fiber;
    entry: Fiber['entry'];
    config: unknown;
    moduleNamespace: unknown;
};
type ReloadModule = {
    filename: string;
    moduleNamespace: unknown;
    plugin: Plugin;
};
/** Entry modules belonging to one runtime, keyed by their original namespaces across replacement. */
declare class ReloadModules {
    private readonly modules;
    static include(reloads: ReadonlyMap<Plugin, Reload>, plugin: Plugin, job: ModuleJob, runtime: Plugin.Runtime | undefined): boolean;
    add(job: ModuleJob, plugin: Plugin): this;
    importRemaining(loader: Context['loader'], getOuterStack: () => string[], primary: ReloadModule): Promise<ReloadModules>;
    getActiveImplementations(ctx: Context, plugin: Plugin, fibers: readonly ReloadFiber[]): Generator<[ReloadFiber, Plugin]>;
    updateEntries(loader: Context['loader']): void;
}
/** Hot reload service with Cordis-compatible module configuration and events. */
declare class Hmr extends Service {
    config: HmrConfig;
    /** Cordis-compatible watcher defaults. */
    static Config: z<HmrConfig>;
    /** Absolute base directory used to resolve module watch roots. */
    baseDir: string;
    private readonly ownerContext;
    private internal;
    private watcher;
    /**
     * Changes from externals will always trigger a full reload.
     * Externals are the dependency tree of the CLI worker entry point.
     */
    private externals;
    /**
     * Files that should be reloaded (accepted changes).
     * Includes all stashed files and their dependents.
     */
    private accepted;
    /**
     * Files that should NOT be reloaded.
     * Includes externals and files whose dependents are all declined.
     */
    private declined;
    /** Stashed file changes waiting to be processed */
    private stashed;
    private operations;
    private readonly executing;
    private applicationReady;
    private closing;
    private readonly configPaths;
    private readonly manifests;
    /** Serialize a caller-owned mutation with all automatic reload paths.
     * @param operation Work that must not overlap module or configuration replacement.
     * @returns The operation result after its asynchronous work completes.
     */
    runExclusive<T>(operation: () => Promise<T>): Promise<T>;
    private runReload;
    /** Watch a configuration path through the same queue as module replacement.
     * @param filename Absolute path, which may not exist yet.
     * @param refresh Rebuilds configuration from its current files and awaits Loader completion.
     * @returns Disposer closing this registration and waiting for its pending refresh.
     */
    watchConfig(filename: string, refresh: () => Promise<void>): Promise<() => Promise<void>>;
    constructor(ctx: Context, config: HmrConfig);
    [Service.init](): AsyncGenerator<() => Promise<void>, void, unknown>;
    /** Omit internal HMR frames from module import diagnostics.
     * @returns The preserved outer stack frames.
     */
    getOuterStack: () => string[];
    /** Read direct module dependency URLs from the active Node loader.
     * @param url Module URL.
     * @returns Linked module URLs, or an empty list for an uncached module.
     */
    getLinked(url: string): Promise<string[]>;
    /**
     * Classify changed files into accepted (should reload) and declined (should not).
     *
     * A file is accepted if it's directly changed (stashed) or if any of its
     * dependents are accepted. A file is declined if all its dependents are
     * declined or if it's an external.
     */
    private analyzeChanges;
    private partialReload;
}
declare namespace Hmr {
    /** Cordis-compatible configuration type. */
    type Config = HmrConfig;
}
export default Hmr;
//# sourceMappingURL=index.d.ts.map