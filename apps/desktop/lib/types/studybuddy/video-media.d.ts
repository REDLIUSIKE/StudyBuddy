import type { OwnedScope } from '@studybuddy/contracts';
import type { VideoScope, VideoCapabilityRequest, VideoCapabilityResult } from './video-types.ts';
interface NativeApi {
    validateGeneration?(kind: 'image' | 'video', body: unknown): void;
    request(scope: OwnedScope, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown>;
    content(scope: OwnedScope, path: string, signal?: AbortSignal): Promise<Response>;
}
interface Options {
    binding(scope: VideoScope, caller?: VideoCapabilityRequest['caller']): Promise<{
        scope: OwnedScope;
        projectRoot: string;
        callerSessionId?: string;
        toolCallId?: string;
    }>;
    isCurrent(scope: VideoScope): boolean;
    api: NativeApi;
    pollIntervalMs: number;
    timeoutMs: number;
    authorize?(request: VideoCapabilityRequest, modelId: string, signal: AbortSignal): Promise<void>;
}
export interface VideoMediaChoice {
    authorityRef: string;
    operation: 'image' | 'video' | 'tts' | 'sfx' | 'asr';
    modelId: string;
    label: string;
    voices?: unknown;
    parameters: Record<string, unknown>;
}
/** Model choices are short-lived projections of the native catalog, scoped to a project Session. */
export declare class VideoMediaAdapter {
    private readonly options;
    private readonly choices;
    private readonly requests;
    constructor(options: Options);
    private check;
    /** Read the existing native media catalogs and issue scoped selection references. */
    catalog(scope: VideoScope, signal: AbortSignal, caller?: VideoCapabilityRequest['caller']): Promise<VideoMediaChoice[]>;
    /** Dispatch once through the existing native authority, preserving its result and request identity. */
    request(request: VideoCapabilityRequest, signal: AbortSignal): Promise<VideoCapabilityResult>;
    private transcribe;
    private generate;
    /** Revoke catalog projections and in-memory observations when the account owner closes. */
    clear(): void;
}
export {};
//# sourceMappingURL=video-media.d.ts.map