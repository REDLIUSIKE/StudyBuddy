/**
 * Shared boot glue for `dsh` profiles, including the CLI packaged by the Python runtime wheel: load the gitignored
 * `.env`, install the fail-loud Loader guards, resolve the config path (snapshot-aware), load the
 * optional user patch layers from the Harness home (`~/.dsh`), expose its path resolver to
 * config expressions, and drive the Cordis Loader against a leaf `cordis.yml` until the tree settles.
 * @module @deepseek-ai/dsh-app-boot
 */
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { inspect, parseEnv } from 'node:util';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import * as yaml from 'js-yaml';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include, { applyEntryPatches, entryListSchema } from '@deepseek-ai/cordis-plugin-include';
import Group from '@deepseek-ai/cordis-plugin-group';
import { dshHomePath, resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
export { readProfilePatches, resolveTelemetryPatch } from "./profile-context.js";
export { sanitizeProfile } from "./profile-sanitize.js";
export { getDshRuntimeVersion, evaluatePluginCompatibility, pluginCompatibilityWarning } from "./plugin-compatibility.js";
export { PROFILE_COMPATIBILITY_FILENAME, readProfileCompatibility, readProfileVersionExemptions, setProfileVersionExemption, } from "./profile-compatibility.js";
import { prepareProfilePatches } from "./compatibility-preflight.js";
export { prepareProfileEntries, prepareProfilePatches } from "./compatibility-preflight.js";
export { readPluginMeta, resolvePluginResource } from "./package-meta.js";
export { ON_DEMAND_BUNDLES, OFFICIAL_ON_DEMAND_CATALOG } from "./official-bundles.js";
export { generateConfigSchema } from "./config-schema/index.js";
export { createConfigProjector, LOADER_EXPRESSION_SCHEMA } from "./config-schema/projector.js";
export { isNativeConfigSchema } from "./config-schema/native.js";
export { readProfilePlugins, reconcileProfilePlugins, writeProfileBundles, } from "./profile-plugins.js";
export { composeEntries, createRuntimeResolution, ProfileRuntimeResolution, DEFAULT_PROFILE_BUNDLES, OPTIONAL_BUNDLES, bundlePatchFiles, bundlePatchPaths, initProfile, removeLinkProjections, loadProfile, loadProfileDirectory, PROFILE_PATCH_FILENAME, PROFILE_TEMPLATES, PROFILES_DIR, readProfileManifest, reportSkippedBundles, resolveBundleDir, resolveProfileDir, writeProfileManifest, } from "./profile.js";
export { PluginPackages, } from "./profile-resolution/service.js";
/**
 * Resolve the config to boot. Replay swaps a `cordis.yml` basename for
 * `cordis.snapshot.yml` in the same directory; every other mode keeps the path.
 * @param configPath - the requested config path (absolute, or relative to `cwd`).
 * @param snapshotMode - the bin's `$DSH_SNAPSHOT` value; only `'replay'` swaps the
 *   basename.
 * @param cwd - the base a relative `configPath` resolves against.
 * @returns the absolute path of the config to boot.
 */
export function resolveConfigPath(configPath, snapshotMode, cwd = process.cwd()) {
    const absolute = resolve(cwd, configPath);
    if (snapshotMode !== 'replay')
        return absolute;
    const dir = dirname(absolute);
    const replayName = basename(absolute).replace(/cordis\.ya?ml$/, 'cordis.snapshot.yml');
    return resolve(dir, replayName);
}
/**
 * Load the optional gitignored `.env` from `dir`. Missing files fall back to the
 * ambient environment; other read failures are reported through `warn`.
 * @param binName - the diagnostic prefix on the warn line.
 * @param dir - the directory whose `.env` to load.
 * @param warn - sink for the one-line misconfiguration diagnostic.
 */
export function loadEnv(binName, dir = process.cwd(), warn = line => void process.stderr.write(line)) {
    try {
        process.loadEnvFile(resolve(dir, '.env'));
    }
    catch (error) {
        if (error?.code !== 'ENOENT') {
            warn(`${binName}: failed to load .env: ${String(error)}\n`);
        }
        // ENOENT (no .env) is fine — rely on the ambient environment.
    }
}
/** Exact names no discovered file may set. */
const BOOTSTRAP_NAMES = new Set([
    // Process launch and module resolution.
    'PATH', 'HOME', 'USERPROFILE', 'SHELL',
    'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS',
    'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
    // Interpreter startup hooks.
    'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS',
    'PERL5OPT', 'PERL5LIB', 'PYTHONSTARTUP', 'PYTHONPATH', 'RUBYOPT', 'RUBYLIB',
    'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS',
    'PYTHONHOME',
    // Version-control hooks, config redirects, and ambient command selectors.
    'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_EXTERNAL_DIFF', 'GIT_PAGER', 'GIT_EDITOR',
    'GIT_ASKPASS', 'SSH_ASKPASS',
    'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_COUNT',
    'EDITOR', 'VISUAL', 'PAGER', 'BROWSER',
    // Network reach and trust.
    'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL',
    'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
    'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE',
    'NODE_TLS_REJECT_UNAUTHORIZED',
]);
/** Name prefixes no discovered file may set. */
const BOOTSTRAP_PREFIXES = ['DSH_', 'XDG_', 'DYLD_', 'BASH_FUNC_'];
/**
 * The bootstrap names the Harness-home `.env` alone may set. A proxy chooses the route every
 * request takes, so the invoking directory's file — which arrives with a clone — keeps refusing
 * them; the home file is the user's own, and `DSH_HOME` is itself bootstrap-only, so no `.env` can
 * relocate this exemption. The CA and TLS names in the same group stay refused everywhere: they
 * change what is trusted, not where traffic goes.
 */
const HOME_LAYER_PROXY_NAMES = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']);
/**
 * Whether a variable may come only from the inherited process environment
 * because it changes process, runtime, VCS, or network bootstrap. The Harness-home
 * file is additionally allowed {@link HOME_LAYER_PROXY_NAMES}.
 * @param name - the variable name.
 * @returns true when only the inherited environment may supply it.
 */
function isBootstrapOnly(name) {
    const upper = name.toUpperCase();
    return BOOTSTRAP_NAMES.has(upper) || BOOTSTRAP_PREFIXES.some(prefix => upper.startsWith(prefix));
}
/**
 * Parse one directory's `.env` without applying it, rejecting bootstrap-only
 * names before any value is materialized.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param dir - the directory whose `.env` to read.
 * @param warn - sink for the one-line unreadable-file diagnostic.
 * @param home - the resolved Harness home; when `dir` is it, {@link HOME_LAYER_PROXY_NAMES} are accepted.
 * @returns the parsed entries, or `undefined` when the file is absent or unreadable.
 * @throws when the file declares a name {@link isBootstrapOnly} rejects and this layer may not set.
 */
function readEnvLayer(binName, dir, warn, home) {
    const path = resolve(dir, '.env');
    const isHome = resolve(dir) === home;
    let content;
    try {
        content = readFileSync(path, 'utf8');
    }
    catch (error) {
        if (error?.code !== 'ENOENT') {
            warn(`${binName}: failed to load .env: ${String(error)}\n`);
        }
        // ENOENT (no .env) is fine — rely on the ambient environment.
        return undefined;
    }
    // Parse once so validation and materialization use exactly the same entries.
    const values = parseEnv(content);
    for (const name of Object.keys(values)) {
        if (!isBootstrapOnly(name))
            continue;
        const proxyName = HOME_LAYER_PROXY_NAMES.has(name.toUpperCase());
        if (isHome && proxyName)
            continue;
        // A proxy name has a second way out that the other bootstrap names do not, so its message says so.
        const remedy = proxyName
            ? `export ${name}, or put it in ${resolve(home, '.env')}, which does not travel with a repository`
            : `export ${name} instead of putting it in a .env file`;
        throw new Error(`${binName}: ${path} sets "${name}", which only the launching environment may set`
            + ' (it decides how this process starts, where its code and instructions load from, or how it'
            + ` reaches the network); ${remedy}`);
    }
    return { path, values };
}
/**
 * Load the product CLI's inherited > invoking-directory `.env` > Harness-home
 * `.env` snapshot. The Harness home resolves before either file; both files
 * are checked before either is applied, and accepted values are materialized
 * without replacing inherited ones. The snapshot preserves which layer supplied each value.
 * @param binName - the diagnostic prefix on the diagnostics.
 * @param cwd - the invoking directory whose `.env` is the project layer.
 * @param warn - sink for the one-line misconfiguration diagnostics.
 * @returns this run's frozen environment snapshot.
 * @throws when either file declares a bootstrap-only variable, except {@link HOME_LAYER_PROXY_NAMES} in the Harness-home file.
 */
export function loadLayeredEnv(binName, cwd = process.cwd(), warn = line => void process.stderr.write(line)) {
    const home = resolveDshHome();
    const inherited = { ...process.env };
    // Parse both layers first: a rejection must not leave one file applied.
    const project = readEnvLayer(binName, cwd, warn, home);
    const user = home === resolve(cwd) ? undefined : readEnvLayer(binName, home, warn, home);
    // Apply the checked values without replacing a higher-ranked name.
    for (const layer of [project, user]) {
        if (layer === undefined)
            continue;
        for (const [name, value] of Object.entries(layer.values)) {
            if (process.env[name] === undefined)
                process.env[name] = value;
        }
    }
    return createLaunchEnvironmentSnapshot([
        { source: 'process', values: inherited },
        ...project === undefined ? [] : [{ source: 'project-env', path: project.path, values: project.values }],
        ...user === undefined ? [] : [{ source: 'user-env', path: user.path, values: user.values }],
    ]);
}
const bootstrapIncludes = new WeakMap();
// The include's YAML dialect (`!!js` scalars become expression nodes the
// Loader interpolates against each entry's injection-ready context), imported
// from the include itself so patch parsing and config dumping can never drift
// from what the include mounts. User patch layers share it so they may
// reference `process.env`.
const userPatchesSchema = entryListSchema;
/** Apply one complete patch generation and wait for Loader activation diagnostics.
 * @param ctx Booted root context.
 * @param patches Complete ordered patch list.
 * @param binName Diagnostic prefix.
 * @param requiredIds Explicit enablement targets whose existing failures also reject reconciliation.
 * @returns Diagnostics for unchanged pre-existing inactive entries; new or changed failures reject.
 */
export async function reconcileProfilePatches(ctx, patches, binName, requiredIds = []) {
    const entry = bootstrapIncludes.get(ctx);
    if (entry === undefined)
        throw new Error(`${binName}: profile reload requires the root Include entry`);
    const previousFailures = (await inactiveEntries(ctx)).map(failure => ({
        ...failure, diagnostic: inactiveDiagnostic(failure), fiber: failure.entry.fiber, options: JSON.stringify(failure.entry.options),
    }));
    // Removed entries leave the Loader store before their async disposers finish.
    const previousFibers = [...ctx.loader.entries()].flatMap(row => row.fiber === undefined ? [] : [{
            fiber: row.fiber, failed: row.fiber.state === FIBER_FAILED || row.fiber.state === FIBER_DISPOSED,
        }]);
    const { patches: _previous, ...includeConfig } = entry.options.config;
    // The recomposition judges the rows the launch judged, resolved from the file this Include read.
    const parentURL = new URL('.', new URL(includeConfig.path, entry.parent.tree.ctx.baseUrl)).href;
    const prepared = prepareProfilePatches(ctx, patches, parentURL, binName);
    await entry.update({ config: { ...includeConfig, patches: prepared } });
    const results = await Promise.allSettled(previousFibers.map(({ fiber }) => fiber.await()));
    await ctx.loader.await();
    const failures = await inactiveEntries(ctx);
    const introduced = failures.filter(failure => requiredIds.includes(failure.entry.options.id) || !previousFailures.some(previous => previous.entry === failure.entry && previous.fiber === failure.entry.fiber
        && previous.options === JSON.stringify(failure.entry.options) && previous.diagnostic === inactiveDiagnostic(failure)));
    if (introduced.length > 0)
        throw new Error(activationDiagnostic(binName, introduced).trimEnd());
    for (const [index, result] of results.entries()) {
        if (result.status === 'rejected' && !previousFibers[index]?.failed)
            throw result.reason;
    }
    ctx.emit('app-boot/config-reload');
    return failures.map(inactiveDiagnostic);
}
/**
 * Load an optional patch-list file: a top-level YAML array of loader patch
 * entries (`@deepseek-ai/cordis-plugin-include`'s `PatchOptions`): id-targeted config
 * overrides and `insert` lists, with `!!js` expressions allowed. A missing
 * file means "no layer"; an unreadable, unparsable, or non-array file throws —
 * a present patch file that cannot apply is a misconfiguration and must fail
 * loud at boot, never be silently skipped.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - absolute path of the patch file.
 * @returns the parsed patches, or `undefined` when the file does not exist.
 */
export function loadOptionalPatches(binName, file) {
    let content;
    try {
        content = readFileSync(file, 'utf8');
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return undefined;
        throw new Error(`${binName}: failed to read patches ${file}: ${String(error)}`);
    }
    return parsePatchList(binName, file, content, 'patches');
}
/**
 * Load a required overlay patch list: a bundle's `cordis.patch.yml` or a
 * `--patch <path>` overlay. Same file format as {@link loadOptionalPatches},
 * but a missing file throws, because the caller named this file — its absence
 * is a misconfiguration, not "no overlay".
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - absolute path of the overlay file.
 * @returns the parsed patch list.
 */
export function loadOverlayPatches(binName, file) {
    let content;
    try {
        content = readFileSync(file, 'utf8');
    }
    catch (error) {
        throw new Error(`${binName}: failed to read overlay ${file}: ${String(error)}`);
    }
    return parsePatchList(binName, file, content, 'overlay');
}
/** Convert inserted filesystem paths to file URLs, anchoring relative paths beside the patch; keep assertion names literal. */
function anchorInsertedPluginNames(patches, file) {
    const base = dirname(resolve(file));
    const visit = (entry) => {
        if (typeof entry.name === 'string' && (isAbsolute(entry.name) || entry.name.startsWith('./') || entry.name.startsWith('../'))) {
            entry.name = pathToFileURL(resolve(base, entry.name)).href;
        }
        if (entry.group && Array.isArray(entry.config))
            entry.config.forEach(visit);
    };
    for (const patch of patches)
        patch.insert?.forEach(visit);
    return patches;
}
/**
 * Parse one loader patch list: a top-level YAML array of
 * `@deepseek-ai/cordis-plugin-include` `PatchOptions` (id-targeted config overrides and
 * `insert` lists, `!!js` expressions allowed). Every invalid field or value throws,
 * because a patch file that cannot be applied at all is a misconfiguration; a
 * single patch whose target row is absent stays a per-entry Loader warning, so
 * one overlay shared across surfaces does not have to match every tree.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - the source path, quoted in errors.
 * @param content - the file's text.
 * @param label - what to call this list in errors (`patches`, `overlay`).
 * @returns the parsed patch list.
 */
function parsePatchList(binName, file, content, label) {
    let parsed;
    try {
        parsed = yaml.load(content, { schema: userPatchesSchema });
    }
    catch (error) {
        throw new Error(`${binName}: failed to parse ${label} ${file}: ${String(error)}`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`${binName}: ${label} ${file} must be a top-level YAML array of loader patch entries`);
    }
    parsed.forEach((entry, index) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error(`${binName}: ${label} entry ${index + 1} in ${file} must be a mapping (a loader patch entry)`);
        }
    });
    return anchorInsertedPluginNames(parsed, file);
}
/**
 * Compose the configured entry list: parse the base config file with the
 * include's entry-list dialect, apply every layer's patches as ONE flattened
 * list through the include's own patch algorithm (`applyEntryPatches`) — the
 * same call `boot()` makes, so even patch-visibility corner cases (a later
 * layer targeting a group child a plain config replacement introduced, which
 * the single-pass id index never sees) compose identically — then render the
 * result as YAML in the same dialect (`!!js` expressions print verbatim,
 * unevaluated). Row admission is a later stage: a plugin row the compatibility
 * policy denies still appears here, while a denied bundle contributes no layer.
 *
 * Every run of rows from the same file and patch layers is preceded by a `# ==` comment
 * naming the file that contributed the rows and any layers that patched them,
 * so the output stays a loadable YAML document while showing which section
 * comes from which file. The file and patch labels are derived from single-call prefix
 * snapshots (base + layers 1..k), diffed positionally: the patch algorithm
 * only rewrites rows in place or appends, so a top-level index identifies one
 * row across snapshots, and a layer whose addition changes the row (config
 * replacement, disable, group insert) is listed as having patched it.
 *
 * A patch that matches no row is reported through `warn` with its layer
 * label, mirroring the Loader's boot-time warning. Earlier layers' patches
 * see an identical preceding state in every snapshot that includes them, so
 * each snapshot's warning list extends the previous one and the new tail
 * belongs to the added layer.
 * @param binName - the diagnostic prefix on read/parse errors.
 * @param absoluteConfigPath - the base config file `boot()` would include.
 * @param layers - overlay layers in application order (later wins).
 * @param warn - sink for skipped-patch diagnostics; defaults to stderr.
 * @returns the composed entry list rendered as a YAML document with
 * source comment separators.
 */
