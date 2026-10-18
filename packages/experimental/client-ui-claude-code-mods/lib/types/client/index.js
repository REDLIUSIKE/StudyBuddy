/** Browser entry: mounts the bridge's Remote and registers the band above the prompt. */
import modsRemote from '@deepseek-ai/dsh-experimental-claude-code-mods/remote';
import { mountModsBand } from "./mount.js";
export { inject } from "./mount.js";
/**
 * Register the mods band on the Client Context.
 * @param ctx - Client Context with the declared `inject` services available.
 * @returns the disposer that withdraws the band.
 */
export async function apply(ctx) {
    return await mountModsBand(ctx, modsRemote);
}
//# sourceMappingURL=index.js.map