/** Optional local SenseVoice provider; activation performs no downloads or model loading. */
import { isAbsolute } from 'node:path';
import { SenseVoiceWorker } from "./recognizer.js";
import { languages } from "./input.js";
export { Config } from "./config.js";
export const name = 'experimental-speech-to-text-sensevoice';
export const inject = ['speechToText', 'subprocess'];
/**
 * Register the local recognizer and inspect disk caches without downloading or loading models.
 * @param ctx - Host registry and subprocess owner.
 * @param config - validated runtime configuration.
 */
export function apply(ctx, config) {
    for (const path of [config.dataRoot, config.modelDirectory, config.vadModelPath]) {
        if (path !== undefined && !isAbsolute(path))
            throw new Error(`SenseVoice paths must be absolute: ${path}`);
    }
    for (const origin of config.modelOrigin === undefined ? config.modelOrigins : [config.modelOrigin])
        new URL(origin);
    const worker = new SenseVoiceWorker(ctx, config);
    const estimatedBytes = config.precision === 'int8' ? 1_000_000_000 : 2_000_000_000;
    ctx.effect(() => {
        const unregister = ctx.speechToText.register({
            info: { id: config.providerId, name: `SenseVoiceSmall (${config.precision.toUpperCase()})`, location: 'host-local', languages, downloadSources: worker.downloadSources,
                setupEstimate: { recommendedDiskBytes: estimatedBytes, expectedMemoryBytes: estimatedBytes,
                    minimumMinutes: 1, maximumMinutes: 10 } },
            preparation: worker,
            transcribe: async (input, signal) => await worker.transcribe(input, signal),
        });
        worker.inspect();
        return async () => {
            const removing = unregister();
            await worker.dispose();
            await removing;
        };
    });
}
//# sourceMappingURL=index.js.map