export function renderConfigDump(binName, absoluteConfigPath, layers, warn = line => void process.stderr.write(`${line}\n`)) {
    let content;
    try {
        content = readFileSync(absoluteConfigPath, 'utf8');
    }
    catch (error) {
        throw new Error(`${binName}: failed to read config ${absoluteConfigPath}: ${String(error)}`);
    }
    let parsed;
    try {
        parsed = yaml.load(content, { schema: entryListSchema });
    }
    catch (error) {
        throw new Error(`${binName}: failed to parse config ${absoluteConfigPath}: ${String(error)}`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`${binName}: config ${absoluteConfigPath} must be a top-level YAML array of entries`);
    }
    const baseLabel = basename(absoluteConfigPath);
    // YAML parsing yields untyped rows; the include validates each entry
    // at mount, and the dump prints whatever the file holds, so `EntryOptions`
    // here is structural trust in the same file `boot()` would include.
    const base = parsed;
    // snapshot_k = ONE application of layers 1..k flattened, using the exact
    // arguments boot passes for that prefix. snapshot_N is the mounted composition.
    // The patches are cloned per call: applyEntryPatches detaches the entry
    // list but pushes `insert` rows by reference from the patch list, so
    // sharing patch objects across snapshot calls would leak a later
    // snapshot's mutations into an earlier one's result.
    const snapshot = (count, warnings) => {
        const flattened = structuredClone(layers.slice(0, count).flatMap(layer => layer.patches));
        return applyEntryPatches(base, flattened, (message, ...args) => {
            // The include logs through cordis's printf-style logger (`%C` = code); a
            // dump has no logger, so substitute inline for a plain line.
            let index = 0;
            warnings.push(message.replace(/%C/g, () => JSON.stringify(args[index++])));
        });
    };
    let previous = base;
    let previousWarnings = [];
    const entryOrigins = base.map(() => ({ origin: baseLabel, patchedBy: [] }));
    let composed = base;
    for (let count = 1; count <= layers.length; count += 1) {
        const layer = layers[count - 1];
        /* v8 ignore next -- count iterates 1..length, so the slot exists */
        if (layer === undefined)
            continue;
        const warnings = [];
        composed = snapshot(count, warnings);
        for (const line of warnings.slice(previousWarnings.length)) {
            warn(`${binName}: [${layer.label}] ${line}`);
        }
        const before = previous.map(entry => JSON.stringify(entry));
        for (let index = 0; index < composed.length; index += 1) {
            if (index >= before.length)
                entryOrigins.push({ origin: layer.label, patchedBy: [] });
            else if (JSON.stringify(composed[index]) !== before[index])
                entryOrigins[index]?.patchedBy.push(layer.label);
        }
        previous = composed;
        previousWarnings = warnings;
    }
    return groupedDump(composed, entryOrigins);
}
/** Render the composed rows grouped under one source-and-patches comment per contiguous run. */
function groupedDump(composed, entryOrigins) {
    const lines = [];
    let currentLabel;
    let group = [];
    const flush = () => {
        if (currentLabel === undefined || group.length === 0)
            return;
        lines.push(`# == ${currentLabel}`);
        lines.push(yaml.dump(group, { schema: entryListSchema, noRefs: true }).trimEnd());
        group = [];
    };
    for (let index = 0; index < composed.length; index += 1) {
        const record = entryOrigins[index];
        /* v8 ignore next -- this array is index-aligned with composed by construction */
        if (record === undefined)
            continue;
        const label = record.patchedBy.length === 0
            ? record.origin
            : `${record.origin}, patched by ${record.patchedBy.join(', ')}`;
        if (label !== currentLabel) {
            flush();
            currentLabel = label;
        }
        group.push(composed[index]);
    }
    flush();
    return lines.join('\n') + '\n';
}
/**
 * Mount and remember the exact root Include entry used by app boot and user patch-layer HMR.
 * @param ctx - context carrying an initialized Loader service.
 * @param absoluteConfigPath - absolute YAML or JSON configuration path.
 * @param patches - initial app and user patches, applied in order.
 * @param bareModuleBaseUrl - optional installed-host base for bare package
 * names; relative names continue to resolve beside the configuration file.
 * @param binName - diagnostic prefix for a profile plugin denied by compatibility policy; defaults to `dsh`.
 * @returns the created root Include entry, or `undefined` when a surface
 * disposed the whole tree (taking the Loader service with it) while the
 * entry creation was in flight.
 */
