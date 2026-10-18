import type { Context } from '@deepseek-ai/cordis';
import type { JobId } from '@deepseek-ai/dsh-jobs';
import type { CapabilityContext, CapabilityTarget, CapabilityResult } from './types.ts';
import type { CapabilityRegistry } from './registry.ts';
import type { CapabilityAssociationStore } from './associations.ts';
declare module '@deepseek-ai/dsh-jobs/view' {
    interface JobKindMap {
        creative: 'creative';
    }
}
/** A producer of native owned Jobs, never a workflow scheduler or paid retry loop. */
export declare class CapabilityJobs {
    private readonly ctx;
    private readonly registry;
    private readonly store;
    private readonly assert;
    private readonly interval;
    private readonly active;
    constructor(ctx: Context, registry: CapabilityRegistry, store: CapabilityAssociationStore, assert: (context: CapabilityContext) => void, interval?: number);
    private key;
    reconcile(context: CapabilityContext, ref: string, cancel?: boolean): Promise<CapabilityResult>;
    track(context: CapabilityContext, target: CapabilityTarget, ref: string): JobId;
    withdrawModule(id: string): Promise<void>;
    withdrawAgent(agent: CapabilityContext['agent']): Promise<void>;
    withdrawTarget(agent: CapabilityContext['agent'], target: CapabilityTarget): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=jobs.d.ts.map