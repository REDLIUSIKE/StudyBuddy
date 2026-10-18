/** In-memory profile package routing for Node's default ESM and CommonJS loaders. */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getEnvironmentData, setEnvironmentData } from 'node:worker_threads';
import { imports as resolvePackageImports } from 'resolve.exports';
const WORKER_RESOLUTION_KEY = '@deepseek-ai/dsh-app-boot/profile-resolution';
const EMPTY_ATTRIBUTES = Object.freeze({});
/**
 * Split a bare request into its package name without allocating path segments.
 * @param request - module specifier to classify.
 * @returns the bare package name, or undefined for non-package requests.
 */
export function barePackageName(request) {
    if (!request || request[0] === '.' || request[0] === '/' || request[0] === '\\'
        || request[0] === '#' || request.includes(':') || isBuiltin(request))
        return;
    const first = request.indexOf('/');
    if (request[0] !== '@')
        return first < 0 ? request : request.slice(0, first);
    if (first < 0)
        return;
    const second = request.indexOf('/', first + 1);
    return second < 0 ? request : request.slice(0, second);
}
function canonicalPath(path) {
    try {
        return realpathSync(path);
    }
    catch {
        // A runtime resolution may name a profile scope before that directory is materialized.
        return resolve(path);
    }
}
function prefixes(path) {
    const configured = resolve(path) + sep;
    const canonical = canonicalPath(path) + sep;
    return canonical === configured ? [configured] : [configured, canonical];
}
function compileResolution(resolution) {
    return {
        entries: new Map(resolution.entries.map(entry => [entry.name, entry])),
        profilesDir: resolution.profilesDir,
        profileDir: resolution.profileDir,
        profilePaths: prefixes(resolution.profilesDir),
        profile: resolution.profileDir === undefined ? [] : prefixes(resolution.profileDir),
        installationPaths: [...new Set(resolution.entries
                .filter(entry => entry.scope === 'installation')
                .flatMap(entry => prefixes(entry.packageDir)))],
        linkedPaths: resolution.linkedRoots.flatMap(root => prefixes(root.realPath)),
        localPackageNames: new Set(resolution.localPackageNames),
        esmRoutes: new Map(),
        cjsRoutes: new Map(),
    };
}
/**
 * The interception layer of a profile is `<profileParent>/node_modules`: an entry occupies its name there, so its
 * subpath misses continue above it, and a name without an entry continues at it.
 */
function computeProfileLayer(dir, active) {
    const profileParent = dirname(dir);
    return {
        kind: 'profile', active,
        localPrefix: dir + sep,
        nativeAfter: join(profileParent, 'package.json'),
        after: join(dirname(profileParent), 'package.json'),
    };
}
/** The interception layer of a module path: from its profile directory inside a profiles tree, or its linked root. */
function findInterceptionLayer(path, resolution) {
    const treeRoot = resolution.profilePaths.find(prefix => path.startsWith(prefix));
    const activeProfile = resolution.profile.find(prefix => path.startsWith(prefix));
    const dir = treeRoot !== undefined ? profileChild(path, treeRoot) : activeProfile?.slice(0, -1);
    if (dir !== undefined)
        return computeProfileLayer(dir, activeProfile !== undefined);
    if (!startsWithin(path, resolution.linkedPaths))
        return undefined;
    if (startsWithin(path, resolution.installationPaths))
        return undefined;
    return { kind: 'linked' };
}
/** Package names a directory's current manifest lists as peers; an unreadable manifest lists none. */
function readPeerNames(directory) {
    try {
        const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
        const peers = manifest.peerDependencies;
        return new Set(peers !== null && typeof peers === 'object' ? Object.keys(peers) : []);
    }
    catch (_error) {
        // Node reports the unreadable or invalid manifest itself when it resolves the package's own imports.
        return new Set();
    }
}
function startsWithin(path, roots) {
    for (const root of roots) {
        if (path.startsWith(root))
            return true;
    }
    return false;
}
/**
 * The profile directory owning a module inside the profiles tree: the first path segment below the tree root.
 * @param path - module path below `treePrefix`.
 * @param treePrefix - profiles directory with a trailing separator.
 * @returns the profile directory without a trailing separator.
 */