export async function mountRootInclude(ctx, absoluteConfigPath, patches = [], bareModuleBaseUrl, binName = 'dsh') {
    ctx.loader.builtins.include = bareModuleBaseUrl === undefined
        ? Include
        : class HostResolvedRootInclude extends Include {
            import(name, getOuterStack) {
                const specifier = isAbsolute(name) ? pathToFileURL(name).href : name;
                if (name.startsWith('.') || name.startsWith('cordis:'))
                    return super.import(specifier, getOuterStack);
                const internal = this.ctx.loader.internal;
                /* v8 ignore next -- Node supplies the internal loader; this preserves the
                   original diagnostic for hypothetical embedders without it. */
                if (internal === undefined)
                    return super.import(specifier, getOuterStack);
                return internal.import(specifier, bareModuleBaseUrl, {});
            }
        };
    // `cordis:group` alongside it: a group row is how a composition gives one
    // `isolate` realm to a provider and its consumers together, and an agent
    // preset living outside this workspace cannot resolve `@deepseek-ai/cordis-plugin-group`
    // by name. Both builtins load through the ambient module pipeline, so neither
    // depends on the included tree's own specifier resolution.
    ctx.loader.builtins.group = Group;
    // Pinned id: the bootstrap include is app glue, not a config row, and its
    // id appears in Loader failure chains — a random id would make startup
    // diagnostics unstable across runs (and snapshot fixtures).
    // The launcher's own copy is prepared here: compatibility decisions must be made before the root
    // Include imports anything, and they change no profile patch layer, manifest, or bundle list.
    const prepared = prepareProfilePatches(ctx, [...patches], pathToFileURL(dirname(absoluteConfigPath)).href + '/', binName);
    const includeConfig = {
        path: pathToFileURL(absoluteConfigPath).href,
        ...prepared.length > 0 ? { patches: prepared } : {},
    };
    const rootInclude = {
        id: 'include',
        name: 'cordis:include',
        config: includeConfig,
    };
    const includeId = await ctx.loader.create(rootInclude);
    const loader = ctx.get('loader');
    if (loader === undefined)
        return undefined;
    const entry = loader.resolve(includeId);
    bootstrapIncludes.set(ctx, entry);
    return entry;
}
// Loader rc.5 derives and drops a rejected promise after a fiber fails. Keep
// exact reasons already folded into the boot diagnostic visible through the
// next process rejection checkpoint so the process guard can coalesce them.
const assembledActivationRejections = new Map();
function retainAssembledRejection(reason) {
    assembledActivationRejections.set(reason, (assembledActivationRejections.get(reason) ?? 0) + 1);
}
function releaseAssembledRejection(reason) {
    const count = assembledActivationRejections.get(reason);
    if (count === undefined || count === 1) {
        assembledActivationRejections.delete(reason);
    }
    else {
        assembledActivationRejections.set(reason, count - 1);
    }
}
async function observeLoaderRejectionCheckpoint(reasons) {
    for (const reason of reasons)
        retainAssembledRejection(reason);
    try {
        await new Promise(resolve => setImmediate(resolve));
    }
    finally {
        for (const reason of reasons)
            releaseAssembledRejection(reason);
    }
}
/**
 * How long {@link installFailLoud} waits for its `release` hook before exiting
 * anyway. A wedged disposer must delay the fatal exit, never cancel it.
 */
