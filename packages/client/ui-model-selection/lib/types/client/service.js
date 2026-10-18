import { Service } from '@deepseek-ai/cordis';
import { WeakMapWithValues } from '@deepseek-ai/dsh-util-values';
import { ModelCatalogDirectory } from "./catalog.js";
import { ModelDirectory } from "./directory.js";
/** The `ctx.modelDirectories` session model-selection service. */
export class ModelDirectoryResolver extends Service {
    static inject = ['sessions', 'remote', 'remote.session'];
    live = { directories: new WeakMapWithValues() };
    catalog;
    /**
     * @param ctx - owning root context (the service registers itself as `models`).
     */
    constructor(ctx) {
        super(ctx, 'modelDirectories');
        this.catalog = new ModelCatalogDirectory(ctx);
        void this.catalog.load().catch(() => { });
        ctx.on('connection/reset', () => {
            this.catalog.resetGeneration();
            for (const directory of this.live.directories.values)
                directory.resetConnected();
        });
        ctx.remote.$on('llm/adapters-updated', () => { this.catalog.refresh(); });
        ctx.remote.$on('settings/document-updated', () => { this.catalog.refresh(); });
        ctx.remote.$on('credentials/record-updated', () => { this.catalog.refresh(); });
        ctx.remote.$on('credentials/reference-updated', () => { this.catalog.refresh(); });
    }
    /**
     * Resolve the per-session shared directory (lazy; the scope disposer
     * removes and disposes it). Unknown sessions fail loud.
     * @param sessionId - the owning session.
     * @returns the resident directory both entries share.
     */
    directoryFor(sessionId) {
        const { live } = this;
        const sessions = this.ctx.sessions;
        const actx = sessions.scope(sessionId);
        if (actx === undefined)
            throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no scope`);
        const binding = sessions.binding(sessionId);
        if (binding === undefined)
            throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no binding`);
        const existing = live.directories.get(binding);
        if (existing !== undefined)
            return existing;
        const directory = new ModelDirectory(this.ctx.remote.session, sessionId, () => sessions.subagentAddress(sessionId) === undefined, this.catalog, binding.session.projections.faceOf('modelSelection'), () => binding.session.getSnapshot().blank, (name, attributes) => this.ctx.get('productAnalytics')?.track(name, attributes));
        live.directories.set(binding, directory);
        actx.effect(() => () => {
            directory.dispose();
            live.directories.delete(binding);
        }, 'ui-model-selection: session directory');
        return directory;
    }
}
//# sourceMappingURL=service.js.map