function profileChild(path, treePrefix) {
    const rest = path.slice(treePrefix.length);
    const end = rest.indexOf(sep);
    return treePrefix + (end < 0 ? rest : rest.slice(0, end));
}
function nativePackageDir(parent, name) {
    for (const searchPath of createRequire(parent).resolve.paths(name)) {
        const candidate = join(searchPath, name);
        if (existsSync(join(candidate, 'package.json')))
            return candidate;
    }
    return undefined;
}
function localPackageCandidate(searchPath, name, flavor) {
    const candidate = join(searchPath, name);
    const stat = statSync(candidate, { throwIfNoEntry: false });
    const found = flavor === 'esm'
        ? stat?.isDirectory() === true
        : stat !== undefined
            || ['.js', '.json', '.node'].some(extension => existsSync(candidate + extension));
    return found ? candidate : undefined;
}
function selfReferenceName(parent) {
    let current = dirname(parent);
    while (true) {
        const manifestPath = join(current, 'package.json');
        if (existsSync(manifestPath)) {
            let manifest;
            try {
                manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            }
            catch (_error) {
                // Only Node decides whether this request consumes an invalid package manifest.
                return null;
            }
            return typeof manifest.name === 'string' && manifest.exports != null
                ? manifest.name
                : false;
        }
        /* v8 ignore next -- scoped module requests normally find an owning manifest before node_modules. */
        if (basename(current) === 'node_modules')
            return false;
        const next = dirname(current);
        if (next === current)
            return false;
        current = next;
    }
}
function packageImportsTarget(parent, request, conditions) {
    let current = dirname(parent);
    while (true) {
        const manifestPath = join(current, 'package.json');
        if (existsSync(manifestPath)) {
            let manifest;
            try {
                manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            }
            catch (_error) {
                // The native resolver retains invalid package-target and manifest diagnostics.
                /* v8 ignore next -- native resolution cannot report MODULE_NOT_FOUND after an invalid scope manifest */
                return undefined;
            }
            try {
                const target = resolvePackageImports(manifest, request, {
                    conditions: [...conditions],
                    unsafe: true,
                })?.[0];
                return target !== undefined && barePackageName(target) !== undefined
                    ? { specifier: target, parentURL: pathToFileURL(manifestPath).href }
                    : undefined;
            }
            catch (_error) {
                // The native resolver retains missing mappings and unmatched-condition diagnostics.
                /* v8 ignore next -- native resolution cannot report MODULE_NOT_FOUND before selecting a valid mapping */
                return undefined;
            }
        }
        if (basename(current) === 'node_modules')
            return undefined;
        const next = dirname(current);
        /* v8 ignore next -- a MODULE_NOT_FOUND package-import target always has an owning package scope */
        if (next === current)
            return undefined;
        current = next;
    }
}
function packageSearchPaths(entry, request, cjs) {
    const name = barePackageName(request);
    /* v8 ignore next -- interception routes are created only for bare package requests */
    if (name === undefined)
        return cjs._nodeModulePaths(dirname(entry.declarer));
    const suffix = sep + name.split('/').join(sep);
    return entry.packageDir.endsWith(suffix)
        ? [entry.packageDir.slice(0, -suffix.length)]
        : cjs._nodeModulePaths(dirname(entry.declarer));
}
function localCandidateOwnsResolution(candidate, resolved, request, name) {
    if (startsWithin(resolved, prefixes(candidate)))
        return true;
    if (sameResolution(candidate, resolved))
        return true;
    if (['.js', '.json', '.node'].some(extension => sameResolution(candidate + extension, resolved)))
        return true;
    /* v8 ignore next -- a bounded native lookup can escape a candidate only through its root legacy main */
    if (request !== name)
        return false;
    try {
        const manifest = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'));
        /* v8 ignore next -- a bounded native lookup outside the package directory requires a legacy main */
        if (typeof manifest.main !== 'string')
            return false;
        const main = createRequire(join(candidate, 'package.json')).resolve(resolve(candidate, manifest.main));
        return sameResolution(main, resolved);
    }
    catch (_error) {
        // Native resolution already owns malformed manifests and missing legacy entries.
        /* v8 ignore next -- this helper runs only after the same native resolution succeeded */
        return false;
    }
}
function isUnselectedPackageMiss(error) {
    const failure = error;
    return failure.code === 'MODULE_NOT_FOUND' && failure.path === undefined;
}
function sameResolution(left, right) {
    if (left === right)
        return true;
    return canonicalPath(left) === canonicalPath(right);
}
/** One mutable pointer to the immutable runtime resolution. */
class ResolutionRouter {
    nodeModulePaths;
    current;
    linkedTargets;
    constructor(resolution, nodeModulePaths) {
        this.nodeModulePaths = nodeModulePaths;
        this.current = compileResolution(resolution);
        this.linkedTargets = new Map(resolution.linkedRoots.map(root => [root.name, root.realPath]));
    }
    replace(successor) {
        const entries = new Map(successor.entries.map(entry => [entry.name, entry]));
        if (successor.profilesDir !== this.current.profilesDir
            || successor.profileDir !== this.current.profileDir) {
            throw new Error('profile resolution: a successor cannot change its profile scope');
        }
        for (const [name, current] of this.current.entries) {
            const next = entries.get(name);
            if (next === undefined && current.scope === 'profile')
                continue;
            if (next === undefined
                || !sameResolution(current.packageDir, next.packageDir)
                || (current.scope === 'installation' && !sameResolution(current.declarer, next.declarer))
                || current.version !== next.version
                || current.scope !== next.scope) {
                throw new Error(`profile resolution: replacing ${JSON.stringify(name)} requires a process restart`);
            }
        }
        const localPackageNames = new Set(successor.localPackageNames);
        for (const name of localPackageNames) {
            if (!this.current.localPackageNames.has(name) && this.current.entries.has(name)) {
                throw new Error(`profile resolution: overriding ${JSON.stringify(name)} locally requires a process restart`);
            }
        }
        // Node retains realpath caches after a root leaves the interception scope.
        for (const root of successor.linkedRoots) {
            const previous = this.linkedTargets.get(root.name);
            if (previous !== undefined && !sameResolution(previous, root.realPath)) {
                throw new Error(`profile resolution: relinking ${JSON.stringify(root.name)} requires a process restart`);
            }
        }
        const next = compileResolution(successor);
        for (const { name, realPath } of successor.linkedRoots) {
            if (!this.linkedTargets.has(name))
                this.linkedTargets.set(name, realPath);
        }
        this.current = next;
    }
    /** Whether a module path has an interception layer: it lies in the profiles tree, the active profile, or a linked root. */
    hasInterceptionLayerForPath(path) {
        return findInterceptionLayer(path, this.current) !== undefined;
    }
    /** Whether an importer URL is scoped; the answer is memoized with the importer's routes. */
    hasInterceptionLayerForUrl(parentURL) {
        return this.getOrCreateParentRoutesForUrl(parentURL) !== false;
    }
    createParentRoutes(parent, resolution) {
        const layer = findInterceptionLayer(parent, resolution);
        return layer === undefined ? undefined : { parent, layer, requests: new Map() };
    }
    getOrCreateParentRoutesForUrl(parentURL) {
        const resolution = this.current;
        let parentRoutes = resolution.esmRoutes.get(parentURL);
        if (parentRoutes !== undefined)
            return parentRoutes;
        let parent;
        try {
            parent = fileURLToPath(parentURL);
        }
        catch {
            // Only file URLs can lie inside a profile tree or linked root.
            parent = undefined;
        }
        parentRoutes = parent === undefined ? false : this.createParentRoutes(parent, resolution) ?? false;
        resolution.esmRoutes.set(parentURL, parentRoutes);
        return parentRoutes;
    }
    routeScoped(request, parentRoutes, resolution, flavor, cjs) {
        const { parent, layer, requests } = parentRoutes;
        const memo = layer.kind === 'profile' && (cjs === undefined || cjs.cacheable);
        const name = barePackageName(request);
        if (name === undefined)
            return undefined;
        if (parentRoutes.selfReferenceName === undefined || !memo) {
            parentRoutes.selfReferenceName = selfReferenceName(parent);
        }
        if (parentRoutes.selfReferenceName === name || parentRoutes.selfReferenceName === null) {
            const state = { route: { kind: 'native' } };
            if (memo)
                requests.set(request, state);
            return state;
        }
        if (layer.kind === 'linked')
            return this.routeLinked(request, name, parent, resolution, flavor, cjs);
        const target = resolution.entries.get(name);
        const candidates = [];
        const localSearchPaths = [];
        for (const searchPath of createRequire(parent).resolve.paths(name)) {
            if (!searchPath.startsWith(layer.localPrefix))
                break;
            localSearchPaths.push(searchPath);
            const candidate = localPackageCandidate(searchPath, name, flavor);
            if (candidate !== undefined)
                candidates.push(candidate);
        }
        if (candidates.length > 0) {
            if (cjs !== undefined) {
                try {
                    const resolved = cjs.resolveNative(localSearchPaths);
                    const selected = candidates.find(candidate => (localCandidateOwnsResolution(candidate, resolved, request, name)));
                    if (selected !== undefined) {
                        const state = {
                            route: { kind: 'native', packageDir: selected },
                            packageDir: selected,
                            cjs: resolved,
                        };
                        if (memo)
                            requests.set(request, state);
                        return state;
                    }
                }
                catch (error) {
                    if (!isUnselectedPackageMiss(error))
                        throw error;
                }
            }
            else {
                const selected = candidates[0];
                const state = {
                    route: { kind: 'native', packageDir: selected },
                    packageDir: selected,
                };
                requests.set(request, state);
                return state;
            }
        }
        const route = target !== undefined
            && (target.scope === 'installation' || layer.active)
            ? { kind: 'interception', entry: target, after: layer.after }
            : { kind: 'native-after-interception', parent: layer.nativeAfter };
        const state = { route };
        if (route.kind === 'interception' && memo)
            requests.set(request, state);
        return state;
    }
    routeLinked(request, name, parent, resolution, flavor, cjs) {
        const target = resolution.entries.get(name);
        if (target === undefined)
            return { route: { kind: 'native' } };
        const ancestors = this.nodeModulePaths(dirname(parent));
        const ancestorSet = new Set(ancestors);
        const searchPaths = flavor === 'esm' ? ancestors : createRequire(parent).resolve.paths(name);
        for (const searchPath of searchPaths) {
            const directory = dirname(searchPath);
            if (ancestorSet.has(searchPath) && readPeerNames(directory).has(name)) {
                const route = { kind: 'interception', entry: target, after: join(dirname(directory), 'package.json') };
                if (cjs === undefined)
                    return { route };
                try {
                    const resolved = cjs.resolveEntry(target, route.after);
                    if (localCandidateOwnsResolution(target.packageDir, resolved, request, name)) {
                        return { route, packageDir: target.packageDir, cjs: resolved };
                    }
                }
                catch (error) {
                    if (!isUnselectedPackageMiss(error))
                        throw error;
                }
                // This position is occupied even when a legacy CommonJS subpath is absent from the supplied package.
                continue;
            }
            const candidate = localPackageCandidate(searchPath, name, flavor);
            if (candidate === undefined)
                continue;
            if (cjs === undefined)
                return { route: { kind: 'native', packageDir: candidate }, packageDir: candidate };
            try {
                const resolved = cjs.resolveNative([searchPath]);
                if (localCandidateOwnsResolution(candidate, resolved, request, name)) {
                    return { route: { kind: 'native', packageDir: candidate }, packageDir: candidate, cjs: resolved };
                }
            }
            catch (error) {
                if (!isUnselectedPackageMiss(error))
                    throw error;
            }
        }
        // An exhausted CommonJS lookup must not retry the physical copies at occupied peer positions.
        return cjs === undefined ? { route: { kind: 'native' } } : { route: { kind: 'native' }, cjs: cjs.resolveNative([]) };
    }
    routeLocalPackage(request, parentRoutes, resolution) {
        const name = barePackageName(request);
        const { layer } = parentRoutes;
        if (name === undefined || layer.kind !== 'profile' || !layer.active || !resolution.localPackageNames.has(name))
            return undefined;
        const state = { route: { kind: 'native' } };
        parentRoutes.requests.set(request, state);
        return state;
    }
    routeUrl(request, parentURL) {
        const resolution = this.current;
        const parentRoutes = this.getOrCreateParentRoutesForUrl(parentURL);
        if (parentRoutes === false)
            return undefined;
        const cached = parentRoutes.requests.get(request);
        if (cached !== undefined)
            return cached;
        const local = this.routeLocalPackage(request, parentRoutes, resolution);
        if (local !== undefined)
            return local;
        return this.routeScoped(request, parentRoutes, resolution, 'esm');
    }
    routePath(request, parent, cjs) {
        const resolution = this.current;
        let parentRoutes = resolution.cjsRoutes.get(parent);
        if (parentRoutes === false)
            return undefined;
        const cached = cjs.cacheable ? parentRoutes?.requests.get(request) : undefined;
        if (cached !== undefined)
            return cached;
        if (parentRoutes === undefined) {
            parentRoutes = this.createParentRoutes(parent, resolution) ?? false;
            resolution.cjsRoutes.set(parent, parentRoutes);
            if (parentRoutes === false)
                return undefined;
        }
        return this.routeScoped(request, parentRoutes, resolution, 'cjs', cjs);
    }
    packageDir(specifier, parentURL) {
        const name = barePackageName(specifier);
        if (name === undefined)
            return undefined;
        const state = this.routeUrl(name, parentURL);
        if (state?.route.kind === 'interception')
            return state.route.entry.packageDir;
        if (state?.packageDir !== undefined)
            return state.packageDir;
        let parent;
        try {
            parent = state?.route.kind === 'native-after-interception' ? state.route.parent : fileURLToPath(parentURL);
        }
        catch {
            return undefined;
        }
        const found = nativePackageDir(parent, name);
        if (state !== undefined && found !== undefined)
            state.packageDir = found;
        return found;
    }
}
function internalModules() {
    const require = createRequire(import.meta.url);
    const builtins = process.execArgv.includes('--expose-internals')
        ? { requireBuiltin: (moduleId) => require(moduleId) }
        : require('node-addon-require-builtin');
    const esmModule = builtins.requireBuiltin('internal/modules/esm/loader');
    const cjsModule = builtins.requireBuiltin('internal/modules/cjs/loader');
    const cjsHelpers = builtins.requireBuiltin('internal/modules/helpers');
    const esmUtils = builtins.requireBuiltin('internal/modules/esm/utils');
    const esmResolve = builtins.requireBuiltin('internal/modules/esm/resolve');
    const esm = esmModule.getOrInitializeCascadedLoader();
    const modern = 'getOrCreateModuleJob' in esm;
    /* v8 ignore start -- the supported Node 22/24/26 matrix validates each available Internal interface */
    if (typeof esm.resolveSync !== 'function'
        || typeof Reflect.get(esm, modern ? 'getOrCreateModuleJob' : 'getModuleJobForImport') !== 'function'
        || (!modern && typeof Reflect.get(esm, 'resolve') !== 'function')
        || typeof cjsModule.Module._resolveFilename !== 'function'
        || typeof cjsHelpers.getCjsConditions !== 'function'
        || typeof esmUtils.getDefaultConditions !== 'function'
        || typeof esmResolve.defaultResolve !== 'function') {
        throw new Error('profile resolution: unsupported Node module loader');
    }
    /* v8 ignore stop */
    return {
        esm,
        esmDefaultResolve: (specifier, context) => esmResolve.defaultResolve(specifier, context),
        esmConditions: esmUtils.getDefaultConditions(),
        cjs: cjsModule.Module,
        cjsConditions: cjsHelpers.getCjsConditions(),
        modern,
    };
}
/**
 * Replace a resolver error's message and the same text in its stack.
 * Node's module-hooks thread serializes errors and returns the stack accessor as a read-only configurable
 * data property, so a rejected stack assignment redefines the property value.
 * @param error - resolver error to update in place.
 * @param message - replacement message.
 */
