import { SettingsSchemaService } from "./schema.js";
import { ConfigForms } from "./config-form.js";
import { SettingsDescribeMirror } from "./settings-mirror.js";
/**
 * Required services: the Remote namespace the mirror reads through and the
 * forwarded settings invalidation it refreshes on.
 */
export const inject = ['remote', 'remote.settings'];
/** Provide shared forms and refresh them on document changes and reconnects.
 * @param ctx Client provider context.
 */
export function apply(ctx) {
    const schema = new SettingsSchemaService(ctx);
    // Every form uses the persistence mode resolved from the connected Host.
    const persistence = ctx.remote.$host.isLoopback ? 'host' : 'memory';
    const mirror = new SettingsDescribeMirror(ctx, persistence);
    ctx.effect(() => {
        const disposers = [
            ctx.remote.$on('settings/document-updated', () => { void mirror.load(); }),
            ctx.on('connection/reset', () => { void mirror.load(); }),
        ];
        // The first connection also emits connection/reset, so startup normally
        // costs two reads (budgeted in startup-rpc-budget.e2e.ts). The in-flight
        // fold does not merge them into one; it guarantees at most one pending
        // read at a time and that no invalidation arriving mid-read is lost.
        void mirror.ensure();
        return () => { for (const dispose of disposers)
            dispose(); };
    }, 'ui-settings: describe mirror invalidations');
    new ConfigForms(ctx, { mirror, schema, persistence });
}
//# sourceMappingURL=index.js.map