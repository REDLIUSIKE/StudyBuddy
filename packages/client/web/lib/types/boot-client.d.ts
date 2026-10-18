/**
 * Production client composition without the page: mount the Loader over a
 * module system, create every manifest row, wait for quiescence, and audit
 * activation. `AppWebEntry` and the whole-client test carrier both call it.
 * @module @deepseek-ai/dsh-client-web/src/boot-client
 */
import type { Context } from '@deepseek-ai/cordis';
import type { BootManifest, ClientModuleLoader } from '@deepseek-ai/dsh-client-modules/client';
import { STATE_LABELS } from './loader-status.ts';
/** Entry state label as the boot page renders it. */
export type EntryStateLabel = (typeof STATE_LABELS)[keyof typeof STATE_LABELS] | 'loading' | 'failed';
/** Inputs of {@link bootClient}. */
export interface ClientBootOptions {
    /** Fresh root Context that will own the plugin tree. */
    readonly ctx: Context;
    /** Module system installed as `loader.internal`. */
    readonly modules: ClientModuleLoader;
    /** Parsed manifest whose `plugins` rows become Loader entries (entry name = row id). */
    readonly manifest: BootManifest;
    /** Per-entry state reporting (the boot page); omitted when no one renders progress. */
    readonly onEntryState?: (name: string, state: EntryStateLabel) => void;
}
/**
 * Compose the client: `ctx.plugin(Loader)`, `loader.internal = modules`, one
 * `loader.create({ name })` per manifest row, `loader.await()`, then
 * {@link assertEntriesActive}. A row whose module cannot be imported is marked
 * failed; the Loader logs its import error, the module system records it, and
 * the audit rejects startup with that error text per entry.
 * @param options - context, module system, manifest, optional progress sink.
 * @returns resolves after every entry is active; rejects with the audit report otherwise.
 */
export declare function bootClient(options: ClientBootOptions): Promise<void>;
/**
 * Reject entries that failed import/apply or still wait on missing services.
 * @param ctx - root Context carrying the Loader.
 * @param modules - the module system whose recorded import failures name why an entry
 *   has no fiber; a row with no record points at the console.
 * @throws {Error} listing every non-active entry with its reason.
 */
export declare function assertEntriesActive(ctx: Context, modules: Pick<ClientModuleLoader, 'importError'>): void;
//# sourceMappingURL=boot-client.d.ts.map