/** Seekable video responses over the same authenticated, policy-owned filesystem as other file previews. */
import type { FileSystem, FsTarget } from '@deepseek-ai/dsh-fs';
/** Serve a video without loading the complete export into Host or renderer memory. */
export declare function serveVideo(request: Request, fs: FileSystem, target: FsTarget, headers: Record<string, string>): Promise<Response>;
//# sourceMappingURL=video-media.d.ts.map