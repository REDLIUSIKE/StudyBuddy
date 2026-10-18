import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CapabilityPluginOptions } from './types.ts';
import { CapabilityRegistry } from './registry.ts';
import { CapabilityPolicy } from './policy.ts';
import { CapabilityAssociationStore } from './associations.ts';
import { CapabilityJobs } from './jobs.ts';
/** Native tools bind an explicit module document to the actual invoking Agent. */
export declare class CapabilityTools {
    private readonly ctx;
    readonly registry: CapabilityRegistry;
    private readonly store;
    private readonly policy;
    private readonly options;
    private readonly mounts;
    private readonly admissions;
    private readonly ownedAgents;
    private accepting;
    private readonly lifetime;
    private readonly active;
    private readonly remove;
    readonly jobs: CapabilityJobs;
    constructor(ctx: Context, registry: CapabilityRegistry, store: CapabilityAssociationStore, policy: CapabilityPolicy, options: CapabilityPluginOptions);
    private tracked;
    permits(agent: Agent, name: string): boolean;
    revoke(): Promise<void>;
    resume(): void;
    private ownAdmission;
    private releaseAdmissions;
    private context;
    private identity;
    private assert;
    private validateArtifacts;
    private projectTool;
    private importTool;
    private mount;
    private unmount;
    close(): Promise<void>;
}
//# sourceMappingURL=tools.d.ts.map