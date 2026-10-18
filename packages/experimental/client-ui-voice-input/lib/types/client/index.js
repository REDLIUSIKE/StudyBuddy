import speechRemote from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote';
import { mountVoiceInput } from "./mount.js";
export { inject } from "./mount.js";
/**
 * Activate the experimental microphone contribution.
 * @param ctx - Client runtime.
 * @returns complete UI and Remote disposer.
 */
export async function apply(ctx) {
    return await mountVoiceInput(ctx, speechRemote);
}
//# sourceMappingURL=index.js.map