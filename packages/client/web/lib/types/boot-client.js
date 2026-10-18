import Loader from '@deepseek-ai/cordis-plugin-loader';
import { STATE_LABELS } from "./loader-status.js";
/**
 * Compose the client: `ctx.plugin(Loader)`, `loader.internal = modules`, one
 * `loader.create({ name })` per manifest row, `loader.await()`, then
 * {@link assertEntriesActive}. A row whose module cannot be imported is marked
 * failed; the Loader logs its import error, the module system records it, and
 * the audit rejects startup with that error text per entry.
 * @param options - context, module system, manifest, optional progress sink.
 * @returns resolves after every entry is active; rejects with the audit report otherwise.
 */
export async function bootClient(options) {
    const { ctx, manifest, onEntryState } = options;
    await ctx.plugin(Loader);
    const loader = ctx.loader;
    loader.internal = options.modules;
    ctx.on('internal/status', (fiber) => {
        const entry = fiber.entry;
        if (entry === undefined || entry.fiber === undefined)
            return;
        onEntryState?.(entry.options.name, STATE_LABELS[entry.fiber.state]);
    });
    const rows = manifest.plugins.map(row => row.id);
    for (const name of rows)
        onEntryState?.(name, 'loading');
    await options.modules.entries.start(loader, manifest);
    for (const entry of loader.entries()) {
        if (entry.fiber === undefined)
            onEntryState?.(entry.options.name, 'failed');
    }
    await loader.await();
    assertEntriesActive(ctx, options.modules);
}
/**
 * Reject entries that failed import/apply or still wait on missing services.
 * @param ctx - root Context carrying the Loader.
 * @param modules - the module system whose recorded import failures name why an entry
 *   has no fiber; a row with no record points at the console.
 * @throws {Error} listing every non-active entry with its reason.
 */
export function assertEntriesActive(ctx, modules) {
    const failures = [];
    for (const entry of ctx.loader.entries()) {
        const name = entry.options.name;
        if (entry.fiber === undefined) {
            const importError = modules.importError(name);
            failures.push(importError === undefined
                ? `${name}: import failed (see console for the import error)`
                : `${name}: import failed: ${importError.message}`);
            continue;
        }
        const state = STATE_LABELS[entry.fiber.state];
        if (state === 'active')
            continue;
        if (state === 'pending') {
            const missing = Object.keys(entry.fiber.inject).filter(service => ctx.get(service) === undefined);
            failures.push(`${name}: pending (waiting for service${missing.length === 1 ? '' : 's'}: ${missing.join(', ') || 'unknown'})`);
        }
        else {
            failures.push(`${name}: ${state}`);
        }
    }
    if (failures.length > 0) {
        throw new Error(`web boot: ${String(failures.length)} entr${failures.length === 1 ? 'y' : 'ies'} did not activate\n${failures.join('\n')}`);
    }
}
//# sourceMappingURL=boot-client.js.map