export const FAIL_LOUD_RELEASE_TIMEOUT_MS = 2_000;
/**
 * Install before boot to turn an unhandled rejection or an uncaught exception,
 * at any point in the process lifetime, into one labelled stderr diagnostic and
 * `exit(1)`. A rejection already included by {@link auditStartupEntries} is
 * ignored during its process checkpoint; every other rejection and every
 * uncaught exception remains fatal. Control never returns to the failed
 * operation after either: only the throw site knows which state is intact, and
 * a listener that threw mid-update (a stream `'data'` handler, a half-applied
 * registry write) leaves silently wrong results behind if it were resumed. The
 * event loop keeps running only until the release hook settles or times out.
 * Stdout remains untouched for ACP; the returned function removes both handlers.
 *
 * The diagnostic is `util.inspect(err)`, not `err.stack`: a `node:fs` error's
 * `code`, `syscall`, and `path` and any `cause` chain are enumerable properties
 * that the stack line omits, and they are what a crash report needs. Once a
 * handler is installed Node prints nothing of its own, so this line is the
 * only record of the failure.
 *
 * The Loader mounts entries concurrently, so a surface that owns the terminal
 * can already hold it when a sibling entry rejects. Exiting straight from the
 * handler would strand raw mode, bracketed paste, and the keyboard protocol on
 * the user's shell, and leave an in-flight terminal query's reply to land as
 * literal text at the next prompt. `release` is the terminal owner's chance to
 * hand it back; it is awaited under {@link FAIL_LOUD_RELEASE_TIMEOUT_MS}, whose
 * timer stays referenced so a never-settling disposer cannot let Node reach an
 * empty event loop and exit 0 instead of failing.
 *
 * The diagnostic is written before the release so a hanging or failing disposer
 * cannot swallow the reason. The handler stays installed while the release runs
 * — removing it would let a second concurrent rejection become uncaught and kill
 * the process mid-teardown, stranding exactly the terminal state this restores —
 * so a latch keeps the first rejection the reported one and lets later
 * rejections (including the release's own) fall through to the pending exit.
 * @param binName - the diagnostic prefix on the fatal-failure line.
 * @param proc - the process slice to register on; tests inject a fake.
 * @param release - optional teardown awaited before exit, used by a
 *   terminal-owning surface to restore the terminal. Its own failure is
 *   swallowed because the pending fatal exit already owns the outcome.
 * @returns the uninstaller that removes both handlers.
 */
