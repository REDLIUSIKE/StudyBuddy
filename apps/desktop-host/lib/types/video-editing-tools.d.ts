/** Project-scoped video tools use the native Agent and the same domain as Studio. */
import type { Context } from '@deepseek-ai/cordis';
import type { VideoScope } from './video-domain-types.ts';
export interface VideoToolPort {
    current(scope: VideoScope): boolean;
    invoke(scope: VideoScope, operation: string, requestId: string, input: unknown, signal: AbortSignal): Promise<unknown>;
}
/** Mount tools only on admitted native Sessions; keep restored video Sessions guarded. */
export declare class NativeVideoTools {
    private readonly ctx;
    private readonly port;
    private readonly mounts;
    constructor(ctx: Context, port: VideoToolPort);
    private owner;
    private admitted;
    mount(scope: VideoScope): Promise<void>;
    /** Remove one project's tools or all owned contributions.
     * @param sessionId - Native Session to remove; omission clears this controller.
     * @returns Completion after synchronous registry and listener disposal. */
    unmount(sessionId?: string): Promise<void>;
}
//# sourceMappingURL=video-editing-tools.d.ts.map