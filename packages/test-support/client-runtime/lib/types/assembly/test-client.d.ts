/**
 * Whole-client test carrier: boots an {@link AssemblyPlan} through the
 * production `bootClient` over an in-process module table, with a
 * `RemoteMock` bound to that client's Connection plugin instance.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/test-client
 */
import { Context } from '@deepseek-ai/cordis';
import { type ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { RemoteMock } from '@deepseek-ai/dsh-remote-mock';
import { type AssemblyPlan } from './roster.ts';
/** Carrier options. */
export interface TestClientOptions {
    /**
     * Mount `uiRenderer` into an element (a fresh `document.body` child when `true`); requires jsdom and a roster
     * that provides `uiRenderer`. Default false.
     */
    readonly mount?: boolean | HTMLElement;
    /** Wait for `ctx.connection.state === 'connected'` before returning. Default true. */
    readonly awaitConnected?: boolean;
    /** Readiness budget in milliseconds before `start` rejects with the mock log summary. Default 5000. */
    readonly connectTimeoutMs?: number;
}
/** A booted client under test. */
export declare class TestClient {
    readonly ctx: Context;
    readonly mock: RemoteMock;
    readonly container: HTMLElement | undefined;
    private readonly restore;
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
    static start(plan: AssemblyPlan, mock: RemoteMock, options?: TestClientOptions): Promise<TestClient>;
    private disposing;
    private constructor();
    /** The roster's Connection service (no `Context` augmentation declares it); throws when the roster provides none. */
    get connection(): ConnectionHandle;
    /** Flush pending React work and microtasks inside `act` (plain microtask flush without a DOM). */
    flush(): Promise<void>;
    /**
     * Rebuild one Loader entry: Client Modules' registry-first fiber teardown, then
     * `entry.refresh()`. Each client's module table retains its own instance-bound
     * Connection plugin, so reloads do not coordinate through process globals.
     * Requires a live client: after `dispose()` the Loader holds no entries and
     * the lookup throws before teardown.
     * @param name - package name of the row.
     */
    reload(name: string): Promise<void>;
    /**
     * Remove one Loader entry and wait for its plugin cleanup.
     * @param name - package name of the row.
     */
    unload(name: string): Promise<void>;
    /**
     * Dispose the plugin tree, then drop an owned mount and release this
     * client's hold on the shared jsdom shims even when the tree fails to dispose,
     * then `mock.assertNoUnmatched()` last so its failure is the test's reason
     * without skipping the cleanup; when both the tree and the check fail, one
     * error carries both messages. The first call owns the teardown and reports
     * its failure; every later call waits for that teardown and resolves.
     */
    dispose(): Promise<void>;
    private teardown;
    private entryOf;
}
//# sourceMappingURL=test-client.d.ts.map