export function installFailLoud(binName, proc = process, release) {
    let exiting = false;
    const report = (err, label) => {
        // A release in flight already owns the exit. Swallow later failures
        // (teardown's own included) rather than reporting a second failure over the
        // real one or letting Node kill the process before the terminal is back.
        if (exiting)
            return;
        exiting = true;
        proc.stderr.write(`${binName}: ${label}: ${inspect(err, { depth: 4, maxArrayLength: 50 })}\n`);
        if (release === undefined) {
            proc.exit(1);
            return;
        }
        void (async () => {
            // Definitely assigned: the timeout promise's executor runs synchronously
            // while the race is being constructed, before the first await.
            let timer;
            try {
                await Promise.race([
                    (async () => release())(),
                    new Promise((resolve) => {
                        timer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS);
                    }),
                ]);
            }
            catch {
                // The terminal release failed; the fatal exit below is the outcome that
                // matters, and no reporter runs after it.
            }
            clearTimeout(timer);
            proc.exit(1);
        })();
    };
    const onRejection = (err) => {
        if (assembledActivationRejections.has(err))
            return;
        // Label kept stable: the Web profile expected-output e2e tests match it.
        report(err, 'fatal load failure');
    };
    const onException = (err) => { report(err, 'fatal uncaught exception'); };
    const uninstall = () => {
        proc.off('unhandledRejection', onRejection);
        proc.off('uncaughtException', onException);
    };
    proc.on('unhandledRejection', onRejection);
    proc.on('uncaughtException', onException);
    return uninstall;
}
/**
 * Value mirrors used because Cordis's const enum has no runtime object to import.
 * Keep aligned with `packages/client/web/src/loader-status.ts`.
 */
