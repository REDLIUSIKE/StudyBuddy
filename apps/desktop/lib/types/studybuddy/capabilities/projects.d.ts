import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityJsonV1 as Json, HarnessCapabilityResultV1 as Result } from '@studybuddy/contracts';
import { CapabilityGrantStore, type CapabilityGrantOperation } from './grants.ts';
export interface CapabilityProject {
    target: Target;
    title: string;
}
export interface CapabilityDomainPort {
    readonly id: string;
    readonly revision: string;
    describe(caller: Caller, signal: AbortSignal): Promise<Json>;
    list(caller: Caller, signal: AbortSignal): Promise<readonly CapabilityProject[]>;
    create(caller: Caller, title: string, signal: AbortSignal): Promise<CapabilityProject>;
    resolve(caller: Caller, projectRef: string, signal: AbortSignal): Promise<CapabilityProject>;
    tools(caller: Caller, target: Target, signal: AbortSignal): Promise<Json>;
    execute(caller: Caller, target: Target, tool: string, args: Json, signal: AbortSignal): Promise<Result>;
    status(caller: Caller, target: Target, ref: string, signal: AbortSignal): Promise<Result>;
    cancel(caller: Caller, target: Target, ref: string, signal: AbortSignal): Promise<Result>;
    release(caller: Caller, target: Target): Promise<void>;
}
export type CapabilityResourceAuthorizer = (caller: Caller, effect: 'read' | 'write', target: Target | null) => Promise<void>;
/** Resolves only domain-owned documents; this service never widens native filesystem roots. */
export declare class CapabilityProjects {
    private readonly grants;
    private readonly authorize;
    private readonly ports;
    private readonly links;
    constructor(grants: CapabilityGrantStore, authorize: CapabilityResourceAuthorizer);
    register(port: CapabilityDomainPort): () => void;
    ids(): string[];
    port(moduleId: string): CapabilityDomainPort;
    bind(caller: Caller, moduleId: string, input: {
        action: 'create';
        title: string;
    } | {
        action: 'attach';
        projectRef: string;
    }, signal: AbortSignal): Promise<Target>;
    assert(caller: Caller, target: Target, operation: CapabilityGrantOperation): Promise<{
        port: CapabilityDomainPort;
        target: Target;
    }>;
    release(caller: Caller, target: Target): Promise<void>;
    revoke(): void;
}
//# sourceMappingURL=projects.d.ts.map