function replaceErrorMessage(error, message) {
    const { message: originalMessage, stack } = error;
    error.message = message;
    /* v8 ignore next -- Node's resolver errors always carry a stack */
    if (stack === undefined)
        return;
    const replaced = stack.replace(originalMessage, message);
    if (!Reflect.set(error, 'stack', replaced))
        Object.defineProperty(error, 'stack', { value: replaced });
}
function throwWithImporter(error, routedParent, parent) {
    const code = error.code;
    if (error instanceof Error && (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')) {
        const routedPath = fileURLToPath(routedParent);
        const parentPath = fileURLToPath(parent);
        replaceErrorMessage(error, error.message.replaceAll(routedParent, parent).replaceAll(routedPath, parentPath));
    }
    throw error;
}
function throwWithoutCjsAnchor(error, anchor) {
    const resolved = error;
    const requireStack = resolved.requireStack;
    if (error instanceof Error
        && resolved.code === 'MODULE_NOT_FOUND'
        && requireStack?.[0] !== undefined
        && sameResolution(requireStack[0], anchor)) {
        const originalMessage = error.message;
        const originalBlock = `\nRequire stack:\n${requireStack.map(path => `- ${path}`).join('\n')}`;
        const remaining = requireStack.slice(1);
        /* v8 ignore next -- routed calls always retain the original importing module */
        const replacement = remaining.length === 0
            ? ''
            : `\nRequire stack:\n${remaining.map(path => `- ${path}`).join('\n')}`;
        error.message = originalMessage.replace(originalBlock, replacement);
        resolved.requireStack = remaining;
        const stack = error.stack;
        /* v8 ignore next -- Node's resolver errors always carry a stack */
        if (stack !== undefined)
            error.stack = stack.replace(originalMessage, error.message);
    }
    throw error;
}
/**
 * Install one runtime resolution as the interception on Node's default ESM and CommonJS resolvers.
 * @param resolution - complete package table and profile scope.
 * @returns an interception that publishes a successor or restores the native methods.
 */
export function installRuntimeInterception(resolution) {
    const { esm, esmDefaultResolve, esmConditions, cjs, cjsConditions, modern } = internalModules();
    const router = new ResolutionRouter(resolution, directory => cjs._nodeModulePaths(directory));
    let delegatedEsm;
    const adaptEsm = (native) => {
        const adapted = (request, parent, attributes) => {
            const delegated = delegatedEsm;
            /* v8 ignore next -- reentry requires a separate synchronous Node hook; supported launches install none */
            if (delegated !== undefined && delegated.parent === parent && delegated.request === request) {
                return native(request, parent, attributes);
            }
            if (parent === undefined || !router.hasInterceptionLayerForUrl(parent))
                return native(request, parent, attributes);
            const state = router.routeUrl(request, parent);
            if (state === undefined) {
                const target = request[0] === '#'
                    ? packageImportsTarget(fileURLToPath(parent), request, esmConditions)
                    : undefined;
                if (target === undefined)
                    return native(request, parent, attributes);
                const restoreImporter = (error) => throwWithImporter(error, target.parentURL, parent);
                let expected;
                try {
                    expected = adapted(target.specifier, target.parentURL, attributes);
                    /* v8 ignore next -- Node 24+ resolves synchronously; the Node 22 matrix covers its Promise result */
                    if (expected instanceof Promise)
                        expected = expected.catch(restoreImporter);
                }
                catch (error) {
                    return restoreImporter(error);
                }
                return expected;
            }
            const cacheable = attributes === EMPTY_ATTRIBUTES || Object.keys(attributes).length === 0;
            if (cacheable && state.esm !== undefined)
                return state.esm;
            const route = state.route;
            if (route.kind === 'native') {
                const result = native(request, parent, attributes);
                if (cacheable && !(result instanceof Promise))
                    state.esm = result;
                return result;
            }
            const routedParent = pathToFileURL(route.kind === 'interception' ? route.entry.declarer : route.parent).href;
            const previous = delegatedEsm;
            delegatedEsm = { parent: routedParent, request };
            const restoreImporter = (error) => throwWithImporter(error, routedParent, parent);
            try {
                let result;
                try {
                    result = native(request, routedParent, attributes);
                }
                catch (error) {
                    return restoreImporter(error);
                }
                /* v8 ignore next -- Node 24+ resolves synchronously; the Node 22 matrix covers its Promise result */
                if (result instanceof Promise)
                    return result.catch(restoreImporter);
                if (cacheable)
                    state.esm = result;
                return result;
            }
            finally {
                delegatedEsm = previous;
            }
        };
        return adapted;
    };
    let restoreEsm;
    /* v8 ignore else -- CI coverage runs Node 24 v2; the Node 22 matrix exercises the v1 adapter */
    if (modern) {
        const loader = esm;
        const original = Reflect.get(loader, 'resolveSync');
        const resolveRequest = adaptEsm((request, parent, attributes) => original.call(loader, parent, { specifier: request, attributes }));
        // Node 24.12+ adds skipSyncHooks after request. Its presence marks hook
        // delegation whose outer call already selected a route.
        const wrapped = (parent, request, ...rest) => (rest.length
            ? Reflect.apply(original, loader, [parent, request, ...rest])
            : resolveRequest(request.specifier, parent, request.attributes ?? EMPTY_ATTRIBUTES));
        loader.resolveSync = wrapped;
        restoreEsm = () => {
            /* v8 ignore else -- interceptions are disposed in reverse installation order */
            if (loader.resolveSync === wrapped)
                loader.resolveSync = original;
        };
    }
    else {
        const loader = esm;
        const original = Reflect.get(loader, 'resolve');
        const originalSync = Reflect.get(loader, 'resolveSync');
        const resolveRequest = adaptEsm((request, parent, attributes) => original.call(loader, request, parent, attributes));
        const resolveRequestSync = adaptEsm((request, parent, attributes) => originalSync.call(loader, request, parent, attributes));
        const wrapped = (request, parent, attributes = EMPTY_ATTRIBUTES) => resolveRequest(request, parent, attributes);
        const wrappedSync = (request, parent, attributes = EMPTY_ATTRIBUTES) => resolveRequestSync(request, parent, attributes);
        loader.resolve = wrapped;
        loader.resolveSync = wrappedSync;
        restoreEsm = () => {
            if (loader.resolve === wrapped)
                loader.resolve = original;
            if (loader.resolveSync === wrappedSync)
                loader.resolveSync = originalSync;
        };
    }
    const originalFilename = Reflect.get(cjs, '_resolveFilename');
    let delegatedCjs = 0;
    const resolveRoutedCjs = (request, routed, parent, main, options) => {
        const anchor = routed.kind === 'interception' ? routed.entry.declarer : routed.parent;
        const synthetic = new cjs(anchor);
        // Late parent assignment preserves Node's require stack without publishing this routing anchor in parent.children.
        synthetic.parent = parent;
        synthetic.filename = anchor;
        synthetic.paths = routed.kind === 'interception'
            ? packageSearchPaths(routed.entry, request, cjs)
            : cjs._nodeModulePaths(dirname(anchor));
        try {
            return originalFilename.call(cjs, request, synthetic, main, options);
        }
        catch (error) {
            return throwWithoutCjsAnchor(error, anchor);
        }
    };
    const resolveNativeCjs = (request, searchPaths, parent, parentFilename, main, conditions) => {
        const synthetic = new cjs(parentFilename);
        if (parent.parent !== undefined)
            synthetic.parent = parent.parent;
        synthetic.filename = parentFilename;
        synthetic.paths = [...searchPaths];
        const options = conditions === undefined ? undefined : { conditions };
        return originalFilename.call(cjs, request, synthetic, main, options);
    };
    const resolvePackageImportCjs = (target, conditions) => {
        const state = router.routeUrl(target.specifier, target.parentURL);
        const resolveFrom = (parentURL) => fileURLToPath(esmDefaultResolve(target.specifier, { parentURL, conditions: [...conditions] }).url);
        /* v8 ignore next -- the target manifest was found inside the established profile scope */
        if (state === undefined)
            return resolveFrom(target.parentURL);
        if (state.route.kind === 'native')
            return resolveFrom(target.parentURL);
        const route = state.route;
        if (route.kind === 'native-after-interception')
            return resolveFrom(pathToFileURL(route.parent).href);
        return resolveFrom(pathToFileURL(route.entry.declarer).href);
    };
    const wrappedFilename = (request, parent, main, options) => {
        if (delegatedCjs || !parent?.filename || options?.paths !== undefined) {
            return originalFilename.call(cjs, request, parent, main, options);
        }
        const parentFilename = parent.filename;
        const cacheable = options?.conditions === undefined;
        const routedOptions = options?.conditions === undefined ? undefined : { conditions: options.conditions };
        const state = router.routePath(request, parentFilename, {
            cacheable,
            resolveNative: searchPaths => resolveNativeCjs(request, searchPaths, parent, parentFilename, main, options?.conditions),
            resolveEntry: (entry, after) => {
                delegatedCjs++;
                try {
                    return resolveRoutedCjs(request, { kind: 'interception', entry, after }, parent, main, routedOptions);
                }
                finally {
                    delegatedCjs--;
                }
            },
        });
        if (state === undefined) {
            const scoped = router.hasInterceptionLayerForPath(parentFilename);
            const conditions = options?.conditions ?? cjsConditions;
            const target = request[0] === '#' && scoped
                ? packageImportsTarget(parentFilename, request, conditions)
                : undefined;
            if (target === undefined)
                return originalFilename.call(cjs, request, parent, main, options);
            return resolvePackageImportCjs(target, conditions);
        }
        if (state.cjs !== undefined)
            return state.cjs;
        const route = state.route;
        if (route.kind === 'native') {
            const result = originalFilename.call(cjs, request, parent, main, options);
            if (cacheable)
                state.cjs = result;
            return result;
        }
        delegatedCjs++;
        try {
            let expected;
            try {
                expected = resolveRoutedCjs(request, route, parent, main, routedOptions);
            }
            catch (error) {
                if (route.kind !== 'interception' || !isUnselectedPackageMiss(error))
                    throw error;
                expected = resolveRoutedCjs(request, { kind: 'native-after-interception', parent: route.after }, parent, main, routedOptions);
            }
            if (cacheable)
                state.cjs = expected;
            return expected;
        }
        finally {
            delegatedCjs--;
        }
    };
    cjs._resolveFilename = wrappedFilename;
    return {
        packageDir(specifier, parentURL) {
            return router.packageDir(specifier, parentURL);
        },
        replace(next) { router.replace(next); },
        dispose() {
            /* v8 ignore else -- interceptions are disposed in reverse installation order */
            if (cjs._resolveFilename === wrappedFilename)
                cjs._resolveFilename = originalFilename;
            restoreEsm();
        },
    };
}
/**
 * Publish one runtime resolution for Harness-owned Workers.
 * @param resolution - complete package table and profile scope.
 * @returns a disposer restoring the previous thread environment data.
 */
export function registerWorkerResolution(resolution) {
    const previous = getEnvironmentData(WORKER_RESOLUTION_KEY);
    setEnvironmentData(WORKER_RESOLUTION_KEY, { resolution });
    return () => { setEnvironmentData(WORKER_RESOLUTION_KEY, previous); };
}
//# sourceMappingURL=resolver.js.map