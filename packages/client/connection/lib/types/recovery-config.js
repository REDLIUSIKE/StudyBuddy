/** Shared validation for Host-configured and browser-local connection recovery. */
import z from '@deepseek-ai/schemastery';
// Browsers and Node share this maximum signed 32-bit timer delay.
const MAX_TIMER_MS = 2_147_483_647;
/** Schema shared by the Host plugin and the Client's recovery input parser. */
export const ConnectionRecoveryConfigSchema = z.object({
    backoffBaseMs: z.natural().min(1).max(MAX_TIMER_MS).default(500),
    backoffFactor: z.number().min(1).max(Number.MAX_VALUE).default(2),
    backoffMaxMs: z.natural().min(1).max(MAX_TIMER_MS).default(10_000),
    generationReadyWarnMs: z.natural().min(1).max(MAX_TIMER_MS).default(3_000),
    generationReadyTimeoutMs: z.natural().min(1).max(MAX_TIMER_MS).default(15_000),
});
/**
 * Validate recovery input and supply every timing default before starting work.
 * @param config - Host configuration, page bootstrap data, or direct loop options.
 * @returns validated, complete recovery timing.
 */
export function resolveConnectionConfig(config = {}) {
    const resolved = ConnectionRecoveryConfigSchema(config);
    if (!Number.isFinite(resolved.backoffFactor)) {
        throw new RangeError('connection recovery backoffFactor must be finite');
    }
    return resolved;
}
//# sourceMappingURL=recovery-config.js.map