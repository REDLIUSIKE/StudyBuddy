import type { HarnessCapabilityInvocationV1 } from '@studybuddy/contracts';
import type { CapabilityAdapter } from '../types.ts';
export interface CapabilityAdapterPort {
    invoke(request: HarnessCapabilityInvocationV1, signal: AbortSignal): Promise<unknown>;
}
/** Module-specific schemas remain owned by the domain. */
export declare function createRpcCapabilityAdapter(id: string, revision: string, port: CapabilityAdapterPort): CapabilityAdapter;
//# sourceMappingURL=rpc-adapter.d.ts.map