const FIBER_PENDING = 0;
const FIBER_ACTIVE = 2;
const FIBER_FAILED = 3;
const FIBER_DISPOSED = 4;
/**
 * Entry ids whose presence defines a usable DSH application.
 *
 * The list is global rather than profile metadata. Missing or disabled ids do
 * not affect startup; an enabled listed entry must activate. The list covers
 * shared Agent execution, application endpoints, and Web bootstrap/transport.
 */
const requiredStartupEntryIds = new Set([
    'agent-loop',
    'webserver',
    'web-runtime',
    'modules',
    'connection',
    'headless-runner',
    'acp',
    'sdk-jsonrpc-server',
]);
/** Render plugin stacks, nested causes, and aggregate member failures once per error. */
function formatActivationError(error) {
    const details = [];
    const seen = new Set();
    function visit(value) {
        if (!(value instanceof Error)) {
            details.push(String(value));
            return;
        }
        if (seen.has(value))
            return;
        seen.add(value);
        details.push(value.stack ?? value.message);
        if (value.cause !== undefined)
            visit(value.cause);
        if (value instanceof AggregateError)
            value.errors.forEach(visit);
    }
    visit(error);
    return details.join('\n');
}
/** Startup audit failure with non-enumerable metadata and original failures as its cause. */
export class StartupError extends Error {
    entries;
    /** Root configuration and startup logs, attached by boot after disposal. */
    startup;
    /**
     * @param message - concise terminal diagnostic.
     * @param entries - inactive plugin metadata and original failure values.
     */
    constructor(message, entries) {
        const failures = entries.flatMap(({ outcome }) => outcome.kind === 'failed' ? [outcome.error] : []);
        super(message, failures.length > 0 ? { cause: new AggregateError(failures, 'Plugin activation failures') } : undefined);
        this.entries = entries;
        Object.defineProperties(this, {
            entries: { enumerable: false },
            startup: { enumerable: false },
        });
    }
}
/**
 * Collect Loader activation failures and disabled-expression errors. Failed
 * fibers are awaited to recover their recorded rejection reason and coalesce
 * duplicate Loader notifications through the next process rejection checkpoint.
 */
