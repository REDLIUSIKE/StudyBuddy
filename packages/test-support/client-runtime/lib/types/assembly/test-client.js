/**
 * Whole-client test carrier: boots an {@link AssemblyPlan} through the
 * production `bootClient` over an in-process module table, with a
 * `RemoteMock` bound to that client's Connection plugin instance.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/test-client
 */
import { Context } from '@deepseek-ai/cordis';
import { tearDownEntryFiber } from '@deepseek-ai/dsh-client-modules/client';
import { installConnection, } from '@deepseek-ai/dsh-client-connection/client';
import { bootClient } from '@deepseek-ai/dsh-client-web/src/boot-client.ts';
import { mountClient } from '@deepseek-ai/dsh-client-web/src/mount.ts';
import { act } from '@testing-library/react';
import { createInProcessModules, loadPluginModules } from "./modules.js";
import { assertPlan, graphFromRoster } from "./roster.js";
import { REMOTES_PACKAGE, remoteNamespacesOf, remoteProxiesPlugin } from "./remote-proxies.js";
/**
 * jsdom shims shared by every live client in this worker. The first holder
 * installs missing shims and the last release removes exactly those shims.
 */
class SharedJsdomShims {
    holders = 0;
    removeShims;
    /**
     * Hold the shims for one client.
     * @returns the release for this holder.
     */
    acquire() {
        if (this.holders === 0) {
            this.removeShims = installJsdomShims();
        }
        this.holders += 1;
        return () => {
            this.holders -= 1;
            if (this.holders > 0)
                return;
            this.removeShims?.();
            this.removeShims = undefined;
        };
    }
}
const sharedJsdomShims = new SharedJsdomShims();
const CONNECTION_PACKAGE = '@deepseek-ai/dsh-client-connection';
/** Default readiness budget; the mock answers `$events` immediately, so a miss means a boot-time fixture is absent. */
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
/**
 * Browser globals jsdom lacks that roster plugins touch at apply or mount:
 * client-hmr opens an `EventSource`; layout components observe size and font loading.
 * Inert stand-ins, installed only where the global is absent.
 */
