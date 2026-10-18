/** Client Cordis plugin that publishes browser observations directly to the Inspector Worker. */
import { INSPECTOR_BOOTSTRAP_ROUTE } from "../shared/web.js";
import { parseInspectorClientBootstrap } from "../shared/bridge/control-codec.js";
import { createInspectorService } from "../shared/service.js";
import { publishCordisTree } from "./inspection/cordis.js";
import { startInspectorClient } from "./bridge/controller.js";
import { disposeInspectorResources } from "../shared/dispose.js";
/** Cordis plugin name shared with the Host face. */
export const name = 'experimental-inspector';
/** This transport root has no Client service dependencies. */
export const inject = [];
/**
 * Mount the Client source, including when the plugin activates after the page loads.
 * @param ctx - Client Cordis context whose page identity and lifecycle own the source.
 * @throws Invalid bootstrap data or a failed service registration; transport setup failures retain reconnect recovery.
 */
export async function apply(ctx) {
    const session = new InspectorClientSession(ctx);
    ctx.effect(() => () => session.dispose(), 'experimental-inspector: Client lifetime');
    ctx.on('connection/reset', () => {
        void session.refresh().catch((error) => {
            ctx.logger.warn('experimental-inspector: Client connection failed; reconnect or reload the page to retry', error);
        });
    });
    const injected = globalThis.__DSH_INSPECTOR__;
    if (injected !== undefined)
        await session.connect(parseInspectorClientBootstrap(injected));
    else
        await session.refresh();
}
/**
 * Owns each source and its tree publisher until replacement or the outer lifetime effect disposes it.
 * Cordis owns service/listener effects; transport setup failures retain the reset listener for retry.
 * Invalid bootstrap data and registration errors reject startup after rollback.
 */
class InspectorClientSession {
    ctx;
    lifetime = new AbortController();
    pending = Promise.resolve();
    bootstrap;
    release;
    constructor(ctx) {
        this.ctx = ctx;
    }
    refresh() {
        return this.enqueue(() => this.readBootstrap());
    }
    connect(bootstrap) {
        return this.enqueue(() => this.replace(bootstrap));
    }
    async readBootstrap() {
        let response;
        try {
            response = await fetch(INSPECTOR_BOOTSTRAP_ROUTE, { signal: this.lifetime.signal });
        }
        catch (error) {
            this.connectionFailed(error);
            return;
        }
        if (!response.ok) {
            this.connectionFailed(new Error(`Inspector bootstrap failed: HTTP ${response.status}`));
            return;
        }
        const value = await response.json();
        await this.replace(parseInspectorClientBootstrap(value));
    }
    connectionFailed(error) {
        if (this.lifetime.signal.aborted)
            return;
        this.ctx.logger.warn('experimental-inspector: Client connection failed; reconnect or reload the page to retry', error);
    }
    enqueue(task) {
        const pending = this.pending.then(() => {
            this.lifetime.signal.throwIfAborted();
            return task();
        });
        this.pending = pending.catch((error) => { void error; /* The caller owns failure reporting. */ });
        return pending;
    }
    async replace(bootstrap) {
        this.lifetime.signal.throwIfAborted();
        if (this.bootstrap?.endpoint === bootstrap.endpoint && this.bootstrap.protocol === bootstrap.protocol)
            return;
        await this.release?.();
        this.release = undefined;
        this.bootstrap = undefined;
        let source;
        try {
            source = await startInspectorClient(bootstrap);
        }
        catch (error) {
            this.connectionFailed(error);
            return;
        }
        const disposers = [];
        const dispose = () => disposeInspectorResources(disposers, () => { source.close(); }, 'experimental-inspector: Client disposal failed');
        try {
            this.lifetime.signal.throwIfAborted();
            disposers.push(publishCordisTree(this.ctx, source, {
                maxNodes: bootstrap.maxCordisNodes,
                maxBytes: bootstrap.maxFrameBytes - 4_096,
            }));
            disposers.push(this.ctx.provide('inspector', createInspectorService(source)));
            const panel = this.ctx.inject(['slots', 'shortcuts', 'locale'], async (ctx) => {
                const { registerInspectorPage } = await import("./bottom/page.js");
                registerInspectorPage(ctx, source.sourceId);
            });
            disposers.push(() => panel.dispose());
        }
        catch (error) {
            try {
                await dispose();
            }
            catch (cleanupError) {
                this.ctx.logger.error('experimental-inspector: Client initialization rollback failed', cleanupError);
            }
            throw error;
        }
        this.bootstrap = bootstrap;
        this.release = dispose;
    }
    async dispose() {
        this.lifetime.abort();
        await this.pending;
        await this.release?.();
        this.release = undefined;
    }
}
//# sourceMappingURL=plugin.js.map