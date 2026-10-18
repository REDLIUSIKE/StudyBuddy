/**
 * Which plugins bring their own configuration to the Plugins page, read from
 * the three slots the page declares: the official plugins listed beside the
 * official bundles, the bundles with a form on their page, and the rows with a
 * page of their own. The projection follows the slot ledgers and the active
 * locale and keeps its snapshot until one of them moves.
 */
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * The key a row's configuration registers under.
 * @param bundle - the bundle's package name.
 * @param rowId - the row id the bundle's patch declares.
 * @returns the `plugins.row.config` key.
 */
export function rowConfigKey(bundle, rowId) {
    return `${bundle}#${rowId}`;
}
const SLOTS = ['plugins.item', 'plugins.bundle.config', 'plugins.row.config'];
/**
 * Project the configuration ledgers as one observable the page binds.
 * @param ctx - the page plugin's context, whose slot registry and locale the projection follows.
 * @returns the ledger source; its snapshot changes only when a ledger or the locale does.
 */
export function configLedgerSource(ctx) {
    let versions = [];
    let revision = -1;
    let ledger = { items: [], bundles: new Set(), rows: new Set() };
    const keysOf = (name) => new Set(ctx.slots.entries(name).flatMap(entry => entry.options.key === undefined ? [] : [entry.options.key]));
    return {
        getSnapshot: () => {
            const next = SLOTS.map(name => ctx.slots.getVersion(name));
            const current = ctx.locale.getSnapshot().revision;
            if (current !== revision || next.some((version, index) => version !== versions[index])) {
                versions = next;
                revision = current;
                ledger = {
                    items: ctx.slots.entries('plugins.item').map(entry => ({
                        /* v8 ignore next -- list-slot registration requires id */
                        id: entry.options.id ?? '',
                        label: resolveSlotLabel(entry.options.label) ?? '',
                    })),
                    bundles: keysOf('plugins.bundle.config'),
                    rows: keysOf('plugins.row.config'),
                };
            }
            return ledger;
        },
        subscribe: (listener) => {
            const offs = [...SLOTS.map(name => ctx.slots.subscribe(name, listener)), ctx.locale.subscribe(listener)];
            return () => { for (const off of offs)
                off(); };
        },
    };
}
//# sourceMappingURL=config-ledger.js.map