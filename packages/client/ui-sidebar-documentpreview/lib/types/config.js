/** Cache limits shared by the Host configuration and browser document previews. */
import z from '@deepseek-ai/schemastery';
/** Deployment limits applied before Office preview registration. */
export const Config = z.object({
    office: z.object({
        maxCachedEntries: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
        maxCachedBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(64 * 1024 * 1024),
        maxPending: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(8),
        maxReaders: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(32),
    }),
    excel: z.object({
        maxBytes: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(16 * 1024 * 1024),
        maxCells: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(250_000),
        timeoutMs: z.natural().min(1).max(2_147_483_647).default(15_000),
    }),
});
//# sourceMappingURL=config.js.map