var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
/** Serialized module and profile-configuration reloads. */
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { watchConfig as watchExactConfig } from "./watch-config.js";
import { Inject, Service } from '@deepseek-ai/cordis';
import { watch } from 'chokidar';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { readProfileManifest, readProfilePatches, reconcileProfilePatches, PROFILE_PATCH_FILENAME } from '@deepseek-ai/dsh-app-boot';
import { handleError } from "./error.js";
import { PackageManifests } from "./package-manifest.js";
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import picomatch from 'picomatch';
import z from '@deepseek-ai/schemastery';
function canonicalPath(filename) {
    // Node's ESM resolver uses the JS realpath implementation; native realpath
    // expands Windows short names differently and would miss its cache keys.
    try {
        return realpathSync(filename);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        const parent = dirname(filename);
        if (parent === filename)
            throw error;
        return resolve(canonicalPath(parent), basename(filename));
    }
}
/**
 * Recursively collect all module dependencies from a ModuleJob.
 * Skips node: builtins and node_modules to focus on user code.
 */
async function loadDependencies(job, ignored = new Set()) {
    const dependencies = new Set();
    async function traverse(job) {
        if (ignored.has(job.url) || dependencies.has(job.url))
            return;
        if (job.url.startsWith('node:') || job.url.includes('/node_modules/'))
            return;
        dependencies.add(job.url);
        const children = await job.linked;
        await Promise.all(Array.prototype.map.call(children, traverse));
    }
    await traverse(job);
    return dependencies;
}
/** Entry names with distinct namespaces; iteration falls back to undefined only for names without a loaded namespace. */
class EntryNamespaces {
    internal;
    moduleUrls;
    names = new Map();
    constructor(internal, moduleUrls) {
        this.internal = internal;
        this.moduleUrls = moduleUrls;
    }
    static getModuleUrls(internal) {
        const moduleUrls = new Map();
        for (const url of internal.loadCache.keys()) {
            const job = internal.loadCache.get(url);
            if (!job?.module)
                continue;
            try {
                moduleUrls.set(job.module.getNamespace(), url);
            }
            catch (_error) {
                // Node also caches unfinished jobs whose namespace is not available yet.
            }
        }
        return moduleUrls;
    }
    add(name, moduleNamespace) {
        const namespaces = this.names.get(name) ?? new Set();
        namespaces.add(moduleNamespace);
        this.names.set(name, namespaces);
        return this;
    }
    *[Symbol.iterator]() {
        for (const [name, namespaces] of this.names) {
            for (const moduleNamespace of namespaces) {
                if (moduleNamespace === undefined && namespaces.size > 1)
                    continue;
                yield [name, moduleNamespace];
            }
        }
    }
    async resolve(name, baseUrl, moduleNamespace) {
        if (moduleNamespace === undefined || name.startsWith('cordis:')) {
            switch (this.internal.version) {
                case 'v1': return await this.internal.resolve(name, baseUrl, {});
                case 'v2': return this.internal.resolveSync(baseUrl, { specifier: name, attributes: {} });
            }
        }
        const url = this.moduleUrls.get(moduleNamespace);
        if (url === undefined)
            throw new Error(`HMR cannot locate the loaded module for ${name} from ${baseUrl}`);
        return { url };
    }
}
/** Entry modules belonging to one runtime, keyed by their original namespaces across replacement. */
class ReloadModules {
    modules = new Map();
    static include(reloads, plugin, job, runtime) {
        let info = reloads.get(plugin);
        if (info === undefined && runtime)
            info = [...reloads.values()].find(info => info.runtime === runtime);
        if (info === undefined)
            return false;
        info.modules.add(job, plugin);
        return true;
    }
    add(job, plugin) {
        assert(job.module, `HMR pending module is missing: ${job.url}`);
        const moduleNamespace = job.module.getNamespace();
        this.modules.set(moduleNamespace, { filename: job.url, moduleNamespace, plugin });
        return this;
    }
    async importRemaining(loader, getOuterStack, primary) {
        const replacements = new ReloadModules();
        for (const [originalNamespace, { filename }] of this.modules) {
            if (filename === primary.filename) {
                replacements.modules.set(originalNamespace, primary);
                continue;
            }
            const moduleNamespace = await loader.import(filename, getOuterStack);
            const plugin = loader.unwrapExports(moduleNamespace);
            replacements.modules.set(originalNamespace, { filename, moduleNamespace, plugin });
        }
        return replacements;
    }
    *getActiveImplementations(ctx, plugin, fibers) {
        const callbacks = new Set([...this.modules.values()].map(value => ctx.registry.resolve(value.plugin)));
        const implementations = fibers.map((previousFiber) => {
            if (previousFiber.entry === undefined)
                return [previousFiber, plugin];
            const replacement = this.modules.get(previousFiber.moduleNamespace);
            const implementation = replacement ? replacement.plugin : ctx.loader.unwrapExports(previousFiber.moduleNamespace);
            callbacks.add(ctx.registry.resolve(implementation));
            return [previousFiber, implementation];
        });
        for (const [previousFiber, implementation] of implementations) {
            if (previousFiber.fiber.parent.fiber.uid === null)
                continue;
            if (previousFiber.entry === undefined && callbacks.size > 1) {
                throw new Error('HMR replacement is ambiguous for a plugin instance without a Loader entry');
            }
            yield [previousFiber, implementation];
        }
    }
    updateEntries(loader) {
        for (const [originalNamespace, { moduleNamespace }] of this.modules) {
            for (const entry of loader.entries()) {
                if (entry.moduleNamespace === originalNamespace)
                    entry.moduleNamespace = moduleNamespace;
            }
        }
    }
}
/** Hot reload service with Cordis-compatible module configuration and events. */
let Hmr = (() => {
    let _classDecorators = [Inject('loader'), Inject('timer')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = Service;
    var Hmr = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            Hmr = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        config;
        /** Cordis-compatible watcher defaults. */
        static Config = z.object({
            base: z.string(),
            root: z.array(String).role('table').default(['.']),
            ignored: z.array(String).role('table').default([
                '**/node_modules',
                '**/.*',
                'cache',
                'data',
            ]),
            debounce: z.natural().role('ms').default(100),
        });
        /** Absolute base directory used to resolve module watch roots. */
        baseDir;
        ownerContext;
        internal;
        watcher;
        /**
         * Changes from externals will always trigger a full reload.
         * Externals are the dependency tree of the CLI worker entry point.
         */
        externals;
        /**
         * Files that should be reloaded (accepted changes).
         * Includes all stashed files and their dependents.
         */
        accepted;
        /**
         * Files that should NOT be reloaded.
         * Includes externals and files whose dependents are all declined.
         */
        declined;
        /** Stashed file changes waiting to be processed */
        stashed = new Set();
        operations = Promise.resolve();
        executing = new AsyncLocalStorage();
        applicationReady = Promise.resolve(true);
        closing = false;
        configPaths = new Set();
        manifests = new PackageManifests();
        /** Serialize a caller-owned mutation with all automatic reload paths.
         * @param operation Work that must not overlap module or configuration replacement.
         * @returns The operation result after its asynchronous work completes.
         */
        runExclusive(operation) {
            if (this.executing.getStore())
                return Promise.reject(new Error('HMR transactions cannot be nested'));
            const task = this.operations.then(async () => {
                if (this.closing)
                    throw new Error('HMR is disposed');
                return this.executing.run(true, operation);
            });
            this.operations = task.catch(() => { });
            return task;
        }
        runReload(operation) {
            return this.runExclusive(async () => {
                if (await this.applicationReady)
                    await operation();
            });
        }
        /** Watch a configuration path through the same queue as module replacement.
         * @param filename Absolute path, which may not exist yet.
         * @param refresh Rebuilds configuration from its current files and awaits Loader completion.
         * @returns Disposer closing this registration and waiting for its pending refresh.
         */
        async watchConfig(filename, refresh) {
            const paths = [resolve(filename), canonicalPath(filename)];
            if (paths.some(path => this.configPaths.has(path)))
                throw new Error(`config path already registered: ${filename}`);
            for (const path of paths)
                this.configPaths.add(path);
            try {
                const dispose = await this.executing.exit(() => watchExactConfig(this.ownerContext, filename, this.config, () => this.runReload(refresh), () => this.executing.getStore() === true));
                return async () => {
                    await dispose();
                    for (const path of paths)
                        this.configPaths.delete(path);
                };
            }
            catch (error) {
                for (const path of paths)
                    this.configPaths.delete(path);
                throw error;
            }
        }
        constructor(ctx, config) {
            super(ctx, 'hmr');
            this.config = config;
            this.ownerContext = ctx;
            if (!this.ctx.loader.internal) {
                throw new Error('--expose-internals is required for HMR service');
            }
            this.internal = this.ctx.loader.internal;
            this.baseDir = fileURLToPath(new URL(config.base || '.', ctx.baseUrl));
        }
        async *[Service.init]() {
            yield async () => {
                this.closing = true;
                await this.watcher?.close();
                // A configuration reload may remove its own HMR entry.
                if (!this.executing.getStore())
                    await this.operations;
                this.manifests.dispose();
            };
            const profile = this.ownerContext.get('profileContext');
            if (profile !== undefined) {
                const ready = this.ownerContext.get('appReady');
                if (ready === undefined)
                    throw new Error('Profile HMR requires application readiness');
                const started = Promise.withResolvers();
                this.applicationReady = started.promise;
                const unsubscribe = ready.onReady(() => { started.resolve(true); });
                yield () => { unsubscribe(); started.resolve(false); return Promise.resolve(); };
                const manifestPath = join(profile.dir, 'package.json');
                const patchFiles = [profile.patchPath, join(profile.home, PROFILE_PATCH_FILENAME)];
                let lastInputs;
                let lastBundles = JSON.stringify(profile.startedBundles);
                const refresh = async (manifestOnly) => {
                    const bundles = JSON.stringify(readProfileManifest('dsh', profile.dir).dsh?.profile?.bundles ?? []);
                    if (manifestOnly && bundles === lastBundles)
                        return;
                    const inputs = JSON.stringify([bundles, ...patchFiles.map((filename) => {
                            try {
                                return readFileSync(filename, 'utf8');
                            }
                            catch (error) {
                                if (error.code === 'ENOENT')
                                    return null;
                                throw error;
                            }
                        })]);
                    if (inputs === lastInputs)
                        return;
                    const patches = readProfilePatches('dsh', profile);
                    const warnings = await reconcileProfilePatches(this.ownerContext.root, patches, 'dsh');
                    lastInputs = inputs;
                    lastBundles = bundles;
                    for (const diagnostic of warnings)
                        this.ctx.logger.warn(diagnostic);
                };
                for (const filename of patchFiles)
                    await this.watchConfig(filename, () => refresh(false));
                await this.watchConfig(manifestPath, () => refresh(true));
            }
            const { loader } = this.ctx;
            const { root, ignored } = this.config;
            if (!this.config.base) {
                this.ctx.logger.info('watching %o', root);
            }
            else {
                this.ctx.logger.info('watching %o in %s', root, this.baseDir);
            }
            const match = picomatch(ignored);
            const watchBaseDir = realpathSync(this.baseDir);
            // Collect externals before opening the watcher so every post-ready change
            // is observed by listeners that already have their classification state.
            const mainJob = process.argv[1] === undefined ? undefined
                : this.internal.loadCache.get(pathToFileURL(resolve(process.argv[1])).href);
            if (mainJob) {
                this.externals = await loadDependencies(mainJob);
            }
            else {
                this.externals = new Set();
            }
            this.watcher = watch(root, {
                ...this.config,
                cwd: watchBaseDir,
                ignored: path => match(relative(watchBaseDir, path)),
                ignoreInitial: true,
            });
            const changed = new Set();
            const dispatch = this.ctx.debounce(() => {
                void this.runExclusive(async () => {
                    if (!await this.applicationReady)
                        return;
                    const batch = [...changed];
                    changed.clear();
                    const includes = new Set();
                    let fullReload = false;
                    for (const path of batch) {
                        const filename = canonicalPath(resolve(watchBaseDir, path));
                        const configuredFilename = resolve(this.baseDir, path);
                        if (this.configPaths.has(filename) || this.configPaths.has(configuredFilename))
                            continue;
                        const isManifest = basename(filename) === 'package.json' && !filename.includes(`${sep}node_modules${sep}`);
                        if (isManifest) {
                            this.manifests.invalidate(filename);
                        }
                        const url = pathToFileURL(filename).href;
                        if (this.externals.has(url)) {
                            fullReload = true;
                            continue;
                        }
                        if (this.internal.loadCache.has(url) || this.internal.loadCache.has(url, 'json')) {
                            this.stashed.add(url);
                            continue;
                        }
                        if (isManifest)
                            continue;
                        const include = [...loader.entries()].map(entry => entry.subtree)
                            .find(tree => tree?.filename === filename || tree?.filename === configuredFilename);
                        if (include !== undefined)
                            includes.add(include);
                        else
                            this.ctx.emit('hmr/change', url);
                    }
                    if (!fullReload && includes.size === 0 && this.stashed.size === 0)
                        return;
                    if (fullReload) {
                        loader.exit();
                        return;
                    }
                    for (const include of includes)
                        await include.refresh();
                    if (this.stashed.size > 0) {
                        try {
                            await this.partialReload();
                        }
                        finally {
                            this.stashed.clear();
                        }
                    }
                    await loader.await();
                }).catch((error) => { this.ctx.logger.warn(error); });
            }, this.config.debounce);
            this.watcher.on('change', (path) => { changed.add(path); dispatch(); });
            const ready = Promise.withResolvers();
            let readyState = root.length === 0 ? 'resolved' : 'pending';
            if (root.length === 0) {
                ready.resolve();
            }
            else {
                this.watcher.once('ready', () => {
                    readyState = 'resolved';
                    ready.resolve();
                });
            }
            this.watcher.on('error', (error) => {
                if (readyState === 'pending') {
                    readyState = 'rejected';
                    ready.reject(error);
                }
                else {
                    this.ctx.logger.warn(error);
                }
            });
            await ready.promise;
        }
        /** Omit internal HMR frames from module import diagnostics.
         * @returns The preserved outer stack frames.
         */
        getOuterStack = () => [];
        /** Read direct module dependency URLs from the active Node loader.
         * @param url Module URL.
         * @returns Linked module URLs, or an empty list for an uncached module.
         */
        async getLinked(url) {
            const job = this.internal.loadCache.get(url);
            if (!job)
                return [];
            const linked = await job.linked;
            return Array.prototype.map.call(linked, (job) => job.url);
        }
        /**
         * Classify changed files into accepted (should reload) and declined (should not).
         *
         * A file is accepted if it's directly changed (stashed) or if any of its
         * dependents are accepted. A file is declined if all its dependents are
         * declined or if it's an external.
         */
        async analyzeChanges() {
            const pending = [];
            this.accepted = new Set(this.stashed);
            this.declined = new Set(this.externals);
            const isExcluded = (url) => url.startsWith('node:') || url.includes('/node_modules/');
            await Promise.all([...this.stashed].map(async (url) => {
                const children = await this.getLinked(url);
                for (const child of children) {
                    if (this.accepted.has(child) || this.declined.has(child) || isExcluded(child))
                        continue;
                    pending.push(child);
                }
            }));
            while (pending.length) {
                let index = 0, hasUpdate = false;
                while (index < pending.length) {
                    const url = pending[index];
                    const children = await this.getLinked(url);
                    let isDeclined = true, isAccepted = false;
                    for (const child of children) {
                        if (this.declined.has(child) || isExcluded(child))
                            continue;
                        if (this.accepted.has(child)) {
                            isAccepted = true;
                            break;
                        }
                        else {
                            isDeclined = false;
                            if (!pending.includes(child)) {
                                hasUpdate = true;
                                pending.push(child);
                            }
                        }
                    }
                    if (isAccepted || isDeclined) {
                        hasUpdate = true;
                        pending.splice(index, 1);
                        if (isAccepted) {
                            this.accepted.add(url);
                        }
                        else {
                            this.declined.add(url);
                        }
                    }
                    else {
                        index++;
                    }
                }
                if (!hasUpdate)
                    break;
            }
            for (const url of pending) {
                this.declined.add(url);
            }
        }
        async partialReload() {
            await this.analyzeChanges();
            const pending = new Map();
            const reloads = new Map();
            const moduleUrls = EntryNamespaces.getModuleUrls(this.internal);
            // Build a map of plugin names per config tree URL.
            // Plugin entry files are treated as atomic reload units.
            const nameMap = new Map();
            for (const entry of this.ctx.loader.entries()) {
                const baseUrl = entry.parent.tree.ctx.baseUrl;
                if (baseUrl === undefined)
                    throw new Error('HMR entry tree has no base URL');
                const names = nameMap.get(baseUrl) ?? new EntryNamespaces(this.internal, moduleUrls);
                names.add(entry.options.name, entry.moduleNamespace);
                nameMap.set(baseUrl, names);
            }
            // Find each plugin's loaded URL and check if it needs reload.
            for (const [baseUrl, names] of nameMap) {
                for (const [name, moduleNamespace] of names) {
                    try {
                        const { url } = await names.resolve(name, baseUrl, moduleNamespace);
                        if (this.declined.has(url))
                            continue;
                        const job = this.internal.loadCache.get(url);
                        const plugin = this.ctx.loader.unwrapExports(job?.module?.getNamespace());
                        if (!job || !plugin)
                            continue;
                        pending.set(job, plugin);
                        this.declined.add(url);
                    }
                    catch (err) {
                        this.ctx.logger.warn(err);
                    }
                }
            }
            // Check each pending plugin's dependency tree for accepted files
            for (const [job, plugin] of pending) {
                this.declined.delete(job.url);
                const dependencies = [...await loadDependencies(job, this.declined)];
                this.declined.add(job.url);
                if (dependencies.length === 0) {
                    pending.delete(job);
                    continue;
                }
                if (!dependencies.some(dep => this.accepted.has(dep)))
                    continue;
                dependencies.forEach(dep => this.accepted.add(dep));
                const runtime = this.ctx.registry.get(plugin);
                if (ReloadModules.include(reloads, plugin, job, runtime))
                    continue;
                reloads.set(plugin, {
                    filename: job.url,
                    runtime,
                    modules: new ReloadModules().add(job, plugin),
                });
            }
            // Re-export roots of a replaced runtime must not retain bindings to its old modules.
            for (const [job, plugin] of pending) {
                if (ReloadModules.include(reloads, plugin, job, this.ctx.registry.get(plugin)))
                    this.accepted.add(job.url);
            }
            /**
             * Clear module caches for all accepted files before re-importing.
             *
             * We need to clear both:
             * 1. ESM loadCache — managed by Node's internal ModuleLoader
             * 2. CJS Module._cache — for CJS modules that were imported via import()
             *
             * In Node 24, CJS modules loaded via import() appear in both caches.
             * If we only clear loadCache, the CJS cache may serve stale modules.
             *
             * We use Map.prototype methods directly on loadCache because:
             * - In Node 22/23, loadCache is a plain Map<url, ModuleJob>
             * - In Node 24, loadCache is a LoadCache extends Map<url, { [type]: ModuleJob }>
             *   where .delete() only sets the type slot to undefined (doesn't remove the entry)
             * Using Map.prototype.delete ensures complete removal in both versions.
             */
            const esmBackup = new Map();
            const cjsBackup = new Map();
            const require = createRequire(import.meta.url);
            for (const filename of this.accepted) {
                // Backup and clear ESM loadCache
                const job = Map.prototype.get.call(this.internal.loadCache, filename);
                esmBackup.set(filename, job);
                Map.prototype.delete.call(this.internal.loadCache, filename);
                // Backup and clear CJS Module._cache
                try {
                    const filepath = fileURLToPath(filename);
                    if (require.cache[filepath]) {
                        cjsBackup.set(filepath, require.cache[filepath]);
                        Reflect.deleteProperty(require.cache, filepath);
                    }
                }
                catch {
                    // filename might not be a file: URL (e.g. node: protocol), ignore
                }
            }
            const rollback = () => {
                for (const [filename, job] of esmBackup) {
                    Map.prototype.set.call(this.internal.loadCache, filename, job);
                }
                for (const [filepath, module] of cjsBackup)
                    require.cache[filepath] = module;
            };
            // Attempt to re-import all plugin entry files
            const generations = [...reloads].map(([previous, info]) => ({
                ...info, previous,
                fibers: [...info.runtime?.fibers ?? []].map((fiber) => {
                    const entry = fiber.entry?.fiber?.uid === fiber.uid ? fiber.entry : undefined;
                    const config = entry === undefined ? fiber._config : entry.options.config;
                    return { fiber, entry, config, moduleNamespace: entry?.moduleNamespace };
                }),
            }));
            const attempts = [];
            try {
                for (const generation of generations) {
                    const moduleNamespace = await this.ctx.loader.import(generation.filename, this.getOuterStack);
                    const replacement = this.ctx.loader.unwrapExports(moduleNamespace);
                    const replacements = await generation.modules.importRemaining(this.ctx.loader, this.getOuterStack, {
                        filename: generation.filename, moduleNamespace, plugin: replacement,
                    });
                    attempts.push({ ...generation, replacement, replacements, activated: [] });
                }
            }
            catch (e) {
                handleError(this.ctx, e);
                rollback();
                throw e;
            }
            const reload = async (plugin, fibers, replacements = new ReloadModules(), activated = []) => {
                for (const [previousFiber, implementation] of replacements.getActiveImplementations(this.ctx, plugin, fibers)) {
                    const fiber = previousFiber.fiber.parent.registry.plugin(implementation, previousFiber.config, this.getOuterStack).ctx.fiber;
                    if (previousFiber.entry !== undefined) {
                        fiber.entry = previousFiber.entry;
                        previousFiber.entry.fiber = fiber;
                    }
                    activated.push(fiber);
                }
                await Promise.all(activated.map(fiber => fiber.await()));
            };
            const removed = new Set();
            try {
                for (const { previous: plugin, replacement, filename, runtime, fibers, replacements, activated } of attempts) {
                    if (!runtime)
                        continue;
                    const path = relative(this.baseDir, fileURLToPath(filename));
                    removed.add(plugin);
                    try {
                        this.ctx.registry.delete(plugin);
                        await Promise.all(fibers.map(({ fiber }) => fiber.await()));
                    }
                    catch (err) {
                        this.ctx.logger.warn('failed to dispose plugin at %C', path);
                        this.ctx.logger.warn(err);
                    }
                    try {
                        await reload(replacement, fibers, replacements, activated);
                        this.ctx.logger.info('reload plugin at %C', path);
                    }
                    catch (err) {
                        this.ctx.logger.warn('failed to reload plugin at %C', path);
                        this.ctx.logger.warn(err);
                        throw err;
                    }
                }
            }
            catch (error) {
                // Restore caches and re-register old plugins after a replacement failure.
                rollback();
                for (const { previous: plugin, fibers, activated } of attempts) {
                    if (!removed.has(plugin))
                        continue;
                    try {
                        for (const { runtime } of activated) {
                            if (runtime && this.ctx.registry.get(runtime.callback) === runtime) {
                                const replacementFibers = [...runtime.fibers];
                                this.ctx.registry.delete(runtime.callback);
                                // Failed startup errors remain on fibers after their teardown finishes.
                                await Promise.allSettled(replacementFibers.map(fiber => fiber.await()));
                            }
                        }
                        await reload(plugin, fibers);
                    }
                    catch (err) {
                        this.ctx.logger.warn(err);
                    }
                }
                throw error;
            }
            await this.ctx.loader.await();
            for (const { replacements } of attempts) {
                replacements.updateEntries(this.ctx.loader);
            }
            this.ctx.emit('hmr/reload', reloads);
            this.stashed = new Set();
        }
        static {
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return Hmr = _classThis;
})();
export default Hmr;
//# sourceMappingURL=index.js.map