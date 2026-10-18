import remote from '@deepseek-ai/dsh-experimental-client-ui-cot-translation/remote';
import { mountTranslation } from "./mount.js";
export { inject } from "./mount.js";
/**
 * Mount the experimental reasoning presentation and its Remote methods.
 * @param ctx - browser plugin context.
 * @returns disposer joining UI and Remote withdrawal.
 */
export async function apply(ctx) { return await mountTranslation(ctx, remote); }
//# sourceMappingURL=index.js.map