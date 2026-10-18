/** Deployment configuration for the managed local SenseVoice recognizer. */
import z from '@deepseek-ai/schemastery';
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
/** Validate deployment-varying runtime choices at plugin activation. */
export const Config = z.object({
    providerId: z.string().min(1).default('sensevoice-local'),
    dataRoot: z.string().min(1).required(),
    modelDirectory: z.union([z.string().min(1), z.const(undefined)]),
    vadModelPath: z.union([z.string().min(1), z.const(undefined)]),
    precision: z.union(['int8', 'fp32']).default('int8'),
    modelOrigin: z.union([z.string().pattern(/^https?:\/\/[^/\s?#@]+\/?$/), z.const(undefined)]),
    modelOrigins: z.array(z.string().pattern(/^https?:\/\/[^/\s?#@]+\/?$/)).min(1)
        .default(['https://huggingface.co', 'https://hf-mirror.com']),
    modelProbeTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(3000),
    threads: z.natural().min(1).default(2),
    segmentSeconds: z.number().min(1).max(120).default(30),
    vadThreshold: z.number().min(0).max(1).default(0.5),
    minSpeechSeconds: z.number().min(0).default(0.25),
    minSilenceSeconds: z.number().min(0.01).default(0.5),
    vadOnsetPaddingSeconds: z.number().min(0).max(1).default(0.3),
    maxAudioBytes: z.natural().min(46).default(4 * 1024 * 1024),
    prepareTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(3_600_000),
    inferenceTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(120_000),
    idleTimeoutMs: z.natural().max(MAX_TIMER_DELAY_MS).default(300_000),
    maxPending: z.natural().min(1).default(4),
    graceMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(1000),
    maxLogBytes: z.natural().min(1).default(64 * 1024),
    maxResponseBytes: z.natural().min(1).default(128 * 1024),
    progressIntervalMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(100),
});
//# sourceMappingURL=config.js.map