async function inactiveEntries(ctx) {
    const failures = [];
    const rejectionReasons = [];
    for (const entry of ctx.loader.entries()) {
        try {
            if (entry.disabled)
                continue;
        }
        catch (error) {
            failures.push({ entry, outcome: { kind: 'failed', error, phase: 'disabled expression failed' } });
            continue;
        }
        const fiber = entry.fiber;
        if (fiber === undefined) {
            failures.push({ entry, outcome: { kind: 'failed', error: 'failed to import' } });
            continue;
        }
        const state = fiber.state;
        if (state === FIBER_ACTIVE)
            continue;
        if (state === FIBER_FAILED) {
            try {
                await fiber.await();
            }
            catch (error) {
                rejectionReasons.push(error);
                failures.push({ entry, outcome: { kind: 'failed', error } });
            }
            continue;
        }
        if (state === FIBER_PENDING) {
            const missing = Object.keys(fiber.inject).filter(service => fiber.ctx.get(service) === undefined);
            failures.push({
                entry,
                outcome: { kind: 'pending', missing },
            });
        }
        else {
            failures.push({ entry, outcome: { kind: 'failed', error: `fiber state ${String(state)}` } });
        }
    }
    if (rejectionReasons.length > 0)
        await observeLoaderRejectionCheckpoint(rejectionReasons);
    return failures;
}
/** Render one failed plugin's original error and activation phase. */
function failureDetail(outcome) {
    return `${outcome.phase === undefined ? '' : `${outcome.phase}: `}${formatActivationError(outcome.error)}`;
}
/** Render optional-only warnings without changing startup policy. */
function activationDiagnostic(binName, failures) {
    const noun = failures.length === 1 ? 'entry' : 'entries';
    return `${binName}: warning: ${String(failures.length)} ${noun} did not activate\n${failures.map(inactiveDiagnostic).join('\n')}\n`;
}
/** Stable per-entry text for reload comparisons and optional warnings. */
function inactiveDiagnostic({ entry, outcome }) {
    const detail = outcome.kind === 'failed' ? failureDetail(outcome)
        : `pending (waiting for ${outcome.missing.length === 1 ? 'service' : 'services'}: ${outcome.missing.join(', ') || 'unknown'})`;
    return `${entry.options.id} (${entry.options.name}): ${detail}`;
}
/** Group startup failures and pending services, marking every required entry. */
function startupDiagnostic(binName, failures, required) {
    const lines = [`${binName}: startup failed: ${String(required.size)} required ${required.size === 1 ? 'plugin' : 'plugins'} did not activate`];
    const failed = failures.flatMap(({ entry, outcome }) => outcome.kind === 'failed' ? [{ entry, outcome }] : []);
    const pending = failures.flatMap(({ entry, outcome }) => outcome.kind === 'pending' ? [{ entry, outcome }] : []);
    pending.sort((left, right) => Number(required.has(right.entry)) - Number(required.has(left.entry)));
    const label = (entry) => `${entry.options.id}${required.has(entry) ? ' (required)' : ''}`;
    if (failed.length > 0) {
        lines.push('', `Failed plugins (${String(failed.length)}):`);
        for (const { entry, outcome } of failed) {
            lines.push(`  ${label(entry)}`, `    Package: ${entry.options.name}`);
            lines.push(...failureDetail(outcome).split('\n').map(line => `    ${line}`));
        }
    }
    if (pending.length > 0) {
        const width = Math.max('Plugin'.length, ...pending.map(({ entry }) => label(entry).length)) + 2;
        lines.push('', `Plugins waiting for services (${String(pending.length)}):`, `  ${'Plugin'.padEnd(width)}Missing services`);
        for (const { entry, outcome } of pending) {
            lines.push(`  ${label(entry).padEnd(width)}${outcome.missing.join(', ') || 'unknown'}`);
        }
    }
    return lines.join('\n');
}
/**
 * Apply DSH startup policy to a settled Loader tree.
 *
 * Inactive entries from the global required list reject startup. Other
 * inactive entries join that failure diagnostic, or produce one warning when
 * no required entry failed and leave successful siblings running.
 * Required ids absent from the tree, and disabled required entries, are ignored.
 * A throwing disabled expression is an entry failure, not a disabled entry.
 * The bootstrap Include must activate so unreadable or invalid root config is fatal.
 * @param ctx - the settled context whose Loader entries to audit.
 * @param binName - the prefix on startup diagnostics.
 * @param warn - sink for optional-entry warnings.
 * @returns after optional warnings if required startup checks pass.
 * @throws {@link StartupError} when the bootstrap Include or a required entry is inactive or its disabled expression throws;
 * its message includes optional failures too.
 */
export async function auditStartupEntries(ctx, binName, warn = line => void process.stderr.write(line)) {
    const failures = await inactiveEntries(ctx);
    const required = new Set(failures.filter(({ entry }) => entry === bootstrapIncludes.get(ctx)
        || requiredStartupEntryIds.has(entry.options.id)).map(({ entry }) => entry));
    if (required.size > 0) {
        throw new StartupError(startupDiagnostic(binName, failures, required), failures.map(({ entry, outcome }) => ({
            id: entry.options.id, module: entry.options.name, required: required.has(entry), fiberState: entry.fiber?.state, outcome,
        })));
    }
    if (failures.length > 0)
        warn(activationDiagnostic(binName, failures));
}
/**
 * Boot the Loader against `absoluteConfigPath` and return only after the whole
 * tree settles. Relative entry names resolve against the config directory;
 * bare package names resolve there by default or against an explicit
 * `bareModuleBaseUrl` for closed packaged runtimes. The bootstrap include
 * is statically imported and mounted as the `cordis:include` builtin, loading
 * through the ambient module pipeline (vite/tsx/plain ESM). The package build
 * embeds Include while leaving Loader external, so the built include tree and
 * host share one Loader peer. Loader settlement drains entry work without
 * rejecting the whole tree. The final {@link auditStartupEntries} call rejects
 * failures in the global required list and warns about other failed, missing,
 * and pending entries while successful siblings remain active. Later unhandled
 * rejections remain covered by {@link installFailLoud}. Built bins need the Loader's native
 * helper for bare plugin specifiers; relative specifiers do not.
 * @param binName - the diagnostic prefix for load-failure errors.
 * @param absoluteConfigPath - the config to include; must already be absolute
 * (see {@link resolveConfigPath}).
 * @param patches - optional overlay patches applied over the included tree
 * (see {@link loadOptionalPatches}); an empty list mounts none.
 * @param prepare - optional host setup run after Loader installation and before any config-tree entry mounts.
 * @param bareModuleBaseUrl - optional installed-host base for bare package
 * names; use it when the host, rather than the configuration project, owns the
 * complete plugin set.
 * @returns the root context after the initial startup audit, or as soon as a
 * surface disposed the tree while startup was still in flight.
 * @throws {@link StartupError} for an inactive required entry, including all inactive plugins in its message;
 * otherwise a labelled error after disposing the partial context — `host
 * preparation failed` when `prepare` threw before any config-tree entry
 * mounted, `plugin tree failed to load` afterwards. Cyclic causes terminate
 * diagnostic traversal without replacing the original cause.
 */
