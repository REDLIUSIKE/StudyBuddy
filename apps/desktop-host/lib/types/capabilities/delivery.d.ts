import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** Load the original native tool only in the invoking Agent's existing scope. */
export declare function createCapabilityNativeDelivery(ctx: Context, load: () => Promise<unknown>): {
    prepare(agent: Agent): Promise<void>;
    close(): Promise<void>;
};
//# sourceMappingURL=delivery.d.ts.map