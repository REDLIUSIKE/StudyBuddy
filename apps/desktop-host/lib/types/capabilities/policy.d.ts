import type { Context } from '@deepseek-ai/cordis';
import type { CapabilityAuthorizer, CapabilityContext, CapabilityEffect, CapabilityJson, CapabilityTarget } from './types.ts';
/** Domain operations honor the live native policy without widening filesystem roots. */
export declare class CapabilityPolicy {
    private readonly ctx;
    private readonly guard;
    constructor(ctx: Context, guard: CapabilityAuthorizer);
    authorize(context: CapabilityContext, effect: CapabilityEffect, target: CapabilityTarget | null, input?: CapabilityJson): Promise<void>;
}
//# sourceMappingURL=policy.d.ts.map