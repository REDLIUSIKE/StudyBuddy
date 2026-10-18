import type { Context } from '@deepseek-ai/cordis';
import { CapabilityRegistry } from './registry.ts';
import { CapabilityAssociationStore } from './associations.ts';
import { CapabilityPolicy } from './policy.ts';
import { CapabilityTools } from './tools.ts';
import type { CapabilityPluginOptions } from './types.ts';
export declare const name = "studybuddy-capabilities";
export declare const inject: string[];
export interface CapabilityServices {
    registry: CapabilityRegistry;
    associations: CapabilityAssociationStore;
    policy: CapabilityPolicy;
    tools: CapabilityTools;
    restoreOrigin?(agent: import('@deepseek-ai/dsh-agent').Agent): Promise<boolean>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        capabilities: CapabilityServices;
    }
}
/** Mount the shared module contract once; adapters contribute independently. */
export declare function apply(ctx: Context, options: CapabilityPluginOptions): void;
//# sourceMappingURL=index.d.ts.map