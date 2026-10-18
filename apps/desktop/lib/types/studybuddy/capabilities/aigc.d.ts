import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityJsonV1 as Json, HarnessCapabilityArtifactV1 as Artifact } from '@studybuddy/contracts';
import type { AigcBridge } from '../aigc-bridge.ts';
import type { AigcDomainRuntime } from '../aigc-domain-runtime.ts';
import type { CapabilityDomainPort, CapabilityProject } from './projects.ts';
import type { CapabilityCanvasViews } from './views.ts';
interface Options {
    runtime: AigcDomainRuntime;
    bridge: AigcBridge;
    views: CapabilityCanvasViews;
    associated(caller: Caller, target: Target): Promise<boolean>;
    artifact(caller: Caller, target: Target, file: string, mime: string): Promise<Artifact>;
    retainSource?(caller: Caller): () => void;
}
/** Live domain tools keep their source descriptor hashes; native Sessions never inherit the target cwd. */
export declare class AigcCapabilityPort implements CapabilityDomainPort {
    private readonly options;
    readonly id = "aigc";
    readonly revision: string;
    private readonly created;
    private readonly operations;
    constructor(options: Options);
    describe(): Promise<Json>;
    directory(caller: Caller, target: Target, signal: AbortSignal): Promise<string>;
    private admitted;
    list(caller: Caller, signal: AbortSignal): Promise<CapabilityProject[]>;
    create(caller: Caller, title: string, signal: AbortSignal): Promise<CapabilityProject>;
    resolve(caller: Caller, ref: string, signal: AbortSignal): Promise<CapabilityProject>;
    private binding;
    private catalog;
    tools(caller: Caller, target: Target, signal: AbortSignal): Promise<Json>;
    execute(caller: Caller, target: Target, tool: string, args: Json, signal: AbortSignal): Promise<import("@studybuddy/contracts").HarnessCapabilityResultV1 | {
        data: {
            assets: Json;
        };
        artifacts: Artifact[];
        operationRef: null;
    }>;
    private operation;
    private finish;
    status(caller: Caller, target: Target, ref: string, signal: AbortSignal): Promise<import("@studybuddy/contracts").HarnessCapabilityResultV1>;
    cancel(caller: Caller, target: Target, ref: string, signal: AbortSignal): Promise<import("@studybuddy/contracts").HarnessCapabilityResultV1>;
    revoke(): Promise<void>;
    release(caller: Caller, target: Target): Promise<void>;
    import(caller: Caller, target: Target, source: Artifact, bytes: Buffer, signal: AbortSignal): Promise<Artifact>;
}
export {};
//# sourceMappingURL=aigc.d.ts.map