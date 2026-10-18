import type { VideoLaunchResources, VideoResourcePin } from './video-types.ts';
/** Verify the complete candidate and exact shared runtime references before any video process starts. */
export declare function loadVideoResources(directory: string, pin: VideoResourcePin | null, roots: {
    primary: string;
    dsh: string;
    aigc: string;
    workspace?: string;
}): Promise<VideoLaunchResources>;
//# sourceMappingURL=video-resources.d.ts.map