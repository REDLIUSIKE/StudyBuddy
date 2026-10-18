/** Source-safe browser registration of the mods band: the Remote stream behind a store, the dock entry, the press. */
import type { Context } from '@deepseek-ai/cordis';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { type ModsBandKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Chrome copy around a mod's band. */
        'claude-code-mods': ModsBandKey;
    }
}
/** Required browser services: the Remote namespace, slots, and localized copy. */
export declare const inject: string[];
/**
 * Mount the bridge's Remote contribution and register the band.
 * @param ctx - browser Context with `remote`, `slots`, and `locale`.
 * @param contribution - the generated `claudeCodeMods` Remote contribution.
 * @returns the disposer that withdraws the band and the Remote mount.
 */
export declare function mountModsBand(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>>;
//# sourceMappingURL=mount.d.ts.map