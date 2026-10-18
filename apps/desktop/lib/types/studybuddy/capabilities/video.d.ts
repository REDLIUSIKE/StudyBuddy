import type { HarnessCapabilityCallerV1 as Caller, HarnessCapabilityTargetV1 as Target, HarnessCapabilityArtifactV1 as Artifact, HarnessCapabilityJsonV1 as Json } from '@studybuddy/contracts';
import type { VideoBridge } from '../video-bridge.ts';
import type { VideoRuntime } from '../video-runtime.ts';
import type { CapabilityDomainPort, CapabilityProject } from './projects.ts';
interface Options {
    runtime: VideoRuntime;
    bridge: VideoBridge;
    userDataRoot?: string;
    associated(caller: Caller, target: Target): Promise<boolean>;
    artifact(caller: Caller, target: Target, file: string, mime: string): Promise<Artifact>;
}
/** Video domain adapter: only domain operations, with the original native caller carried separately. */
export declare class VideoCapabilityPort implements CapabilityDomainPort {
    private readonly options;
    readonly id = "video";
    readonly revision: string;
    private readonly created;
    constructor(options: Options);
    describe(): Promise<Json>;
    private admitted;
    list(caller: Caller, signal: AbortSignal): Promise<CapabilityProject[]>;
    create(caller: Caller, title: string, signal: AbortSignal): Promise<CapabilityProject>;
    resolve(caller: Caller, ref: string, signal: AbortSignal): Promise<CapabilityProject>;
    tools(caller: Caller, target: Target): Promise<Json>;
    execute(caller: Caller, target: Target, tool: string, args: Json, signal: AbortSignal): Promise<{
        artifacts: Artifact[];
        operationRef: string | null;
        data: string | number | boolean | Json[] | {
            [key: string]: Json;
        } | {
            content: ({
                type: "image";
                mimeType: "image/png";
                data: string;
            } | {
                type: string;
                text: string;
            })[];
            details: Json;
        } | null;
    }>;
    status(caller: Caller, target: Target, ref: string, signal: AbortSignal): Promise<{
        artifacts: Artifact[];
        operationRef: string | null;
        data: string | number | boolean | Json[] | {
            [key: string]: Json;
        } | {
            content: ({
                type: "image";
                mimeType: "image/png";
                data: string;
            } | {
                type: string;
                text: string;
            })[];
            details: Json;
        } | null;
    }>;
    cancel(caller: Caller, target: Target, ref: string, signal: AbortSignal): Promise<{
        artifacts: Artifact[];
        operationRef: string | null;
        data: string | number | boolean | Json[] | {
            [key: string]: Json;
        } | {
            content: ({
                type: "image";
                mimeType: "image/png";
                data: string;
            } | {
                type: string;
                text: string;
            })[];
            details: Json;
        } | null;
    }>;
    private exportId;
    release(caller: Caller, target: Target): Promise<void>;
    import(caller: Caller, target: Target, source: Artifact, bytes: Buffer, signal: AbortSignal): Promise<Artifact>;
}
export {};
//# sourceMappingURL=video.d.ts.map