const JSDOM_SHIMS = {
    EventSource: class {
        addEventListener() { }
        close() { }
    },
    ResizeObserver: class {
        observe() { }
        disconnect() { }
    },
};
/** Install a shim for each absent global; the disposer deletes exactly those. */
function installJsdomShims() {
    const globals = globalThis;
    const installed = Object.keys(JSDOM_SHIMS).filter(name => globals[name] === undefined);
    for (const name of installed)
        globals[name] = JSDOM_SHIMS[name];
    const fontDocument = typeof document === 'undefined' ? undefined : document;
    const shimFonts = fontDocument !== undefined && fontDocument.fonts === undefined;
    const fontsDescriptor = fontDocument === undefined ? undefined : Object.getOwnPropertyDescriptor(fontDocument, 'fonts');
    if (shimFonts)
        Object.defineProperty(fontDocument, 'fonts', { configurable: true, value: new EventTarget() });
    return () => {
        for (const name of installed)
            Reflect.deleteProperty(globals, name);
        if (shimFonts) {
            if (fontsDescriptor === undefined)
                Reflect.deleteProperty(fontDocument, 'fonts');
            else
                Object.defineProperty(fontDocument, 'fonts', fontsDescriptor);
        }
    };
}
/** The Error a thrown value stands for: itself, or a new Error carrying its string form. */
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
function messageOf(error) {
    return toError(error).message;
}
function connectionOf(ctx) {
    const connection = ctx.get('connection');
    if (connection === undefined) {
        throw new Error('client-test-runtime: the roster provides no `connection` service');
    }
    return connection;
}
function resolveMountPoint(mount) {
    if (mount === undefined || mount === false)
        return { element: undefined, owned: false };
    if (typeof document === 'undefined') {
        throw new Error('client-test-runtime: mount requires a DOM; add `// @vitest-environment jsdom` to the spec');
    }
    if (mount === true) {
        const element = document.createElement('div');
        document.body.appendChild(element);
        return { element, owned: true };
    }
    return { element: mount, owned: false };
}
/** Run `fn` inside React `act` when a DOM exists; plain await otherwise. */
async function settle(fn) {
    if (typeof document === 'undefined') {
        await fn();
        return;
    }
    await act(async () => { await fn(); });
}
async function awaitConnected(ctx, mock, timeoutMs) {
    const { state } = connectionOf(ctx);
    if (state.getSnapshot() === 'connected')
        return;
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            unsubscribe();
            const unmatched = mock.log.unmatched().map(row => `${row.mode} ${row.endpoint}`);
            const streams = mock.log.streams().map(row => `${row.endpoint} (${row.state})`);
            reject(new Error(`client-test-runtime: connection state is ${String(state.getSnapshot())} after ${timeoutMs}ms; `
                + `unmatched: [${unmatched.join(', ')}]; streams: [${streams.join(', ')}]`));
        }, timeoutMs);
        const unsubscribe = state.subscribe(() => {
            if (state.getSnapshot() !== 'connected')
                return;
            clearTimeout(timer);
            unsubscribe();
            resolve();
        });
    });
}
/** A booted client under test. */
export class TestClient {
    ctx;
    mock;
    container;
    restore;
    /**
     * Load the roster's modules, bind this client's mock to its Connection row,
     * hold the jsdom shims, and boot through `bootClient` over the synthesized
     * boot graph; afterwards optionally mount and wait for the connection. The
     * bound row replaces only the page-global input adapter: both paths call
     * `installConnection`, while this path supplies the mock carrier, uses
     * default recovery timings, and captures the current page hostname once for
     * later reloads. A caller-provided Connection row remains unchanged and owns
     * its readiness behavior. The `@deepseek-ai/dsh-api-remotes` row is
     * dropped from the roster: its generated Remote clients exist only in built
     * `lib/`, and the `remote.<ns>` services the roster injects (plus the
     * namespaces the mock has rules for at this point) are provided as
     * contract-free proxies over the same Connection instead; a `provide` entry
     * for that row is refused. On any failure the context is disposed, an owned
     * mount removed, and this client's hold on the shims released before the
     * original error is rethrown.
     * @param plan - roster and annotations.
     * @param mock - Remote mock answering every Gateway call.
     * @param options - mount and readiness options.
     * @returns the booted client.
     */
    static async start(plan, mock, options = {}) {
        assertPlan(plan);
        if (plan.provide?.[REMOTES_PACKAGE] !== undefined) {
            throw new Error(`client-test-runtime: ${REMOTES_PACKAGE} cannot be provided; its remote.<ns> services are the tier's proxies`);
        }
        const roster = plan.roster.rows.some(row => row.name === REMOTES_PACKAGE)
            ? plan.roster.without([REMOTES_PACKAGE])
            : plan.roster;
        const ctx = new Context();
        const pageLocation = typeof location === 'undefined'
            ? undefined
            : { hostname: location.hostname };
        let mountPoint = { element: undefined, owned: false };
        let release;
        const restore = () => {
            if (mountPoint.owned)
                mountPoint.element?.remove();
            release?.();
        };
        try {
            const modules = new Map(await loadPluginModules({ ...plan, roster }));
            const connection = modules.get(CONNECTION_PACKAGE);
            if (connection !== undefined && plan.provide?.[CONNECTION_PACKAGE] === undefined) {
                modules.set(CONNECTION_PACKAGE, {
                    ...connection,
                    apply: (connectionCtx) => {
                        installConnection(connectionCtx, {
                            transport: { rpc: mock.rpc },
                            ...(pageLocation === undefined ? {} : { location: pageLocation }),
                        });
                    },
                });
            }
            mountPoint = resolveMountPoint(options.mount);
            release = sharedJsdomShims.acquire();
            const system = createInProcessModules(graphFromRoster(roster.rows), modules);
            ctx.plugin(remoteProxiesPlugin(remoteNamespacesOf(modules.values(), mock), mock));
            await bootClient({ ctx, modules: system, manifest: system.manifest });
            if (mountPoint.element !== undefined) {
                if (ctx.get('uiRenderer') === undefined) {
                    throw new Error('client-test-runtime: mount requested, but the roster provides no `uiRenderer`');
                }
                await mountClient(ctx, mountPoint.element);
            }
            if (options.awaitConnected !== false) {
                await awaitConnected(ctx, mock, options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
            }
        }
        catch (error) {
            try {
                await settle(() => ctx.fiber.dispose());
            }
            catch {
                // The boot failure is the error to report; a half-built tree failing to dispose adds nothing to it.
            }
            finally {
                restore();
            }
            throw error;
        }
        return new TestClient(ctx, mock, mountPoint.element, restore);
    }
    disposing;
    constructor(ctx, mock, container, restore) {
        this.ctx = ctx;
        this.mock = mock;
        this.container = container;
        this.restore = restore;
    }
    /** The roster's Connection service (no `Context` augmentation declares it); throws when the roster provides none. */
    get connection() {
        return connectionOf(this.ctx);
    }
    /** Flush pending React work and microtasks inside `act` (plain microtask flush without a DOM). */
    async flush() {
        await settle(() => Promise.resolve());
    }
    /**
     * Rebuild one Loader entry: Client Modules' registry-first fiber teardown, then
     * `entry.refresh()`. Each client's module table retains its own instance-bound
     * Connection plugin, so reloads do not coordinate through process globals.
     * Requires a live client: after `dispose()` the Loader holds no entries and
     * the lookup throws before teardown.
     * @param name - package name of the row.
     */
    async reload(name) {
        const entry = this.entryOf(name);
        await tearDownEntryFiber(entry);
        await entry.refresh();
        await this.ctx.loader.await();
    }
    /**
     * Remove one Loader entry and wait for its plugin cleanup.
     * @param name - package name of the row.
     */
    async unload(name) {
        const entry = this.entryOf(name);
        const disposal = entry.fiber?.dispose();
        this.ctx.loader.remove(entry.id);
        await disposal;
    }
    /**
     * Dispose the plugin tree, then drop an owned mount and release this
     * client's hold on the shared jsdom shims even when the tree fails to dispose,
     * then `mock.assertNoUnmatched()` last so its failure is the test's reason
     * without skipping the cleanup; when both the tree and the check fail, one
     * error carries both messages. The first call owns the teardown and reports
     * its failure; every later call waits for that teardown and resolves.
     */
    async dispose() {
        if (this.disposing !== undefined) {
            await this.disposing.catch(() => undefined);
            return;
        }
        this.disposing = this.teardown();
        await this.disposing;
    }
    async teardown() {
        let failure;
        try {
            await settle(() => this.ctx.fiber.dispose());
        }
        catch (error) {
            failure = toError(error);
        }
        finally {
            this.restore();
        }
        if (failure === undefined) {
            this.mock.assertNoUnmatched();
            return;
        }
        try {
            this.mock.assertNoUnmatched();
        }
        catch (unmatched) {
            throw new Error(`${messageOf(unmatched)}\nclient-test-runtime: the plugin tree also failed to dispose: ${failure.message}`, { cause: failure });
        }
        throw failure;
    }
    entryOf(name) {
        const entries = [...this.ctx.loader.entries()];
        const entry = entries.find(candidate => candidate.options.name === name);
        if (entry === undefined) {
            throw new Error(`client-test-runtime: no Loader entry named ${name}; entries: ${entries.map(row => row.options.name).join(', ')}`);
        }
        return entry;
    }
}
//# sourceMappingURL=test-client.js.map