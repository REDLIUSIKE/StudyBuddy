import type { Context } from '@deepseek-ai/cordis';
import type { VideoScope } from './video-domain-types.ts';
import type { VideoProjectAdmission, VideoProjectBinding } from './video-control-wire.d.ts';
export declare function parseVideoProjectAdmission(value: unknown): VideoProjectAdmission;
/** Account-owned video projects admit real native workspaces and persistent Sessions. */
export declare class NativeVideoProjects {
    private readonly ctx;
    private readonly hostGeneration;
    private scope;
    private epoch;
    private lifecycle;
    private cleanup;
    private readonly bindings;
    private readonly pending;
    constructor(ctx: Context, hostGeneration: string);
    matchesScope(value: unknown): boolean;
    setScope(value: unknown): Promise<void>;
    binding: (scope: VideoScope) => VideoProjectBinding | undefined;
    bind(value: unknown): Promise<VideoProjectBinding>;
    private assert;
    private create;
    close(projectId: string): Promise<void>;
    private owned;
}
//# sourceMappingURL=video-projects.d.ts.map