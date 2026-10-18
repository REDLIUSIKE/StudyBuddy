import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityArtifactV1 as Artifact, HarnessCapabilityInvocationV1 as Invocation, NativeBuiltinHostContextV1 } from '@studybuddy/contracts';
import { CapabilityMainBridge } from './bridge.ts';
import { CapabilityProjects, type CapabilityDomainPort } from './projects.ts';
import { CapabilityAssetTransfer } from './assets.ts';
import { AigcCanvasControllers } from './canvas-controller.ts';
import type { AigcBridge } from '../aigc-bridge.ts';
import type { AigcDomainRuntime } from '../aigc-domain-runtime.ts';
import type { VideoBridge } from '../video-bridge.ts';
import type { VideoRuntime } from '../video-runtime.ts';
type ImportPort = CapabilityDomainPort & {
    import(caller: Caller, target: Target, source: Artifact, bytes: Buffer, signal: AbortSignal): Promise<Artifact>;
};
interface Module {
    port: ImportPort;
    root(caller: Caller, target: Target, signal: AbortSignal): Promise<string>;
    extraRoots?(caller: Caller): string[];
    prepareOpen?(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
    open?(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
    restore?(caller: Caller, directory: string): Promise<boolean>;
}
interface Options {
    owner(): NativeBuiltinHostContextV1 | null;
    nativeModuleAnchor?: string;
    retainSource?(caller: Caller): () => void;
    destination?(caller: Caller, signal: AbortSignal): Promise<string>;
    open?(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
}
/** Generic Main lifetime and artifact authority. Domain modules are registered by the composition below. */
export declare class CapabilityMainService {
    private readonly options;
    readonly projects: CapabilityProjects;
    readonly assets: CapabilityAssetTransfer;
    readonly bridge: CapabilityMainBridge;
    private readonly modules;
    private readonly locations;
    private readonly active;
    private readonly projectActions;
    constructor(options: Options);
    assert(caller: Caller): void;
    private module;
    register(module: Module): () => void;
    ids: () => string[];
    openAction(id: string, scope: Caller['scope'], signal: AbortSignal): Promise<void>;
    prepareOpen(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
    openProject(caller: Caller, target: Target, signal: AbortSignal): Promise<void>;
    deliver(caller: Caller, ref: string, directory: string, signal: AbortSignal): Promise<{
        path: string;
    }>;
    artifact(caller: Caller, target: Target, file: string, mime: string, schemaRef?: string): Promise<Artifact>;
    handle(request: Invocation, signal: AbortSignal): Promise<import("@studybuddy/contracts").HarnessCapabilityResultV1>;
    revoke(): Promise<void>;
}
interface CompositionOptions extends Options {
    userDataRoot: string;
    associated(caller: Caller, target: Target): Promise<boolean>;
    aigc?: {
        bridge: AigcBridge;
        runtime: AigcDomainRuntime;
        create: ConstructorParameters<typeof AigcCanvasControllers>[0]['create'];
        session: ConstructorParameters<typeof AigcCanvasControllers>[0]['session'];
    };
    video?: {
        bridge: VideoBridge;
        runtime: VideoRuntime;
    };
}
/** First module registrations. Future modules contribute the same port/root contract. */
export declare function createStudyBuddyCapabilities(options: CompositionOptions): {
    service: CapabilityMainService;
    prepareCanvas(caller: Caller, projectRef: string, controllerRef: string): Promise<void>;
    revoke(): Promise<void>;
};
export {};
//# sourceMappingURL=service.d.ts.map