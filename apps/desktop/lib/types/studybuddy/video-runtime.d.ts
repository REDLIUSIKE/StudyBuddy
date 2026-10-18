import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { OwnedScope } from '@studybuddy/contracts';
import type { VideoLaunchResources, VideoCapabilityRequest, VideoCapabilityResult } from './video-types.ts';
import type { VideoScope } from './video-types.ts';
import type { VideoPathInput } from './video-path-store.ts';
interface Options {
    userDataRoot: string;
    isCurrent(scope: OwnedScope): boolean;
    resources(): Promise<VideoLaunchResources>;
    invoke(scope: OwnedScope, request: VideoCapabilityRequest, signal: AbortSignal): Promise<VideoCapabilityResult>;
    launch(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams;
    terminate?(child: ChildProcessWithoutNullStreams): Promise<void>;
    invalidated(): void;
}
interface Origins {
    editorOrigin: string;
    filmOrigin: string;
}
export declare function accountVideoDirectory(root: string, accountId: string): string;
/** Own the video profile and private transport for exactly one authenticated generation. */
export declare class VideoRuntime {
    private readonly options;
    private current;
    private cleanup;
    private readonly paths;
    constructor(options: Options);
    generation(scope: OwnedScope): string;
    ensure(scope: OwnedScope): Promise<Origins>;
    private assert;
    private send;
    private start;
    private relay;
    private relocated;
    /** Register only paths returned by the native selector; persistence follows successful domain admission. */
    admitPaths(scope: OwnedScope, input: VideoPathInput): Promise<string[]>;
    /** Restore asset/export selections only after the private native project binding exists. */
    restoreProjectPaths(scope: OwnedScope, project: VideoScope): Promise<void>;
    private admitRunning;
    command(scope: OwnedScope, operation: string, parameters: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
    private commandRunning;
    requestHeaders(scope: OwnedScope, value: string): Readonly<Record<string, string>>;
    /** Top-frame navigation is limited to Studio; film-origin access is for subresources only. */
    isEditorUrl(scope: OwnedScope, value: string): boolean;
    private stop;
    revoke(): Promise<void>;
}
export {};
//# sourceMappingURL=video-runtime.d.ts.map