export async function boot(binName, absoluteConfigPath, patches, prepare, bareModuleBaseUrl) {
    const ctx = new Context();
    const startupLogs = [];
    // The collector must outlive root disposal to retain asynchronous cleanup errors.
    const diagnostics = new Context();
    diagnostics.logger = ctx.logger;
    diagnostics.logger.exporter({
        levels: { default: 2 },
        export: ({ ts, name, type, args }) => {
            if (type === 'warn' || type === 'error')
                startupLogs.push({ ts, name, type, args });
        },
    });
    // Two failure labels: `prepare` runs before any config-tree entry mounts,
    // so its failure is host setup, not the plugin tree.
    let stage = 'host preparation failed';
    try {
        ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href + '/';
        ctx.provide('dshHomePath', dshHomePath);
        // Fiber.update() discards the restart promise. Observe it before the
        // waterfall returns; activation audits still report the failed fiber.
        ctx.on('internal/update', (_config, _noSave, next) => {
            void Promise.resolve(next()).catch((error) => { ctx.logger.error(error); });
        }, { global: true, prepend: true });
        await ctx.plugin(Loader);
        await prepare?.(ctx);
        stage = 'plugin tree failed to load';
        await mountRootInclude(ctx, absoluteConfigPath, patches, bareModuleBaseUrl, binName);
        // A surface can finish and dispose the whole tree while startup is still
        // in flight, before the last entry settles. The Loader service goes with
        // it, and the activation audit describes a live tree — reading `ctx.loader`
        // past this point would throw a TypeError over an app that exited exactly
        // as asked. Re-check after settlement before auditing the tree.
        await ctx.get('loader')?.await();
        if (ctx.get('loader') === undefined)
            return ctx;
        await auditStartupEntries(ctx, binName);
        return ctx;
    }
    catch (cause) {
        // Root-fiber disposal contains cleanup failures per observer (Cordis
        // fiber.ts hardening) and a repeated call returns the settled single-shot
        // result, so this await cannot reject and replace `cause`.
        await ctx.fiber.dispose();
        if (cause instanceof StartupError) {
            cause.startup = { configurationPath: absoluteConfigPath, messages: startupLogs };
            throw cause;
        }
        const detail = cause instanceof Error ? cause.message : String(cause);
        // A wrapper can carry an activation error whose original stack names the failed plugin.
        let deepest = cause;
        const seen = new Set();
        while (deepest instanceof Error && !seen.has(deepest) && deepest.cause !== undefined) {
            seen.add(deepest);
            deepest = deepest.cause;
        }
        const stack = deepest instanceof AggregateError
            ? `\n${deepest.stack ?? deepest.message}\n${deepest.errors.map(formatActivationError).join('\n')}`
            : deepest instanceof Error && deepest !== cause ? `\n${deepest.stack ?? deepest.message}` : '';
        throw new Error(`${binName}: ${stage}: ${detail}${stack}`, { cause });
    }
    finally {
        await diagnostics.fiber.dispose();
    }
}
/** Prompt-section name for the harness-source location line an app bin adds after boot. */
export const HARNESS_SOURCE_SECTION = 'harness:source';
/**
 * Add a global prompt section naming the on-disk harness source checkout while
 * explicitly distinguishing it from the task workspace and current working
 * directory. The self-referential `dsh-tool-cordis` toolset reads and edits this
 * checkout. Call once on the settled boot context ({@link boot}); the section
 * uses the shared first-party placement after reusable instructions
 * and before the Web surface and persona suffix. A booted tree with no
 * `systemPrompt` service has no prompt to augment, so this is then a no-op
 * that returns `undefined`. The section is
 * registered against the `systemPrompt` service's fiber, so a dev HMR reload of
 * that plugin drops it until the next boot.
 * @param ctx - the settled boot context whose global system prompt to augment.
 * @param sourceRoot - the absolute path to the harness checkout root.
 * @returns the section disposer, or `undefined` when no `systemPrompt` service is mounted.
 */
export function addHarnessSourceSection(ctx, sourceRoot) {
    const systemPrompt = ctx.get('systemPrompt');
    if (systemPrompt === undefined)
        return undefined;
    return systemPrompt.section({
        name: HARNESS_SOURCE_SECTION,
        order: systemPrompt.getSectionOrder('HARNESS_SOURCE'),
        text: `The DeepSeek Harness implementation checkout is at ${sourceRoot}. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.`,
    });
}
//# sourceMappingURL=index.js.map