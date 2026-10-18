import type { NativeBuiltinHostContextV1, OwnedScope, HarnessCapabilityCallerV1 } from '@studybuddy/contracts';
import type { VideoProjectBinding, VideoToolInvocation } from '../../../desktop-host/src/video-control-wire.d.ts';
import type { VideoScope, VideoCapabilityRequest, VideoCapabilityResult } from './video-types.ts';
import { VideoRuntime } from './video-runtime.ts';
interface Options {
    userDataRoot: string;
    runtime: VideoRuntime;
    isCurrent(scope: OwnedScope): boolean;
    hostContext(scope: OwnedScope): NativeBuiltinHostContextV1;
    command(action: 'scope' | 'bind' | 'tools' | 'project-close' | 'native' | 'cancel-native', data: unknown, signal?: AbortSignal): Promise<unknown>;
    mediaChoices?(scope: VideoScope, signal: AbortSignal, caller?: VideoCapabilityRequest['caller']): Promise<unknown>;
    mediaRequest?(request: VideoCapabilityRequest, signal: AbortSignal): Promise<VideoCapabilityResult>;
}
/** Main resolves original project identities; guests never choose native roots or Sessions. */
export declare class VideoBridge {
    private readonly options;
    private identity;
    private lease;
    private ready;
    private readonly requests;
    private readonly bindings;
    private readonly admissions;
    private readonly closingProjects;
    private readonly selections;
    private readonly callers;
    private readonly tasks;
    private readonly sourcePins;
    constructor(options: Options);
    private owner;
    private assert;
    bind(scope: OwnedScope, projectId: string): Promise<VideoProjectBinding>;
    private admit;
    /** Stop the previous project's native Agent, media and render work before re-admission. */
    closeProject(scope: OwnedScope, projectId: string): Promise<void>;
    current: (scope: VideoScope) => boolean;
    selection(scope: OwnedScope, projectId: string, value: unknown): void;
    isEditorOwner(caller: HarnessCapabilityCallerV1, projectId: string): boolean;
    binding: (scope: VideoScope, caller?: VideoCapabilityRequest["caller"]) => Promise<{
        scope: OwnedScope;
        projectRoot: string;
        callerSessionId?: string;
        toolCallId?: string;
    }>;
    private actualCaller;
    capabilityCaller(scope: VideoScope, caller: NonNullable<VideoCapabilityRequest['caller']>): HarnessCapabilityCallerV1;
    restoreSource(caller: HarnessCapabilityCallerV1, directory: string): Promise<boolean>;
    retainTask(caller: HarnessCapabilityCallerV1, projectId: string): Promise<VideoProjectBinding>;
    releaseTask(caller: HarnessCapabilityCallerV1, projectId: string): void;
    retainSource(caller: HarnessCapabilityCallerV1): () => void;
    releaseView(scope: OwnedScope, projectId: string): Promise<void>;
    invokeCapability(caller: HarnessCapabilityCallerV1, projectId: string, operation: string, input: unknown, signal: AbortSignal): Promise<unknown>;
    /** Studio operations use the same admitted native Session and existing media owner. */
    capability(request: VideoCapabilityRequest, signal: AbortSignal): Promise<VideoCapabilityResult>;
    tool(request: VideoToolInvocation, signal: AbortSignal): Promise<unknown>;
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=video-bridge.d.ts.map